-- 0028_rankings_budget: this month's DataForSEO spend against the budget, for the jobs
-- (service role) and the admin status card. Admins only otherwise.

create or replace function public.dfs_budget_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.dfs_settings%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not private.has_role('{admin}') then
    raise exception 'Only admins can see DataForSEO spending.' using errcode = '42501';
  end if;
  select * into s from public.dfs_settings where id;
  return jsonb_build_object(
    'spent', private.dfs_month_spend(),
    'budget', s.monthly_budget_usd,
    'research_runs_per_client_month', s.research_runs_per_client_month,
    'low_balance', s.low_balance_usd,
    'balance', s.last_balance_usd,
    'balance_at', s.last_balance_at,
    'over_budget', private.dfs_month_spend() >= s.monthly_budget_usd
  );
end;
$$;

revoke execute on function public.dfs_budget_status() from public, anon;
grant execute on function public.dfs_budget_status() to authenticated, service_role;
