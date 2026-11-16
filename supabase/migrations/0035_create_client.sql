-- 0035_create_client: the Add client page saves everything in one transaction.
--   create_client(p, p_slug, p_link_token): the client, the team-approved business profile,
--     the onboarding row, optionally the onboarding link, and the history line. Admins and
--     account managers only. A taken slug gets -2, -3… (also when two people add the same
--     name at the same moment).
--   onboarding_get: when the client hasn't saved business details yet, the wizard starts
--     from the team profile (flag business_from_profile), so the client only confirms them.

create or replace function public.create_client(p jsonb, p_slug text, p_link_token text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  new_id uuid;
  final_slug text;
  attempt integer := 1;
  failed_constraint text;
  v_name text := nullif(btrim(coalesce(p->>'name', '')), '');
  v_country text := upper(btrim(coalesce(p->>'country_code', '')));
  v_city text := nullif(btrim(coalesce(p->>'city', '')), '');
  v_owner uuid := nullif(p->>'owner_id', '')::uuid;
  services text[];
  other_categories text[];
  service_areas text[];
begin
  if not private.has_role('{admin,manager}') then
    raise exception 'Only admins and account managers can add clients.' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) < 2 then
    raise exception 'Enter the business name.' using errcode = 'P0001';
  end if;
  if v_country !~ '^[A-Z]{2}$' then
    raise exception 'Choose a country.' using errcode = 'P0001';
  end if;
  if v_city is null then
    raise exception 'Enter the city.' using errcode = 'P0001';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_slug) > 60 or p_slug in ('new', 'search') then
    raise exception 'The client name can''t be used for a link. Change it a little.' using errcode = 'P0001';
  end if;
  if p_link_token is not null and p_link_token !~ '^[A-Za-z0-9]{22}$' then
    raise exception 'Invalid onboarding link.' using errcode = 'P0001';
  end if;
  if v_owner is not null and not exists (
    select 1 from public.team_members where id = v_owner and status = 'active'
  ) then
    raise exception 'Choose an active team member to look after the client.' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(x), '{}') into services
    from (select distinct btrim(v) as x from jsonb_array_elements_text(coalesce(p->'services', '[]')) v where btrim(v) <> '') s;
  select coalesce(array_agg(x), '{}') into other_categories
    from (select distinct btrim(v) as x from jsonb_array_elements_text(coalesce(p->'other_categories', '[]')) v where btrim(v) <> '') s;
  select coalesce(array_agg(x), '{}') into service_areas
    from (select distinct btrim(v) as x from jsonb_array_elements_text(coalesce(p->'service_areas', '[]')) v where btrim(v) <> '') s;

  -- The client, with the first free slug.
  loop
    final_slug := case when attempt = 1 then p_slug else p_slug || '-' || attempt end;
    begin
      insert into public.clients (
        name, slug, website, city, region, country_code, industry, owner_id, stage, package,
        started_on, keywords_target, backlinks_target, articles_target, gbp_posts_target,
        review_requests_target, ai_fixes_target, created_by
      ) values (
        v_name,
        final_slug,
        nullif(btrim(coalesce(p->>'website', '')), ''),
        v_city,
        nullif(btrim(coalesce(p->>'region', '')), ''),
        v_country,
        nullif(btrim(coalesce(p->>'industry', '')), ''),
        v_owner,
        'onboarding',
        coalesce(nullif(p->>'package', ''), 'seo')::public.package_kind,
        coalesce(nullif(p->>'started_on', '')::date, (now() at time zone 'America/Phoenix')::date),
        coalesce((p->>'keywords_target')::smallint, 20),
        coalesce((p->>'backlinks_target')::smallint, 20),
        coalesce((p->>'articles_target')::smallint, 8),
        coalesce((p->>'gbp_posts_target')::smallint, 8),
        coalesce((p->>'review_requests_target')::smallint, 30),
        coalesce((p->>'ai_fixes_target')::smallint, 8),
        me
      )
      returning id into new_id;
      exit;
    exception when unique_violation then
      get stacked diagnostics failed_constraint = constraint_name;
      if failed_constraint is distinct from 'clients_slug_key' then
        raise;
      end if;
      attempt := attempt + 1;
      if attempt > 50 then
        raise exception 'There are already many clients with this name. Change it a little.' using errcode = 'P0001';
      end if;
    end;
  end loop;

  -- What the team already knows, as the approved profile (the rest of the app reads this).
  insert into public.client_business_profiles (
    client_id, business_name, phone, public_email, website, street, city, region, postal_code,
    country_code, service_area_business, service_areas, primary_category, other_categories,
    services, year_founded, description, contact_name, contact_role, contact_email,
    contact_phone, preferred_contact, updated_by
  ) values (
    new_id,
    v_name,
    nullif(btrim(coalesce(p->>'phone', '')), ''),
    nullif(lower(btrim(coalesce(p->>'public_email', ''))), ''),
    nullif(btrim(coalesce(p->>'website', '')), ''),
    nullif(btrim(coalesce(p->>'street', '')), ''),
    v_city,
    nullif(btrim(coalesce(p->>'region', '')), ''),
    nullif(btrim(coalesce(p->>'postal_code', '')), ''),
    v_country,
    coalesce((p->>'service_area_business')::boolean, false),
    service_areas,
    nullif(btrim(coalesce(p->>'industry', '')), ''),
    other_categories,
    services,
    nullif(p->>'year_founded', '')::smallint,
    nullif(btrim(coalesce(p->>'description', '')), ''),
    nullif(btrim(coalesce(p->>'contact_name', '')), ''),
    nullif(btrim(coalesce(p->>'contact_role', '')), ''),
    nullif(lower(btrim(coalesce(p->>'contact_email', ''))), ''),
    nullif(btrim(coalesce(p->>'contact_phone', '')), ''),
    nullif(p->>'preferred_contact', ''),
    me
  );

  insert into public.client_onboarding (client_id) values (new_id) on conflict (client_id) do nothing;

  if p_link_token is not null then
    insert into public.onboarding_links (client_id, token, created_by) values (new_id, p_link_token, me);
  end if;

  insert into public.activity_log (actor_id, client_id, action, meta)
  values (me, new_id, 'client.created', jsonb_build_object('name', v_name, 'onboarding_link', p_link_token is not null));

  return jsonb_build_object('id', new_id, 'slug', final_slug);
end;
$$;

revoke execute on function public.create_client(jsonb, text, text) from public, anon;
grant execute on function public.create_client(jsonb, text, text) to authenticated;

-- The onboarding wizard starts from the team profile until the client saves their own copy.
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
    'business', coalesce(
      (
        select to_jsonb(b) - 'client_id' - 'applied_at' - 'applied_by' - 'updated_at'
        from public.onboarding_business_details b where b.client_id = cid
      ),
      (
        select to_jsonb(bp) - 'client_id' - 'updated_by' - 'updated_at'
        from public.client_business_profiles bp where bp.client_id = cid
      )
    ),
    'business_from_profile', not exists (
      select 1 from public.onboarding_business_details b where b.client_id = cid
    ) and exists (
      select 1 from public.client_business_profiles bp where bp.client_id = cid
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
