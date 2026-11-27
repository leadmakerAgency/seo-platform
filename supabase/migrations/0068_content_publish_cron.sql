-- 0068 · The content-publish job (docs/plans/git-cms/06-pipeline.md)
-- Every 5 minutes pg_cron calls POST <app>/api/cron/content-publish with the bearer token from
-- Vault (content_cron_token, created in 0065; app_base_url is the one configure_zernio_cron
-- saved). The route commits due Git-site articles, checks builds and checks connections daily.
-- Apply together with the deploy that ships the route, so the job never calls a missing URL.

select cron.unschedule(jobid) from cron.job where jobname = 'content-publish';
select cron.schedule(
  'content-publish',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url')
             || '/api/cron/content-publish',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'content_cron_token')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    )
  $job$
);

-- For admins: whether the job runs and when it last did (service role only).
create or replace function public.content_publish_cron_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'scheduled', exists (select 1 from cron.job where jobname = 'content-publish'),
    'last_run_at', (
      select max(d.start_time) from cron.job_run_details d
      join cron.job j on j.jobid = d.jobid where j.jobname = 'content-publish'
    )
  )
$$;
revoke execute on function public.content_publish_cron_status() from public, anon, authenticated;
grant execute on function public.content_publish_cron_status() to service_role;
