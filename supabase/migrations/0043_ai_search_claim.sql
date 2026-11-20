-- Shockwave AI Search: resume a stopped worker sooner. The pipeline beats every 30 s, so a run
-- whose heartbeat is 2 minutes old has lost its worker (a redeploy can exit before the worker
-- hands the run back). Three such stops in a row fail the run.

create or replace function public.dfs_claim_ai_search_run()
returns setof public.ai_search_runs
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_search_runs
    set status = 'failed', finished_at = now(), error = 'Stopped responding three times.'
    where status = 'running' and attempts >= 3
      and released_at is null and heartbeat_at < now() - interval '2 minutes';
  return query
  update public.ai_search_runs
    set status = 'running', attempts = attempts + 1, started_at = coalesce(started_at, now()),
        heartbeat_at = now(), released_at = null
    where id = (
      select id from public.ai_search_runs
      where status = 'queued'
         or (status = 'running' and (released_at is not null or heartbeat_at < now() - interval '2 minutes'))
      order by created_at
      limit 1
      for update skip locked
    )
    returning *;
end;
$$;

revoke execute on function public.dfs_claim_ai_search_run() from public, anon, authenticated;
grant execute on function public.dfs_claim_ai_search_run() to service_role;
