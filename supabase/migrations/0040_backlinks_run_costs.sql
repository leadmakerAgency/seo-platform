-- Backlinks: every run's full cost, for the "Runs and costs" panel on the Backlinks page.
--   A run's cost = its Google/Maps searches (dfs_calls.ref = run) + the site-strength check
--   its top-30 step made (dfs_calls.ref = strength check, linked here by run_id) + Claude's
--   review (ai_calls.ref = run). Strength checks started by hand stand on their own.
-- dfs_calls and ai_calls stay admin-only; public.backlink_run_history() returns the sums to
-- anyone who can see the client.

alter table public.backlink_strength_checks
  add column run_id uuid references public.backlink_runs (id) on delete set null;

create index backlink_strength_checks_run_idx on public.backlink_strength_checks (run_id) where run_id is not null;
create index ai_calls_ref_idx on public.ai_calls (ref) where ref is not null;

comment on column public.backlink_strength_checks.run_id is
  'The Find places / Re-rank run whose top-30 step made this check; null when started by hand.';

-- Checks made by a run's top-30 step so far: same client, between the run's start and finish.
update public.backlink_strength_checks s
  set run_id = r.id
  from public.backlink_runs r
  where s.run_id is null
    and r.client_id = s.client_id
    and r.started_at is not null
    and s.created_at between r.started_at and coalesce(r.finished_at, now());

create or replace function public.backlink_run_history(p_client_id uuid, p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  out jsonb;
  month_start timestamptz := private.agency_month_start();
begin
  if not private.can_see_client(p_client_id) then
    return null;
  end if;

  with entries as (
    select
      r.id, r.kind::text as kind, r.status::text as status, r.created_at, r.finished_at,
      r.queries_total, r.counts, r.error, r.target_ids, r.created_by,
      coalesce(g.cost, 0) as google, coalesce(g.calls, 0) as google_calls,
      coalesce(m.cost, 0) as maps, coalesce(m.calls, 0) as maps_calls,
      coalesce(st.cost, 0) as strength, coalesce(st.domains, 0) as strength_domains,
      coalesce(ai.cost, 0) as ai, coalesce(ai.calls, 0) as ai_calls, ai.input_tokens, ai.output_tokens
    from public.backlink_runs r
    left join lateral (
      select sum(d.cost_usd) cost, count(*) calls from public.dfs_calls d where d.ref = r.id and d.api = 'serp_google'
    ) g on true
    left join lateral (
      select sum(d.cost_usd) cost, count(*) calls from public.dfs_calls d where d.ref = r.id and d.api <> 'serp_google'
    ) m on true
    left join lateral (
      select sum(d.cost_usd) cost, (select sum(s2.domains) from public.backlink_strength_checks s2 where s2.run_id = r.id) domains
      from public.backlink_strength_checks s join public.dfs_calls d on d.ref = s.id
      where s.run_id = r.id
    ) st on true
    left join lateral (
      select sum(a.cost_usd) cost, count(*) calls, sum(a.input_tokens) input_tokens, sum(a.output_tokens) output_tokens
      from public.ai_calls a where a.ref = r.id
    ) ai on true
    where r.client_id = p_client_id
    union all
    select
      s.id, 'strength', s.status::text, s.created_at, s.finished_at,
      null, null, s.error, null, s.created_by,
      0, 0, 0, 0,
      coalesce((select sum(d.cost_usd) from public.dfs_calls d where d.ref = s.id), 0), s.domains,
      0, 0, null, null
    from public.backlink_strength_checks s
    where s.client_id = p_client_id and s.run_id is null
  ),
  priced as (
    select e.*, (e.google + e.maps + e.strength + e.ai) as total from entries e
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'all_time', coalesce(sum(total), 0),
        'this_month', coalesce(sum(total) filter (where created_at >= month_start), 0),
        'last_month', coalesce(sum(total) filter (
          where created_at >= month_start - interval '1 month' and created_at < month_start), 0),
        'runs', count(*) filter (where kind <> 'strength'),
        'runs_this_month', count(*) filter (where kind <> 'strength' and created_at >= month_start),
        'google', coalesce(sum(google), 0),
        'maps', coalesce(sum(maps), 0),
        'strength', coalesce(sum(strength), 0),
        'ai', coalesce(sum(ai), 0)
      )
      from priced
    ),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'status', p.status,
        'created_at', p.created_at, 'finished_at', p.finished_at,
        'searches', p.queries_total, 'counts', p.counts, 'error', p.error,
        'places', (
          select coalesce(jsonb_agg(t.label order by t.created_at), '[]'::jsonb)
          from public.backlink_targets t where t.id = any (p.target_ids)
        ),
        'by', (select tm.full_name from public.team_members tm where tm.id = p.created_by),
        'google', p.google, 'google_calls', p.google_calls,
        'maps', p.maps, 'maps_calls', p.maps_calls,
        'strength', p.strength, 'strength_domains', p.strength_domains,
        'ai', p.ai, 'ai_calls', p.ai_calls, 'ai_input_tokens', p.input_tokens, 'ai_output_tokens', p.output_tokens,
        'total', p.total
      ) order by p.created_at desc)
      from (select * from priced order by created_at desc limit greatest(1, least(coalesce(p_limit, 100), 500))) p
    ), '[]'::jsonb)
  ) into out;
  return out;
end;
$$;

revoke execute on function public.backlink_run_history(uuid, integer) from public, anon;
grant execute on function public.backlink_run_history(uuid, integer) to authenticated;
