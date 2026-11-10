-- 0001_base: team members with roles, clients, alerts and the activity log.
-- Applied to the "seo-platform" Supabase project through the Supabase MCP.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'manager', 'va', 'writer', 'viewer');
create type public.member_status as enum ('active', 'invited', 'disabled');
-- Order matters: later values are more urgent (used for "Most urgent" sorting).
create type public.client_health as enum ('on_track', 'needs_look', 'action_needed');
create type public.client_stage as enum ('onboarding', 'active', 'paused', 'churned');
create type public.alert_severity as enum ('needs_look', 'action_needed');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.team_members (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null,
  role public.app_role not null default 'viewer',
  status public.member_status not null default 'invited',
  created_at timestamptz not null default now()
);
comment on table public.team_members is 'Agency staff who can sign in. One row per auth user.';

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  website text,
  city text,
  region text,
  country_code text not null default 'US' check (country_code ~ '^[A-Z]{2}$'),
  industry text,
  owner_id uuid references public.team_members (id) on delete set null,
  health public.client_health not null default 'on_track',
  stage public.client_stage not null default 'onboarding',
  keywords_target smallint not null default 20 check (keywords_target between 0 and 500),
  backlinks_target smallint not null default 20 check (backlinks_target between 0 and 500),
  articles_target smallint not null default 8 check (articles_target between 0 and 200),
  started_on date not null default current_date,
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.clients is 'SEO clients managed by the agency.';

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  severity public.alert_severity not null,
  title text not null,
  detail text,
  action_label text,
  action_href text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
comment on table public.alerts is 'Problems that need attention. Written by modules (connections, publishing, deliverables).';

create table public.activity_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.team_members (id) on delete set null,
  client_id uuid references public.clients (id) on delete cascade,
  action text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.activity_log is 'Append-only record of who did what.';

-- ---------------------------------------------------------------------------
-- Indexes (every foreign key plus the dashboard filters)
-- ---------------------------------------------------------------------------
create index clients_owner_id_idx on public.clients (owner_id);
create index clients_created_by_idx on public.clients (created_by);
create index clients_health_idx on public.clients (health);
create index clients_country_code_idx on public.clients (country_code);
create index alerts_client_id_idx on public.alerts (client_id);
create index alerts_open_idx on public.alerts (severity desc, created_at desc) where resolved_at is null;
create index activity_log_actor_id_idx on public.activity_log (actor_id);
create index activity_log_client_id_idx on public.activity_log (client_id);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
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

create or replace function public.is_team_member()
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

create or replace function public.has_role(roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = any (roles), false)
$$;

-- True until the first team member exists; the /setup page uses it.
create or replace function public.setup_required()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.team_members)
$$;

-- Health counts for the dashboard tiles (runs with the caller's RLS).
create or replace function public.client_health_counts()
returns table (health public.client_health, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.health, count(*)::bigint
  from public.clients c
  group by c.health
$$;

revoke execute on function public.current_app_role() from public, anon;
revoke execute on function public.is_team_member() from public, anon;
revoke execute on function public.has_role(public.app_role[]) from public, anon;
revoke execute on function public.client_health_counts() from public, anon;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_team_member() to authenticated;
grant execute on function public.has_role(public.app_role[]) to authenticated;
grant execute on function public.client_health_counts() to authenticated;
grant execute on function public.setup_required() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
-- Every new auth user gets a team_members row. The very first one becomes the
-- active admin; everyone after that starts as an invited viewer.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_first boolean;
begin
  perform pg_advisory_xact_lock(hashtext('team_members_bootstrap'));
  select not exists (select 1 from public.team_members) into is_first;

  insert into public.team_members (id, email, full_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when is_first then 'admin'::public.app_role else 'viewer'::public.app_role end,
    case when is_first then 'active'::public.member_status else 'invited'::public.member_status end
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.team_members enable row level security;
alter table public.clients enable row level security;
alter table public.alerts enable row level security;
alter table public.activity_log enable row level security;

-- team_members: any active member can see the team; only admins change it.
create policy "Team members can view the team"
  on public.team_members for select to authenticated
  using ((select public.is_team_member()));

create policy "Admins can update team members"
  on public.team_members for update to authenticated
  using ((select public.has_role('{admin}')))
  with check ((select public.has_role('{admin}')));

create policy "Admins can remove team members"
  on public.team_members for delete to authenticated
  using ((select public.has_role('{admin}')));

-- clients: members read; admins and managers write; admins delete.
-- (VAs and writers get narrowed to their task clients with the Tasks module.)
create policy "Team members can view clients"
  on public.clients for select to authenticated
  using ((select public.is_team_member()));

create policy "Admins and managers can add clients"
  on public.clients for insert to authenticated
  with check ((select public.has_role('{admin,manager}')));

create policy "Admins and managers can update clients"
  on public.clients for update to authenticated
  using ((select public.has_role('{admin,manager}')))
  with check ((select public.has_role('{admin,manager}')));

create policy "Admins can delete clients"
  on public.clients for delete to authenticated
  using ((select public.has_role('{admin}')));

-- alerts: same shape as clients.
create policy "Team members can view alerts"
  on public.alerts for select to authenticated
  using ((select public.is_team_member()));

create policy "Admins and managers can add alerts"
  on public.alerts for insert to authenticated
  with check ((select public.has_role('{admin,manager}')));

create policy "Admins and managers can update alerts"
  on public.alerts for update to authenticated
  using ((select public.has_role('{admin,manager}')))
  with check ((select public.has_role('{admin,manager}')));

create policy "Admins can delete alerts"
  on public.alerts for delete to authenticated
  using ((select public.has_role('{admin}')));

-- activity_log: append-only; members write their own entries.
create policy "Team members can view activity"
  on public.activity_log for select to authenticated
  using ((select public.is_team_member()));

create policy "Team members can log their own activity"
  on public.activity_log for insert to authenticated
  with check ((select public.is_team_member()) and actor_id = (select auth.uid()));
