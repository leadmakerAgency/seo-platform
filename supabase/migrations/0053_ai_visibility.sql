-- 0053 · AI Visibility tables (docs/plans/ai-visibility/03-data-model.md)
-- Every table: RLS select through private.can_see_client; writes only through RPCs (0054).

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

alter table public.dfs_settings
  add column aiv_monthly_budget_usd numeric(10, 2) not null default 40 check (aiv_monthly_budget_usd between 0 and 10000),
  add column aiv_max_run_usd numeric(10, 2) not null default 5 check (aiv_max_run_usd between 0 and 500),
  add column aiv_manual_runs_per_client_month smallint not null default 4 check (aiv_manual_runs_per_client_month between 0 and 100),
  add column aiv_prompts_per_client smallint not null default 50 check (aiv_prompts_per_client between 1 and 500),
  add column aiv_answer_retention_days smallint not null default 180 check (aiv_answer_retention_days between 7 and 1000),
  add column aiv_access text not null default 'unknown' check (aiv_access in ('unknown', 'active', 'denied')),
  add column aiv_access_checked_at timestamptz,
  add column aiv_claude_model text check (aiv_claude_model is null or char_length(aiv_claude_model) <= 80),
  add column aiv_perplexity_model text check (aiv_perplexity_model is null or char_length(aiv_perplexity_model) <= 80),
  add column aiv_last_cleanup_at timestamptz;

-- ---------------------------------------------------------------------------
-- Project (one per client)
-- ---------------------------------------------------------------------------

create table public.aiv_projects (
  client_id uuid primary key references public.clients (id) on delete cascade,
  brand_name text not null check (char_length(btrim(brand_name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 600),
  industry text check (industry is null or char_length(industry) <= 80),
  personas text[] not null default '{}' check (cardinality(personas) <= 8),
  brand_identity text[] not null default '{}' check (cardinality(brand_identity) <= 8),
  models public.aiv_model[] not null default '{chatgpt,gemini,ai_overview,ai_mode,claude,perplexity}'
    check (cardinality(models) between 1 and 6),
  countries text[] not null default '{US}' check (cardinality(countries) between 1 and 3),
  language text not null default 'en' check (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  frequency text not null default 'weekly' check (frequency in ('weekly', 'twice_weekly', 'daily')),
  run_weekday smallint not null default 1 check (run_weekday between 0 and 6),
  next_run_at timestamptz,
  paused boolean not null default false,
  version integer not null default 1,
  updated_by uuid references public.team_members (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index aiv_projects_due_idx on public.aiv_projects (next_run_at) where not paused;

-- ---------------------------------------------------------------------------
-- Brands: the client's own brand and the competitors
-- ---------------------------------------------------------------------------

create table public.aiv_brands (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  is_own boolean not null default false,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  tracked_names text[] not null check (cardinality(tracked_names) between 1 and 10),
  pattern text check (pattern is null or char_length(pattern) <= 200),
  domains text[] not null default '{}' check (cardinality(domains) <= 10),
  color_slot smallint not null default 0 check (color_slot between 0 and 7),
  active boolean not null default true,
  source text not null default 'team' check (source in ('team', 'suggested', 'competitors')),
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index aiv_brands_name_uniq on public.aiv_brands (client_id, lower(display_name));
create unique index aiv_brands_own_uniq on public.aiv_brands (client_id) where is_own;
create index aiv_brands_client_idx on public.aiv_brands (client_id) where active;

-- ---------------------------------------------------------------------------
-- Topics and questions (prompts)
-- ---------------------------------------------------------------------------

create table public.aiv_topics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort smallint not null default 0,
  created_at timestamptz not null default now()
);
create unique index aiv_topics_name_uniq on public.aiv_topics (client_id, lower(name));

create table public.aiv_prompts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  topic_id uuid references public.aiv_topics (id) on delete set null,
  text text not null check (char_length(text) between 8 and 400),
  country text not null check (country ~ '^[A-Z]{2}$'),
  language text not null default 'en' check (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  intent public.aiv_intent,
  branded boolean not null default false,
  persona text check (persona is null or char_length(persona) <= 80),
  head_phrase text check (head_phrase is null or char_length(head_phrase) <= 80),
  volume smallint check (volume is null or volume between 1 and 5),
  volume_raw integer,
  volume_at timestamptz,
  status text not null default 'active' check (status in ('active', 'archived')),
  source text not null default 'team' check (source in ('suggested', 'team', 'import', 'keywords')),
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index aiv_prompts_text_uniq on public.aiv_prompts (client_id, lower(text), country);
create index aiv_prompts_client_idx on public.aiv_prompts (client_id, status);

create table public.aiv_suggestions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  kind text not null check (kind in ('prompt', 'brand', 'topic')),
  key text not null check (char_length(key) between 1 and 400),
  payload jsonb not null default '{}',
  reason text check (reason is null or char_length(reason) <= 300),
  mentions integer not null default 0,
  status text not null default 'new' check (status in ('new', 'accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  decided_by uuid references public.team_members (id) on delete set null,
  decided_at timestamptz
);
create unique index aiv_suggestions_key_uniq on public.aiv_suggestions (client_id, kind, key);

-- ---------------------------------------------------------------------------
-- Runs and their checkpointed tasks
-- ---------------------------------------------------------------------------

create table public.aiv_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  trigger text not null check (trigger in ('schedule', 'manual', 'new_prompts')),
  status public.backlink_run_status not null default 'queued',
  stage smallint not null default 0 check (stage between 0 and 6),
  params jsonb not null default '{}',
  counts jsonb not null default '{}',
  estimate_usd numeric(10, 4) not null default 0,
  cost_usd numeric(10, 4) not null default 0,
  attempts smallint not null default 0,
  heartbeat_at timestamptz,
  released_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  error text check (error is null or char_length(error) <= 1000),
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index aiv_runs_open_uniq on public.aiv_runs (client_id) where status in ('queued', 'running');
create index aiv_runs_client_idx on public.aiv_runs (client_id, created_at desc);

create table public.aiv_tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.aiv_runs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  key text not null check (char_length(key) <= 200),
  prompt_id uuid not null references public.aiv_prompts (id) on delete cascade,
  model public.aiv_model not null,
  country text not null,
  status text not null default 'queued' check (status in ('queued', 'posted', 'collected', 'failed', 'skipped')),
  dfs_task_id text,
  posted_at timestamptz,
  collected_at timestamptz,
  attempts smallint not null default 0,
  error text check (error is null or char_length(error) <= 500),
  cost_usd numeric(10, 5) not null default 0,
  unique (run_id, key)
);
create index aiv_tasks_posted_idx on public.aiv_tasks (run_id, model) where status = 'posted';

-- ---------------------------------------------------------------------------
-- Answers (chats) and what was found in them
-- ---------------------------------------------------------------------------

create table public.aiv_chats (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.aiv_runs (id) on delete cascade,
  task_id uuid unique references public.aiv_tasks (id) on delete set null,
  client_id uuid not null references public.clients (id) on delete cascade,
  prompt_id uuid not null references public.aiv_prompts (id) on delete cascade,
  model public.aiv_model not null,
  country text not null,
  country_fallback boolean not null default false,
  run_date date not null,
  status text not null check (status in ('ok', 'empty', 'failed')),
  answer text check (answer is null or char_length(answer) <= 40000),
  model_version text check (model_version is null or char_length(model_version) <= 120),
  fan_out text[] not null default '{}',
  has_ads boolean not null default false,
  brand_hints text[] not null default '{}',
  check_url text check (check_url is null or char_length(check_url) <= 2000),
  analyzed_at timestamptz,
  analysis_version text,
  error text check (error is null or char_length(error) <= 500),
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index aiv_chats_client_date_idx on public.aiv_chats (client_id, run_date);
create index aiv_chats_prompt_idx on public.aiv_chats (prompt_id, model, run_date desc);
create index aiv_chats_run_idx on public.aiv_chats (run_id);
create index aiv_chats_unanalyzed_idx on public.aiv_chats (run_id) where analyzed_at is null and status = 'ok';

create table public.aiv_mentions (
  id bigint generated always as identity primary key,
  chat_id uuid not null references public.aiv_chats (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  run_date date not null,
  model public.aiv_model not null,
  brand_id uuid references public.aiv_brands (id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  name_key text not null check (char_length(name_key) between 1 and 80),
  position smallint not null check (position >= 1),
  sentiment smallint check (sentiment is null or sentiment between 0 and 100),
  quote text check (quote is null or char_length(quote) <= 300),
  unique (chat_id, name_key)
);
create index aiv_mentions_brand_idx on public.aiv_mentions (client_id, brand_id, run_date);
create index aiv_mentions_untracked_idx on public.aiv_mentions (client_id, name_key) where brand_id is null;

create table public.aiv_sources (
  id bigint generated always as identity primary key,
  chat_id uuid not null references public.aiv_chats (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  run_date date not null,
  model public.aiv_model not null,
  url text not null check (char_length(url) <= 2000),
  domain text not null check (char_length(domain) <= 253),
  title text check (title is null or char_length(title) <= 300),
  retrieved boolean not null default false,
  cited boolean not null default false,
  cite_rank smallint,
  unique (chat_id, url)
);
create index aiv_sources_domain_idx on public.aiv_sources (client_id, domain, run_date);
create index aiv_sources_url_idx on public.aiv_sources (client_id, url);

create table public.aiv_ads (
  id bigint generated always as identity primary key,
  chat_id uuid not null references public.aiv_chats (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  run_date date not null,
  advertiser text check (advertiser is null or char_length(advertiser) <= 120),
  domain text check (domain is null or char_length(domain) <= 253),
  title text check (title is null or char_length(title) <= 300),
  url text check (url is null or char_length(url) <= 2000)
);
create index aiv_ads_client_idx on public.aiv_ads (client_id, run_date);

-- Global cache: what kind of site a domain is (shared by every client).
create table public.aiv_domains (
  domain text primary key check (char_length(domain) <= 253),
  type text not null check (type in ('corporate', 'editorial', 'reference', 'ugc', 'directory', 'social', 'ecommerce', 'other')),
  by text not null check (by in ('rule', 'ai')),
  classified_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------------

create table public.aiv_actions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  "group" text not null check ("group" in ('site', 'own_pages', 'earned', 'claims')),
  title text not null check (char_length(btrim(title)) between 1 and 140),
  detail text check (detail is null or char_length(detail) <= 1200),
  evidence jsonb not null default '{}',
  impact text not null default 'medium' check (impact in ('high', 'medium', 'low')),
  domain text check (domain is null or char_length(domain) <= 253),
  url text check (url is null or (char_length(url) <= 2000 and url ~* '^https?://')),
  status text not null default 'new' check (status in ('new', 'in_progress', 'done', 'declined')),
  source text not null default 'ai' check (source in ('ai', 'team')),
  opportunity_id uuid references public.backlink_opportunities (id) on delete set null,
  work_item_id uuid references public.work_items (id) on delete set null,
  created_run_id uuid references public.aiv_runs (id) on delete set null,
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_by uuid references public.team_members (id) on delete set null,
  done_at timestamptz
);
create unique index aiv_actions_open_uniq on public.aiv_actions (client_id, "group", coalesce(domain, lower(title)))
  where status in ('new', 'in_progress');
create index aiv_actions_client_idx on public.aiv_actions (client_id, status);

-- ---------------------------------------------------------------------------
-- Locations per platform family (synced monthly)
-- ---------------------------------------------------------------------------

create table public.aiv_locations (
  family text not null check (family in ('chat_gpt', 'gemini', 'serp')),
  country_iso text not null check (country_iso ~ '^[A-Z]{2}$'),
  location_code integer not null,
  synced_at timestamptz not null default now(),
  primary key (family, country_iso)
);

-- ---------------------------------------------------------------------------
-- Backlinks: places sent from AI Visibility
-- ---------------------------------------------------------------------------

alter table public.backlink_opportunities drop constraint backlink_opportunities_source_check;
alter table public.backlink_opportunities add constraint backlink_opportunities_source_check
  check (source in ('search', 'core', 'brief', 'ai', 'manual', 'ai_visibility'));

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['aiv_projects', 'aiv_brands', 'aiv_topics', 'aiv_prompts', 'aiv_suggestions', 'aiv_runs',
                           'aiv_tasks', 'aiv_chats', 'aiv_mentions', 'aiv_sources', 'aiv_ads', 'aiv_actions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "See AI visibility data of visible clients" on public.%I for select to authenticated using ((select private.can_see_client(client_id)))', t);
  end loop;
end;
$$;

alter table public.aiv_domains enable row level security;
create policy "Anyone signed in can read domain types" on public.aiv_domains for select to authenticated using (true);
alter table public.aiv_locations enable row level security;
create policy "Anyone signed in can read AI locations" on public.aiv_locations for select to authenticated using (true);
