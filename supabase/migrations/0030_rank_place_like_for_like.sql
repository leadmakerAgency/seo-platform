-- 0030_rank_place_like_for_like: the Overview's "up from N at the start" compares the same
-- keywords on both sides. Adds 'current_compared' (latest-check count over only the keywords
-- that were also in the baseline check). Everything else is unchanged from 0026.

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
    select rc.id, rc.checked_at from public.rank_checks rc
    where rc.client_id = p_client_id and rc.engine = p_engine and rc.status = 'done' and rc.scope = 'full'
  ),
  latest as (select id, checked_at from checks order by checked_at desc limit 1),
  previous as (select id from checks order by checked_at desc offset 1 limit 1),
  baseline as (
    select id, checked_at from checks
    order by (checked_at::date >= p_started) desc,
             case when checked_at::date >= p_started then checked_at end asc,
             checked_at asc
    limit 1
  ),
  now_ranks as (select keyword_id, position from public.keyword_ranks where check_id = (select id from latest)),
  base_ranks as (
    select b.keyword_id, b.position from public.keyword_ranks b
    where b.check_id = (select id from baseline) and b.keyword_id in (select keyword_id from now_ranks)
  ),
  prev_ranks as (
    select p.keyword_id, p.position from public.keyword_ranks p
    where p.check_id = (select id from previous) and p.keyword_id in (select keyword_id from now_ranks)
  )
  select case when not exists (select 1 from latest) then null else jsonb_build_object(
    'current', (select count(*) from now_ranks where position <= p_top),
    'current_compared', (
      select count(*) from now_ranks n
      where n.position <= p_top and n.keyword_id in (select keyword_id from base_ranks)
    ),
    'out_of', (select count(*) from now_ranks),
    'previous', case when exists (select 1 from previous) then (select count(*) from prev_ranks where position <= p_top) end,
    'baseline', (select count(*) from base_ranks where position <= p_top),
    'compared', (select count(*) from base_ranks),
    'baseline_checked_at', (select checked_at from baseline),
    'last_checked_at', (select checked_at from latest),
    'checks', (select count(*) from checks)
  ) end
$$;
