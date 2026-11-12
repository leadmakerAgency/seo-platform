-- 0015_onboarding: the client onboarding link (connect.leadmaker.agency/<slug>-<token>).
-- The client never signs in. Every write goes through a token-checked
-- security-definer function (anon), is validated in the database, and is
-- saved immediately. Business details are stored as submitted and only reach
-- the client's profile when the team applies them. Passwords live only in
-- Supabase Vault.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.onboarding_status as enum ('not_started', 'in_progress', 'submitted', 'reviewed');
create type public.onboarding_step_status as enum ('todo', 'in_progress', 'done', 'skipped');
create type public.onboarding_link_status as enum ('active', 'revoked', 'expired');
create type public.website_platform as enum (
  'wordpress', 'webflow', 'shopify', 'wix', 'squarespace', 'godaddy', 'other', 'none', 'unknown'
);
create type public.website_manager as enum ('self', 'developer', 'agency', 'unknown');
create type public.website_access_status as enum ('todo', 'invited_us', 'login_in_vault', 'later');
create type public.google_access_status as enum ('todo', 'added', 'no_access', 'not_using', 'help');
create type public.login_source as enum ('onboarding', 'team');
create type public.connect_source as enum ('team', 'onboarding');

-- ---------------------------------------------------------------------------
-- Validation helpers (immutable, used in check constraints)
-- ---------------------------------------------------------------------------
create or replace function private.valid_list(p_items text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_items), 0) <= 50
    and not exists (
      select 1 from unnest(coalesce(p_items, '{}'::text[])) x
      where x is null or char_length(btrim(x)) = 0 or char_length(x) > 120
    )
$$;

-- {"mon": [{"open": "09:00", "close": "17:00"}], ..., "sun": []}
create or replace function private.valid_hours(p_hours jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  slot jsonb;
begin
  if p_hours is null then return true; end if;
  if jsonb_typeof(p_hours) <> 'object' then return false; end if;
  for k, v in select * from jsonb_each(p_hours) loop
    if k not in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun') then return false; end if;
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 4 then return false; end if;
    for slot in select * from jsonb_array_elements(v) loop
      if jsonb_typeof(slot) <> 'object'
        or coalesce(slot ->> 'open', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or coalesce(slot ->> 'close', '') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$' then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.onboarding_links (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9]{22}$'),
  status public.onboarding_link_status not null default 'active',
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  revoked_at timestamptz,
  writes_window_start timestamptz,
  writes_count integer not null default 0,
  check (expires_at > created_at)
);
comment on table public.onboarding_links is 'The onboarding link sent to a client. One active link per client.';
create unique index onboarding_links_one_active_idx on public.onboarding_links (client_id) where status = 'active';
create index onboarding_links_created_by_idx on public.onboarding_links (created_by);

create table public.client_onboarding (
  client_id uuid primary key references public.clients (id) on delete cascade,
  status public.onboarding_status not null default 'not_started',
  business_status public.onboarding_step_status not null default 'todo',
  social_status public.onboarding_step_status not null default 'todo',
  google_access_status public.onboarding_step_status not null default 'todo',
  website_status public.onboarding_step_status not null default 'todo',
  logins_status public.onboarding_step_status not null default 'todo',
  logins_skipped boolean not null default false,
  started_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.team_members (id) on delete set null,
  updated_at timestamptz not null default now()
);
comment on table public.client_onboarding is 'Onboarding progress per client (overall status and each step).';
create index client_onboarding_reviewed_by_idx on public.client_onboarding (reviewed_by);

create table public.onboarding_business_details (
  client_id uuid primary key references public.clients (id) on delete cascade,
  business_name text check (business_name is null or char_length(business_name) <= 160),
  legal_name text check (legal_name is null or char_length(legal_name) <= 160),
  phone text check (phone is null or phone ~ '^[0-9+()\-. x]{5,40}$'),
  public_email text check (public_email is null or (char_length(public_email) <= 254 and public_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  website text check (website is null or (char_length(website) <= 300 and website ~* '^https?://')),
  street text check (street is null or char_length(street) <= 200),
  city text check (city is null or char_length(city) <= 120),
  region text check (region is null or char_length(region) <= 120),
  postal_code text check (postal_code is null or char_length(postal_code) <= 20),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  service_area_business boolean not null default false,
  service_areas text[] not null default '{}' check (private.valid_list(service_areas)),
  primary_category text check (primary_category is null or char_length(primary_category) <= 120),
  other_categories text[] not null default '{}' check (private.valid_list(other_categories)),
  services text[] not null default '{}' check (private.valid_list(services)),
  hours jsonb check (private.valid_hours(hours)),
  year_founded smallint check (year_founded is null or year_founded between 1800 and 2100),
  description text check (description is null or char_length(description) <= 2000),
  contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  contact_role text check (contact_role is null or char_length(contact_role) <= 120),
  contact_email text check (contact_email is null or (char_length(contact_email) <= 254 and contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  contact_phone text check (contact_phone is null or contact_phone ~ '^[0-9+()\-. x]{5,40}$'),
  preferred_contact text check (preferred_contact is null or preferred_contact in ('email', 'phone', 'text', 'whatsapp')),
  notes text check (notes is null or char_length(notes) <= 2000),
  updated_at timestamptz not null default now(),
  applied_at timestamptz,
  applied_by uuid references public.team_members (id) on delete set null
);
comment on table public.onboarding_business_details is 'Business details exactly as the client submitted them. Applied to the profile only by the team.';
create index onboarding_business_details_applied_by_idx on public.onboarding_business_details (applied_by);

-- The team-approved business information the rest of the app uses.
create table public.client_business_profiles (
  client_id uuid primary key references public.clients (id) on delete cascade,
  business_name text check (business_name is null or char_length(business_name) <= 160),
  legal_name text check (legal_name is null or char_length(legal_name) <= 160),
  phone text check (phone is null or char_length(phone) <= 40),
  public_email text check (public_email is null or char_length(public_email) <= 254),
  website text check (website is null or char_length(website) <= 300),
  street text check (street is null or char_length(street) <= 200),
  city text check (city is null or char_length(city) <= 120),
  region text check (region is null or char_length(region) <= 120),
  postal_code text check (postal_code is null or char_length(postal_code) <= 20),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  service_area_business boolean not null default false,
  service_areas text[] not null default '{}' check (private.valid_list(service_areas)),
  primary_category text check (primary_category is null or char_length(primary_category) <= 120),
  other_categories text[] not null default '{}' check (private.valid_list(other_categories)),
  services text[] not null default '{}' check (private.valid_list(services)),
  hours jsonb check (private.valid_hours(hours)),
  year_founded smallint check (year_founded is null or year_founded between 1800 and 2100),
  description text check (description is null or char_length(description) <= 2000),
  contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  contact_role text check (contact_role is null or char_length(contact_role) <= 120),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 40),
  preferred_contact text check (preferred_contact is null or preferred_contact in ('email', 'phone', 'text', 'whatsapp')),
  updated_by uuid references public.team_members (id) on delete set null,
  updated_at timestamptz not null default now()
);
comment on table public.client_business_profiles is 'Team-approved business details (name, address, hours, services) used across the app.';
create index client_business_profiles_updated_by_idx on public.client_business_profiles (updated_by);

create table public.onboarding_google_access (
  client_id uuid primary key references public.clients (id) on delete cascade,
  sc_status public.google_access_status not null default 'todo',
  sc_property text check (sc_property is null or char_length(sc_property) <= 300),
  ga4_status public.google_access_status not null default 'todo',
  ga4_property text check (ga4_property is null or char_length(ga4_property) <= 300),
  notes text check (notes is null or char_length(notes) <= 1000),
  sc_verified_at timestamptz,
  ga4_verified_at timestamptz,
  verified_by uuid references public.team_members (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index onboarding_google_access_verified_by_idx on public.onboarding_google_access (verified_by);

create table public.onboarding_website (
  client_id uuid primary key references public.clients (id) on delete cascade,
  platform public.website_platform,
  url text check (url is null or (char_length(url) <= 300 and url ~* '^https?://')),
  managed_by public.website_manager,
  developer_name text check (developer_name is null or char_length(developer_name) <= 120),
  developer_email text check (developer_email is null or (char_length(developer_email) <= 254 and developer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  access_status public.website_access_status not null default 'todo',
  notes text check (notes is null or char_length(notes) <= 1000),
  updated_at timestamptz not null default now()
);

create table public.onboarding_social_choices (
  client_id uuid not null references public.clients (id) on delete cascade,
  platform public.social_platform not null,
  updated_at timestamptz not null default now(),
  primary key (client_id, platform)
);
comment on table public.onboarding_social_choices is 'Platforms the client said they don''t use, so the social step can finish.';

create table public.client_logins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  site_name text not null check (char_length(btrim(site_name)) between 1 and 120),
  site_url text check (site_url is null or (char_length(site_url) <= 300 and site_url ~* '^https?://')),
  username text not null check (char_length(btrim(username)) between 1 and 200),
  secret_id uuid not null unique,
  has_2fa boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 500),
  source public.login_source not null,
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  last_viewed_at timestamptz,
  last_viewed_by uuid references public.team_members (id) on delete set null
);
comment on table public.client_logins is 'Logins for sites with no API. The password is only in Supabase Vault (secret_id).';
create index client_logins_client_idx on public.client_logins (client_id);
create index client_logins_created_by_idx on public.client_logins (created_by);
create index client_logins_last_viewed_by_idx on public.client_logins (last_viewed_by);

alter table public.notifications
  add column client_id uuid references public.clients (id) on delete cascade;
create index notifications_client_id_idx on public.notifications (client_id);

alter table public.social_connect_attempts
  add column source public.connect_source not null default 'team',
  add column callback_key_hash text check (callback_key_hash is null or callback_key_hash ~ '^[0-9a-f]{64}$'),
  add constraint social_connect_attempts_onboarding_key check (source <> 'onboarding' or callback_key_hash is not null);

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

-- The client behind an active, unexpired link (null otherwise). With p_write,
-- counts the write and refuses more than 600 an hour on one link.
create or replace function private.onboarding_client(p_token text, p_write boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9]{22}$' then
    return null;
  end if;
  select id, client_id, status, expires_at, writes_window_start, writes_count
    into l from public.onboarding_links where token = p_token;
  if not found or l.status <> 'active' then
    return null;
  end if;
  if l.expires_at < now() then
    update public.onboarding_links set status = 'expired' where id = l.id and status = 'active';
    return null;
  end if;
  if p_write then
    if l.writes_window_start is null or l.writes_window_start < now() - interval '1 hour' then
      update public.onboarding_links set writes_window_start = now(), writes_count = 1 where id = l.id;
    elsif l.writes_count >= 600 then
      raise exception 'Too many changes in a short time. Wait a few minutes and try again.' using errcode = 'P0001';
    else
      update public.onboarding_links set writes_count = writes_count + 1 where id = l.id;
    end if;
  end if;
  return l.client_id;
end;
$$;

create or replace function private.log_onboarding(p_client_id uuid, p_action text, p_meta jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_log (actor_id, client_id, action, meta)
  values ((select auth.uid()), p_client_id, p_action, p_meta)
$$;

-- Notify whoever looks after the client; with no active owner, every active admin.
create or replace function private.notify_client_owner(
  p_client_id uuid,
  p_kind public.notification_kind
)
returns void
language sql
security definer
set search_path = ''
as $$
  with owner as (
    select o.id from public.clients c
    join public.team_members o on o.id = c.owner_id
    where c.id = p_client_id and o.status = 'active'
  )
  insert into public.notifications (recipient_id, kind, client_id, actor_id)
  select m.id, p_kind, p_client_id, (select auth.uid())
  from public.team_members m
  where m.status = 'active'
    and m.id is distinct from (select auth.uid())
    and (m.id in (select id from owner) or (not exists (select 1 from owner) and m.role = 'admin'))
$$;

create or replace function private.onboarding_href(p_client_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select '/clients/' || slug || '/onboarding' from public.clients where id = p_client_id
$$;

-- Recomputes every step from the stored answers. p_client_edit = true when the
-- client changed something (an edit after submitting reopens the onboarding).
create or replace function private.onboarding_refresh(p_client_id uuid, p_client_edit boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.client_onboarding%rowtype;
  b public.onboarding_business_details%rowtype;
  g public.onboarding_google_access%rowtype;
  w public.onboarding_website%rowtype;
  s_business public.onboarding_step_status := 'todo';
  s_social public.onboarding_step_status := 'todo';
  s_google public.onboarding_step_status := 'todo';
  s_website public.onboarding_step_status := 'todo';
  s_logins public.onboarding_step_status := 'todo';
  covered integer;
  total integer := cardinality(enum_range(null::public.social_platform));
  login_count integer;
  new_status public.onboarding_status;
begin
  insert into public.client_onboarding (client_id) values (p_client_id) on conflict (client_id) do nothing;
  select * into o from public.client_onboarding where client_id = p_client_id for update;

  select * into b from public.onboarding_business_details where client_id = p_client_id;
  if found then
    if coalesce(b.business_name, '') <> '' and coalesce(b.phone, '') <> ''
       and coalesce(b.primary_category, '') <> '' and coalesce(b.contact_name, '') <> ''
       and (coalesce(b.contact_email, '') <> '' or coalesce(b.contact_phone, '') <> '')
       and (
         (not b.service_area_business and coalesce(b.street, '') <> '' and coalesce(b.city, '') <> '')
         or (b.service_area_business and cardinality(b.service_areas) > 0)
       ) then
      s_business := 'done';
    else
      s_business := 'in_progress';
    end if;
  end if;

  select count(distinct p) into covered from (
    select platform as p from public.social_accounts
      where client_id = p_client_id and status <> 'removed'
    union
    select platform from public.onboarding_social_choices where client_id = p_client_id
  ) x;
  s_social := case when covered >= total then 'done' when covered > 0 then 'in_progress' else 'todo' end;

  select * into g from public.onboarding_google_access where client_id = p_client_id;
  if found then
    if g.sc_status in ('added', 'no_access', 'not_using') and g.ga4_status in ('added', 'no_access', 'not_using') then
      s_google := 'done';
    elsif g.sc_status <> 'todo' or g.ga4_status <> 'todo' or g.sc_property is not null or g.ga4_property is not null then
      s_google := 'in_progress';
    end if;
  end if;

  select * into w from public.onboarding_website where client_id = p_client_id;
  if found then
    if w.platform = 'none' or w.access_status in ('invited_us', 'login_in_vault') then
      s_website := 'done';
    elsif w.access_status = 'later' then
      s_website := 'skipped';
    elsif w.platform is not null or w.url is not null then
      s_website := 'in_progress';
    end if;
  end if;

  select count(*) into login_count from public.client_logins where client_id = p_client_id;
  s_logins := case when login_count > 0 then 'done' when o.logins_skipped then 'skipped' else 'todo' end;

  new_status := o.status;
  if p_client_edit then
    if o.status in ('not_started', 'submitted') then new_status := 'in_progress'; end if;
  elsif o.status = 'not_started'
        and (s_business <> 'todo' or s_social <> 'todo' or s_google <> 'todo' or s_website <> 'todo' or s_logins <> 'todo') then
    new_status := 'in_progress';
  end if;

  -- History: once per step when it gets finished.
  if s_business = 'done' and o.business_status <> 'done' then
    perform private.log_onboarding(p_client_id, 'onboarding.step_done', '{"step":"business"}');
  end if;
  if s_social = 'done' and o.social_status <> 'done' then
    perform private.log_onboarding(p_client_id, 'onboarding.step_done', '{"step":"social"}');
  end if;
  if s_google = 'done' and o.google_access_status <> 'done' then
    perform private.log_onboarding(p_client_id, 'onboarding.step_done', '{"step":"google"}');
  end if;
  if s_website in ('done', 'skipped') and o.website_status not in ('done', 'skipped') then
    perform private.log_onboarding(p_client_id, 'onboarding.step_done', '{"step":"website"}');
  end if;
  if s_logins in ('done', 'skipped') and o.logins_status not in ('done', 'skipped') then
    perform private.log_onboarding(p_client_id, 'onboarding.step_done', '{"step":"logins"}');
  end if;

  update public.client_onboarding
    set business_status = s_business,
        social_status = s_social,
        google_access_status = s_google,
        website_status = s_website,
        logins_status = s_logins,
        status = new_status,
        started_at = coalesce(started_at, case when new_status <> 'not_started' then now() end),
        updated_at = now()
    where client_id = p_client_id;

  return jsonb_build_object(
    'status', new_status,
    'business', s_business,
    'social', s_social,
    'google', s_google,
    'website', s_website,
    'logins', s_logins
  );
end;
$$;

-- Reviewed onboardings are read-only for the client (except connecting accounts).
create or replace function private.onboarding_writable(p_client_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.client_onboarding where client_id = p_client_id and status = 'reviewed') then
    raise exception 'Your onboarding is complete. Ask your account manager if something needs to change.' using errcode = 'P0001';
  end if;
end;
$$;
