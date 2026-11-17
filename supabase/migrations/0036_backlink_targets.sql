-- 0036_backlink_targets: Find places searches the places the team chose for the client
-- (cities, regions, whole countries), not the client's own city.
--   backlink_targets: the places, each a DataForSEO location (checked against dfs_locations)
--   backlink_runs.target_ids, backlink_run_queries.target_id, backlink_opportunities.target_ids
--   {place} footprints replace the city ones (the old ones are turned off, not deleted)
--   request_backlink_discovery(client, target_ids): picks places, 24 h per place, 60 searches max
--   add / update / remove_backlink_target, backlink_quota.targets, store merges target_ids
-- Plan: docs/plans/backlinks/06-target-places.md

-- ---------------------------------------------------------------------------
-- Places
-- ---------------------------------------------------------------------------

create table public.backlink_targets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  location_code integer not null,
  location_name text not null check (char_length(location_name) <= 300),
  kind text not null check (kind in ('city', 'region', 'country')),
  country_iso text not null check (country_iso ~ '^[A-Z]{2}$'),
  region_name text check (region_name is null or char_length(region_name) <= 120),
  region_code text check (region_code is null or char_length(region_code) <= 10),
  city text check (city is null or char_length(city) <= 120),
  label text not null check (char_length(label) between 1 and 160),
  search_name text not null check (char_length(search_name) between 2 and 100 and search_name !~ '[{}:]'),
  active boolean not null default true,
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, location_code)
);
comment on table public.backlink_targets is 'Places a client wants to be found in; Find places searches these.';
create index backlink_targets_created_by_idx on public.backlink_targets (created_by);

-- At most 25 active places per client.
create or replace function private.backlink_targets_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active and (
    select count(*) from public.backlink_targets
    where client_id = new.client_id and active and id <> new.id
  ) >= 25 then
    raise exception 'A client can have 25 active places. Turn one off or remove it first.' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger backlink_targets_limit
  before insert or update of active on public.backlink_targets
  for each row execute function private.backlink_targets_limit();

alter table public.backlink_targets enable row level security;
create policy "See backlink places for clients you can see (targets)"
  on public.backlink_targets for select to authenticated
  using ((select private.can_see_client(client_id)));
revoke all on public.backlink_targets from anon;
revoke insert, update, delete on public.backlink_targets from authenticated;

-- ---------------------------------------------------------------------------
-- Runs, searches and places remember which place they were for
-- ---------------------------------------------------------------------------

alter table public.backlink_runs add column target_ids uuid[] not null default '{}';

alter table public.backlink_run_queries
  add column target_id uuid references public.backlink_targets (id) on delete set null;
create index backlink_run_queries_target_idx on public.backlink_run_queries (target_id);
alter table public.backlink_run_queries drop constraint backlink_run_queries_run_id_query_norm_key;
alter table public.backlink_run_queries
  add constraint backlink_run_queries_run_target_query_key unique nulls not distinct (run_id, target_id, query_norm);

alter table public.backlink_opportunities add column target_ids uuid[] not null default '{}';
create index backlink_opportunities_targets_idx on public.backlink_opportunities using gin (target_ids);

-- ---------------------------------------------------------------------------
-- Footprints: {place} (the place's search words) replaces {city} {state_code}
-- ---------------------------------------------------------------------------

do $$
declare
  c text;
begin
  select conname into c from pg_constraint
    where conrelid = 'public.backlink_footprints'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%state_code%';
  if c is not null then
    execute format('alter table public.backlink_footprints drop constraint %I', c);
  end if;
end $$;
alter table public.backlink_footprints add constraint backlink_footprints_template_check check (
  char_length(template) between 3 and 200
  and template !~* '(^|[[:space:]])-?(site|inurl|intitle|intext|allinurl|allintitle|allintext|allinanchor|inanchor|filetype|link|related|info|define|cache):'
  and regexp_replace(template, '\{(place|city|state|state_code|service|industry)\}', '', 'g') !~ '[{}]'
);

update public.backlink_footprints set active = false, updated_at = now()
  where scope in ('geo', 'service') and template like '%{city}%';

insert into public.backlink_footprints (template, scope, sort) values
  ('{place} business directory', 'geo', 10),
  ('add your business {place}', 'geo', 11),
  ('submit business listing {place}', 'geo', 12),
  ('{place} chamber of commerce', 'geo', 13),
  ('{place} business association', 'geo', 14),
  ('{place} local business listings', 'geo', 15),
  ('{place} community news', 'geo', 16),
  ('{service} {place} directory', 'service', 20),
  ('best {service} {place}', 'service', 21),
  ('top rated {service} {place}', 'service', 22),
  ('{service} contractors {place}', 'service', 23)
on conflict (template) do update set active = true, scope = excluded.scope, sort = excluded.sort;

-- ---------------------------------------------------------------------------
-- Searches per run (the app's buildQueries uses the same limits)
-- ---------------------------------------------------------------------------

-- Upper bound: per place up to 7 place searches + up to 5 service searches, plus up to 4
-- industry searches once per run.
create or replace function private.backlink_search_estimate(p_client_id uuid, p_places integer)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  geo_n integer;
  service_n integer;
  industry_n integer;
  n_services integer;
  has_industry boolean;
begin
  select count(*) filter (where scope = 'geo'), count(*) filter (where scope = 'service'),
         count(*) filter (where scope = 'industry')
    into geo_n, service_n, industry_n
    from public.backlink_footprints where active;
  select least(3, greatest(
           coalesce(cardinality(p.services), 0),
           case when coalesce(p.primary_category, c.industry, '') <> '' then 1 else 0 end)),
         coalesce(p.primary_category, c.industry, '') <> ''
    into n_services, has_industry
    from public.clients c
    left join public.client_business_profiles p on p.client_id = c.id
    where c.id = p_client_id;
  return p_places * (least(7, geo_n) + least(5, service_n * coalesce(n_services, 0)))
    + case when has_industry then least(4, industry_n) else 0 end;
end;
$$;

-- When a place was last searched (runs that didn't fail).
create or replace function private.backlink_target_last_search(p_target_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(r.created_at) from public.backlink_runs r
  where p_target_id = any (r.target_ids) and r.status <> 'failed'
$$;

-- ---------------------------------------------------------------------------
-- Team functions
-- ---------------------------------------------------------------------------

create or replace function public.add_backlink_target(
  p_client_id uuid, p_location_code integer, p_label text, p_search_name text, p_region_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  loc record;
  parts text[];
  v_kind text;
  v_city text;
  v_region text;
  tid uuid;
begin
  perform private.require_backlinks_worker(p_client_id);
  select code, name, type, country_iso into loc from public.dfs_locations
    where source = 'google' and code = p_location_code;
  if loc.code is null or loc.country_iso is null then
    raise exception 'Pick a place from the list.' using errcode = 'P0001';
  end if;
  parts := string_to_array(loc.name, ',');
  v_kind := case
    when loc.type = 'Country' then 'country'
    when loc.type in ('City', 'Municipality', 'Neighborhood') then 'city'
    else 'region' end;
  v_city := case when v_kind = 'city' then btrim(parts[1]) end;
  v_region := case
    when v_kind = 'region' then btrim(parts[1])
    when v_kind = 'city' and cardinality(parts) >= 3 then btrim(parts[cardinality(parts) - 1])
    end;

  insert into public.backlink_targets (
    client_id, location_code, location_name, kind, country_iso, region_name, region_code, city,
    label, search_name, created_by
  ) values (
    p_client_id, loc.code, loc.name, v_kind, upper(loc.country_iso), v_region,
    nullif(btrim(coalesce(p_region_code, '')), ''), v_city,
    left(coalesce(nullif(btrim(p_label), ''), loc.name), 160),
    lower(regexp_replace(btrim(coalesce(p_search_name, '')), '\s+', ' ', 'g')),
    (select auth.uid())
  )
  on conflict (client_id, location_code) do update set active = true
  returning id into tid;

  perform private.log_backlinks(p_client_id, 'backlink.target_added',
    jsonb_build_object('place', left(coalesce(nullif(btrim(p_label), ''), loc.name), 160)));
  return tid;
end;
$$;

create or replace function public.update_backlink_target(p_id uuid, p_search_name text, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.backlink_targets%rowtype;
begin
  select * into t from public.backlink_targets where id = p_id;
  if t.id is null then
    raise exception 'That place was removed.' using errcode = 'P0002';
  end if;
  perform private.require_backlinks_worker(t.client_id);
  update public.backlink_targets set
    search_name = coalesce(lower(regexp_replace(btrim(nullif(p_search_name, '')), '\s+', ' ', 'g')), search_name),
    active = coalesce(p_active, active),
    updated_at = now()
  where id = p_id;
end;
$$;

create or replace function public.remove_backlink_target(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.backlink_targets%rowtype;
begin
  select * into t from public.backlink_targets where id = p_id;
  if t.id is null then
    return;
  end if;
  perform private.require_backlinks_worker(t.client_id);
  delete from public.backlink_targets where id = p_id;
  perform private.log_backlinks(t.client_id, 'backlink.target_removed', jsonb_build_object('place', t.label));
end;
$$;

-- ---------------------------------------------------------------------------
-- Find places for the chosen places
-- ---------------------------------------------------------------------------

drop function if exists public.request_backlink_discovery(uuid);

create or replace function public.request_backlink_discovery(p_client_id uuid, p_target_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  rid uuid;
  ids uuid[];
  n_ok integer;
  recent record;
  lim integer;
  used integer;
  est integer;
  problem text;
begin
  perform private.require_backlinks_worker(p_client_id);
  select id, stage into c from public.clients where id = p_client_id;
  if not found then
    raise exception 'Client not found.' using errcode = 'P0002';
  end if;
  if c.stage in ('paused', 'churned') then
    raise exception 'This client is paused or has left. Searches are off.' using errcode = 'P0001';
  end if;

  -- A second click returns the search that is already open.
  select id into rid from public.backlink_runs
    where client_id = p_client_id and status in ('queued', 'running');
  if rid is not null then
    return rid;
  end if;

  select coalesce(array_agg(distinct x), '{}') into ids from unnest(coalesce(p_target_ids, '{}')) x;
  if cardinality(ids) = 0 then
    raise exception 'Pick at least one place to search.' using errcode = 'P0001';
  end if;
  select count(*) into n_ok from public.backlink_targets
    where id = any (ids) and client_id = p_client_id and active;
  if n_ok <> cardinality(ids) then
    raise exception 'Some of these places were removed or turned off. Reload the page.' using errcode = 'P0001';
  end if;

  select t.label, private.backlink_target_last_search(t.id) as at into recent
    from public.backlink_targets t
    where t.id = any (ids) and private.backlink_target_last_search(t.id) > now() - interval '24 hours'
    order by 2 desc limit 1;
  if recent.label is not null then
    raise exception '% was searched in the last 24 hours. Untick it, or try again after %.',
      recent.label,
      to_char((recent.at + interval '24 hours') at time zone 'America/Phoenix', 'Dy FMDD Mon, FMHH12:MI AM')
      using errcode = 'P0001';
  end if;

  est := private.backlink_search_estimate(p_client_id, cardinality(ids));
  if est > 60 then
    raise exception 'That is about % searches; a search can do 60 at most. Pick fewer places.', est
      using errcode = 'P0001';
  end if;

  select backlink_runs_per_client_month into lim from public.dfs_settings where id;
  select count(*) into used from public.backlink_runs
    where client_id = p_client_id and status <> 'failed' and created_at >= private.agency_month_start();
  if used >= lim then
    raise exception 'This client has used its % searches this month. An admin can raise the limit.', lim
      using errcode = 'P0001';
  end if;

  problem := private.backlinks_budget_problem();
  if problem is not null then
    raise exception '%', problem using errcode = 'P0001';
  end if;

  begin
    insert into public.backlink_runs (client_id, created_by, target_ids)
    values (p_client_id, (select auth.uid()), ids)
    returning id into rid;
  exception when unique_violation then
    select id into rid from public.backlink_runs
      where client_id = p_client_id and status in ('queued', 'running');
  end;
  return rid;
end;
$$;

-- ---------------------------------------------------------------------------
-- The store merges which places found each site
-- ---------------------------------------------------------------------------

create or replace function public.dfs_store_backlink_candidates(p_run_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.backlink_runs%rowtype;
  it jsonb;
  dir record;
  opp record;
  st public.opportunity_status;
  reason text;
  tids uuid[];
  n_new integer := 0;
  n_known integer := 0;
begin
  select * into run from public.backlink_runs where id = p_run_id;
  if run.id is null then
    raise exception 'Unknown search %', p_run_id using errcode = 'P0002';
  end if;

  for it in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into public.directories (site_key, domain, rank_target, name, type, geo_scope, country_code, region, city, industries)
    values (
      it->>'site_key', it->>'domain', coalesce(it->>'rank_target', it->>'site_key'),
      left(coalesce(nullif(it->>'name', ''), it->>'site_key'), 200),
      coalesce((it->>'type')::public.directory_type, 'other'),
      coalesce(it->>'geo_scope', 'unknown'), it->>'country_code', it->>'region', it->>'city',
      coalesce(array(select jsonb_array_elements_text(it->'industries')), '{}')
    )
    on conflict (site_key) do update set
      last_seen_at = now(),
      type = case
        when public.directories.type_source = 'auto' and public.directories.type = 'other' then excluded.type
        else public.directories.type end,
      industries = array(select distinct x from unnest(public.directories.industries || excluded.industries) x limit 30)
    returning id, status, is_core into dir;

    st := coalesce((it->>'status')::public.opportunity_status, 'pending_review');
    reason := case when st = 'filtered' then coalesce(it->>'filter_reason', 'looks_like_business') end;
    if st not in ('pending_review', 'filtered') then
      st := 'pending_review';
      reason := null;
    end if;
    if dir.status = 'blocked' or (not dir.is_core and exists (
      select 1 from public.directories b
      where b.site_key = it->>'domain' and b.status = 'blocked' and b.id <> dir.id
    )) then
      st := 'filtered';
      reason := 'blocked';
    end if;

    -- Only this run's places count.
    tids := array(
      select distinct x::uuid from jsonb_array_elements_text(coalesce(it->'target_ids', '[]'::jsonb)) x
      where x ~ '^[0-9a-f-]{36}$' and x::uuid = any (run.target_ids)
    );

    insert into public.backlink_opportunities as o (
      client_id, directory_id, status, filter_reason, is_core, found_url, found_title, found_snippet,
      best_position, is_local, relevance, first_run_id, last_run_id, target_ids
    )
    values (
      run.client_id, dir.id, st, reason, coalesce((it->>'is_core')::boolean, false),
      case when it->>'found_url' ~ '^https?://' then left(it->>'found_url', 2000) end,
      left(it->>'found_title', 300), left(it->>'found_snippet', 600),
      (it->>'best_position')::smallint, coalesce((it->>'is_local')::boolean, false),
      least(1, greatest(0, coalesce((it->>'relevance')::numeric, 0))), run.id, run.id, tids
    )
    on conflict (client_id, directory_id) do update set
      last_run_id = excluded.last_run_id,
      target_ids = array(select distinct x from unnest(o.target_ids || excluded.target_ids) x),
      is_core = o.is_core or excluded.is_core,
      is_local = o.is_local or excluded.is_local,
      found_url = case when o.found_url is null or excluded.best_position < coalesce(o.best_position, 32767)
        then coalesce(excluded.found_url, o.found_url) else o.found_url end,
      found_title = case when o.found_title is null or excluded.best_position < coalesce(o.best_position, 32767)
        then coalesce(excluded.found_title, o.found_title) else o.found_title end,
      found_snippet = case when o.found_snippet is null or excluded.best_position < coalesce(o.best_position, 32767)
        then coalesce(excluded.found_snippet, o.found_snippet) else o.found_snippet end,
      best_position = least(o.best_position, excluded.best_position),
      relevance = greatest(o.relevance, excluded.relevance),
      status = case
        when o.decided_by is null and o.status = 'filtered' and o.filter_reason <> 'blocked'
          and excluded.status = 'pending_review' then 'pending_review'::public.opportunity_status
        when o.decided_by is null and o.status = 'pending_review' and excluded.filter_reason = 'blocked'
          then 'filtered'::public.opportunity_status
        else o.status end,
      filter_reason = case
        when o.decided_by is null and o.status = 'filtered' and o.filter_reason <> 'blocked'
          and excluded.status = 'pending_review' then null
        when o.decided_by is null and o.status = 'pending_review' and excluded.filter_reason = 'blocked'
          then 'blocked'
        else o.filter_reason end,
      updated_at = now()
    returning o.id, (o.xmax = 0) as inserted into opp;

    if opp.inserted then n_new := n_new + 1; else n_known := n_known + 1; end if;

    insert into public.backlink_opportunity_hits (opportunity_id, client_id, query_id, footprint_id, query, position, url)
    select opp.id, run.client_id, (h->>'query_id')::uuid, nullif(h->>'footprint_id', '')::uuid,
      left(h->>'query', 700), (h->>'position')::smallint,
      case when h->>'url' ~ '^https?://' then left(h->>'url', 2000) end
    from jsonb_array_elements(coalesce(it->'hits', '[]'::jsonb)) h
    where exists (
      select 1 from public.backlink_run_queries q
      where q.id = (h->>'query_id')::uuid and q.client_id = run.client_id
    )
    on conflict (opportunity_id, query_id) do nothing;
  end loop;

  return jsonb_build_object('new', n_new, 'known', n_known);
end;
$$;

-- ---------------------------------------------------------------------------
-- The page's limits and the places
-- ---------------------------------------------------------------------------

create or replace function public.backlink_quota(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.dfs_settings%rowtype;
  used integer;
  open_run public.backlink_runs%rowtype;
begin
  if not private.can_see_client(p_client_id) then
    return null;
  end if;
  select * into s from public.dfs_settings where id;
  select count(*) into used from public.backlink_runs
    where client_id = p_client_id and status <> 'failed' and created_at >= private.agency_month_start();
  select * into open_run from public.backlink_runs
    where client_id = p_client_id and status in ('queued', 'running') limit 1;
  return jsonb_build_object(
    'used', used,
    'limit', s.backlink_runs_per_client_month,
    'next_search_at', null,
    'budget_problem', private.backlinks_budget_problem(),
    'access', s.backlinks_access,
    'per_place', private.backlink_search_estimate(p_client_id, 1) - private.backlink_search_estimate(p_client_id, 0),
    'fixed', private.backlink_search_estimate(p_client_id, 0),
    'max_searches', 60,
    'open_run', case when open_run.id is null then null else jsonb_build_object(
      'id', open_run.id, 'status', open_run.status,
      'queries_done', open_run.queries_done, 'queries_total', open_run.queries_total,
      'target_ids', to_jsonb(open_run.target_ids)
    ) end,
    'strength_running', exists (
      select 1 from public.backlink_strength_checks
      where client_id = p_client_id and status = 'running' and created_at > now() - interval '10 minutes'
    ),
    'targets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'label', t.label, 'kind', t.kind, 'country_iso', t.country_iso,
        'location_name', t.location_name, 'search_name', t.search_name, 'active', t.active,
        'last_searched_at', ls.at,
        'searchable_at', case when ls.at > now() - interval '24 hours' then ls.at + interval '24 hours' end,
        'places', (select count(*) from public.backlink_opportunities o
                   where o.client_id = p_client_id and t.id = any (o.target_ids) and o.status <> 'filtered')
      ) order by t.created_at)
      from public.backlink_targets t
      cross join lateral (select private.backlink_target_last_search(t.id) as at) ls
      where t.client_id = p_client_id
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function private.backlink_targets_limit() from public, anon, authenticated;
revoke execute on function private.backlink_search_estimate(uuid, integer) from public, anon;
revoke execute on function private.backlink_target_last_search(uuid) from public, anon;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.add_backlink_target(uuid, integer, text, text, text)',
    'public.update_backlink_target(uuid, text, boolean)',
    'public.remove_backlink_target(uuid)',
    'public.request_backlink_discovery(uuid, uuid[])',
    'public.backlink_quota(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  execute 'revoke execute on function public.dfs_store_backlink_candidates(uuid, jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.dfs_store_backlink_candidates(uuid, jsonb) to service_role';
end $$;
