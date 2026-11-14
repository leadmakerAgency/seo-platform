-- 0023_overview_pace_from_start: in a client's first (part) month the schedule runs from
-- their start date, not the 1st, and "behind" needs 5 days of work time. Alert detail
-- labels get sentence case ("Google posts", not "Google Posts").

create or replace function private.month_progress(p_client_id uuid, p_month date, p_today date)
returns table (
  kind public.deliverable_kind,
  target integer,
  done integer,
  expected numeric,
  status text,
  prorated boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_month date := private.agency_month(p_today);
  days integer := private.month_days(p_month);
  started date;
  start_day integer := 1;
  span integer;
  elapsed integer;
begin
  perform private.ensure_month_plan(p_client_id, p_month);
  select started_on into started from public.clients where id = p_client_id;
  if started is not null and private.agency_month(started) = p_month then
    start_day := extract(day from started)::integer;
  end if;
  span := days - start_day + 1;
  elapsed := case
    when p_month < current_month then span
    when p_month = current_month then greatest(0, extract(day from p_today)::integer - start_day + 1)
    else 0
  end;
  return query
  select
    p.kind,
    p.target::integer,
    coalesce(w.done, 0)::integer,
    round(p.target * elapsed::numeric / span, 1),
    case
      when coalesce(w.done, 0) >= p.target then
        case when p_month < current_month then 'delivered' else 'done' end
      when p_month < current_month then 'short'
      when elapsed >= 5
        and coalesce(w.done, 0) < (p.target * elapsed::numeric / span) - greatest(1, ceil(p.target * 0.15))
        then 'behind'
      else 'on_track'
    end,
    p.prorated
  from public.client_month_plans p
  left join lateral (
    select sum(wi.quantity)::integer as done
    from public.work_items wi
    where wi.client_id = p_client_id and wi.month = p_month and wi.kind = p.kind
  ) w on true
  where p.client_id = p_client_id and p.month = p_month
  order by p.kind;
end;
$$;

-- month_progress now decides when "behind" can start (5 days of work time).
create or replace function private.check_client_pace(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  key text := 'pace:' || p_client_id;
  labels text[];
  details text[];
begin
  select id, slug, stage into c from public.clients where id = p_client_id;
  if not found then
    return;
  end if;
  if c.stage <> 'active' then
    perform private.resolve_alert(key);
    return;
  end if;

  select
    array_agg(private.deliverable_label(mp.kind) order by mp.kind),
    array_agg(
      upper(left(private.deliverable_label(mp.kind), 1)) || substr(private.deliverable_label(mp.kind), 2)
        || ': ' || mp.done || ' of ' || mp.target
        || ', about ' || round(mp.expected) || ' expected by now'
      order by mp.kind
    )
  into labels, details
  from private.month_progress(p_client_id, private.agency_month(), private.agency_today()) mp
  where mp.status = 'behind';

  if labels is null then
    perform private.resolve_alert(key);
    return;
  end if;

  perform private.raise_alert(
    p_client_id,
    key,
    'needs_look',
    case cardinality(labels)
      when 1 then 'Behind on ' || labels[1]
      when 2 then 'Behind on ' || labels[1] || ' and ' || labels[2]
      else 'Behind on ' || cardinality(labels) || ' deliverables'
    end,
    array_to_string(details, '. ') || '.',
    'Open Overview',
    '/clients/' || c.slug
  );
end;
$$;

revoke execute on function private.check_client_pace(uuid) from public, anon;
revoke execute on function private.month_progress(uuid, date, date) from public, anon;
grant execute on function private.month_progress(uuid, date, date) to authenticated;

-- Re-check everyone with the corrected schedule.
do $$
declare
  cid uuid;
begin
  for cid in select id from public.clients loop
    perform private.check_client_pace(cid);
  end loop;
end $$;
