-- 0012_connections_cron: hourly Zernio health sync.
-- pg_cron calls POST <app>/api/cron/zernio-sync with a bearer token kept in
-- Vault. Nothing to set up by hand: an admin clicks "Turn on hourly checks",
-- which calls configure_zernio_cron(<public app URL>) with the service role.
-- The token is generated here and never shown; the route checks it with
-- verify_zernio_cron_token().

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.configure_zernio_cron(p_base_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  url_id uuid;
begin
  if p_base_url is null or p_base_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' then
    raise exception 'Use the app''s public https address, like https://app.example.com.' using errcode = '22023';
  end if;

  select id into url_id from vault.secrets where name = 'app_base_url';
  if url_id is null then
    perform vault.create_secret(p_base_url, 'app_base_url', 'Public URL of the LeadMaker app, for scheduled calls');
  else
    perform vault.update_secret(url_id, p_base_url);
  end if;

  if not exists (select 1 from vault.secrets where name = 'zernio_cron_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'zernio_cron_token',
      'Bearer token the hourly Zernio sync sends to the app'
    );
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname = 'zernio-sync';
  perform cron.schedule(
    'zernio-sync',
    '7 * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url')
               || '/api/cron/zernio-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'zernio_cron_token')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      )
    $job$
  );
end;
$$;

-- Compares hashes so the check takes the same time whatever the input.
create or replace function public.verify_zernio_cron_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select extensions.digest(s.decrypted_secret, 'sha256') = extensions.digest(coalesce(p_token, ''), 'sha256')
    from vault.decrypted_secrets s
    where s.name = 'zernio_cron_token'
  ), false)
$$;

create or replace function public.zernio_cron_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'scheduled', exists (select 1 from cron.job where jobname = 'zernio-sync'),
    'last_run_at', (
      select max(d.start_time) from cron.job_run_details d
      join cron.job j on j.jobid = d.jobid where j.jobname = 'zernio-sync'
    ),
    'last_status', (
      select d.status from cron.job_run_details d
      join cron.job j on j.jobid = d.jobid where j.jobname = 'zernio-sync'
      order by d.start_time desc limit 1
    )
  )
$$;

revoke execute on function public.configure_zernio_cron(text) from public, anon, authenticated;
revoke execute on function public.verify_zernio_cron_token(text) from public, anon, authenticated;
revoke execute on function public.zernio_cron_status() from public, anon, authenticated;
grant execute on function public.configure_zernio_cron(text) to service_role;
grant execute on function public.verify_zernio_cron_token(text) to service_role;
grant execute on function public.zernio_cron_status() to service_role;

-- The rolled-back access tests used task numbers; restart while there are no tasks yet.
do $$
begin
  if not exists (select 1 from public.tasks) then
    execute 'alter table public.tasks alter column number restart with 1001';
  end if;
end $$;
