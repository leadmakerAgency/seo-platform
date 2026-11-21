-- 0055 · AI Visibility cron: every 10 minutes pg_cron calls POST <app>/api/cron/ai-visibility with a
-- bearer token from Vault (same pattern as 0027 and 0034). The route queues due checks, resumes
-- open ones (dispatch, collect, analyse) and runs the daily cleanup.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'aiv_cron_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'aiv_cron_token',
      'Bearer token the AI visibility job sends to the app');
  end if;
end $$;

create or replace function public.verify_aiv_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select extensions.digest(s.decrypted_secret, 'sha256') = extensions.digest(coalesce(p_token, ''), 'sha256')
    from vault.decrypted_secrets s
    where s.name = 'aiv_cron_token'
  ), false)
$$;

revoke execute on function public.verify_aiv_token(text) from public, anon, authenticated;
grant execute on function public.verify_aiv_token(text) to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'ai-visibility-tick';
select cron.schedule(
  'ai-visibility-tick',
  '*/10 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url')
             || '/api/cron/ai-visibility',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'aiv_cron_token')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    )
  $job$
);
