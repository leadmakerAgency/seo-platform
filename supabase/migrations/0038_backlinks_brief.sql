-- 0038_backlinks_brief: the strategy brief, tailored searches and the top 30.
--   backlink_briefs: reach (local/national/global), buyer (b2b/b2c/both), offering
--     (services/software/products), audience, core + adjacent topics, trusted sites,
--     competitors, exclude terms, site types; versioned
--   footprints know which reach/buyer/offering/site type they serve; {topic} placeholder
--   the app builds the search plan; request_backlink_discovery checks and saves it (≤ 60)
--   opportunities: source (search/core/brief), topic match, rule score, Claude's verdict,
--     shortlist rank; status 'reserve' = More (outside the top 30)
--   dfs_apply_shortlist keeps Review at 30 or fewer and never touches a decided place
--   rerank_backlinks: redo the top 30 from saved results (AI review only, no searches)
--   ai_calls: ledger for Claude calls, monthly AI budget in dfs_settings
-- Plan: docs/plans/backlinks/07-strategy-brief.md

-- ---------------------------------------------------------------------------
-- The brief
-- ---------------------------------------------------------------------------

create table public.backlink_briefs (
  client_id uuid primary key references public.clients (id) on delete cascade,
  reach text not null check (reach in ('local', 'national', 'global')),
  buyer text not null check (buyer in ('b2b', 'b2c', 'both')),
  offering text not null check (offering in ('services', 'software', 'products')),
  audience text check (audience is null or char_length(audience) <= 300),
  core_topics text[] not null check (cardinality(core_topics) between 1 and 5 and private.valid_list(core_topics)),
  adjacent_topics text[] not null default '{}' check (cardinality(adjacent_topics) <= 12 and private.valid_list(adjacent_topics)),
  trusted_sites text[] not null default '{}' check (cardinality(trusted_sites) <= 20 and private.valid_list(trusted_sites)),
  competitors text[] not null default '{}' check (cardinality(competitors) <= 20 and private.valid_list(competitors)),
  exclude_terms text[] not null default '{}' check (cardinality(exclude_terms) <= 30 and private.valid_list(exclude_terms)),
  site_types text[] not null default '{}' check (site_types <@ array[
    'directories', 'review_platforms', 'marketplaces', 'niche_blogs', 'guest_posts', 'local_news',
    'podcasts', 'associations', 'communities', 'sponsorships', 'resource_pages'
  ]::text[]),
  notes text check (notes is null or char_length(notes) <= 1000),
  version integer not null default 1,
  updated_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.backlink_briefs is 'How each client should be found: reach, buyer, offering and topics. Find places searches from it.';
create index backlink_briefs_updated_by_idx on public.backlink_briefs (updated_by);
alter table public.backlink_briefs enable row level security;
create policy "See backlink briefs for clients you can see"
  on public.backlink_briefs for select to authenticated
  using ((select private.can_see_client(client_id)));
revoke all on public.backlink_briefs from anon;
revoke insert, update, delete on public.backlink_briefs from authenticated;

-- ---------------------------------------------------------------------------
-- Claude calls: ledger and monthly budget
-- ---------------------------------------------------------------------------

create table public.ai_calls (
  id bigint generated always as identity primary key,
  client_id uuid references public.clients (id) on delete set null,
  feature text not null check (char_length(feature) <= 60),
  model text not null check (char_length(model) <= 80),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  ms integer,
  ok boolean not null default true,
  error text check (error is null or char_length(error) <= 500),
  ref uuid,
  created_at timestamptz not null default now()
);
comment on table public.ai_calls is 'Every Claude API call, with its cost (written by server jobs).';
create index ai_calls_client_idx on public.ai_calls (client_id);
create index ai_calls_created_idx on public.ai_calls (created_at);
alter table public.ai_calls enable row level security;
create policy "Admins read AI calls" on public.ai_calls for select to authenticated
  using ((select private.has_role('{admin}')));
revoke all on public.ai_calls from anon;
revoke insert, update, delete on public.ai_calls from authenticated;

alter table public.dfs_settings
  add column ai_monthly_budget_usd numeric(10, 2) not null default 20 check (ai_monthly_budget_usd >= 0);

create or replace function private.ai_month_spend()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(cost_usd), 0) from public.ai_calls where created_at >= private.agency_month_start()
$$;

-- For server jobs (service role): null while Claude may still be used this month.
create or replace function public.dfs_ai_budget_problem()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.ai_month_spend() >= (select ai_monthly_budget_usd from public.dfs_settings where id)
    then 'This month''s AI budget is used up. An admin can raise it.' end
$$;

-- ---------------------------------------------------------------------------
-- Runs, places and footprints
-- ---------------------------------------------------------------------------

alter table public.backlink_runs
  add column kind text not null default 'search' check (kind in ('search', 'rerank')),
  add column brief_version integer;

alter table public.backlink_opportunities
  add column source text not null default 'search' check (source in ('search', 'core', 'brief')),
  add column matched_topic text check (matched_topic is null or char_length(matched_topic) <= 120),
  add column topic_fit numeric(4, 3) check (topic_fit is null or topic_fit between 0 and 1),
  add column rule_score numeric(4, 3) check (rule_score is null or rule_score between 0 and 1),
  add column ai_fit smallint check (ai_fit is null or ai_fit between 1 and 5),
  add column ai_verdict text check (ai_verdict is null or ai_verdict in (
    'keep', 'competitor', 'irrelevant', 'paid_link_seller', 'spam', 'not_a_link_opportunity')),
  add column ai_reason text check (ai_reason is null or char_length(ai_reason) <= 200),
  add column shortlist_rank smallint check (shortlist_rank is null or shortlist_rank between 1 and 30);
update public.backlink_opportunities set source = 'core' where is_core;

alter table public.backlink_opportunities drop constraint if exists backlink_opportunities_filter_reason_check;
alter table public.backlink_opportunities add constraint backlink_opportunities_filter_reason_check
  check (filter_reason in (
    'own_site', 'agency_client', 'competitor', 'looks_like_business', 'blocked', 'other_state',
    'not_local_article', 'pdf', 'ai_rejected', 'excluded_term'
  ));
create index backlink_opportunities_review_idx on public.backlink_opportunities (client_id, status, source);

-- Existing places are not moved here: the first re-rank (or search) with a brief applies the
-- top 30 through dfs_apply_shortlist.

-- Footprints: which clients each one is for.
alter table public.backlink_footprints
  add column reach text[] not null default '{local,national,global}',
  add column buyer text[] not null default '{b2b,b2c,both}',
  add column offering text[] not null default '{services,software,products}',
  add column site_type text,
  add column priority smallint not null default 50;

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
  and regexp_replace(template, '\{(place|topic|city|state|state_code|service|industry)\}', '', 'g') !~ '[{}]'
);

-- Place and service-in-a-place searches: local clients only.
update public.backlink_footprints set reach = '{local}',
  site_type = case
    when template like '%chamber%' or template like '%association%' then 'associations'
    when template like '%news%' then 'local_news'
    else 'directories' end,
  priority = sort
  where scope in ('geo', 'service');
update public.backlink_footprints set
  site_type = case
    when template like '%association%' then 'associations'
    when template like '%directory%' then 'directories'
    else 'guest_posts' end,
  priority = sort
  where scope = 'industry';

insert into public.backlink_footprints (template, scope, reach, buyer, offering, site_type, priority) values
  -- Local: more place searches.
  ('{place} local news', 'geo', '{local}', '{b2b,b2c,both}', '{services,software,products}', 'local_news', 17),
  ('{place} community sponsorship', 'geo', '{local}', '{b2b,b2c,both}', '{services,software,products}', 'sponsorships', 18),
  ('{place} events calendar', 'geo', '{local}', '{b2b,b2c,both}', '{services,software,products}', 'sponsorships', 19),
  ('{place} neighborhood association', 'geo', '{local}', '{b2c,both}', '{services,software,products}', 'associations', 20),
  -- Local: topics in a place.
  ('{topic} blog {place}', 'topic', '{local}', '{b2b,b2c,both}', '{services,software,products}', 'niche_blogs', 10),
  ('{place} {topic} association', 'topic', '{local}', '{b2b,b2c,both}', '{services,software,products}', 'associations', 20),
  ('best {topic} {place}', 'topic', '{local}', '{b2c,both}', '{services,software,products}', 'review_platforms', 30),
  ('{topic} {place} magazine', 'topic', '{local}', '{b2b,b2c,both}', '{services,software,products}', 'local_news', 40),
  -- National and global: topics anywhere.
  ('{topic} blog', 'topic', '{national,global}', '{b2b,b2c,both}', '{services,software,products}', 'niche_blogs', 10),
  ('{topic} write for us', 'topic', '{national,global}', '{b2b,b2c,both}', '{services,software,products}', 'guest_posts', 20),
  ('{topic} resources', 'topic', '{national,global}', '{b2b,b2c,both}', '{services,software,products}', 'resource_pages', 30),
  ('{topic} podcast', 'topic', '{national,global}', '{b2b,b2c,both}', '{services,software,products}', 'podcasts', 40),
  ('{topic} newsletter', 'topic', '{national,global}', '{b2b,b2c,both}', '{services,software,products}', 'niche_blogs', 50),
  ('{topic} forum', 'topic', '{local,national,global}', '{b2c,both}', '{services,software,products}', 'communities', 45),
  ('{topic} community', 'topic', '{national,global}', '{b2b,b2c,both}', '{services,software,products}', 'communities', 55),
  -- Buyer: what B2B buyers, software buyers and shoppers read.
  ('top {service} companies', 'buyer', '{local,national,global}', '{b2b,both}', '{services}', 'review_platforms', 10),
  ('{topic} conference', 'buyer', '{national,global}', '{b2b,both}', '{services,software,products}', 'sponsorships', 30),
  ('{industry} trade publication', 'buyer', '{national,global}', '{b2b,both}', '{services,software,products}', 'niche_blogs', 20),
  ('{topic} association', 'buyer', '{national,global}', '{b2b,both}', '{services,software,products}', 'associations', 25),
  ('best {topic} software', 'buyer', '{local,national,global}', '{b2b,b2c,both}', '{software}', 'review_platforms', 10),
  ('{topic} tools comparison', 'buyer', '{national,global}', '{b2b,b2c,both}', '{software}', 'review_platforms', 15),
  ('{service} alternatives', 'buyer', '{national,global}', '{b2b,b2c,both}', '{software}', 'marketplaces', 20),
  ('{topic} gift guide', 'buyer', '{national,global}', '{b2c,both}', '{products}', 'niche_blogs', 10),
  ('{topic} product reviews', 'buyer', '{national,global}', '{b2c,both}', '{products}', 'review_platforms', 15)
on conflict (template) do update set
  scope = excluded.scope, reach = excluded.reach, buyer = excluded.buyer, offering = excluded.offering,
  site_type = excluded.site_type, priority = excluded.priority, active = true;

-- Core listings: which clients each set is for (empty = any).
alter table public.directories
  add column core_reach text[] not null default '{}',
  add column core_buyer text[] not null default '{}',
  add column core_offering text[] not null default '{}';
update public.directories set core_reach = '{local}' where is_core;

insert into public.directories
  (site_key, domain, rank_target, name, type, type_source, is_core, core_countries, core_industries,
   core_reach, core_buyer, core_offering, geo_scope, submit_url, cost_type, notes)
values
  ('clutch.co', 'clutch.co', 'clutch.co', 'Clutch', 'review_site', 'seed', true, '{}', '{}', '{}', '{b2b,both}', '{services}', 'national', 'https://clutch.co/get-listed', 'free', 'The main review platform for B2B service firms.'),
  ('goodfirms.co', 'goodfirms.co', 'goodfirms.co', 'GoodFirms', 'review_site', 'seed', true, '{}', '{}', '{}', '{b2b,both}', '{services}', 'national', 'https://www.goodfirms.co/', 'free', 'Basic listing is free; premium tiers are paid.'),
  ('upcity.com', 'upcity.com', 'upcity.com', 'UpCity', 'review_site', 'seed', true, '{}', '{}', '{}', '{b2b,both}', '{services}', 'national', 'https://upcity.com/', 'free', null),
  ('designrush.com', 'designrush.com', 'designrush.com', 'DesignRush', 'review_site', 'seed', true, '{}', '{}', '{}', '{b2b,both}', '{services}', 'national', 'https://www.designrush.com/', 'unknown', null),
  ('sortlist.com', 'sortlist.com', 'sortlist.com', 'Sortlist', 'marketplace', 'seed', true, '{}', '{}', '{}', '{b2b,both}', '{services}', 'national', 'https://www.sortlist.com/', 'unknown', null),
  ('themanifest.com', 'themanifest.com', 'themanifest.com', 'The Manifest', 'review_site', 'seed', true, '{}', '{}', '{}', '{b2b,both}', '{services}', 'national', 'https://themanifest.com/', 'free', 'Listings come from a Clutch profile.'),
  ('crunchbase.com', 'crunchbase.com', 'crunchbase.com', 'Crunchbase', 'business_directory', 'seed', true, '{}', '{}', '{}', '{b2b,both}', '{services,software}', 'national', 'https://www.crunchbase.com/', 'free', null),
  ('g2.com', 'g2.com', 'g2.com', 'G2', 'review_site', 'seed', true, '{}', '{}', '{}', '{}', '{software}', 'national', 'https://sell.g2.com/', 'free', 'Also covers Capterra, GetApp and Software Advice (same owner).'),
  ('capterra.com', 'capterra.com', 'capterra.com', 'Capterra', 'marketplace', 'seed', true, '{}', '{}', '{}', '{}', '{software}', 'national', 'https://www.capterra.com/vendors/', 'free', null),
  ('getapp.com', 'getapp.com', 'getapp.com', 'GetApp', 'marketplace', 'seed', true, '{}', '{}', '{}', '{}', '{software}', 'national', 'https://www.getapp.com/', 'free', null),
  ('softwareadvice.com', 'softwareadvice.com', 'softwareadvice.com', 'Software Advice', 'marketplace', 'seed', true, '{}', '{}', '{}', '{b2b,both}', '{software}', 'national', 'https://www.softwareadvice.com/', 'free', null),
  ('trustradius.com', 'trustradius.com', 'trustradius.com', 'TrustRadius', 'review_site', 'seed', true, '{}', '{}', '{}', '{b2b,both}', '{software}', 'national', 'https://www.trustradius.com/vendors', 'free', null),
  ('producthunt.com', 'producthunt.com', 'producthunt.com', 'Product Hunt', 'community', 'seed', true, '{}', '{}', '{}', '{}', '{software}', 'national', 'https://www.producthunt.com/', 'free', null),
  ('alternativeto.net', 'alternativeto.net', 'alternativeto.net', 'AlternativeTo', 'marketplace', 'seed', true, '{}', '{}', '{}', '{}', '{software}', 'national', 'https://alternativeto.net/', 'free', null),
  ('saashub.com', 'saashub.com', 'saashub.com', 'SaaSHub', 'marketplace', 'seed', true, '{}', '{}', '{}', '{}', '{software}', 'national', 'https://www.saashub.com/', 'free', null),
  ('trustpilot.com', 'trustpilot.com', 'trustpilot.com', 'Trustpilot', 'review_site', 'seed', true, '{}', '{}', '{}', '{b2c,both}', '{products,services}', 'national', 'https://business.trustpilot.com/', 'free', null),
  ('sitejabber.com', 'sitejabber.com', 'sitejabber.com', 'Sitejabber', 'review_site', 'seed', true, '{}', '{}', '{}', '{b2c,both}', '{products}', 'national', 'https://www.sitejabber.com/', 'free', null)
on conflict (site_key) do update set
  is_core = true,
  core_countries = excluded.core_countries,
  core_reach = excluded.core_reach,
  core_buyer = excluded.core_buyer,
  core_offering = excluded.core_offering,
  name = excluded.name,
  type = case when public.directories.type_source = 'manual' then public.directories.type else excluded.type end,
  type_source = case when public.directories.type_source = 'manual' then 'manual' else 'seed' end,
  submit_url = coalesce(public.directories.submit_url, excluded.submit_url),
  cost_type = case when public.directories.cost_type = 'unknown' then excluded.cost_type else public.directories.cost_type end,
  notes = coalesce(public.directories.notes, excluded.notes);

-- ---------------------------------------------------------------------------
-- Brief: save and completeness
-- ---------------------------------------------------------------------------

-- What is still missing before Find places can run (empty = ready).
create or replace function private.backlink_brief_missing(p_client_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b public.backlink_briefs%rowtype;
  missing text[] := '{}';
  topics integer;
begin
  select * into b from public.backlink_briefs where client_id = p_client_id;
  if b.client_id is null then
    return array['Fill in the strategy brief'];
  end if;
  topics := cardinality(b.core_topics) + cardinality(b.adjacent_topics);
  if topics < 5 then
    missing := missing || format('Add %s more topics (5 at least, 10–15 is best)', 5 - topics);
  end if;
  if b.reach = 'local' and not exists (
    select 1 from public.backlink_targets t where t.client_id = p_client_id and t.active and t.kind in ('city', 'region')
  ) then
    missing := missing || 'Add a city or region to the places (the client is local)'::text;
  end if;
  if b.reach <> 'local' and not exists (
    select 1 from public.backlink_targets t where t.client_id = p_client_id and t.active and t.kind = 'country'
  ) then
    missing := missing || 'Add a country to the places (the client is national or global)'::text;
  end if;
  return missing;
end;
$$;

create or replace function public.save_backlink_brief(p_client_id uuid, p jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v integer;
  clean_list text;
begin
  if not private.has_role('{admin,manager}') or not private.can_see_client(p_client_id) then
    raise exception 'Only admins and account managers can change the strategy brief.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'Client not found.' using errcode = 'P0002';
  end if;

  insert into public.backlink_briefs as b (
    client_id, reach, buyer, offering, audience, core_topics, adjacent_topics, trusted_sites,
    competitors, exclude_terms, site_types, notes, updated_by
  )
  select
    p_client_id,
    p->>'reach', p->>'buyer', p->>'offering',
    nullif(btrim(coalesce(p->>'audience', '')), ''),
    array(select distinct lower(btrim(x)) from jsonb_array_elements_text(coalesce(p->'core_topics', '[]')) x where btrim(x) <> ''),
    array(select distinct lower(btrim(x)) from jsonb_array_elements_text(coalesce(p->'adjacent_topics', '[]')) x where btrim(x) <> ''),
    array(select distinct lower(btrim(x)) from jsonb_array_elements_text(coalesce(p->'trusted_sites', '[]')) x where btrim(x) <> ''),
    array(select distinct lower(btrim(x)) from jsonb_array_elements_text(coalesce(p->'competitors', '[]')) x where btrim(x) <> ''),
    array(select distinct lower(btrim(x)) from jsonb_array_elements_text(coalesce(p->'exclude_terms', '[]')) x where btrim(x) <> ''),
    array(select distinct btrim(x) from jsonb_array_elements_text(coalesce(p->'site_types', '[]')) x where btrim(x) <> ''),
    nullif(btrim(coalesce(p->>'notes', '')), ''),
    (select auth.uid())
  on conflict (client_id) do update set
    reach = excluded.reach, buyer = excluded.buyer, offering = excluded.offering,
    audience = excluded.audience, core_topics = excluded.core_topics,
    adjacent_topics = excluded.adjacent_topics, trusted_sites = excluded.trusted_sites,
    competitors = excluded.competitors, exclude_terms = excluded.exclude_terms,
    site_types = excluded.site_types, notes = excluded.notes,
    version = b.version + 1, updated_by = excluded.updated_by, updated_at = now()
  returning version into v;

  -- Topics, sites and terms never carry search operators or quotes.
  select string_agg(x, ', ') into clean_list from (
    select unnest(core_topics || adjacent_topics || exclude_terms) x from public.backlink_briefs where client_id = p_client_id
  ) s where x ~ '[:{}"]';
  if clean_list is not null then
    raise exception 'Remove : { } or " from: %', clean_list using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.backlink_briefs, unnest(trusted_sites || competitors) d
    where client_id = p_client_id and d !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+(/[^\s]*)?$'
  ) then
    raise exception 'Trusted sites and competitors must be web addresses like clutch.co.' using errcode = 'P0001';
  end if;

  perform private.log_backlinks(p_client_id, 'backlink.brief_saved', jsonb_build_object('version', v));
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Find places with a planned list of searches
-- ---------------------------------------------------------------------------

-- The 2-argument version from 0036 now only refuses: every search needs a brief and a plan.
create or replace function public.request_backlink_discovery(p_client_id uuid, p_target_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Reload the page: Find places now needs the strategy brief.' using errcode = 'P0001';
end;
$$;

create or replace function public.request_backlink_discovery(
  p_client_id uuid, p_target_ids uuid[], p_queries jsonb, p_brief_version integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  b public.backlink_briefs%rowtype;
  rid uuid;
  ids uuid[];
  n_ok integer;
  recent record;
  lim integer;
  used integer;
  n_queries integer;
  bad text;
  missing text[];
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

  select id into rid from public.backlink_runs
    where client_id = p_client_id and status in ('queued', 'running');
  if rid is not null then
    return rid;
  end if;

  select * into b from public.backlink_briefs where client_id = p_client_id;
  missing := private.backlink_brief_missing(p_client_id);
  if cardinality(missing) > 0 then
    raise exception '%', array_to_string(missing, '. ') || '.' using errcode = 'P0001';
  end if;
  if b.version is distinct from p_brief_version then
    raise exception 'The strategy brief changed. Reload the page and try again.' using errcode = 'P0001';
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

  -- The planned searches: 1–60, plain words, known footprints and places.
  n_queries := jsonb_array_length(coalesce(p_queries, '[]'::jsonb));
  if n_queries = 0 then
    raise exception 'Nothing to search. Check the brief''s topics and site types.' using errcode = 'P0001';
  end if;
  if n_queries > 60 then
    raise exception 'That is % searches; a search can do 60 at most. Pick fewer places.', n_queries using errcode = 'P0001';
  end if;
  select q->>'query' into bad from jsonb_array_elements(p_queries) q
    where coalesce(char_length(q->>'query'), 0) not between 2 and 300
      or q->>'query' ~ '[:{}"]'
      or (q->>'scope') not in ('geo', 'service', 'industry', 'topic', 'buyer')
      or (nullif(q->>'target_id', '') is not null and not ((q->>'target_id')::uuid = any (ids)))
      or (nullif(q->>'footprint_id', '') is not null and not exists (
        select 1 from public.backlink_footprints f where f.id = (q->>'footprint_id')::uuid))
    limit 1;
  if found then
    raise exception 'One of the planned searches isn''t allowed: %', coalesce(bad, '(empty)') using errcode = 'P0001';
  end if;

  select backlink_runs_per_client_month into lim from public.dfs_settings where id;
  select count(*) into used from public.backlink_runs
    where client_id = p_client_id and kind = 'search' and status <> 'failed' and created_at >= private.agency_month_start();
  if used >= lim then
    raise exception 'This client has used its % searches this month. An admin can raise the limit.', lim
      using errcode = 'P0001';
  end if;

  problem := private.backlinks_budget_problem();
  if problem is not null then
    raise exception '%', problem using errcode = 'P0001';
  end if;

  begin
    insert into public.backlink_runs (client_id, created_by, target_ids, kind, brief_version, params, queries_total)
    values (p_client_id, (select auth.uid()), ids, 'search', b.version,
      jsonb_build_object('brief', to_jsonb(b) - 'client_id' - 'updated_by' - 'created_at' - 'updated_at'),
      n_queries)
    returning id into rid;
  exception when unique_violation then
    select id into rid from public.backlink_runs
      where client_id = p_client_id and status in ('queued', 'running');
    return rid;
  end;

  insert into public.backlink_run_queries (run_id, client_id, footprint_id, scope, query, query_norm, target_id)
  select rid, p_client_id, nullif(q->>'footprint_id', '')::uuid, (q->>'scope')::public.footprint_scope,
    btrim(q->>'query'), lower(regexp_replace(btrim(q->>'query'), '\s+', ' ', 'g')),
    nullif(q->>'target_id', '')::uuid
  from jsonb_array_elements(p_queries) q
  on conflict (run_id, target_id, query_norm) do nothing;
  update public.backlink_runs set queries_total = (select count(*) from public.backlink_run_queries where run_id = rid)
    where id = rid;
  return rid;
end;
$$;

-- Redo the top 30 from saved results with the current brief (no searches; AI review only).
create or replace function public.rerank_backlinks(p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.backlink_briefs%rowtype;
  rid uuid;
  last_at timestamptz;
  problem text;
begin
  perform private.require_backlinks_worker(p_client_id);
  select * into b from public.backlink_briefs where client_id = p_client_id;
  if b.client_id is null then
    raise exception 'Fill in the strategy brief first.' using errcode = 'P0001';
  end if;
  select id into rid from public.backlink_runs where client_id = p_client_id and status in ('queued', 'running');
  if rid is not null then
    return rid;
  end if;
  if not exists (
    select 1 from public.backlink_opportunities
    where client_id = p_client_id and source = 'search' and decided_by is null and status in ('pending_review', 'reserve')
  ) then
    raise exception 'There are no found places to rank yet. Run Find places first.' using errcode = 'P0001';
  end if;
  select max(created_at) into last_at from public.backlink_runs
    where client_id = p_client_id and kind = 'rerank' and status <> 'failed';
  if last_at > now() - interval '10 minutes' then
    raise exception 'Re-ranked a few minutes ago. Try again after %.',
      to_char((last_at + interval '10 minutes') at time zone 'America/Phoenix', 'FMHH12:MI AM') using errcode = 'P0001';
  end if;
  problem := public.dfs_ai_budget_problem();
  if problem is not null then
    raise exception '%', problem using errcode = 'P0001';
  end if;
  begin
    insert into public.backlink_runs (client_id, created_by, kind, brief_version, params)
    values (p_client_id, (select auth.uid()), 'rerank', b.version,
      jsonb_build_object('brief', to_jsonb(b) - 'client_id' - 'updated_by' - 'created_at' - 'updated_at'))
    returning id into rid;
  exception when unique_violation then
    select id into rid from public.backlink_runs where client_id = p_client_id and status in ('queued', 'running');
  end;
  return rid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Store (search results land in More until the shortlist picks them)
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
  src text;
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

    src := coalesce(nullif(it->>'source', ''), case when coalesce((it->>'is_core')::boolean, false) then 'core' else 'search' end);
    if src not in ('search', 'core', 'brief') then
      src := 'search';
    end if;
    st := coalesce((it->>'status')::public.opportunity_status, 'reserve');
    if st not in ('pending_review', 'reserve', 'filtered') then
      st := 'reserve';
    end if;
    -- Searched places wait in More until the shortlist picks them; basics go straight to review.
    if st = 'pending_review' and src = 'search' then
      st := 'reserve';
    end if;
    reason := case when st = 'filtered' then coalesce(it->>'filter_reason', 'looks_like_business') end;
    if dir.status = 'blocked' or (not dir.is_core and exists (
      select 1 from public.directories b
      where b.site_key = it->>'domain' and b.status = 'blocked' and b.id <> dir.id
    )) then
      st := 'filtered';
      reason := 'blocked';
    end if;

    tids := array(
      select distinct x::uuid from jsonb_array_elements_text(coalesce(it->'target_ids', '[]'::jsonb)) x
      where x ~ '^[0-9a-f-]{36}$' and x::uuid = any (run.target_ids)
    );

    insert into public.backlink_opportunities as o (
      client_id, directory_id, status, filter_reason, is_core, source, found_url, found_title, found_snippet,
      best_position, is_local, relevance, rule_score, topic_fit, matched_topic, first_run_id, last_run_id, target_ids
    )
    values (
      run.client_id, dir.id, st, reason, src = 'core', src,
      case when it->>'found_url' ~ '^https?://' then left(it->>'found_url', 2000) end,
      left(it->>'found_title', 300), left(it->>'found_snippet', 600),
      (it->>'best_position')::smallint, coalesce((it->>'is_local')::boolean, false),
      least(1, greatest(0, coalesce((it->>'relevance')::numeric, 0))),
      least(1, greatest(0, coalesce((it->>'rule_score')::numeric, (it->>'relevance')::numeric, 0))),
      least(1, greatest(0, coalesce((it->>'topic_fit')::numeric, 0))),
      left(nullif(it->>'matched_topic', ''), 120),
      run.id, run.id, tids
    )
    on conflict (client_id, directory_id) do update set
      last_run_id = excluded.last_run_id,
      target_ids = array(select distinct x from unnest(o.target_ids || excluded.target_ids) x),
      is_core = o.is_core or excluded.is_core,
      source = case when o.source = 'search' then o.source else excluded.source end,
      is_local = o.is_local or excluded.is_local,
      found_url = case when o.found_url is null or excluded.best_position < coalesce(o.best_position, 32767)
        then coalesce(excluded.found_url, o.found_url) else o.found_url end,
      found_title = case when o.found_title is null or excluded.best_position < coalesce(o.best_position, 32767)
        then coalesce(excluded.found_title, o.found_title) else o.found_title end,
      found_snippet = case when o.found_snippet is null or excluded.best_position < coalesce(o.best_position, 32767)
        then coalesce(excluded.found_snippet, o.found_snippet) else o.found_snippet end,
      best_position = least(o.best_position, excluded.best_position),
      relevance = greatest(o.relevance, excluded.relevance),
      rule_score = excluded.rule_score,
      topic_fit = excluded.topic_fit,
      matched_topic = coalesce(excluded.matched_topic, o.matched_topic),
      status = case
        when o.decided_by is not null then o.status
        when excluded.filter_reason = 'blocked' then 'filtered'::public.opportunity_status
        when o.status = 'filtered' and o.filter_reason = 'blocked' then o.status
        when o.status in ('pending_review', 'reserve') and excluded.status = 'filtered' then o.status
        when o.status = 'filtered' and excluded.status in ('pending_review', 'reserve') then excluded.status
        else o.status end,
      filter_reason = case
        when o.decided_by is not null then o.filter_reason
        when excluded.filter_reason = 'blocked' then 'blocked'
        when o.status = 'filtered' and o.filter_reason = 'blocked' then o.filter_reason
        when o.status in ('pending_review', 'reserve') and excluded.status = 'filtered' then o.filter_reason
        when o.status = 'filtered' and excluded.status in ('pending_review', 'reserve') then null
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
-- The top 30
-- ---------------------------------------------------------------------------

-- Applies the shortlist: picks → Review (rank 1–30), kept → More, misfits → Hidden.
-- Only undecided searched places of this run's client change; Review never holds more than 30.
create or replace function public.dfs_apply_shortlist(p_run_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.backlink_runs%rowtype;
  n_review integer;
  n_more integer;
  n_hidden integer;
begin
  select * into run from public.backlink_runs where id = p_run_id;
  if run.id is null then
    raise exception 'Unknown search %', p_run_id using errcode = 'P0002';
  end if;

  update public.backlink_opportunities o set
    status = case
      when it.status = 'pending_review' then 'pending_review'::public.opportunity_status
      when it.status = 'filtered' then 'filtered'::public.opportunity_status
      else 'reserve'::public.opportunity_status end,
    filter_reason = case when it.status = 'filtered' then coalesce(it.filter_reason, 'ai_rejected') end,
    shortlist_rank = case when it.status = 'pending_review' and it.shortlist_rank between 1 and 30 then it.shortlist_rank end,
    rule_score = coalesce(least(1, greatest(0, it.rule_score)), o.rule_score),
    topic_fit = coalesce(least(1, greatest(0, it.topic_fit)), o.topic_fit),
    matched_topic = coalesce(left(it.matched_topic, 120), o.matched_topic),
    ai_fit = it.ai_fit,
    ai_verdict = it.ai_verdict,
    ai_reason = left(it.ai_reason, 200),
    updated_at = now()
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as it(
    id uuid, status text, shortlist_rank smallint, rule_score numeric, topic_fit numeric,
    matched_topic text, ai_fit smallint, ai_verdict text, ai_reason text, filter_reason text
  )
  where o.id = it.id
    and o.client_id = run.client_id
    and o.source = 'search'
    and o.decided_by is null
    and o.status in ('pending_review', 'reserve', 'filtered')
    and not (o.status = 'filtered' and o.filter_reason = 'blocked')
    and (it.filter_reason is null or it.filter_reason in ('ai_rejected', 'competitor', 'excluded_term'));

  -- Never more than 30 waiting: the lowest ranked go back to More.
  with ranked as (
    select id, row_number() over (order by shortlist_rank nulls last, rule_score desc nulls last, created_at) rn
    from public.backlink_opportunities
    where client_id = run.client_id and source = 'search' and status = 'pending_review'
  )
  update public.backlink_opportunities o set status = 'reserve', shortlist_rank = null, updated_at = now()
    from ranked r where r.id = o.id and r.rn > 30 and o.decided_by is null;

  select count(*) filter (where status = 'pending_review'), count(*) filter (where status = 'reserve'),
         count(*) filter (where status = 'filtered')
    into n_review, n_more, n_hidden
    from public.backlink_opportunities where client_id = run.client_id and source = 'search';
  return jsonb_build_object('review', n_review, 'more', n_more, 'hidden', n_hidden);
end;
$$;

-- ---------------------------------------------------------------------------
-- Review: from More too, and "Move to Review" when there is room
-- ---------------------------------------------------------------------------

create or replace function public.review_backlink_opportunities(
  p_ids uuid[], p_decision text, p_reason public.backlink_reject_reason default null, p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[] := array(select distinct x from unnest(coalesce(p_ids, '{}')) x);
  cid uuid;
  oid_ uuid;
  o record;
  n_found integer;
  changed integer;
  total integer := 0;
  sites text[];
  waiting integer;
begin
  if p_decision not in ('approve', 'reject', 'restore', 'promote') then
    raise exception 'Unknown decision.' using errcode = '22023';
  end if;
  if cardinality(ids) = 0 then
    return 0;
  end if;
  if cardinality(ids) > 500 then
    raise exception 'Review at most 500 places at a time.' using errcode = '22023';
  end if;
  if p_decision = 'reject' and p_reason is null then
    raise exception 'Pick a reason for rejecting.' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'Keep the note under 500 characters.' using errcode = '22023';
  end if;

  select count(*) into n_found from public.backlink_opportunities where id = any(ids);
  if n_found <> cardinality(ids) then
    raise exception 'Some of these places no longer exist. Reload the page.' using errcode = 'P0002';
  end if;
  for cid in select distinct client_id from public.backlink_opportunities where id = any(ids) loop
    perform private.require_backlinks_worker(cid);
  end loop;

  for cid in select distinct client_id from public.backlink_opportunities where id = any(ids) loop
    changed := 0;
    sites := '{}';
    if p_decision in ('approve', 'reject') then
      with changed_rows as (
        update public.backlink_opportunities x set
          status = case p_decision when 'approve' then 'approved'::public.opportunity_status
                                   else 'rejected'::public.opportunity_status end,
          filter_reason = null,
          shortlist_rank = null,
          reject_reason = case when p_decision = 'reject' then p_reason end,
          reject_note = case when p_decision = 'reject' then nullif(trim(p_note), '') end,
          decided_by = (select auth.uid()),
          decided_at = now(),
          updated_at = now()
        where x.id = any(ids) and x.client_id = cid
          and x.status <> case p_decision when 'approve' then 'approved'::public.opportunity_status
                                          else 'rejected'::public.opportunity_status end
          and not (x.status = 'filtered' and x.filter_reason = 'blocked')
        returning x.directory_id
      )
      select count(*), array(select d.name from changed_rows r join public.directories d on d.id = r.directory_id limit 10)
        into changed, sites from changed_rows;
    else
      -- restore / promote, one at a time: searched places go to Review only while it has room.
      for oid_ in select id from public.backlink_opportunities
          where id = any(ids) and client_id = cid order by shortlist_rank nulls last, rule_score desc nulls last loop
        select x.*, d.name as dname into o from public.backlink_opportunities x
          join public.directories d on d.id = x.directory_id where x.id = oid_;
        if o.status = 'filtered' and o.filter_reason = 'blocked' then
          continue;
        end if;
        if p_decision = 'promote' and o.status <> 'reserve' then
          continue;
        end if;
        if p_decision = 'restore' and o.status in ('pending_review', 'reserve') then
          continue;
        end if;
        select count(*) into waiting from public.backlink_opportunities
          where client_id = cid and source = 'search' and status = 'pending_review';
        if o.source = 'search' and waiting >= 30 then
          if p_decision = 'promote' then
            raise exception 'Review already has 30 places. Approve or reject some first.' using errcode = 'P0001';
          end if;
          update public.backlink_opportunities set status = 'reserve', filter_reason = null, reject_reason = null,
            reject_note = null, decided_by = (select auth.uid()), decided_at = now(), updated_at = now()
            where id = oid_;
        else
          update public.backlink_opportunities set status = 'pending_review', filter_reason = null, reject_reason = null,
            reject_note = null, decided_by = (select auth.uid()), decided_at = now(), updated_at = now()
            where id = oid_;
        end if;
        changed := changed + 1;
        if cardinality(sites) < 10 then
          sites := sites || o.dname;
        end if;
      end loop;
    end if;
    if changed > 0 then
      perform private.log_backlinks(cid, 'backlink.reviewed', jsonb_build_object(
        'decision', p_decision, 'count', changed, 'sites', to_jsonb(sites),
        'reason', case when p_decision = 'reject' then p_reason end
      ));
    end if;
    total := total + changed;
  end loop;
  return total;
end;
$$;

-- ---------------------------------------------------------------------------
-- The page's limits, with the brief
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
  b public.backlink_briefs%rowtype;
begin
  if not private.can_see_client(p_client_id) then
    return null;
  end if;
  select * into s from public.dfs_settings where id;
  select * into b from public.backlink_briefs where client_id = p_client_id;
  select count(*) into used from public.backlink_runs
    where client_id = p_client_id and kind = 'search' and status <> 'failed' and created_at >= private.agency_month_start();
  select * into open_run from public.backlink_runs
    where client_id = p_client_id and status in ('queued', 'running') limit 1;
  return jsonb_build_object(
    'used', used,
    'limit', s.backlink_runs_per_client_month,
    'next_search_at', null,
    'budget_problem', private.backlinks_budget_problem(),
    'ai_budget_problem', public.dfs_ai_budget_problem(),
    'access', s.backlinks_access,
    'max_searches', 60,
    'brief_version', b.version,
    'brief_missing', to_jsonb(private.backlink_brief_missing(p_client_id)),
    'open_run', case when open_run.id is null then null else jsonb_build_object(
      'id', open_run.id, 'status', open_run.status, 'kind', open_run.kind, 'step', open_run.step,
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

revoke execute on function private.ai_month_spend() from public, anon;
revoke execute on function private.backlink_brief_missing(uuid) from public, anon;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.save_backlink_brief(uuid, jsonb)',
    'public.request_backlink_discovery(uuid, uuid[], jsonb, integer)',
    'public.rerank_backlinks(uuid)',
    'public.review_backlink_opportunities(uuid[], text, public.backlink_reject_reason, text)',
    'public.backlink_quota(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.dfs_store_backlink_candidates(uuid, jsonb)',
    'public.dfs_apply_shortlist(uuid, jsonb)',
    'public.dfs_ai_budget_problem()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
