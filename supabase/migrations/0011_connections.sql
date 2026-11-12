-- 0011_connections: client social and Google Business Profile connections
-- through Zernio. Zernio is the source of truth; these tables mirror it.
-- One Zernio profile per client (externalId = clients.id). Status changes on
-- social_accounts raise and resolve alerts, notify and write history in
-- triggers, so the app never has to remember to.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.social_platform as enum (
  'googlebusiness', 'facebook', 'instagram', 'linkedin', 'youtube',
  'twitter', 'tiktok', 'pinterest', 'threads'
);
create type public.social_account_status as enum ('connected', 'needs_reconnect', 'removed');
create type public.connect_attempt_status as enum ('pending', 'connected', 'failed', 'expired', 'cancelled');
create type public.connect_method as enum ('oauth', 'invite');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.zernio_profiles (
  -- restrict: a client with a Zernio profile can't be deleted until it has
  -- been offboarded (accounts disconnected, profile deleted), so Zernio
  -- never keeps billing for a client we no longer have.
  client_id uuid primary key references public.clients (id) on delete restrict,
  zernio_profile_id text not null unique check (zernio_profile_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (client_id, zernio_profile_id)
);
comment on table public.zernio_profiles is 'The Zernio profile of each client (one per client). Zernio externalId = clients.id.';

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  zernio_profile_id text not null,
  zernio_account_id text not null unique check (zernio_account_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  platform public.social_platform not null,
  platform_user_id text check (platform_user_id is null or char_length(platform_user_id) <= 200),
  username text check (username is null or char_length(username) <= 300),
  display_name text check (display_name is null or char_length(display_name) <= 300),
  avatar_url text check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 2000)),
  profile_url text check (profile_url is null or (profile_url ~ '^https://' and char_length(profile_url) <= 2000)),
  location_id text check (location_id is null or char_length(location_id) <= 200),
  location_name text check (location_name is null or char_length(location_name) <= 300),
  status public.social_account_status not null default 'connected',
  can_post boolean,
  can_fetch_analytics boolean,
  token_expires_at timestamptz,
  unhealthy_since timestamptz,
  issues text[] not null default '{}',
  disconnect_reason text check (disconnect_reason is null or char_length(disconnect_reason) <= 500),
  connected_by uuid references public.team_members (id) on delete set null,
  connected_at timestamptz not null default now(),
  removed_at timestamptz,
  removal_grace_ends_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- An account can only ever sit on the client that owns its Zernio profile.
  foreign key (client_id, zernio_profile_id)
    references public.zernio_profiles (client_id, zernio_profile_id) on delete cascade
);
comment on table public.social_accounts is 'Mirror of the client''s Zernio-connected accounts. No tokens are stored.';

create table public.social_connect_attempts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  platform public.social_platform not null,
  method public.connect_method not null,
  reconnect_account_id uuid references public.social_accounts (id) on delete set null,
  status public.connect_attempt_status not null default 'pending',
  invite_url text check (invite_url is null or (invite_url ~ '^https://' and char_length(invite_url) <= 2000)),
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  result_account_id uuid references public.social_accounts (id) on delete set null,
  error_code text check (error_code is null or char_length(error_code) <= 100),
  error_message text check (error_message is null or char_length(error_message) <= 500),
  zernio_request_id text check (zernio_request_id is null or char_length(zernio_request_id) <= 200),
  check (expires_at > created_at),
  check ((method = 'invite') = (invite_url is not null))
);
comment on table public.social_connect_attempts is 'Each Connect click or client connect link, so a callback can be tied to who started it.';

create table public.zernio_webhook_events (
  id text primary key check (char_length(id) between 1 and 200),
  event text not null check (char_length(event) <= 100),
  zernio_profile_id text,
  zernio_account_id text,
  client_id uuid references public.clients (id) on delete set null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  last_error text check (last_error is null or char_length(last_error) <= 1000)
);
comment on table public.zernio_webhook_events is 'Zernio webhook deliveries: dedupe on the event id, audit and retry. Service role only.';

alter table public.alerts add column source_key text check (source_key is null or char_length(source_key) <= 200);
alter table public.notifications
  add column social_account_id uuid references public.social_accounts (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create unique index alerts_open_source_key_idx on public.alerts (source_key)
  where source_key is not null and resolved_at is null;
create index social_accounts_client_status_idx on public.social_accounts (client_id, status);
create index social_accounts_profile_idx on public.social_accounts (client_id, zernio_profile_id);
create index social_accounts_platform_user_idx on public.social_accounts (platform, platform_user_id)
  where platform_user_id is not null;
create index social_accounts_needs_reconnect_idx on public.social_accounts (status) where status = 'needs_reconnect';
create index social_accounts_connected_by_idx on public.social_accounts (connected_by);
create index zernio_profiles_created_by_idx on public.zernio_profiles (created_by);
create index social_connect_attempts_client_idx on public.social_connect_attempts (client_id, status);
create index social_connect_attempts_created_by_idx on public.social_connect_attempts (created_by);
create index social_connect_attempts_reconnect_idx on public.social_connect_attempts (reconnect_account_id);
create index social_connect_attempts_result_idx on public.social_connect_attempts (result_account_id);
create index zernio_webhook_events_unprocessed_idx on public.zernio_webhook_events (received_at)
  where processed_at is null;
create index zernio_webhook_events_client_idx on public.zernio_webhook_events (client_id);
create index notifications_social_account_idx on public.notifications (social_account_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.platform_label(p_platform public.social_platform)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_platform
    when 'googlebusiness' then 'Google Business Profile'
    when 'facebook' then 'Facebook'
    when 'instagram' then 'Instagram'
    when 'linkedin' then 'LinkedIn'
    when 'youtube' then 'YouTube'
    when 'twitter' then 'X'
    when 'tiktok' then 'TikTok'
    when 'pinterest' then 'Pinterest'
    when 'threads' then 'Threads'
  end
$$;

-- One open alert per source_key: raising again refreshes it instead of
-- creating a duplicate.
create or replace function private.raise_alert(
  p_client_id uuid,
  p_source_key text,
  p_severity public.alert_severity,
  p_title text,
  p_detail text,
  p_action_label text,
  p_action_href text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.alerts (client_id, source_key, severity, title, detail, action_label, action_href)
  values (p_client_id, p_source_key, p_severity, p_title, p_detail, p_action_label, p_action_href)
  on conflict (source_key) where source_key is not null and resolved_at is null
  do update set severity = excluded.severity,
                title = excluded.title,
                detail = excluded.detail,
                action_label = excluded.action_label,
                action_href = excluded.action_href
$$;

create or replace function private.resolve_alert(p_source_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.alerts set resolved_at = now()
  where source_key = p_source_key and resolved_at is null
$$;

create or replace function private.connection_href(p_client_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select '/clients/' || slug || '/connections' from public.clients where id = p_client_id
$$;

create or replace function private.log_connection_activity(
  p_client_id uuid,
  p_action text,
  p_meta jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_log (actor_id, client_id, action, meta)
  values ((select auth.uid()), p_client_id, p_action, p_meta)
$$;

-- Tell whoever looks after the client; with no owner, every active admin.
create or replace function private.notify_connection_lost(p_client_id uuid, p_account_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  with owner as (
    select o.id
    from public.clients c
    join public.team_members o on o.id = c.owner_id
    where c.id = p_client_id and o.status = 'active'
  )
  insert into public.notifications (recipient_id, kind, social_account_id, actor_id)
  select m.id, 'connection_lost', p_account_id, (select auth.uid())
  from public.team_members m
  where m.status = 'active'
    and m.id is distinct from (select auth.uid())
    and (
      m.id in (select id from owner)
      or (not exists (select 1 from owner) and m.role = 'admin')
    )
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function private.social_accounts_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    if new.client_id is distinct from old.client_id
       or new.zernio_profile_id is distinct from old.zernio_profile_id
       or new.zernio_account_id is distinct from old.zernio_account_id
       or new.platform is distinct from old.platform then
      raise exception 'A connected account can''t move to another client or platform.' using errcode = '42501';
    end if;
  end if;

  if new.status = 'removed' and (tg_op = 'INSERT' or old.status <> 'removed') then
    new.removed_at := coalesce(new.removed_at, now());
  elsif new.status = 'connected' then
    new.removed_at := null;
    new.removal_grace_ends_at := null;
    new.disconnect_reason := null;
    new.unhealthy_since := null;
  elsif new.status = 'needs_reconnect' then
    new.unhealthy_since := coalesce(new.unhealthy_since, now());
  end if;
  return new;
end;
$$;

create or replace function private.social_accounts_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  label text := private.platform_label(new.platform);
  name text := coalesce(nullif(new.location_name, ''), nullif(new.display_name, ''), nullif(new.username, ''), label);
  meta jsonb := jsonb_build_object('platform', new.platform, 'name', name, 'account_id', new.id);
  alert_key text := 'connection:' || new.id::text;
begin
  if tg_op = 'INSERT' then
    perform private.log_connection_activity(new.client_id, 'connection.connected', meta);
    if new.status = 'needs_reconnect' then
      perform private.raise_alert(
        new.client_id, alert_key, 'action_needed',
        label || ' needs reconnecting',
        coalesce(new.disconnect_reason, 'The connection stopped working. Reconnect it to keep posting.'),
        'Reconnect', private.connection_href(new.client_id)
      );
    end if;
    return null;
  end if;

  if new.status is not distinct from old.status then
    -- Same status: keep an open alert's reason current.
    if new.status = 'needs_reconnect' and new.disconnect_reason is distinct from old.disconnect_reason then
      perform private.raise_alert(
        new.client_id, alert_key, 'action_needed',
        label || ' needs reconnecting',
        coalesce(new.disconnect_reason, 'The connection stopped working. Reconnect it to keep posting.'),
        'Reconnect', private.connection_href(new.client_id)
      );
    end if;
    return null;
  end if;

  if new.status = 'needs_reconnect' then
    perform private.log_connection_activity(
      new.client_id, 'connection.needs_reconnect',
      meta || jsonb_build_object('reason', new.disconnect_reason)
    );
    perform private.raise_alert(
      new.client_id, alert_key, 'action_needed',
      label || ' needs reconnecting',
      coalesce(new.disconnect_reason, 'The connection stopped working. Reconnect it to keep posting.'),
      'Reconnect', private.connection_href(new.client_id)
    );
    perform private.notify_connection_lost(new.client_id, new.id);
  elsif new.status = 'connected' then
    perform private.log_connection_activity(new.client_id, 'connection.restored', meta);
    perform private.resolve_alert(alert_key);
  elsif new.status = 'removed' then
    perform private.log_connection_activity(new.client_id, 'connection.removed', meta);
    perform private.resolve_alert(alert_key);
  end if;
  return null;
end;
$$;

create trigger social_accounts_before_write
  before insert or update on public.social_accounts
  for each row execute function private.social_accounts_before_write();

create trigger social_accounts_after_write
  after insert or update on public.social_accounts
  for each row execute function private.social_accounts_after_write();

create or replace function private.social_connect_attempts_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'failed' and old.status <> 'failed' then
    perform private.log_connection_activity(
      new.client_id, 'connection.failed',
      jsonb_build_object('platform', new.platform, 'error', new.error_code)
    );
  end if;
  return null;
end;
$$;

create trigger social_connect_attempts_after_update
  after update on public.social_connect_attempts
  for each row execute function private.social_connect_attempts_after_update();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.zernio_profiles enable row level security;
alter table public.social_accounts enable row level security;
alter table public.social_connect_attempts enable row level security;
alter table public.zernio_webhook_events enable row level security; -- no policies: service role only

create policy "Admins and managers see Zernio profiles"
  on public.zernio_profiles for select to authenticated
  using ((select private.has_role('{admin,manager}')) and private.can_see_client(client_id));

create policy "Admins and managers create Zernio profiles"
  on public.zernio_profiles for insert to authenticated
  with check ((select private.has_role('{admin,manager}')) and created_by = (select auth.uid()));

create policy "Team sees connected accounts of clients they can see"
  on public.social_accounts for select to authenticated
  using ((select private.is_team_member()) and private.can_see_client(client_id));

create policy "Admins and managers add connected accounts"
  on public.social_accounts for insert to authenticated
  with check ((select private.has_role('{admin,manager}')));

create policy "Admins and managers update connected accounts"
  on public.social_accounts for update to authenticated
  using ((select private.has_role('{admin,manager}')))
  with check ((select private.has_role('{admin,manager}')));

create policy "Admins and managers see connect attempts"
  on public.social_connect_attempts for select to authenticated
  using ((select private.has_role('{admin,manager}')) and private.can_see_client(client_id));

create policy "Admins and managers start connect attempts"
  on public.social_connect_attempts for insert to authenticated
  with check ((select private.has_role('{admin,manager}')) and created_by = (select auth.uid()));

create policy "Admins and managers update connect attempts"
  on public.social_connect_attempts for update to authenticated
  using ((select private.has_role('{admin,manager}')))
  with check ((select private.has_role('{admin,manager}')));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on public.zernio_webhook_events from anon, authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on function private.portal_can_upload(text) to anon, authenticated;
grant execute on function private.can_see_request_object(text) to authenticated;
grant execute on function private.can_see_client(uuid) to authenticated;
grant execute on function private.has_role(public.app_role[]) to authenticated;
grant execute on function private.is_team_member() to authenticated;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.can_see_task(uuid) to authenticated;
grant execute on function private.can_work_task(uuid) to authenticated;
grant execute on function private.agency_today() to authenticated;
