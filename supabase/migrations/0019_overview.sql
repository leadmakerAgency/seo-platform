-- 0019_overview: everything the client Overview reads.
--   * client package + the new monthly targets, automatic health
--   * client_month_plans: what we promised each month (a snapshot)
--   * work_items: one ledger of delivered work (tasks today, other pages later)
--   * keywords / rank_checks / keyword_ranks / ai_checks / ai_answers: filled later
--     by the Rankings and AI visibility jobs; the Overview reads them now
--   * RPCs: client_month_progress, month_progress_summary, client_visibility,
--     client_activity
-- Dates and months are the agency's (America/Phoenix) via private.agency_today().

-- ---------------------------------------------------------------------------
-- Clients: package, new targets, health reason
-- ---------------------------------------------------------------------------

alter table public.clients
  add column package public.package_kind not null default 'seo',
  add column gbp_posts_target smallint not null default 8
    check (gbp_posts_target between 0 and 500),
  add column review_requests_target smallint not null default 30
    check (review_requests_target between 0 and 500),
  add column ai_fixes_target smallint not null default 8
    check (ai_fixes_target between 0 and 500),
  add column health_reason text check (health_reason is null or char_length(health_reason) <= 300),
  add column health_changed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------

create or replace function private.agency_month(p_day date default null)
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', coalesce(p_day, private.agency_today())::timestamp)::date
$$;

create or replace function private.month_days(p_month date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select extract(day from (date_trunc('month', p_month::timestamp) + interval '1 month - 1 day'))::integer
$$;

create or replace function private.deliverable_label(p_kind public.deliverable_kind)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'backlinks' then 'backlinks'
    when 'articles' then 'articles'
    when 'gbp_posts' then 'Google posts'
    when 'review_requests' then 'review requests'
    when 'ai_fixes' then 'AI visibility fixes'
  end
$$;

-- The client's current monthly target for one deliverable.
create or replace function private.client_target(p_client public.clients, p_kind public.deliverable_kind)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'backlinks' then p_client.backlinks_target
    when 'articles' then p_client.articles_target
    when 'gbp_posts' then p_client.gbp_posts_target
    when 'review_requests' then p_client.review_requests_target
    when 'ai_fixes' then p_client.ai_fixes_target
  end::integer
$$;

-- ---------------------------------------------------------------------------
-- Month plans: what we promised a client in a given month
-- ---------------------------------------------------------------------------

create table public.client_month_plans (
  client_id uuid not null references public.clients (id) on delete cascade,
  month date not null check (month = date_trunc('month', month::timestamp)::date),
  kind public.deliverable_kind not null,
  target smallint not null check (target between 0 and 500),
  -- First month of a client who started after the 1st: targets scaled to the days left.
  prorated boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (client_id, month, kind)
);

alter table public.client_month_plans enable row level security;

create policy "See month plans for clients you can see"
  on public.client_month_plans for select to authenticated
  using (private.can_see_client(client_id));

-- Creates the month's plan from the client's targets the first time it's needed.
-- No plan for future months or for months that ended before the client started.
create or replace function private.ensure_month_plan(p_client_id uuid, p_month date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.clients%rowtype;
  days integer := private.month_days(p_month);
  factor numeric := 1;
begin
  if p_month is null or p_month > private.agency_month() then
    return;
  end if;
  if exists (select 1 from public.client_month_plans where client_id = p_client_id and month = p_month) then
    return;
  end if;
  select * into c from public.clients where id = p_client_id;
  if not found or (p_month + days - 1) < c.started_on then
    return;
  end if;
  if private.agency_month(c.started_on) = p_month and extract(day from c.started_on) > 1 then
    factor := (days - extract(day from c.started_on) + 1)::numeric / days;
  end if;
  insert into public.client_month_plans (client_id, month, kind, target, prorated)
  select p_client_id, p_month, k, ceil(private.client_target(c, k) * factor)::smallint, factor < 1
  from unnest(enum_range(null::public.deliverable_kind)) as k
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Work ledger: every unit of delivered work, from any source
-- ---------------------------------------------------------------------------

alter table public.tasks
  add column counts_as public.deliverable_kind,
  add column units smallint not null default 1 check (units between 1 and 50);

create table public.work_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  kind public.deliverable_kind not null,
  quantity smallint not null default 1 check (quantity between -50 and 50 and quantity <> 0),
  delivered_on date not null,
  month date generated always as (date_trunc('month', delivered_on::timestamp)::date) stored,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  url text check (url is null or (char_length(url) <= 500 and url ~* '^https?://[^\s]+$')),
  note text check (note is null or char_length(note) <= 500),
  source public.work_source not null,
  source_id uuid,
  task_id uuid references public.tasks (id) on delete cascade,
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  -- A correction (negative quantity) must say why.
  constraint work_items_correction_note check (
    quantity > 0 or (note is not null and char_length(btrim(note)) >= 3)
  ),
  -- Manual entries have no source row; everything else points at one.
  constraint work_items_source_id check ((source = 'manual') = (source_id is null)),
  constraint work_items_task_link check (source <> 'task' or task_id is not null)
);

-- The same piece of work can never count twice.
create unique index work_items_source_uniq
  on public.work_items (source, source_id, client_id) where source_id is not null;
create index work_items_client_month_idx on public.work_items (client_id, month);
create index work_items_task_idx on public.work_items (task_id) where task_id is not null;
create index work_items_created_by_idx on public.work_items (created_by);

alter table public.work_items enable row level security;

create policy "See work for clients you can see"
  on public.work_items for select to authenticated
  using (private.can_see_client(client_id));

create policy "The team logs work by hand"
  on public.work_items for insert to authenticated
  with check (
    source = 'manual'
    and created_by = (select auth.uid())
    and (select private.has_role('{admin,manager,va,writer}'))
    and private.can_see_client(client_id)
  );

create policy "Remove your own entries; managers remove any"
  on public.work_items for delete to authenticated
  using (
    source = 'manual'
    and private.can_see_client(client_id)
    and (created_by = (select auth.uid()) or (select private.has_role('{admin,manager}')))
  );

-- Manual entries: only this month or last month, never in the future.
create or replace function private.work_items_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source = 'manual' then
    if new.delivered_on > private.agency_today() then
      raise exception 'Work can''t be logged for a future date.' using errcode = 'P0001';
    end if;
    if new.delivered_on < (private.agency_month() - interval '1 month')::date then
      raise exception 'Work can only be logged for this month or last month.' using errcode = 'P0001';
    end if;
  end if;
  new.title := btrim(new.title);
  return new;
end;
$$;

create trigger work_items_before_insert
  before insert on public.work_items
  for each row execute function private.work_items_before_insert();

-- ---------------------------------------------------------------------------
-- Visibility: keywords, rank checks, AI answers (written by future jobs)
-- ---------------------------------------------------------------------------

create table public.keywords (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  phrase text not null check (char_length(btrim(phrase)) between 1 and 200),
  tracked boolean not null default true,
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, client_id)
);
create unique index keywords_client_phrase_uniq
  on public.keywords (client_id, lower(btrim(phrase))) where archived_at is null;
create index keywords_created_by_idx on public.keywords (created_by);

create table public.rank_checks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  engine public.rank_engine not null,
  status public.check_status not null default 'running',
  source text not null default 'dataforseo' check (char_length(source) <= 40),
  location text check (location is null or char_length(location) <= 200),
  device text check (device is null or device in ('mobile', 'desktop')),
  started_at timestamptz not null default now(),
  checked_at timestamptz,
  cost_usd numeric(10, 4) check (cost_usd is null or cost_usd >= 0),
  error text check (error is null or char_length(error) <= 500),
  constraint rank_checks_done_has_time check (status <> 'done' or checked_at is not null),
  unique (id, client_id, engine)
);
create index rank_checks_latest_idx
  on public.rank_checks (client_id, engine, checked_at desc) where status = 'done';

create table public.keyword_ranks (
  check_id uuid not null,
  keyword_id uuid not null,
  client_id uuid not null,
  engine public.rank_engine not null,
  -- null = not found in the results we checked.
  position smallint check (position is null or position between 1 and 200),
  url text check (url is null or char_length(url) <= 1000),
  primary key (check_id, keyword_id),
  foreign key (check_id, client_id, engine)
    references public.rank_checks (id, client_id, engine) on delete cascade,
  foreign key (keyword_id, client_id) references public.keywords (id, client_id) on delete cascade
);
create index keyword_ranks_client_engine_idx on public.keyword_ranks (client_id, engine);
create index keyword_ranks_keyword_idx on public.keyword_ranks (keyword_id, client_id);

create table public.ai_checks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  status public.check_status not null default 'running',
  source text not null default 'dataforseo' check (char_length(source) <= 40),
  runs smallint not null default 3 check (runs between 1 and 10),
  started_at timestamptz not null default now(),
  checked_at timestamptz,
  cost_usd numeric(10, 4) check (cost_usd is null or cost_usd >= 0),
  error text check (error is null or char_length(error) <= 500),
  constraint ai_checks_done_has_time check (status <> 'done' or checked_at is not null),
  unique (id, client_id)
);
create index ai_checks_latest_idx
  on public.ai_checks (client_id, checked_at desc) where status = 'done';

create table public.ai_answers (
  check_id uuid not null,
  keyword_id uuid not null,
  client_id uuid not null,
  tool public.ai_tool not null,
  run_no smallint not null check (run_no between 1 and 10),
  mentioned boolean not null,
  position smallint check (position is null or position between 1 and 50),
  cited_url text check (cited_url is null or char_length(cited_url) <= 1000),
  primary key (check_id, keyword_id, tool, run_no),
  foreign key (check_id, client_id) references public.ai_checks (id, client_id) on delete cascade,
  foreign key (keyword_id, client_id) references public.keywords (id, client_id) on delete cascade
);
create index ai_answers_client_idx on public.ai_answers (client_id);
create index ai_answers_keyword_idx on public.ai_answers (keyword_id, client_id);

alter table public.keywords enable row level security;
alter table public.rank_checks enable row level security;
alter table public.keyword_ranks enable row level security;
alter table public.ai_checks enable row level security;
alter table public.ai_answers enable row level security;

create policy "See keywords for clients you can see"
  on public.keywords for select to authenticated using (private.can_see_client(client_id));
create policy "See rank checks for clients you can see"
  on public.rank_checks for select to authenticated using (private.can_see_client(client_id));
create policy "See ranks for clients you can see"
  on public.keyword_ranks for select to authenticated using (private.can_see_client(client_id));
create policy "See AI checks for clients you can see"
  on public.ai_checks for select to authenticated using (private.can_see_client(client_id));
create policy "See AI answers for clients you can see"
  on public.ai_answers for select to authenticated using (private.can_see_client(client_id));

-- ---------------------------------------------------------------------------
-- Month progress
-- ---------------------------------------------------------------------------

-- Per deliverable for one month: target, done, where they should be by today, status.
-- status: done | on_track | behind (current month); delivered | short (past months).
-- "behind" = below schedule by more than max(1, 15% of target), from day 5 on.
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
  elapsed integer;
begin
  perform private.ensure_month_plan(p_client_id, p_month);
  elapsed := case
    when p_month < current_month then days
    when p_month = current_month then extract(day from p_today)::integer
    else 0
  end;
  return query
  select
    p.kind,
    p.target::integer,
    coalesce(w.done, 0)::integer,
    round(p.target * elapsed::numeric / days, 1),
    case
      when coalesce(w.done, 0) >= p.target then
        case when p_month < current_month then 'delivered' else 'done' end
      when p_month < current_month then 'short'
      when elapsed >= 5
        and coalesce(w.done, 0) < (p.target * elapsed::numeric / days) - greatest(1, ceil(p.target * 0.15))
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

-- The Overview's "This month's work". p_month null = this month.
create or replace function public.client_month_progress(p_client_id uuid, p_month date default null)
returns table (
  kind public.deliverable_kind,
  target integer,
  done integer,
  expected numeric,
  status text,
  prorated boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  m date := coalesce(p_month, private.agency_month());
begin
  if not private.can_see_client(p_client_id) then
    return;
  end if;
  if m <> date_trunc('month', m::timestamp)::date or m > private.agency_month() then
    raise exception 'Pick the first day of this month or an earlier one.' using errcode = 'P0001';
  end if;
  return query select * from private.month_progress(p_client_id, m, private.agency_today());
end;
$$;

-- This month's backlinks/articles for a page of clients (Dashboard table).
create or replace function public.month_progress_summary(p_client_ids uuid[])
returns table (client_id uuid, kind public.deliverable_kind, target integer, done integer, status text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cid uuid;
begin
  if coalesce(cardinality(p_client_ids), 0) > 100 then
    raise exception 'Too many clients at once.' using errcode = 'P0001';
  end if;
  foreach cid in array coalesce(p_client_ids, '{}') loop
    if private.can_see_client(cid) then
      return query
      select cid, mp.kind, mp.target, mp.done, mp.status
      from private.month_progress(cid, private.agency_month(), private.agency_today()) mp;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pace alert + automatic health
-- ---------------------------------------------------------------------------

-- Raises (or clears) "Behind on …" for an Active client from day 5 of the month.
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
  if c.stage <> 'active' or extract(day from private.agency_today()) < 5 then
    perform private.resolve_alert(key);
    return;
  end if;

  select
    array_agg(private.deliverable_label(mp.kind) order by mp.kind),
    array_agg(
      initcap(private.deliverable_label(mp.kind)) || ': ' || mp.done || ' of ' || mp.target
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

-- Health = the most severe open alert (none = on track). Logs real changes.
create or replace function private.refresh_client_health(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_health public.client_health;
  old_reason text;
  top record;
  new_health public.client_health := 'on_track';
  new_reason text;
begin
  select health, health_reason into old_health, old_reason from public.clients where id = p_client_id;
  if not found then
    return;
  end if;

  select a.severity, a.title into top
  from public.alerts a
  where a.client_id = p_client_id and a.resolved_at is null
  order by a.severity desc, a.created_at desc
  limit 1;

  if found then
    new_health := case top.severity when 'action_needed' then 'action_needed' else 'needs_look' end;
    new_reason := left(top.title, 300);
  end if;

  if new_health is distinct from old_health or new_reason is distinct from old_reason then
    update public.clients
      set health = new_health,
          health_reason = new_reason,
          health_changed_at = case when new_health is distinct from old_health then now() else health_changed_at end
      where id = p_client_id;
  end if;

  if new_health is distinct from old_health then
    insert into public.activity_log (actor_id, client_id, action, meta)
    values (
      null, p_client_id, 'client.health_changed',
      jsonb_build_object('from', old_health, 'to', new_health, 'reason', new_reason)
    );
  end if;
end;
$$;

create or replace function private.alerts_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_client_health(old.client_id);
  else
    perform private.refresh_client_health(new.client_id);
    if tg_op = 'UPDATE' and new.client_id is distinct from old.client_id then
      perform private.refresh_client_health(old.client_id);
    end if;
  end if;
  return null;
end;
$$;

create trigger alerts_after_write
  after insert or update or delete on public.alerts
  for each row execute function private.alerts_after_write();

-- ---------------------------------------------------------------------------
-- Work ledger triggers: tasks feed it, every change re-checks pace
-- ---------------------------------------------------------------------------

-- One work item for (task, client), delivered the day the client was ticked off.
create or replace function private.sync_task_work(p_task_id uuid, p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  tc record;
  counts boolean := false;
begin
  select id, number, title, counts_as, units into t from public.tasks where id = p_task_id;
  if found and t.counts_as is not null then
    select done_at, done_by into tc
      from public.task_clients where task_id = p_task_id and client_id = p_client_id;
    counts := found and tc.done_at is not null;
  end if;

  if not counts then
    delete from public.work_items
      where source = 'task' and source_id = p_task_id and client_id = p_client_id;
    return;
  end if;

  insert into public.work_items (client_id, kind, quantity, delivered_on, title, source, source_id, task_id, created_by)
  values (
    p_client_id, t.counts_as, t.units,
    (tc.done_at at time zone 'America/Phoenix')::date,
    left('T-' || t.number || ' ' || t.title, 200),
    'task', p_task_id, p_task_id, tc.done_by
  )
  on conflict (source, source_id, client_id) where source_id is not null
  do update set kind = excluded.kind,
                quantity = excluded.quantity,
                title = excluded.title;
end;
$$;

create or replace function private.task_clients_work_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.work_items
      where source = 'task' and source_id = old.task_id and client_id = old.client_id;
  elsif tg_op = 'INSERT' and new.done_at is not null then
    perform private.sync_task_work(new.task_id, new.client_id);
  elsif tg_op = 'UPDATE' and new.done_at is distinct from old.done_at then
    perform private.sync_task_work(new.task_id, new.client_id);
  end if;
  return null;
end;
$$;

create trigger task_clients_work_items
  after insert or update or delete on public.task_clients
  for each row execute function private.task_clients_work_items();

-- A task's "counts toward", units or title changed: move its work items along.
create or replace function private.tasks_work_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
begin
  if new.counts_as is not distinct from old.counts_as
     and new.units is not distinct from old.units
     and new.title is not distinct from old.title then
    return null;
  end if;
  for cid in select client_id from public.task_clients where task_id = new.id loop
    perform private.sync_task_work(new.id, cid);
  end loop;
  return null;
end;
$$;

create trigger tasks_work_items
  after update on public.tasks
  for each row execute function private.tasks_work_items();

-- Every ledger change: log manual entries, re-check pace.
create or replace function private.work_items_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.work_items;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if r.source = 'manual' then
    insert into public.activity_log (actor_id, client_id, action, meta)
    values (
      (select auth.uid()),
      r.client_id,
      case when tg_op = 'DELETE' then 'work.removed' else 'work.logged' end,
      jsonb_build_object(
        'kind', r.kind, 'quantity', r.quantity, 'title', r.title, 'delivered_on', r.delivered_on
      )
    );
  end if;
  perform private.check_client_pace(r.client_id);
  return null;
end;
$$;

create trigger work_items_after_write
  after insert or delete on public.work_items
  for each row execute function private.work_items_after_write();

-- Only account managers change what a task counts toward (VAs and writers tick clients off).
create or replace function private.tasks_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not private.has_role('{admin,manager}') then
    if (new.title, new.description, new.steps, new.type, new.priority, new.assignee_id,
        new.due_on, new.repeat, new.previous_task_id, new.created_by, new.number,
        new.counts_as, new.units)
       is distinct from
       (old.title, old.description, old.steps, old.type, old.priority, old.assignee_id,
        old.due_on, old.repeat, old.previous_task_id, old.created_by, old.number,
        old.counts_as, old.units) then
      raise exception 'Only an account manager can change this task.' using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  if new.status = 'done' and old.status <> 'done' then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

-- Repeating tasks: the next copy keeps "counts toward" and units.
create or replace function private.tasks_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_id uuid;
  assignee_name text;
begin
  if new.status is distinct from old.status then
    perform private.log_task_activity(
      new.id, 'task.status_changed',
      jsonb_build_object('number', new.number, 'from', old.status, 'to', new.status)
    );
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    select coalesce(nullif(m.full_name, ''), split_part(m.email, '@', 1))
      into assignee_name
      from public.team_members m where m.id = new.assignee_id;
    perform private.log_task_activity(
      new.id, 'task.assigned',
      jsonb_build_object('number', new.number, 'assignee_name', assignee_name)
    );
    perform private.notify(new.assignee_id, 'task_assigned', new.id);
  end if;

  if new.due_on is distinct from old.due_on then
    perform private.log_task_activity(
      new.id, 'task.due_changed',
      jsonb_build_object('number', new.number, 'from', old.due_on, 'to', new.due_on)
    );
  end if;

  if new.status = 'done' and old.status <> 'done' and new.repeat <> 'none'
     and not exists (select 1 from public.tasks n where n.previous_task_id = new.id) then
    insert into public.tasks (
      title, description, steps, type, priority, assignee_id, due_on, repeat,
      previous_task_id, created_by, counts_as, units
    )
    values (
      new.title, new.description, new.steps, new.type, new.priority, new.assignee_id,
      private.next_due_on(new.due_on, new.repeat), new.repeat, new.id, new.created_by,
      new.counts_as, new.units
    )
    returning id into next_id;

    insert into public.task_clients (task_id, client_id)
    select next_id, tc.client_id from public.task_clients tc where tc.task_id = new.id;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Client edits: log them, keep this month's plan in step, re-check pace
-- ---------------------------------------------------------------------------

create or replace function private.clients_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fields text[] := '{}';
  targets jsonb := '{}';
begin
  if new.name is distinct from old.name then fields := array_append(fields, 'name'); end if;
  if new.website is distinct from old.website then fields := array_append(fields, 'website'); end if;
  if new.city is distinct from old.city or new.region is distinct from old.region
     or new.country_code is distinct from old.country_code then
    fields := array_append(fields, 'location');
  end if;
  if new.industry is distinct from old.industry then fields := array_append(fields, 'industry'); end if;
  if new.owner_id is distinct from old.owner_id then fields := array_append(fields, 'owner'); end if;
  if new.stage is distinct from old.stage then fields := array_append(fields, 'stage'); end if;
  if new.started_on is distinct from old.started_on then fields := array_append(fields, 'start date'); end if;
  if new.package is distinct from old.package then fields := array_append(fields, 'package'); end if;

  if new.keywords_target is distinct from old.keywords_target then
    targets := targets || jsonb_build_object('keywords', jsonb_build_array(old.keywords_target, new.keywords_target));
  end if;
  if new.backlinks_target is distinct from old.backlinks_target then
    targets := targets || jsonb_build_object('backlinks', jsonb_build_array(old.backlinks_target, new.backlinks_target));
  end if;
  if new.articles_target is distinct from old.articles_target then
    targets := targets || jsonb_build_object('articles', jsonb_build_array(old.articles_target, new.articles_target));
  end if;
  if new.gbp_posts_target is distinct from old.gbp_posts_target then
    targets := targets || jsonb_build_object('gbp_posts', jsonb_build_array(old.gbp_posts_target, new.gbp_posts_target));
  end if;
  if new.review_requests_target is distinct from old.review_requests_target then
    targets := targets || jsonb_build_object('review_requests', jsonb_build_array(old.review_requests_target, new.review_requests_target));
  end if;
  if new.ai_fixes_target is distinct from old.ai_fixes_target then
    targets := targets || jsonb_build_object('ai_fixes', jsonb_build_array(old.ai_fixes_target, new.ai_fixes_target));
  end if;

  if cardinality(fields) > 0 then
    insert into public.activity_log (actor_id, client_id, action, meta)
    values (
      (select auth.uid()), new.id, 'client.updated',
      jsonb_build_object('fields', to_jsonb(fields))
        || case when new.stage is distinct from old.stage
             then jsonb_build_object('stage', new.stage) else '{}'::jsonb end
    );
  end if;

  if targets <> '{}'::jsonb then
    insert into public.activity_log (actor_id, client_id, action, meta)
    values ((select auth.uid()), new.id, 'client.targets_changed', jsonb_build_object('changes', targets));
  end if;

  -- This month's promise follows target edits; past months never change.
  if targets <> '{}'::jsonb or new.started_on is distinct from old.started_on then
    delete from public.client_month_plans where client_id = new.id and month = private.agency_month();
    perform private.ensure_month_plan(new.id, private.agency_month());
  end if;

  if targets <> '{}'::jsonb or new.stage is distinct from old.stage
     or new.started_on is distinct from old.started_on then
    perform private.check_client_pace(new.id);
  end if;

  return null;
end;
$$;

create trigger clients_after_update
  after update on public.clients
  for each row execute function private.clients_after_update();

-- ---------------------------------------------------------------------------
-- Visibility summary for the Overview ("Where they show up")
-- ---------------------------------------------------------------------------

-- One place: latest, previous and baseline (first check since the client started).
create or replace function private.rank_place(
  p_client_id uuid, p_engine public.rank_engine, p_top integer, p_started date
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with checks as (
    select rc.id, rc.checked_at,
           (select count(*) from public.keyword_ranks kr where kr.check_id = rc.id)::integer as out_of,
           (select count(*) from public.keyword_ranks kr
             where kr.check_id = rc.id and kr.position is not null and kr.position <= p_top)::integer as hits
    from public.rank_checks rc
    where rc.client_id = p_client_id and rc.engine = p_engine and rc.status = 'done'
  ),
  ordered as (
    select *, row_number() over (order by checked_at desc) as rn from checks
  ),
  baseline as (
    select * from checks
    order by (checked_at::date >= p_started) desc,
             case when checked_at::date >= p_started then checked_at end asc,
             checked_at asc
    limit 1
  )
  select case when not exists (select 1 from checks) then null else jsonb_build_object(
    'current', (select hits from ordered where rn = 1),
    'out_of', (select out_of from ordered where rn = 1),
    'previous', (select hits from ordered where rn = 2),
    'baseline', (select hits from baseline),
    'baseline_checked_at', (select checked_at from baseline),
    'last_checked_at', (select checked_at from ordered where rn = 1),
    'checks', (select count(*) from checks)
  ) end
$$;

create or replace function private.ai_place(p_client_id uuid, p_started date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with checks as (
    select ac.id, ac.checked_at,
           (select count(*) from public.ai_answers aa where aa.check_id = ac.id)::integer as out_of,
           (select count(*) from public.ai_answers aa where aa.check_id = ac.id and aa.mentioned)::integer as hits
    from public.ai_checks ac
    where ac.client_id = p_client_id and ac.status = 'done'
  ),
  ordered as (
    select *, row_number() over (order by checked_at desc) as rn from checks
  ),
  baseline as (
    select * from checks
    order by (checked_at::date >= p_started) desc,
             case when checked_at::date >= p_started then checked_at end asc,
             checked_at asc
    limit 1
  )
  select case when not exists (select 1 from checks) then null else jsonb_build_object(
    'current', (select hits from ordered where rn = 1),
    'out_of', (select out_of from ordered where rn = 1),
    'previous', (select hits from ordered where rn = 2),
    'baseline', (select hits from baseline),
    'baseline_checked_at', (select checked_at from baseline),
    'last_checked_at', (select checked_at from ordered where rn = 1),
    'checks', (select count(*) from checks)
  ) end
$$;

-- website = Google top 10, bing = Bing top 10, map = map pack top 3, ai = answers naming them.
-- Each is null until the first finished check. tracked = keywords being tracked.
create or replace function public.client_visibility(p_client_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  started date;
begin
  if not private.can_see_client(p_client_id) then
    return null;
  end if;
  select started_on into started from public.clients where id = p_client_id;
  return jsonb_build_object(
    'tracked', (select count(*) from public.keywords k
                where k.client_id = p_client_id and k.tracked and k.archived_at is null),
    'website', private.rank_place(p_client_id, 'google', 10, started),
    'bing', private.rank_place(p_client_id, 'bing', 10, started),
    'map', private.rank_place(p_client_id, 'google_maps', 3, started),
    'ai', private.ai_place(p_client_id, started)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Client history (newest first, paged by id)
-- ---------------------------------------------------------------------------

create index activity_log_client_recent_idx on public.activity_log (client_id, id desc);

create or replace function public.client_activity(
  p_client_id uuid, p_before bigint default null, p_limit integer default 15
)
returns table (id bigint, action text, meta jsonb, created_at timestamptz, actor_name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.action, a.meta, a.created_at,
         coalesce(nullif(m.full_name, ''), split_part(m.email, '@', 1))
  from public.activity_log a
  left join public.team_members m on m.id = a.actor_id
  where a.client_id = p_client_id
    and private.can_see_client(p_client_id)
    and (p_before is null or a.id < p_before)
  order by a.id desc
  limit least(greatest(coalesce(p_limit, 15), 1), 50)
$$;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

update public.tasks
  set counts_as = case type when 'backlinks' then 'backlinks'::public.deliverable_kind
                            when 'content' then 'articles'::public.deliverable_kind end
  where counts_as is null and type in ('backlinks', 'content');

-- Already-ticked clients on counting tasks become work items.
insert into public.work_items (client_id, kind, quantity, delivered_on, title, source, source_id, task_id, created_by)
select tc.client_id, t.counts_as, t.units, (tc.done_at at time zone 'America/Phoenix')::date,
       left('T-' || t.number || ' ' || t.title, 200), 'task', t.id, t.id, tc.done_by
from public.task_clients tc
join public.tasks t on t.id = tc.task_id
where tc.done_at is not null and t.counts_as is not null
on conflict do nothing;

do $$
declare
  cid uuid;
begin
  for cid in select id from public.clients loop
    perform private.ensure_month_plan(cid, private.agency_month());
    perform private.check_client_pace(cid);
    perform private.refresh_client_health(cid);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema private from public, anon;
grant execute on function private.can_see_client(uuid) to authenticated;
grant execute on function private.has_role(public.app_role[]) to authenticated;
grant execute on function private.is_team_member() to authenticated;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.can_see_task(uuid) to authenticated;
grant execute on function private.can_work_task(uuid) to authenticated;
grant execute on function private.agency_today() to authenticated;
grant execute on function private.agency_month(date) to authenticated;
grant execute on function private.month_days(date) to authenticated;
grant execute on function private.month_progress(uuid, date, date) to authenticated;
grant execute on function private.rank_place(uuid, public.rank_engine, integer, date) to authenticated;
grant execute on function private.ai_place(uuid, date) to authenticated;
grant execute on function private.portal_can_upload(text) to anon, authenticated;
grant execute on function private.can_see_request_object(text) to authenticated;
grant execute on function private.valid_list(text[]) to anon, authenticated, service_role;
grant execute on function private.valid_hours(jsonb) to anon, authenticated, service_role;

revoke execute on function public.client_month_progress(uuid, date) from public, anon;
revoke execute on function public.month_progress_summary(uuid[]) from public, anon;
revoke execute on function public.client_visibility(uuid) from public, anon;
revoke execute on function public.client_activity(uuid, bigint, integer) from public, anon;
grant execute on function public.client_month_progress(uuid, date) to authenticated;
grant execute on function public.month_progress_summary(uuid[]) to authenticated;
grant execute on function public.client_visibility(uuid) to authenticated;
grant execute on function public.client_activity(uuid, bigint, integer) to authenticated;

revoke all on public.client_month_plans, public.work_items, public.keywords, public.rank_checks,
  public.keyword_ranks, public.ai_checks, public.ai_answers from anon;
