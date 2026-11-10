-- 0002_private_auth_helpers: move the role-check helpers out of the API-exposed
-- "public" schema into "private", so they can't be called as RPCs. RLS policies
-- still use them. public.setup_required() stays public on purpose: the /setup
-- page calls it before anyone is signed in, and it only returns a boolean.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select tm.role
  from public.team_members tm
  where tm.id = (select auth.uid()) and tm.status = 'active'
$$;

create or replace function private.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.id = (select auth.uid()) and tm.status = 'active'
  )
$$;

create or replace function private.has_role(roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() = any (roles), false)
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- Recreate every policy against the private helpers.
drop policy "Team members can view the team" on public.team_members;
drop policy "Admins can update team members" on public.team_members;
drop policy "Admins can remove team members" on public.team_members;
drop policy "Team members can view clients" on public.clients;
drop policy "Admins and managers can add clients" on public.clients;
drop policy "Admins and managers can update clients" on public.clients;
drop policy "Admins can delete clients" on public.clients;
drop policy "Team members can view alerts" on public.alerts;
drop policy "Admins and managers can add alerts" on public.alerts;
drop policy "Admins and managers can update alerts" on public.alerts;
drop policy "Admins can delete alerts" on public.alerts;
drop policy "Team members can view activity" on public.activity_log;
drop policy "Team members can log their own activity" on public.activity_log;

create policy "Team members can view the team"
  on public.team_members for select to authenticated
  using ((select private.is_team_member()));

create policy "Admins can update team members"
  on public.team_members for update to authenticated
  using ((select private.has_role('{admin}')))
  with check ((select private.has_role('{admin}')));

create policy "Admins can remove team members"
  on public.team_members for delete to authenticated
  using ((select private.has_role('{admin}')));

create policy "Team members can view clients"
  on public.clients for select to authenticated
  using ((select private.is_team_member()));

create policy "Admins and managers can add clients"
  on public.clients for insert to authenticated
  with check ((select private.has_role('{admin,manager}')));

create policy "Admins and managers can update clients"
  on public.clients for update to authenticated
  using ((select private.has_role('{admin,manager}')))
  with check ((select private.has_role('{admin,manager}')));

create policy "Admins can delete clients"
  on public.clients for delete to authenticated
  using ((select private.has_role('{admin}')));

create policy "Team members can view alerts"
  on public.alerts for select to authenticated
  using ((select private.is_team_member()));

create policy "Admins and managers can add alerts"
  on public.alerts for insert to authenticated
  with check ((select private.has_role('{admin,manager}')));

create policy "Admins and managers can update alerts"
  on public.alerts for update to authenticated
  using ((select private.has_role('{admin,manager}')))
  with check ((select private.has_role('{admin,manager}')));

create policy "Admins can delete alerts"
  on public.alerts for delete to authenticated
  using ((select private.has_role('{admin}')));

create policy "Team members can view activity"
  on public.activity_log for select to authenticated
  using ((select private.is_team_member()));

create policy "Team members can log their own activity"
  on public.activity_log for insert to authenticated
  with check ((select private.is_team_member()) and actor_id = (select auth.uid()));

drop function public.has_role(public.app_role[]);
drop function public.is_team_member();
drop function public.current_app_role();

-- setup_required: anon needs it before sign-up; authenticated users don't.
revoke execute on function public.setup_required() from authenticated;
