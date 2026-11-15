-- 0025_rankings: tables for Rankings (DataForSEO).
--   rank_settings      per client: where/how rankings are checked, relevance terms, schedule
--   keywords (+cols)   tracked keywords; archived ones keep their history
--   keyword_metrics    shared cache of search volume / difficulty / intent (not per client)
--   rank_runs          one weekly / manual / new-keywords run per client
--   rank_checks (+cols), keyword_ranks (+cols)   results per engine and keyword
--   serp_tasks         ledger of DataForSEO task ids (results can't be lost or applied twice)
--   keyword_research_runs, keyword_candidates      "find better keywords"
--   dfs_calls, dfs_settings, dfs_locations         spend ledger, budget, locations cache
-- Job writes go through the service role; team writes only through the RPCs in 0026.

create or replace function private.normalize_keyword(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------------
-- Settings per client
-- ---------------------------------------------------------------------------

create table public.rank_settings (
  client_id uuid primary key references public.clients (id) on delete cascade,
  -- Google SERP / Google Ads location (a city), and the country for Labs.
  location_code integer,
  location_name text check (location_name is null or char_length(location_name) <= 200),
  country_location_code integer,
  bing_location_code integer,
  language_code text not null default 'en' check (language_code ~ '^[a-z]{2,3}(-[a-z]{2,4})?$'),
  device text not null default 'mobile' check (device in ('mobile', 'desktop')),
  engines public.rank_engine[] not null default '{google,google_maps,bing}'
    check (cardinality(engines) between 1 and 3),
  depth smallint not null default 100 check (depth between 10 and 200),
  maps_place_id text check (maps_place_id is null or char_length(maps_place_id) <= 200),
  maps_cid text check (maps_cid is null or char_length(maps_cid) <= 100),
  maps_name text check (maps_name is null or char_length(maps_name) <= 200),
  check_weekday smallint not null default 1 check (check_weekday between 0 and 6),
  next_run_at timestamptz,
  paused boolean not null default false,
  topic_terms text[] not null default '{}' check (private.valid_list(topic_terms)),
  negative_terms text[] not null default
    '{jobs,job,salary,hiring,career,careers,diy,"how to",free,course,training,school,certification,license}'
    check (private.valid_list(negative_terms)),
  updated_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rank_settings_due_idx on public.rank_settings (next_run_at) where not paused;
create index rank_settings_updated_by_idx on public.rank_settings (updated_by);

-- ---------------------------------------------------------------------------
-- Keywords: more detail on the tracked list
-- ---------------------------------------------------------------------------

alter table public.keywords
  add column source public.keyword_source not null default 'manual',
  add column topic text check (topic is null or char_length(topic) <= 120),
  add column notes text check (notes is null or char_length(notes) <= 500),
  add column archived_reason text check (archived_reason is null or char_length(archived_reason) <= 300),
  add column archived_by uuid references public.team_members (id) on delete set null,
  add column replaced_by uuid references public.keywords (id) on delete set null,
  add column first_checked_at timestamptz;
create index keywords_active_idx on public.keywords (client_id) where archived_at is null and tracked;
create index keywords_archived_by_idx on public.keywords (archived_by);
create index keywords_replaced_by_idx on public.keywords (replaced_by);

-- ---------------------------------------------------------------------------
-- Shared metrics cache (one keyword in one place is fetched once for every client)
-- ---------------------------------------------------------------------------

create table public.keyword_metrics (
  keyword_norm text not null check (char_length(keyword_norm) between 1 and 200),
  location_code integer not null,
  language_code text not null,
  -- google_ads = city volume (Keywords Data); labs = national (DataForSEO Labs)
  source text not null check (source in ('google_ads', 'labs')),
  search_volume integer check (search_volume is null or search_volume >= 0),
  monthly_searches jsonb,
  cpc numeric(10, 2) check (cpc is null or cpc >= 0),
  competition numeric(5, 4) check (competition is null or competition between 0 and 1),
  competition_level text check (competition_level is null or competition_level in ('LOW', 'MEDIUM', 'HIGH')),
  keyword_difficulty smallint check (keyword_difficulty is null or keyword_difficulty between 0 and 100),
  main_intent text check (main_intent is null or main_intent in ('informational', 'navigational', 'commercial', 'transactional')),
  core_keyword text check (core_keyword is null or char_length(core_keyword) <= 200),
  trend_yearly integer,
  fetched_at timestamptz not null default now(),
  primary key (keyword_norm, location_code, language_code, source)
);

-- ---------------------------------------------------------------------------
-- Rank runs and checks
-- ---------------------------------------------------------------------------

create table public.rank_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  trigger public.rank_run_trigger not null,
  scope public.check_scope not null,
  status public.rank_run_status not null default 'queued',
  -- partial runs: just these keywords
  keyword_ids uuid[],
  keywords_count integer not null default 0,
  cost_usd numeric(10, 4) not null default 0,
  error text check (error is null or char_length(error) <= 500),
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index rank_runs_client_idx on public.rank_runs (client_id, created_at desc);
create index rank_runs_open_idx on public.rank_runs (status, created_at) where status in ('queued', 'running');
create index rank_runs_created_by_idx on public.rank_runs (created_by);
-- At most one queued or running full run per client.
create unique index rank_runs_one_full_idx on public.rank_runs (client_id)
  where scope = 'full' and status in ('queued', 'running');

alter table public.rank_checks
  add column run_id uuid references public.rank_runs (id) on delete cascade,
  add column scope public.check_scope not null default 'full',
  add column summary jsonb,
  add column tasks_total integer not null default 0,
  add column tasks_done integer not null default 0,
  add column tasks_failed integer not null default 0;
create unique index rank_checks_run_engine_idx on public.rank_checks (run_id, engine) where run_id is not null;

alter table public.keyword_ranks
  add column rank_absolute smallint check (rank_absolute is null or rank_absolute between 1 and 1000),
  add column local_pack_position smallint check (local_pack_position is null or local_pack_position between 1 and 20),
  add column serp_features text[] not null default '{}',
  add column in_ai_overview boolean not null default false,
  add column matched_domain text check (matched_domain is null or char_length(matched_domain) <= 300),
  add column title text check (title is null or char_length(title) <= 500),
  add column check_url text check (check_url is null or char_length(check_url) <= 2000),
  add column maps_rating numeric(3, 2),
  add column maps_reviews integer;

-- Ledger of DataForSEO tasks: one per check and keyword.
create table public.serp_tasks (
  id uuid primary key, -- the DataForSEO task id
  check_id uuid not null references public.rank_checks (id) on delete cascade,
  keyword_id uuid not null references public.keywords (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  engine public.rank_engine not null,
  status public.serp_task_status not null default 'posted',
  posted_at timestamptz not null default now(),
  completed_at timestamptz,
  attempts smallint not null default 0,
  cost_usd numeric(10, 5),
  error_code integer,
  error_message text check (error_message is null or char_length(error_message) <= 500),
  unique (check_id, keyword_id)
);
create index serp_tasks_open_idx on public.serp_tasks (posted_at) where status = 'posted';
create index serp_tasks_keyword_idx on public.serp_tasks (keyword_id);
create index serp_tasks_client_idx on public.serp_tasks (client_id);

-- ---------------------------------------------------------------------------
-- Keyword research
-- ---------------------------------------------------------------------------

create table public.keyword_research_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  status public.research_status not null default 'queued',
  trigger public.research_trigger not null default 'manual',
  step smallint not null default 0,
  params jsonb not null default '{}',
  counts jsonb not null default '{}',
  cost_usd numeric(10, 4) not null default 0,
  attempts smallint not null default 0,
  error text check (error is null or char_length(error) <= 500),
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz
);
create index keyword_research_runs_client_idx on public.keyword_research_runs (client_id, created_at desc);
create index keyword_research_runs_created_by_idx on public.keyword_research_runs (created_by);
create unique index keyword_research_runs_one_open_idx on public.keyword_research_runs (client_id)
  where status in ('queued', 'running');

create table public.keyword_candidates (
  client_id uuid not null references public.clients (id) on delete cascade,
  keyword_norm text not null check (char_length(keyword_norm) between 1 and 200),
  phrase text not null check (char_length(phrase) between 1 and 200),
  topic text check (topic is null or char_length(topic) <= 120),
  sources text[] not null default '{}',
  competitor_domains text[] not null default '{}',
  local_volume integer,
  national_volume integer,
  difficulty smallint check (difficulty is null or difficulty between 0 and 100),
  cpc numeric(10, 2),
  competition numeric(5, 4),
  intent text,
  trend_yearly integer,
  core_keyword text,
  ranked_position smallint,
  ranked_url text check (ranked_url is null or char_length(ranked_url) <= 2000),
  score smallint not null default 0 check (score between 0 and 100),
  score_parts jsonb not null default '{}',
  status public.candidate_status not null default 'new',
  first_seen_run uuid references public.keyword_research_runs (id) on delete set null,
  last_seen_run uuid references public.keyword_research_runs (id) on delete set null,
  decided_by uuid references public.team_members (id) on delete set null,
  decided_at timestamptz,
  dismiss_reason text check (dismiss_reason is null or char_length(dismiss_reason) <= 300),
  updated_at timestamptz not null default now(),
  primary key (client_id, keyword_norm)
);
create index keyword_candidates_score_idx on public.keyword_candidates (client_id, status, score desc);
create index keyword_candidates_first_run_idx on public.keyword_candidates (first_seen_run);
create index keyword_candidates_last_run_idx on public.keyword_candidates (last_seen_run);
create index keyword_candidates_decided_by_idx on public.keyword_candidates (decided_by);

-- ---------------------------------------------------------------------------
-- DataForSEO plumbing: spend ledger, budget, locations
-- ---------------------------------------------------------------------------

create table public.dfs_calls (
  id bigint generated always as identity primary key,
  client_id uuid references public.clients (id) on delete set null,
  api public.dfs_api not null,
  endpoint text not null check (char_length(endpoint) <= 200),
  tasks integer not null default 1,
  items integer not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  status_code integer,
  http_status integer,
  ms integer,
  ref uuid,
  error text check (error is null or char_length(error) <= 500),
  created_at timestamptz not null default now()
);
create index dfs_calls_created_idx on public.dfs_calls (created_at desc);
create index dfs_calls_client_idx on public.dfs_calls (client_id, created_at desc);

create table public.dfs_settings (
  id boolean primary key default true check (id),
  monthly_budget_usd numeric(10, 2) not null default 75 check (monthly_budget_usd >= 0),
  research_runs_per_client_month smallint not null default 4
    check (research_runs_per_client_month between 0 and 50),
  low_balance_usd numeric(10, 2) not null default 10 check (low_balance_usd >= 0),
  last_balance_usd numeric(12, 4),
  last_balance_at timestamptz,
  last_locations_sync_at timestamptz,
  updated_by uuid references public.team_members (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.dfs_settings (id) values (true);
create index dfs_settings_updated_by_idx on public.dfs_settings (updated_by);

create table public.dfs_locations (
  source text not null check (source in ('google', 'bing', 'google_ads', 'labs')),
  code integer not null,
  name text not null check (char_length(name) <= 300),
  type text,
  parent_code integer,
  country_iso text,
  synced_at timestamptz not null default now(),
  primary key (source, code)
);
create index dfs_locations_name_idx on public.dfs_locations (source, lower(name) text_pattern_ops);

-- ---------------------------------------------------------------------------
-- Row level security (reads); writes go through 0026's RPCs or the service role
-- ---------------------------------------------------------------------------

alter table public.rank_settings enable row level security;
alter table public.keyword_metrics enable row level security;
alter table public.rank_runs enable row level security;
alter table public.serp_tasks enable row level security;
alter table public.keyword_research_runs enable row level security;
alter table public.keyword_candidates enable row level security;
alter table public.dfs_calls enable row level security;
alter table public.dfs_settings enable row level security;
alter table public.dfs_locations enable row level security;

create policy "See rank settings for clients you can see"
  on public.rank_settings for select to authenticated using (private.can_see_client(client_id));
create policy "Team members read the keyword metrics cache"
  on public.keyword_metrics for select to authenticated using ((select private.is_team_member()));
create policy "See rank runs for clients you can see"
  on public.rank_runs for select to authenticated using (private.can_see_client(client_id));
create policy "See ranking tasks for clients you can see"
  on public.serp_tasks for select to authenticated using (private.can_see_client(client_id));
create policy "See research runs for clients you can see"
  on public.keyword_research_runs for select to authenticated using (private.can_see_client(client_id));
create policy "See keyword candidates for clients you can see"
  on public.keyword_candidates for select to authenticated using (private.can_see_client(client_id));
create policy "Admins see DataForSEO spend"
  on public.dfs_calls for select to authenticated using ((select private.has_role('{admin}')));
create policy "Admins see DataForSEO settings"
  on public.dfs_settings for select to authenticated using ((select private.has_role('{admin}')));
create policy "Admins change DataForSEO settings"
  on public.dfs_settings for update to authenticated
  using ((select private.has_role('{admin}'))) with check ((select private.has_role('{admin}')));
create policy "Team members read locations"
  on public.dfs_locations for select to authenticated using ((select private.is_team_member()));

revoke all on public.rank_settings, public.keyword_metrics, public.rank_runs, public.serp_tasks,
  public.keyword_research_runs, public.keyword_candidates, public.dfs_calls, public.dfs_settings,
  public.dfs_locations from anon;

revoke execute on function private.normalize_keyword(text) from public, anon;
grant execute on function private.normalize_keyword(text) to authenticated, service_role;
