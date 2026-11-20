-- 0048_manual_search_cron: once a day (07:00 in Phoenix = 14:00 UTC, no daylight saving) remind
-- whoever is assigned about backlink listings whose follow-up date has come, or that have waited
-- 21+ days in Submitted with no follow-up date. One notification per person and client, skipped
-- while an unread one for the same client is still waiting. Pure SQL, no app call.

create or replace function private.backlink_follow_ups()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  with due as (
    select distinct s.assigned_to, s.client_id
    from public.backlink_submissions s
    join public.team_members m on m.id = s.assigned_to and m.status = 'active'
    join public.clients c on c.id = s.client_id and c.stage <> 'churned'
    where s.status in ('doing', 'submitted', 'blocked')
      and (
        s.follow_up_on <= private.agency_today()
        or (s.follow_up_on is null and s.status = 'submitted' and s.submitted_on <= private.agency_today() - 21)
      )
  )
  insert into public.notifications (recipient_id, kind, client_id)
  select d.assigned_to, 'backlink_follow_up', d.client_id
  from due d
  where not exists (
    select 1 from public.notifications x
    where x.recipient_id = d.assigned_to and x.kind = 'backlink_follow_up' and x.client_id = d.client_id
      and x.read_at is null
  );
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function private.backlink_follow_ups() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'backlinks-follow-ups';
select cron.schedule('backlinks-follow-ups', '0 14 * * *', 'select private.backlink_follow_ups()');
