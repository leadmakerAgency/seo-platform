-- 0020_overview_cron: once a day (00:10 in Phoenix = 07:10 UTC, no daylight saving)
-- create the month's plans, re-check every client's pace (it changes as days pass
-- with no new work) and refresh health. Pure SQL, so no app call is needed.

create or replace function private.overview_daily()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
begin
  for cid in select id from public.clients where stage in ('onboarding', 'active') loop
    perform private.ensure_month_plan(cid, private.agency_month());
  end loop;
  for cid in select id from public.clients loop
    perform private.check_client_pace(cid);
    perform private.refresh_client_health(cid);
  end loop;
end;
$$;

revoke execute on function private.overview_daily() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'overview-daily';
select cron.schedule('overview-daily', '10 7 * * *', 'select private.overview_daily()');
