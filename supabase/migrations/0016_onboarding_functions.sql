-- 0016_onboarding_functions: the onboarding link's client-facing functions
-- (anon, token-checked), the team-side functions, triggers, RLS and grants.
-- Tables and helpers are in 0015_onboarding.

-- ---------------------------------------------------------------------------
-- Client-facing functions (anon). Every one checks the token first.
-- ---------------------------------------------------------------------------
create or replace function public.onboarding_get(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cid uuid := private.onboarding_client(p_token, false);
  l record;
  result jsonb;
begin
  if cid is null then
    return null;
  end if;

  select id, first_opened_at, last_opened_at, expires_at into l
    from public.onboarding_links where token = p_token;
  if l.first_opened_at is null then
    update public.onboarding_links set first_opened_at = now(), last_opened_at = now() where id = l.id;
    perform private.log_onboarding(cid, 'onboarding.opened', '{}');
    perform private.notify_client_owner(cid, 'onboarding_opened');
  elsif l.last_opened_at is null or l.last_opened_at < now() - interval '10 minutes' then
    update public.onboarding_links set last_opened_at = now() where id = l.id;
  end if;

  perform private.onboarding_refresh(cid, false);

  select jsonb_build_object(
    'client', jsonb_build_object('name', c.name, 'slug', c.slug),
    'contact', nullif(split_part(coalesce(nullif(own.full_name, ''), split_part(own.email, '@', 1)), ' ', 1), ''),
    'expires_at', l.expires_at,
    'onboarding', (
      select jsonb_build_object(
        'status', o.status, 'business', o.business_status, 'social', o.social_status,
        'google', o.google_access_status, 'website', o.website_status, 'logins', o.logins_status,
        'logins_skipped', o.logins_skipped, 'submitted_at', o.submitted_at
      ) from public.client_onboarding o where o.client_id = cid
    ),
    'business', (
      select to_jsonb(b) - 'client_id' - 'applied_at' - 'applied_by' - 'updated_at'
      from public.onboarding_business_details b where b.client_id = cid
    ),
    'google', (
      select jsonb_build_object('sc_status', g.sc_status, 'sc_property', g.sc_property,
        'ga4_status', g.ga4_status, 'ga4_property', g.ga4_property, 'notes', g.notes)
      from public.onboarding_google_access g where g.client_id = cid
    ),
    'website', (
      select jsonb_build_object('platform', w.platform, 'url', w.url, 'managed_by', w.managed_by,
        'developer_name', w.developer_name, 'developer_email', w.developer_email,
        'access_status', w.access_status, 'notes', w.notes)
      from public.onboarding_website w where w.client_id = cid
    ),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', a.platform,
        'name', coalesce(a.location_name, a.display_name, a.username),
        'status', a.status
      ) order by a.connected_at)
      from public.social_accounts a where a.client_id = cid and a.status <> 'removed'
    ), '[]'::jsonb),
    'not_using', coalesce((
      select jsonb_agg(sc.platform) from public.onboarding_social_choices sc where sc.client_id = cid
    ), '[]'::jsonb),
    'logins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cl.id, 'site_name', cl.site_name, 'site_url', cl.site_url,
        'username', cl.username, 'has_2fa', cl.has_2fa
      ) order by cl.created_at)
      from public.client_logins cl where cl.client_id = cid
    ), '[]'::jsonb)
  )
  into result
  from public.clients c
  left join public.team_members own on own.id = c.owner_id
  where c.id = cid;

  return result;
end;
$$;

create or replace function public.onboarding_save_business(p_token text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := private.onboarding_client(p_token, true);
begin
  if cid is null then
    raise exception 'This link isn''t active.' using errcode = '42501';
  end if;
  perform private.onboarding_writable(cid);
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Nothing to save.' using errcode = 'P0001';
  end if;

  insert into public.onboarding_business_details (client_id) values (cid) on conflict (client_id) do nothing;

  update public.onboarding_business_details d set
    business_name = case when p_data ? 'business_name' then nullif(btrim(p_data ->> 'business_name'), '') else d.business_name end,
    legal_name = case when p_data ? 'legal_name' then nullif(btrim(p_data ->> 'legal_name'), '') else d.legal_name end,
    phone = case when p_data ? 'phone' then nullif(btrim(p_data ->> 'phone'), '') else d.phone end,
    public_email = case when p_data ? 'public_email' then lower(nullif(btrim(p_data ->> 'public_email'), '')) else d.public_email end,
    website = case when p_data ? 'website' then nullif(btrim(p_data ->> 'website'), '') else d.website end,
    street = case when p_data ? 'street' then nullif(btrim(p_data ->> 'street'), '') else d.street end,
    city = case when p_data ? 'city' then nullif(btrim(p_data ->> 'city'), '') else d.city end,
    region = case when p_data ? 'region' then nullif(btrim(p_data ->> 'region'), '') else d.region end,
    postal_code = case when p_data ? 'postal_code' then nullif(btrim(p_data ->> 'postal_code'), '') else d.postal_code end,
    country_code = case when p_data ? 'country_code' then upper(nullif(btrim(p_data ->> 'country_code'), '')) else d.country_code end,
    service_area_business = case when p_data ? 'service_area_business' then coalesce((p_data ->> 'service_area_business')::boolean, false) else d.service_area_business end,
    service_areas = case when p_data ? 'service_areas' then coalesce((select array_agg(btrim(x)) from jsonb_array_elements_text(p_data -> 'service_areas') x where btrim(x) <> ''), '{}') else d.service_areas end,
    primary_category = case when p_data ? 'primary_category' then nullif(btrim(p_data ->> 'primary_category'), '') else d.primary_category end,
    other_categories = case when p_data ? 'other_categories' then coalesce((select array_agg(btrim(x)) from jsonb_array_elements_text(p_data -> 'other_categories') x where btrim(x) <> ''), '{}') else d.other_categories end,
    services = case when p_data ? 'services' then coalesce((select array_agg(btrim(x)) from jsonb_array_elements_text(p_data -> 'services') x where btrim(x) <> ''), '{}') else d.services end,
    hours = case when p_data ? 'hours' then case when jsonb_typeof(p_data -> 'hours') = 'object' then p_data -> 'hours' end else d.hours end,
    year_founded = case when p_data ? 'year_founded' then nullif(p_data ->> 'year_founded', '')::smallint else d.year_founded end,
    description = case when p_data ? 'description' then nullif(btrim(p_data ->> 'description'), '') else d.description end,
    contact_name = case when p_data ? 'contact_name' then nullif(btrim(p_data ->> 'contact_name'), '') else d.contact_name end,
    contact_role = case when p_data ? 'contact_role' then nullif(btrim(p_data ->> 'contact_role'), '') else d.contact_role end,
    contact_email = case when p_data ? 'contact_email' then lower(nullif(btrim(p_data ->> 'contact_email'), '')) else d.contact_email end,
    contact_phone = case when p_data ? 'contact_phone' then nullif(btrim(p_data ->> 'contact_phone'), '') else d.contact_phone end,
    preferred_contact = case when p_data ? 'preferred_contact' then nullif(p_data ->> 'preferred_contact', '') else d.preferred_contact end,
    notes = case when p_data ? 'notes' then nullif(btrim(p_data ->> 'notes'), '') else d.notes end,
    updated_at = now()
  where d.client_id = cid;

  return private.onboarding_refresh(cid, true);
end;
$$;

create or replace function public.onboarding_save_google_access(p_token text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := private.onboarding_client(p_token, true);
begin
  if cid is null then
    raise exception 'This link isn''t active.' using errcode = '42501';
  end if;
  perform private.onboarding_writable(cid);
  insert into public.onboarding_google_access (client_id) values (cid) on conflict (client_id) do nothing;
  update public.onboarding_google_access g set
    sc_status = case when p_data ? 'sc_status' then (p_data ->> 'sc_status')::public.google_access_status else g.sc_status end,
    sc_property = case when p_data ? 'sc_property' then nullif(btrim(p_data ->> 'sc_property'), '') else g.sc_property end,
    ga4_status = case when p_data ? 'ga4_status' then (p_data ->> 'ga4_status')::public.google_access_status else g.ga4_status end,
    ga4_property = case when p_data ? 'ga4_property' then nullif(btrim(p_data ->> 'ga4_property'), '') else g.ga4_property end,
    notes = case when p_data ? 'notes' then nullif(btrim(p_data ->> 'notes'), '') else g.notes end,
    updated_at = now()
  where g.client_id = cid;
  return private.onboarding_refresh(cid, true);
end;
$$;

create or replace function public.onboarding_save_website(p_token text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := private.onboarding_client(p_token, true);
begin
  if cid is null then
    raise exception 'This link isn''t active.' using errcode = '42501';
  end if;
  perform private.onboarding_writable(cid);
  insert into public.onboarding_website (client_id) values (cid) on conflict (client_id) do nothing;
  update public.onboarding_website w set
    platform = case when p_data ? 'platform' then nullif(p_data ->> 'platform', '')::public.website_platform else w.platform end,
    url = case when p_data ? 'url' then nullif(btrim(p_data ->> 'url'), '') else w.url end,
    managed_by = case when p_data ? 'managed_by' then nullif(p_data ->> 'managed_by', '')::public.website_manager else w.managed_by end,
    developer_name = case when p_data ? 'developer_name' then nullif(btrim(p_data ->> 'developer_name'), '') else w.developer_name end,
    developer_email = case when p_data ? 'developer_email' then lower(nullif(btrim(p_data ->> 'developer_email'), '')) else w.developer_email end,
    access_status = case when p_data ? 'access_status' then (p_data ->> 'access_status')::public.website_access_status else w.access_status end,
    notes = case when p_data ? 'notes' then nullif(btrim(p_data ->> 'notes'), '') else w.notes end,
    updated_at = now()
  where w.client_id = cid;
  return private.onboarding_refresh(cid, true);
end;
$$;

create or replace function public.onboarding_set_not_using(
  p_token text,
  p_platforms public.social_platform[],
  p_not_using boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := private.onboarding_client(p_token, true);
begin
  if cid is null then
    raise exception 'This link isn''t active.' using errcode = '42501';
  end if;
  if p_not_using then
    insert into public.onboarding_social_choices (client_id, platform)
    select cid, p from unnest(coalesce(p_platforms, '{}')) p
    on conflict (client_id, platform) do update set updated_at = now();
  else
    delete from public.onboarding_social_choices
    where client_id = cid and platform = any (coalesce(p_platforms, '{}'));
  end if;
  return private.onboarding_refresh(cid, true);
end;
$$;

create or replace function public.onboarding_add_login(
  p_token text,
  p_site_name text,
  p_site_url text,
  p_username text,
  p_password text,
  p_has_2fa boolean,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := private.onboarding_client(p_token, true);
  secret uuid;
  new_id uuid;
begin
  if cid is null then
    raise exception 'This link isn''t active.' using errcode = '42501';
  end if;
  perform private.onboarding_writable(cid);
  if coalesce(char_length(p_password), 0) not between 1 and 500 then
    raise exception 'Enter the password (up to 500 characters).' using errcode = 'P0001';
  end if;
  if (select count(*) from public.client_logins where client_id = cid) >= 40 then
    raise exception 'That''s the most logins we can take here. Send the rest to your account manager.' using errcode = 'P0001';
  end if;

  secret := vault.create_secret(p_password, null, 'Client login (onboarding)');
  insert into public.client_logins (client_id, site_name, site_url, username, secret_id, has_2fa, notes, source)
  values (
    cid, btrim(p_site_name), nullif(btrim(coalesce(p_site_url, '')), ''), btrim(p_username), secret,
    coalesce(p_has_2fa, false), nullif(btrim(coalesce(p_notes, '')), ''), 'onboarding'
  )
  returning id into new_id;

  update public.client_onboarding set logins_skipped = false where client_id = cid;
  return private.onboarding_refresh(cid, true) || jsonb_build_object('login_id', new_id);
end;
$$;

create or replace function public.onboarding_remove_login(p_token text, p_login_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := private.onboarding_client(p_token, true);
begin
  if cid is null then
    raise exception 'This link isn''t active.' using errcode = '42501';
  end if;
  perform private.onboarding_writable(cid);
  delete from public.client_logins where id = p_login_id and client_id = cid;
  return private.onboarding_refresh(cid, true);
end;
$$;

create or replace function public.onboarding_skip_logins(p_token text, p_skip boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := private.onboarding_client(p_token, true);
begin
  if cid is null then
    raise exception 'This link isn''t active.' using errcode = '42501';
  end if;
  perform private.onboarding_writable(cid);
  perform private.onboarding_refresh(cid, true);
  update public.client_onboarding set logins_skipped = coalesce(p_skip, false) where client_id = cid;
  return private.onboarding_refresh(cid, true);
end;
$$;

create or replace function public.onboarding_submit(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := private.onboarding_client(p_token, true);
  steps jsonb;
  cname text;
begin
  if cid is null then
    raise exception 'This link isn''t active.' using errcode = '42501';
  end if;
  perform private.onboarding_writable(cid);
  steps := private.onboarding_refresh(cid, false);
  if steps ->> 'business' <> 'done' then
    raise exception 'Fill in your business details first.' using errcode = 'P0001';
  end if;

  update public.client_onboarding
    set status = 'submitted', submitted_at = now(), updated_at = now()
    where client_id = cid;

  select name into cname from public.clients where id = cid;
  perform private.log_onboarding(cid, 'onboarding.submitted', steps);
  perform private.notify_client_owner(cid, 'onboarding_submitted');
  perform private.raise_alert(
    cid, 'onboarding:' || cid::text, 'needs_look',
    'Finished onboarding: review the details',
    'Check the business details, apply them to the profile and mark the onboarding reviewed.',
    'Review', private.onboarding_href(cid)
  );
  return steps || jsonb_build_object('status', 'submitted');
end;
$$;

-- ---------------------------------------------------------------------------
-- Team-side functions (authenticated)
-- ---------------------------------------------------------------------------

-- The password of a stored login. Admins and managers, and VAs and writers on
-- clients in their tasks. Every reveal is logged (never the password).
create or replace function public.reveal_client_login(p_login_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  secret text;
begin
  select id, client_id, site_name, secret_id into l from public.client_logins where id = p_login_id;
  if not found
     or not private.has_role('{admin,manager,va,writer}')
     or not private.can_see_client(l.client_id) then
    raise exception 'You can''t see this login.' using errcode = '42501';
  end if;
  select decrypted_secret into secret from vault.decrypted_secrets where id = l.secret_id;
  update public.client_logins set last_viewed_at = now(), last_viewed_by = (select auth.uid()) where id = l.id;
  perform private.log_onboarding(l.client_id, 'vault.viewed', jsonb_build_object('site', l.site_name));
  return secret;
end;
$$;

create or replace function public.add_client_login(
  p_client_id uuid,
  p_site_name text,
  p_site_url text,
  p_username text,
  p_password text,
  p_has_2fa boolean,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret uuid;
  new_id uuid;
begin
  if not private.has_role('{admin,manager}') or not private.can_see_client(p_client_id) then
    raise exception 'Only admins and account managers can add logins.' using errcode = '42501';
  end if;
  if coalesce(char_length(p_password), 0) not between 1 and 500 then
    raise exception 'Enter the password (up to 500 characters).' using errcode = 'P0001';
  end if;
  secret := vault.create_secret(p_password, null, 'Client login (team)');
  insert into public.client_logins (client_id, site_name, site_url, username, secret_id, has_2fa, notes, source, created_by)
  values (
    p_client_id, btrim(p_site_name), nullif(btrim(coalesce(p_site_url, '')), ''), btrim(p_username), secret,
    coalesce(p_has_2fa, false), nullif(btrim(coalesce(p_notes, '')), ''), 'team', (select auth.uid())
  )
  returning id into new_id;
  perform private.log_onboarding(p_client_id, 'vault.added', jsonb_build_object('site', btrim(p_site_name)));
  if exists (select 1 from public.client_onboarding where client_id = p_client_id) then
    perform private.onboarding_refresh(p_client_id, false);
  end if;
  return new_id;
end;
$$;

create or replace function public.remove_client_login(p_login_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
begin
  select id, client_id, site_name into l from public.client_logins where id = p_login_id;
  if not found or not private.has_role('{admin,manager}') or not private.can_see_client(l.client_id) then
    raise exception 'Only admins and account managers can remove logins.' using errcode = '42501';
  end if;
  delete from public.client_logins where id = l.id;
  perform private.log_onboarding(l.client_id, 'vault.removed', jsonb_build_object('site', l.site_name));
  if exists (select 1 from public.client_onboarding where client_id = l.client_id) then
    perform private.onboarding_refresh(l.client_id, false);
  end if;
end;
$$;

-- Copies the chosen submitted fields into the approved profile (and the core
-- client columns that mirror them).
create or replace function public.apply_onboarding_profile(p_client_id uuid, p_fields text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.onboarding_business_details%rowtype;
  f text[] := coalesce(p_fields, '{}');
begin
  if not private.has_role('{admin,manager}') or not private.can_see_client(p_client_id) then
    raise exception 'Only admins and account managers can apply onboarding details.' using errcode = '42501';
  end if;
  select * into d from public.onboarding_business_details where client_id = p_client_id;
  if not found then
    raise exception 'The client hasn''t sent any business details yet.' using errcode = 'P0001';
  end if;

  insert into public.client_business_profiles (client_id) values (p_client_id) on conflict (client_id) do nothing;
  update public.client_business_profiles p set
    business_name = case when 'business_name' = any (f) then d.business_name else p.business_name end,
    legal_name = case when 'legal_name' = any (f) then d.legal_name else p.legal_name end,
    phone = case when 'phone' = any (f) then d.phone else p.phone end,
    public_email = case when 'public_email' = any (f) then d.public_email else p.public_email end,
    website = case when 'website' = any (f) then d.website else p.website end,
    street = case when 'address' = any (f) then d.street else p.street end,
    city = case when 'address' = any (f) then d.city else p.city end,
    region = case when 'address' = any (f) then d.region else p.region end,
    postal_code = case when 'address' = any (f) then d.postal_code else p.postal_code end,
    country_code = case when 'address' = any (f) then d.country_code else p.country_code end,
    service_area_business = case when 'service_areas' = any (f) then d.service_area_business else p.service_area_business end,
    service_areas = case when 'service_areas' = any (f) then d.service_areas else p.service_areas end,
    primary_category = case when 'categories' = any (f) then d.primary_category else p.primary_category end,
    other_categories = case when 'categories' = any (f) then d.other_categories else p.other_categories end,
    services = case when 'services' = any (f) then d.services else p.services end,
    hours = case when 'hours' = any (f) then d.hours else p.hours end,
    year_founded = case when 'about' = any (f) then d.year_founded else p.year_founded end,
    description = case when 'about' = any (f) then d.description else p.description end,
    contact_name = case when 'contact' = any (f) then d.contact_name else p.contact_name end,
    contact_role = case when 'contact' = any (f) then d.contact_role else p.contact_role end,
    contact_email = case when 'contact' = any (f) then d.contact_email else p.contact_email end,
    contact_phone = case when 'contact' = any (f) then d.contact_phone else p.contact_phone end,
    preferred_contact = case when 'contact' = any (f) then d.preferred_contact else p.preferred_contact end,
    updated_by = (select auth.uid()),
    updated_at = now()
  where p.client_id = p_client_id;

  update public.clients c set
    name = case when 'business_name' = any (f) and coalesce(d.business_name, '') <> '' then d.business_name else c.name end,
    website = case when 'website' = any (f) then coalesce(d.website, c.website) else c.website end,
    city = case when 'address' = any (f) and d.city is not null then d.city else c.city end,
    region = case when 'address' = any (f) and d.region is not null then d.region else c.region end,
    country_code = case when 'address' = any (f) and d.country_code is not null then d.country_code else c.country_code end,
    industry = case when 'categories' = any (f) and d.primary_category is not null then d.primary_category else c.industry end
  where c.id = p_client_id;

  update public.onboarding_business_details
    set applied_at = now(), applied_by = (select auth.uid())
    where client_id = p_client_id;
  perform private.log_onboarding(p_client_id, 'onboarding.applied', jsonb_build_object('fields', to_jsonb(f)));
end;
$$;

create or replace function public.onboarding_mark_verified(p_client_id uuid, p_which text, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role('{admin,manager}') or not private.can_see_client(p_client_id) then
    raise exception 'Only admins and account managers can do this.' using errcode = '42501';
  end if;
  if p_which not in ('sc', 'ga4') then
    raise exception 'Unknown property.' using errcode = '22023';
  end if;
  insert into public.onboarding_google_access (client_id) values (p_client_id) on conflict (client_id) do nothing;
  update public.onboarding_google_access set
    sc_verified_at = case when p_which = 'sc' then case when p_verified then now() end else sc_verified_at end,
    ga4_verified_at = case when p_which = 'ga4' then case when p_verified then now() end else ga4_verified_at end,
    verified_by = (select auth.uid())
  where client_id = p_client_id;
end;
$$;

-- Marks the onboarding reviewed (read-only for the client), resolves the alert,
-- and optionally moves the client from Onboarding to Active.
create or replace function public.onboarding_mark_reviewed(p_client_id uuid, p_activate boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role('{admin,manager}') or not private.can_see_client(p_client_id) then
    raise exception 'Only admins and account managers can do this.' using errcode = '42501';
  end if;
  insert into public.client_onboarding (client_id) values (p_client_id) on conflict (client_id) do nothing;
  update public.client_onboarding
    set status = 'reviewed', reviewed_at = now(), reviewed_by = (select auth.uid()), updated_at = now()
    where client_id = p_client_id;
  perform private.resolve_alert('onboarding:' || p_client_id::text);
  if p_activate then
    update public.clients set stage = 'active' where id = p_client_id and stage = 'onboarding';
  end if;
  perform private.log_onboarding(p_client_id, 'onboarding.reviewed', jsonb_build_object('activated', coalesce(p_activate, false)));
end;
$$;

-- Lets the client edit again after a review (for example new details).
create or replace function public.onboarding_reopen(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role('{admin,manager}') or not private.can_see_client(p_client_id) then
    raise exception 'Only admins and account managers can do this.' using errcode = '42501';
  end if;
  update public.client_onboarding
    set status = 'in_progress', reviewed_at = null, reviewed_by = null, updated_at = now()
    where client_id = p_client_id and status = 'reviewed';
  perform private.log_onboarding(p_client_id, 'onboarding.reopened', '{}');
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- A login row and its Vault secret live and die together (also on client delete).
create or replace function private.client_logins_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where id = old.secret_id;
  return null;
end;
$$;

create trigger client_logins_after_delete
  after delete on public.client_logins
  for each row execute function private.client_logins_after_delete();

create or replace function private.onboarding_links_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_onboarding(new.client_id, 'onboarding.link_created', jsonb_build_object('expires_at', new.expires_at));
    insert into public.client_onboarding (client_id) values (new.client_id) on conflict (client_id) do nothing;
  elsif new.status = 'revoked' and old.status <> 'revoked' then
    perform private.log_onboarding(new.client_id, 'onboarding.link_revoked', '{}');
  end if;
  return null;
end;
$$;

create trigger onboarding_links_after_write
  after insert or update on public.onboarding_links
  for each row execute function private.onboarding_links_after_write();

create or replace function private.onboarding_links_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.client_id is distinct from old.client_id or new.token is distinct from old.token then
    raise exception 'A link can''t change client or token. Create a new link instead.' using errcode = '42501';
  end if;
  if new.status = 'revoked' and old.status <> 'revoked' then
    new.revoked_at := now();
  end if;
  if new.status = 'active' and old.status <> 'active' then
    raise exception 'A revoked or expired link can''t be turned back on. Create a new link instead.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger onboarding_links_before_update
  before update on public.onboarding_links
  for each row execute function private.onboarding_links_before_update();

-- Connected accounts count toward the social step as soon as they arrive.
create or replace function private.social_accounts_onboarding_refresh()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.client_onboarding
    where client_id = new.client_id and status <> 'reviewed'
  ) then
    perform private.onboarding_refresh(new.client_id, false);
  end if;
  return null;
end;
$$;

create trigger social_accounts_onboarding_refresh
  after insert or update of status on public.social_accounts
  for each row execute function private.social_accounts_onboarding_refresh();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.onboarding_links enable row level security;
alter table public.client_onboarding enable row level security;
alter table public.onboarding_business_details enable row level security;
alter table public.client_business_profiles enable row level security;
alter table public.onboarding_google_access enable row level security;
alter table public.onboarding_website enable row level security;
alter table public.onboarding_social_choices enable row level security;
alter table public.client_logins enable row level security;

create policy "Admins and managers see onboarding links"
  on public.onboarding_links for select to authenticated
  using ((select private.has_role('{admin,manager}')) and private.can_see_client(client_id));
create policy "Admins and managers create onboarding links"
  on public.onboarding_links for insert to authenticated
  with check ((select private.has_role('{admin,manager}')) and private.can_see_client(client_id) and created_by = (select auth.uid()));
create policy "Admins and managers update onboarding links"
  on public.onboarding_links for update to authenticated
  using ((select private.has_role('{admin,manager}')) and private.can_see_client(client_id))
  with check ((select private.has_role('{admin,manager}')) and private.can_see_client(client_id));

-- Answers: readable by the team members who can see the client. Written only
-- through the functions above.
create policy "Team sees onboarding progress"
  on public.client_onboarding for select to authenticated
  using ((select private.is_team_member()) and private.can_see_client(client_id));
create policy "Team sees submitted business details"
  on public.onboarding_business_details for select to authenticated
  using ((select private.is_team_member()) and private.can_see_client(client_id));
create policy "Team sees business profiles"
  on public.client_business_profiles for select to authenticated
  using ((select private.is_team_member()) and private.can_see_client(client_id));
create policy "Team sees Google access answers"
  on public.onboarding_google_access for select to authenticated
  using ((select private.is_team_member()) and private.can_see_client(client_id));
create policy "Team sees website answers"
  on public.onboarding_website for select to authenticated
  using ((select private.is_team_member()) and private.can_see_client(client_id));
create policy "Team sees social choices"
  on public.onboarding_social_choices for select to authenticated
  using ((select private.is_team_member()) and private.can_see_client(client_id));
create policy "Team sees stored logins (never the password)"
  on public.client_logins for select to authenticated
  using ((select private.is_team_member()) and private.can_see_client(client_id));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
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
-- Check constraints call these, so every role that writes those tables needs them.
grant usage on schema private to authenticated, service_role;
grant execute on function private.valid_list(text[]) to anon, authenticated, service_role;
grant execute on function private.valid_hours(jsonb) to anon, authenticated, service_role;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.onboarding_get(text)',
    'public.onboarding_save_business(text, jsonb)',
    'public.onboarding_save_google_access(text, jsonb)',
    'public.onboarding_save_website(text, jsonb)',
    'public.onboarding_set_not_using(text, public.social_platform[], boolean)',
    'public.onboarding_add_login(text, text, text, text, text, boolean, text)',
    'public.onboarding_remove_login(text, uuid)',
    'public.onboarding_skip_logins(text, boolean)',
    'public.onboarding_submit(text)'
  ] loop
    execute format('revoke execute on function %s from public', fn);
    execute format('grant execute on function %s to anon, authenticated, service_role', fn);
  end loop;
  foreach fn in array array[
    'public.reveal_client_login(uuid)',
    'public.add_client_login(uuid, text, text, text, text, boolean, text)',
    'public.remove_client_login(uuid)',
    'public.apply_onboarding_profile(uuid, text[])',
    'public.onboarding_mark_verified(uuid, text, boolean)',
    'public.onboarding_mark_reviewed(uuid, boolean)',
    'public.onboarding_reopen(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
