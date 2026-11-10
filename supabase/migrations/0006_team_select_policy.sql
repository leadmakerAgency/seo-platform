-- 0006_team_select_policy: one SELECT policy on team_members instead of two
-- (the performance advisor flags multiple permissive policies), and restart
-- task numbers at 1001 after the RLS test run consumed some.

drop policy "Members can view their own row" on public.team_members;
drop policy "Team members can view the team" on public.team_members;

create policy "Members see the team, invited people see themselves"
  on public.team_members for select to authenticated
  using (id = (select auth.uid()) or (select private.is_team_member()));

alter table public.tasks alter column number restart with 1001;
