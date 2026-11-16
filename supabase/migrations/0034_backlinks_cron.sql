-- 0034_backlinks_cron: every 15 minutes pg_cron calls POST <app>/api/cron/backlinks with a
-- bearer token from Vault (same pattern as 0027; app_base_url is the one the Zernio setup saved).
-- The route only resumes searches whose worker stopped and cleans up: it never starts a search.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'backlinks_cron_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'backlinks_cron_token',
      'Bearer token the backlinks job sends to the app');
  end if;
end $$;

-- Compares hashes, so the check takes the same time whatever the input.
create or replace function public.verify_backlinks_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select extensions.digest(s.decrypted_secret, 'sha256') = extensions.digest(coalesce(p_token, ''), 'sha256')
    from vault.decrypted_secrets s
    where s.name = 'backlinks_cron_token'
  ), false)
$$;

-- Housekeeping for the cron route: strength checks stuck for 10 minutes fail, and cached
-- results older than 120 days that no recent search points to are deleted.
create or replace function public.dfs_backlinks_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  stuck integer;
  pruned integer;
begin
  update public.backlink_strength_checks
    set status = 'failed', error = 'Did not finish.', finished_at = now()
    where status = 'running' and created_at < now() - interval '10 minutes';
  get diagnostics stuck = row_count;
  delete from public.serp_result_cache c
    where c.fetched_at < now() - interval '120 days'
      and not exists (
        select 1 from public.backlink_run_queries q
        join public.backlink_runs r on r.id = q.run_id
        where q.cache_id = c.id and r.created_at > now() - interval '7 days'
      );
  get diagnostics pruned = row_count;
  return jsonb_build_object('stuck_checks', stuck, 'pruned_cache', pruned);
end;
$$;

revoke execute on function public.verify_backlinks_token(text) from public, anon, authenticated;
revoke execute on function public.dfs_backlinks_cleanup() from public, anon, authenticated;
grant execute on function public.verify_backlinks_token(text) to service_role;
grant execute on function public.dfs_backlinks_cleanup() to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'backlinks-tick';
select cron.schedule(
  'backlinks-tick',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url')
             || '/api/cron/backlinks',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'backlinks_cron_token')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    )
  $job$
);
