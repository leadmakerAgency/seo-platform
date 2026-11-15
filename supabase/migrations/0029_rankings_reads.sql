-- 0029_rankings_reads: small read helpers for the Rankings page.
--   keyword_first_ranks(client): each tracked keyword's first-ever position per engine ("start")
--   research_quota(client): research runs used / allowed this month, and whether the
--     DataForSEO budget is used up (team members who can see the client; no amounts)

create or replace function public.keyword_first_ranks(p_client_id uuid)
returns table (keyword_id uuid, engine public.rank_engine, first_position smallint, checked_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (kr.keyword_id, kr.engine) kr.keyword_id, kr.engine, kr.position, rc.checked_at
  from public.keyword_ranks kr
  join public.rank_checks rc on rc.id = kr.check_id and rc.status = 'done'
  where kr.client_id = p_client_id
  order by kr.keyword_id, kr.engine, rc.checked_at asc
$$;

create or replace function public.research_quota(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lim integer;
  used integer;
begin
  if not private.can_see_client(p_client_id) then
    return null;
  end if;
  select research_runs_per_client_month into lim from public.dfs_settings;
  select count(*) into used from public.keyword_research_runs
    where client_id = p_client_id and status <> 'failed'
      and created_at >= (date_trunc('month', now() at time zone 'America/Phoenix') at time zone 'America/Phoenix');
  return jsonb_build_object(
    'used', used,
    'limit', lim,
    'over_budget', private.dfs_month_spend() >= (select monthly_budget_usd from public.dfs_settings)
  );
end;
$$;

revoke execute on function public.keyword_first_ranks(uuid) from public, anon;
revoke execute on function public.research_quota(uuid) from public, anon;
grant execute on function public.keyword_first_ranks(uuid) to authenticated;
grant execute on function public.research_quota(uuid) to authenticated;
