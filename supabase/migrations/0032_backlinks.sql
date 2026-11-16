-- 0032_backlinks: tables for Backlinks (docs/plans/backlinks).
--   directories                 the shared library: one row per place you can get listed on,
--                               with its strength (Domain Rank) and spam score. No client data.
--   backlink_footprints         search templates ("{city} {state_code} chamber of commerce")
--   serp_result_cache           parsed Google results, shared by every client in a city (service role)
--   backlink_runs               one "Find places" search per client
--   backlink_run_queries        the searches of a run (created up front, so a resume skips done ones)
--   backlink_opportunities      a place for one client: Pending review, Approved, Rejected or Hidden
--   backlink_opportunity_hits   which searches found it, at what position ("why chosen")
--   backlink_strength_checks    each "Check site strength" click (spend, throttle)

create type public.directory_type as enum (
  'business_directory', 'industry_directory', 'maps', 'chamber', 'association', 'review_site',
  'news_blog', 'guest_post', 'social', 'government', 'aggregator', 'other'
);
create type public.directory_status as enum ('active', 'blocked');
create type public.opportunity_status as enum ('pending_review', 'approved', 'rejected', 'filtered');
create type public.backlink_reject_reason as enum (
  'not_relevant', 'competitor', 'paid_only', 'not_accepting', 'duplicate', 'spam', 'broken', 'other'
);
create type public.backlink_run_status as enum ('queued', 'running', 'done', 'failed');
create type public.footprint_scope as enum ('geo', 'service', 'industry');
create type public.discovery_query_status as enum ('queued', 'done', 'cached', 'failed');
create type public.strength_check_status as enum ('running', 'done', 'failed');

-- ---------------------------------------------------------------------------
-- The library
-- ---------------------------------------------------------------------------

create table public.directories (
  id uuid primary key default gen_random_uuid(),
  -- Where you apply: the host (no www.), or host + city path for sites like patch.com.
  site_key text not null unique
    check (char_length(site_key) between 3 and 300 and site_key = lower(site_key)),
  -- Registrable domain (yelp.com), for blocking.
  domain text not null check (char_length(domain) between 3 and 253 and domain = lower(domain)),
  -- What strength is checked on (Bing Places → bing.com).
  rank_target text not null check (char_length(rank_target) between 3 and 300),
  name text not null check (char_length(name) between 1 and 200),
  type public.directory_type not null default 'other',
  type_source text not null default 'auto' check (type_source in ('auto', 'manual', 'seed')),
  status public.directory_status not null default 'active',
  blocked_reason text check (blocked_reason is null or char_length(blocked_reason) <= 300),
  blocked_by uuid references public.team_members (id) on delete set null,
  blocked_at timestamptz,
  is_core boolean not null default false,
  core_countries text[] not null default '{}',
  -- Words matched against the client's industry, category and services; empty = every client.
  core_industries text[] not null default '{}',
  geo_scope text not null default 'unknown' check (geo_scope in ('national', 'state', 'city', 'unknown')),
  country_code text check (country_code is null or char_length(country_code) = 2),
  region text check (region is null or char_length(region) <= 100),
  city text check (city is null or char_length(city) <= 100),
  industries text[] not null default '{}',
  submit_url text check (submit_url is null or (submit_url ~ '^https?://' and char_length(submit_url) <= 500)),
  cost_type text not null default 'unknown' check (cost_type in ('free', 'paid', 'unknown')),
  notes text check (notes is null or char_length(notes) <= 2000),
  -- DataForSEO Domain Rank 0–1000; shown as 0–100 with DataForSEO's own formula.
  authority_raw smallint check (authority_raw between 0 and 1000),
  authority smallint generated always as (
    case when authority_raw is null then null
    else least(100, greatest(0, round(sin(authority_raw::float8 / 636.62) * 100)))::smallint end
  ) stored,
  spam_score smallint check (spam_score between 0 and 100),
  authority_source text check (authority_source in ('dfs_backlinks', 'manual')),
  authority_status text check (authority_status in ('ok', 'no_data')),
  authority_checked_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_by uuid references public.team_members (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index directories_domain_idx on public.directories (domain);
create index directories_rank_target_idx on public.directories (rank_target);
create index directories_core_idx on public.directories (is_core) where is_core;
create index directories_blocked_by_idx on public.directories (blocked_by);
create index directories_updated_by_idx on public.directories (updated_by);

create table public.backlink_footprints (
  id uuid primary key default gen_random_uuid(),
  template text not null unique check (
    char_length(template) between 3 and 200
    -- Search operators cost 5x per operator at DataForSEO: never in a footprint.
    and template !~* '(^|[[:space:]])-?(site|inurl|intitle|intext|allinurl|allintitle|allintext|allinanchor|inanchor|filetype|link|related|info|define|cache):'
    -- Only known placeholders.
    and regexp_replace(template, '\{(city|state|state_code|service|industry)\}', '', 'g') !~ '[{}]'
  ),
  scope public.footprint_scope not null,
  active boolean not null default true,
  sort smallint not null default 100,
  note text check (note is null or char_length(note) <= 300),
  updated_at timestamptz not null default now()
);

create table public.serp_result_cache (
  id uuid primary key default gen_random_uuid(),
  engine text not null check (engine in ('google_organic', 'google_maps')),
  query_norm text not null check (char_length(query_norm) between 1 and 700),
  location_code integer not null,
  language_code text not null,
  device text not null,
  depth smallint not null,
  -- [{p: position, url, title, desc}] (organic) or [{title, domain}] (maps)
  items jsonb not null default '[]'::jsonb,
  -- Business domains seen in the local pack (competitors, not places to list on).
  competitors text[] not null default '{}',
  items_count integer not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  fetched_at timestamptz not null default now(),
  unique (engine, query_norm, location_code, language_code, device, depth)
);
create index serp_result_cache_fetched_idx on public.serp_result_cache (fetched_at);

-- ---------------------------------------------------------------------------
-- Per client
-- ---------------------------------------------------------------------------

create table public.backlink_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  status public.backlink_run_status not null default 'queued',
  step smallint not null default 0,
  params jsonb not null default '{}'::jsonb,
  counts jsonb not null default '{}'::jsonb,
  queries_total smallint not null default 0,
  queries_done smallint not null default 0,
  cost_usd numeric(10, 4) not null default 0,
  error text check (error is null or char_length(error) <= 500),
  attempts smallint not null default 0,
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  heartbeat_at timestamptz,
  finished_at timestamptz
);
create unique index backlink_runs_one_open_idx on public.backlink_runs (client_id)
  where status in ('queued', 'running');
create index backlink_runs_client_idx on public.backlink_runs (client_id, created_at desc);
create index backlink_runs_status_idx on public.backlink_runs (status) where status in ('queued', 'running');
create index backlink_runs_created_by_idx on public.backlink_runs (created_by);

create table public.backlink_run_queries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.backlink_runs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  footprint_id uuid references public.backlink_footprints (id) on delete set null,
  scope public.footprint_scope not null,
  query text not null check (char_length(query) between 1 and 700),
  query_norm text not null check (char_length(query_norm) between 1 and 700),
  status public.discovery_query_status not null default 'queued',
  cache_id uuid references public.serp_result_cache (id) on delete set null,
  items_count integer not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  error text check (error is null or char_length(error) <= 500),
  done_at timestamptz,
  unique (run_id, query_norm)
);
create index backlink_run_queries_client_idx on public.backlink_run_queries (client_id);
create index backlink_run_queries_footprint_idx on public.backlink_run_queries (footprint_id);
create index backlink_run_queries_cache_idx on public.backlink_run_queries (cache_id);

create table public.backlink_opportunities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  directory_id uuid not null references public.directories (id) on delete restrict,
  status public.opportunity_status not null default 'pending_review',
  filter_reason text check (filter_reason in (
    'own_site', 'agency_client', 'competitor', 'looks_like_business', 'blocked', 'other_state',
    'not_local_article', 'pdf'
  )),
  is_core boolean not null default false,
  found_url text check (found_url is null or (found_url ~ '^https?://' and char_length(found_url) <= 2000)),
  found_title text check (found_title is null or char_length(found_title) <= 300),
  found_snippet text check (found_snippet is null or char_length(found_snippet) <= 600),
  best_position smallint,
  is_local boolean not null default false,
  -- The part of the score that doesn't depend on site strength (0–1), set by the search job.
  relevance numeric(4, 3) not null default 0 check (relevance between 0 and 1),
  first_run_id uuid references public.backlink_runs (id) on delete set null,
  last_run_id uuid references public.backlink_runs (id) on delete set null,
  reject_reason public.backlink_reject_reason,
  reject_note text check (reject_note is null or char_length(reject_note) <= 500),
  -- Set when a person approves, rejects or restores: the search job never changes such a row's status.
  decided_by uuid references public.team_members (id) on delete set null,
  decided_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, directory_id),
  check ((status = 'filtered') = (filter_reason is not null)),
  check (status <> 'rejected' or reject_reason is not null)
);
create index backlink_opportunities_client_idx on public.backlink_opportunities (client_id, status);
create index backlink_opportunities_directory_idx on public.backlink_opportunities (directory_id);
create index backlink_opportunities_first_run_idx on public.backlink_opportunities (first_run_id);
create index backlink_opportunities_last_run_idx on public.backlink_opportunities (last_run_id);
create index backlink_opportunities_decided_by_idx on public.backlink_opportunities (decided_by);

create table public.backlink_opportunity_hits (
  id bigint generated always as identity primary key,
  opportunity_id uuid not null references public.backlink_opportunities (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  query_id uuid not null references public.backlink_run_queries (id) on delete cascade,
  footprint_id uuid references public.backlink_footprints (id) on delete set null,
  query text not null check (char_length(query) between 1 and 700),
  position smallint,
  url text check (url is null or (url ~ '^https?://' and char_length(url) <= 2000)),
  created_at timestamptz not null default now(),
  unique (opportunity_id, query_id)
);
create index backlink_opportunity_hits_client_idx on public.backlink_opportunity_hits (client_id);
create index backlink_opportunity_hits_query_idx on public.backlink_opportunity_hits (query_id);
create index backlink_opportunity_hits_footprint_idx on public.backlink_opportunity_hits (footprint_id);

create table public.backlink_strength_checks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  status public.strength_check_status not null default 'running',
  targets text[] not null default '{}',
  domains integer not null default 0,
  forced boolean not null default false,
  cost_usd numeric(10, 5) not null default 0,
  error text check (error is null or char_length(error) <= 500),
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index backlink_strength_checks_one_running_idx on public.backlink_strength_checks (client_id)
  where status = 'running';
create index backlink_strength_checks_client_idx on public.backlink_strength_checks (client_id, created_at desc);
create index backlink_strength_checks_created_by_idx on public.backlink_strength_checks (created_by);

-- Spend attribution (Backlinks sub-budget) joins dfs_calls.ref to runs and checks.
create index if not exists dfs_calls_ref_idx on public.dfs_calls (ref) where ref is not null;

alter table public.dfs_settings
  add column backlinks_budget_usd numeric(10, 2) not null default 15 check (backlinks_budget_usd >= 0),
  add column backlink_runs_per_client_month smallint not null default 4
    check (backlink_runs_per_client_month between 0 and 50),
  add column backlinks_access text not null default 'unknown' check (backlinks_access in ('unknown', 'ok', 'denied')),
  add column backlinks_access_checked_at timestamptz;

-- ---------------------------------------------------------------------------
-- RLS: the library is shared (no client data); client rows follow the client
-- ---------------------------------------------------------------------------

alter table public.directories enable row level security;
alter table public.backlink_footprints enable row level security;
alter table public.serp_result_cache enable row level security;
alter table public.backlink_runs enable row level security;
alter table public.backlink_run_queries enable row level security;
alter table public.backlink_opportunities enable row level security;
alter table public.backlink_opportunity_hits enable row level security;
alter table public.backlink_strength_checks enable row level security;

create policy "Team members read the directory library"
  on public.directories for select to authenticated using ((select private.is_team_member()));
create policy "Team members read the search footprints"
  on public.backlink_footprints for select to authenticated using ((select private.is_team_member()));
create policy "See backlink searches for clients you can see"
  on public.backlink_runs for select to authenticated using ((select private.can_see_client(client_id)));
create policy "See backlink search queries for clients you can see"
  on public.backlink_run_queries for select to authenticated using ((select private.can_see_client(client_id)));
create policy "See backlink places for clients you can see"
  on public.backlink_opportunities for select to authenticated using ((select private.can_see_client(client_id)));
create policy "See why backlink places were chosen for clients you can see"
  on public.backlink_opportunity_hits for select to authenticated using ((select private.can_see_client(client_id)));
create policy "See strength checks for clients you can see"
  on public.backlink_strength_checks for select to authenticated using ((select private.can_see_client(client_id)));
-- serp_result_cache: no policies (service role only).

revoke all on public.directories, public.backlink_footprints, public.serp_result_cache,
  public.backlink_runs, public.backlink_run_queries, public.backlink_opportunities,
  public.backlink_opportunity_hits, public.backlink_strength_checks from anon;
revoke all on public.serp_result_cache from authenticated;
revoke insert, update, delete, truncate on public.directories, public.backlink_footprints,
  public.backlink_runs, public.backlink_run_queries, public.backlink_opportunities,
  public.backlink_opportunity_hits, public.backlink_strength_checks from authenticated;

-- ---------------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------------

insert into public.backlink_footprints (template, scope, sort) values
  ('{city} {state_code} business directory', 'geo', 10),
  ('{city} {state} business directory', 'geo', 11),
  ('add your business {city} {state_code}', 'geo', 12),
  ('submit business listing {city} {state_code}', 'geo', 13),
  ('{city} {state_code} chamber of commerce', 'geo', 14),
  ('{city} {state_code} business association', 'geo', 15),
  ('{city} {state_code} local business listings', 'geo', 16),
  ('{city} {state_code} community news', 'geo', 17),
  ('{service} {city} {state_code} directory', 'service', 20),
  ('best {service} {city} {state_code}', 'service', 21),
  ('top rated {service} {city} {state_code}', 'service', 22),
  ('{service} contractors {city} {state_code}', 'service', 23),
  ('{industry} association {state}', 'industry', 30),
  ('{industry} directory', 'industry', 31),
  ('{industry} blog write for us', 'industry', 32),
  ('{industry} guest post', 'industry', 33);

-- Core listings every US client should have (industry ones only when the industry matches).
-- submit_url is the page to start from; VAs confirm it on first use.
insert into public.directories
  (site_key, domain, rank_target, name, type, type_source, is_core, core_countries, core_industries,
   geo_scope, country_code, submit_url, cost_type, notes)
values
  ('business.google.com', 'google.com', 'google.com', 'Google Business Profile', 'maps', 'seed', true, '{US}', '{}', 'national', 'US', 'https://business.google.com/', 'free', null),
  ('bingplaces.com', 'bingplaces.com', 'bing.com', 'Bing Places', 'maps', 'seed', true, '{US}', '{}', 'national', 'US', 'https://www.bingplaces.com/', 'free', null),
  ('businessconnect.apple.com', 'apple.com', 'apple.com', 'Apple Business Connect', 'maps', 'seed', true, '{US}', '{}', 'national', 'US', 'https://businessconnect.apple.com/', 'free', null),
  ('yelp.com', 'yelp.com', 'yelp.com', 'Yelp', 'review_site', 'seed', true, '{US}', '{}', 'national', 'US', 'https://biz.yelp.com/', 'free', null),
  ('bbb.org', 'bbb.org', 'bbb.org', 'Better Business Bureau', 'business_directory', 'seed', true, '{US}', '{}', 'national', 'US', 'https://www.bbb.org/', 'free', 'A basic listing is free; accreditation is paid.'),
  ('facebook.com', 'facebook.com', 'facebook.com', 'Facebook', 'social', 'seed', true, '{US}', '{}', 'national', 'US', 'https://www.facebook.com/pages/create', 'free', null),
  ('nextdoor.com', 'nextdoor.com', 'nextdoor.com', 'Nextdoor', 'social', 'seed', true, '{US}', '{}', 'national', 'US', 'https://business.nextdoor.com/', 'free', null),
  ('yellowpages.com', 'yellowpages.com', 'yellowpages.com', 'Yellow Pages', 'business_directory', 'seed', true, '{US}', '{}', 'national', 'US', 'https://www.yellowpages.com/', 'unknown', null),
  ('foursquare.com', 'foursquare.com', 'foursquare.com', 'Foursquare', 'aggregator', 'seed', true, '{US}', '{}', 'national', 'US', 'https://foursquare.com/', 'free', 'Feeds many apps and maps.'),
  ('mapquest.com', 'mapquest.com', 'mapquest.com', 'MapQuest', 'maps', 'seed', true, '{US}', '{}', 'national', 'US', 'https://www.mapquest.com/', 'unknown', 'Mostly filled from data aggregators.'),
  ('manta.com', 'manta.com', 'manta.com', 'Manta', 'business_directory', 'seed', true, '{US}', '{}', 'national', 'US', 'https://www.manta.com/', 'free', null),
  ('hotfrog.com', 'hotfrog.com', 'hotfrog.com', 'Hotfrog', 'business_directory', 'seed', true, '{US}', '{}', 'national', 'US', 'https://www.hotfrog.com/', 'free', null),
  ('brownbook.net', 'brownbook.net', 'brownbook.net', 'Brownbook', 'business_directory', 'seed', true, '{US}', '{}', 'national', 'US', 'https://www.brownbook.net/', 'free', null),
  ('ezlocal.com', 'ezlocal.com', 'ezlocal.com', 'EZlocal', 'business_directory', 'seed', true, '{US}', '{}', 'national', 'US', 'https://ezlocal.com/', 'free', null),
  ('cylex.us.com', 'cylex.us.com', 'cylex.us.com', 'Cylex', 'business_directory', 'seed', true, '{US}', '{}', 'national', 'US', 'https://www.cylex.us.com/', 'free', null),
  ('merchantcircle.com', 'merchantcircle.com', 'merchantcircle.com', 'MerchantCircle', 'business_directory', 'seed', true, '{US}', '{}', 'national', 'US', 'https://www.merchantcircle.com/', 'free', null),
  ('alignable.com', 'alignable.com', 'alignable.com', 'Alignable', 'social', 'seed', true, '{US}', '{}', 'national', 'US', 'https://www.alignable.com/', 'free', null),
  ('chamberofcommerce.com', 'chamberofcommerce.com', 'chamberofcommerce.com', 'ChamberofCommerce.com', 'business_directory', 'seed', true, '{US}', '{}', 'national', 'US', 'https://www.chamberofcommerce.com/', 'free', 'A directory, not a real chamber.'),
  ('data-axle.com', 'data-axle.com', 'data-axle.com', 'Data Axle', 'aggregator', 'seed', true, '{US}', '{}', 'national', 'US', 'https://www.data-axle.com/', 'paid', 'Data aggregator; bought through BrightLocal.'),
  ('neustarlocaleze.biz', 'neustarlocaleze.biz', 'neustarlocaleze.biz', 'Neustar Localeze', 'aggregator', 'seed', true, '{US}', '{}', 'national', 'US', 'https://www.neustarlocaleze.biz/', 'paid', 'Data aggregator; bought through BrightLocal.'),
  ('bark.com', 'bark.com', 'bark.com', 'Bark', 'industry_directory', 'seed', true, '{US}', '{}', 'national', 'US', 'https://www.bark.com/', 'unknown', 'Free profile; leads are paid.'),
  ('thumbtack.com', 'thumbtack.com', 'thumbtack.com', 'Thumbtack', 'industry_directory', 'seed', true, '{US}', '{}', 'national', 'US', 'https://www.thumbtack.com/pro', 'unknown', 'Free profile; leads are paid.'),
  ('angi.com', 'angi.com', 'angi.com', 'Angi', 'industry_directory', 'seed', true, '{US}',
    '{hvac,heating,cooling,air condition,duct,plumb,roof,electric,contractor,remodel,clean,landscap,lawn,pest,handyman,paint,floor,garage,window,pool,home,gutter,fence,concrete,insulation,mold,water damage,restoration}',
    'national', 'US', 'https://pro.angi.com/', 'unknown', 'Free profile; leads are paid.'),
  ('homeadvisor.com', 'homeadvisor.com', 'homeadvisor.com', 'HomeAdvisor', 'industry_directory', 'seed', true, '{US}',
    '{hvac,heating,cooling,air condition,duct,plumb,roof,electric,contractor,remodel,clean,landscap,lawn,pest,handyman,paint,floor,garage,window,pool,home,gutter,fence,concrete,insulation,mold,water damage,restoration}',
    'national', 'US', 'https://pro.homeadvisor.com/', 'paid', null),
  ('houzz.com', 'houzz.com', 'houzz.com', 'Houzz', 'industry_directory', 'seed', true, '{US}',
    '{remodel,contractor,design,interior,architect,kitchen,bath,floor,roof,landscap,home,builder,cabinet,window,paint}',
    'national', 'US', 'https://pro.houzz.com/', 'free', null),
  ('porch.com', 'porch.com', 'porch.com', 'Porch', 'industry_directory', 'seed', true, '{US}',
    '{hvac,heating,cooling,duct,plumb,roof,electric,contractor,remodel,clean,landscap,pest,handyman,paint,floor,garage,window,pool,home,moving}',
    'national', 'US', 'https://pro.porch.com/', 'unknown', null);

-- Sites that are never a place to get listed (a blocked root also blocks its subdomains,
-- except core listings such as business.google.com).
insert into public.directories (site_key, domain, rank_target, name, type, type_source, status, blocked_reason)
select d, d, d, d, 'other', 'seed', 'blocked', 'Not a place to get listed'
from unnest(array[
  'google.com', 'bing.com', 'apple.com', 'youtube.com', 'wikipedia.org', 'amazon.com', 'ebay.com',
  'walmart.com', 'homedepot.com', 'lowes.com', 'indeed.com', 'glassdoor.com', 'ziprecruiter.com',
  'simplyhired.com', 'monster.com', 'reddit.com', 'quora.com', 'pinterest.com', 'craigslist.org',
  'tiktok.com', 'x.com', 'twitter.com', 'nerdwallet.com', 'forbes.com', 'investopedia.com'
]) as d;
