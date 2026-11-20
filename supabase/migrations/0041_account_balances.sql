-- Credits left on the paid accounts, for admins (Backlinks "Runs and costs").
--   DataForSEO: dfs_settings.last_balance_usd (the free user_data call; refreshed by the
--     rankings cron once a day and by the Backlinks page when older than an hour).
--   Anthropic: its API has no balance endpoint, so an admin enters the credit balance from
--     the Anthropic console once; the estimate is that minus every logged Claude call since.

alter table public.dfs_settings
  add column anthropic_credit_usd numeric(10, 2) check (anthropic_credit_usd is null or anthropic_credit_usd between 0 and 1000000),
  add column anthropic_credit_at timestamptz;

comment on column public.dfs_settings.anthropic_credit_usd is
  'Anthropic credit balance as an admin read it in the console, at anthropic_credit_at. The app subtracts ai_calls since then.';

create or replace function public.account_balances()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.dfs_settings%rowtype;
  ai_since numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not private.has_role('{admin}') then
    return null;
  end if;
  select * into s from public.dfs_settings where id;
  select coalesce(sum(cost_usd), 0) into ai_since from public.ai_calls
    where s.anthropic_credit_at is not null and created_at >= s.anthropic_credit_at;
  return jsonb_build_object(
    'dataforseo', jsonb_build_object(
      'balance', s.last_balance_usd,
      'checked_at', s.last_balance_at,
      'low', s.low_balance_usd,
      'month_spend', private.dfs_month_spend(),
      'month_budget', s.monthly_budget_usd
    ),
    'anthropic', jsonb_build_object(
      'credit', s.anthropic_credit_usd,
      'credit_at', s.anthropic_credit_at,
      'spent_since', ai_since,
      'left', case when s.anthropic_credit_usd is null then null else greatest(0, s.anthropic_credit_usd - ai_since) end,
      'month_spend', private.ai_month_spend(),
      'month_budget', s.ai_monthly_budget_usd
    )
  );
end;
$$;

create or replace function public.set_anthropic_credit(p_amount numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role('{admin}') then
    raise exception 'Only admins can set the Anthropic balance.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 1000000 then
    raise exception 'Enter the balance in dollars, between 0 and 1,000,000.' using errcode = '22023';
  end if;
  update public.dfs_settings set anthropic_credit_usd = round(p_amount, 2), anthropic_credit_at = now() where id;
end;
$$;

revoke execute on function public.account_balances() from public, anon;
grant execute on function public.account_balances() to authenticated, service_role;
revoke execute on function public.set_anthropic_credit(numeric) from public, anon;
grant execute on function public.set_anthropic_credit(numeric) to authenticated;
