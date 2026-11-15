-- 0027_rankings_cron: every 10 minutes pg_cron calls POST <app>/api/cron/rankings with a
-- bearer token from Vault (same pattern as the Zernio sync in 0012; app_base_url is the
-- one configure_zernio_cron saved). A second Vault token goes into DataForSEO postback
-- URLs so only DataForSEO's callbacks for our own tasks are accepted.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'rankings_cron_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'rankings_cron_token',
      'Bearer token the rankings job sends to the app');
  end if;
  if not exists (select 1 from vault.secrets where name = 'dfs_postback_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'dfs_postback_token',
      'Token in DataForSEO postback URLs');
  end if;
end $$;

-- p_kind: 'cron' or 'postback'. Compares hashes, so the check takes the same time whatever the input.
create or replace function public.verify_rankings_token(p_kind text, p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select extensions.digest(s.decrypted_secret, 'sha256') = extensions.digest(coalesce(p_token, ''), 'sha256')
    from vault.decrypted_secrets s
    where s.name = case p_kind when 'cron' then 'rankings_cron_token' when 'postback' then 'dfs_postback_token' end
  ), false)
$$;

-- What the app needs to build postback URLs (service role only).
create or replace function public.dfs_postback_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'base_url', (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url'),
    'token', (select decrypted_secret from vault.decrypted_secrets where name = 'dfs_postback_token')
  )
$$;

create or replace function public.rankings_cron_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'scheduled', exists (select 1 from cron.job where jobname = 'rankings-tick'),
    'last_run_at', (
      select max(d.start_time) from cron.job_run_details d
      join cron.job j on j.jobid = d.jobid where j.jobname = 'rankings-tick'
    ),
    'last_status', (
      select d.status from cron.job_run_details d
      join cron.job j on j.jobid = d.jobid where j.jobname = 'rankings-tick'
      order by d.start_time desc limit 1
    )
  )
$$;

revoke execute on function public.verify_rankings_token(text, text) from public, anon, authenticated;
revoke execute on function public.dfs_postback_config() from public, anon, authenticated;
revoke execute on function public.rankings_cron_status() from public, anon, authenticated;
grant execute on function public.verify_rankings_token(text, text) to service_role;
grant execute on function public.dfs_postback_config() to service_role;
grant execute on function public.rankings_cron_status() to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'rankings-tick';
select cron.schedule(
  'rankings-tick',
  '*/10 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url')
             || '/api/cron/rankings',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'rankings_cron_token')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    )
  $job$
);
