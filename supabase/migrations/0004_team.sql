-- 0004_team: what the Team page needs.
-- * Invited (not yet active) users can read their own row, for the /welcome page.
-- * There must always be one active admin, and admins can't change their own
--   role or status (the service role, used for invites and activation, can).

create policy "Members can view their own row"
  on public.team_members for select to authenticated
  using (id = (select auth.uid()));

create or replace function private.protect_team_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  other_admins integer;
begin
  if tg_op = 'UPDATE' and actor is not null and new.id = actor
     and (new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'You can''t change your own role or access.' using errcode = '42501';
  end if;

  if old.role = 'admin' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'active') then
    select count(*) into other_admins
    from public.team_members
    where role = 'admin' and status = 'active' and id <> old.id;
    if other_admins = 0 then
      raise exception 'There must always be at least one active admin.' using errcode = 'P0001';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

revoke execute on function private.protect_team_members() from public, anon, authenticated;

create trigger team_members_protect
  before update or delete on public.team_members
  for each row execute function private.protect_team_members();
