-- 0062 · Ranking scan tables (docs/plans/ranking-scan/03-data-model.md)
-- What the client's site already ranks for, from DataForSEO, Search Console and Google Business
-- Profile. The team reads through RLS; the scan pipeline writes with the service role.

create table public.rank_scans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  status public.rank_scan_status not null default 'queued',
  trigger public.rank_scan_trigger not null default 'manual',
  step smallint not null default 0 check (step between 0 and 5),
  params jsonb not null default '{}',
  sources jsonb not null default '{}',
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
comment on table public.rank_scans is 'One scan of what a client already ranks for (DataForSEO, Search Console, Google Business Profile).';

create unique index rank_scans_open_idx on public.rank_scans (client_id) where status in ('queued', 'running');
create index rank_scans_client_idx on public.rank_scans (client_id, created_at desc);
create index rank_scans_queue_idx on public.rank_scans (status, created_at) where status in ('queued', 'running');
create index rank_scans_created_by_idx on public.rank_scans (created_by);

create table public.rank_scan_keywords (
  scan_id uuid not null references public.rank_scans (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  keyword_norm text not null check (char_length(keyword_norm) between 1 and 200),
  phrase text not null check (char_length(phrase) between 1 and 200),
  sources public.rank_scan_source[] not null default '{}',
  verdict public.rank_verdict,
  reasons text[] not null default '{}',
  is_brand boolean not null default false,
  low_ctr boolean not null default false,
  score smallint check (score is null or score between 0 and 100),
  position numeric(6, 1),
  topic text check (topic is null or char_length(topic) <= 120),
  -- DataForSEO (national, from Labs)
  dfs_position smallint,
  dfs_type text check (dfs_type is null or char_length(dfs_type) <= 40),
  dfs_url text check (dfs_url is null or char_length(dfs_url) <= 2000),
  dfs_previous_position smallint,
  dfs_volume integer,
  dfs_etv numeric(12, 2),
  dfs_check_url text check (dfs_check_url is null or char_length(dfs_check_url) <= 2000),
  dfs_updated_at timestamptz,
  other_language boolean not null default false,
  -- Search Console (3 months)
  gsc_clicks integer,
  gsc_impressions integer,
  gsc_ctr numeric(6, 4),
  gsc_position numeric(6, 1),
  gsc_page text check (gsc_page is null or char_length(gsc_page) <= 2000),
  -- Google Business Profile (monthly reach)
  gbp_reach integer,
  gbp_below_threshold boolean not null default false,
  -- Metrics
  city_volume integer,
  national_volume integer,
  difficulty smallint,
  intent text check (intent is null or intent in ('informational', 'navigational', 'commercial', 'transactional')),
  cpc numeric(10, 2),
  primary key (scan_id, keyword_norm)
);
comment on table public.rank_scan_keywords is 'One keyword of a ranking scan, with each source''s numbers and the verdict.';

create index rank_scan_keywords_client_idx on public.rank_scan_keywords (client_id, scan_id, verdict);
create index rank_scan_keywords_norm_idx on public.rank_scan_keywords (client_id, keyword_norm);

-- Settings per client
alter table public.rank_settings
  add column scan_auto boolean not null default true,
  add column scan_next_at timestamptz,
  add column last_scan_id uuid references public.rank_scans (id) on delete set null,
  add column gsc_account_id uuid references public.social_accounts (id) on delete set null,
  add column gsc_country_only boolean not null default true,
  add column brand_terms text[] not null default '{}' check (cardinality(brand_terms) <= 20);
create index rank_settings_last_scan_idx on public.rank_settings (last_scan_id);
create index rank_settings_gsc_account_idx on public.rank_settings (gsc_account_id);
create index rank_settings_scan_due_idx on public.rank_settings (scan_next_at) where scan_auto;

-- First automatic scans spread over the next week, not all at once.
update public.rank_settings set scan_next_at = now() + (random() * interval '7 days') where scan_next_at is null;

alter table public.dfs_settings
  add column rank_scans_per_client_month integer not null default 4 check (rank_scans_per_client_month between 1 and 50);

-- Search Console is never a social post target (like WordPress).
alter table public.content_post_targets drop constraint content_post_targets_platform_check;
alter table public.content_post_targets
  add constraint content_post_targets_platform_check check (platform not in ('wordpress', 'googlesearchconsole'));

-- RLS: the team reads clients it can see; writes only through the service role and RPCs.
alter table public.rank_scans enable row level security;
alter table public.rank_scan_keywords enable row level security;

create policy "Team sees ranking scans of clients they can see"
  on public.rank_scans for select to authenticated
  using ((select private.is_team_member()) and private.can_see_client(client_id));
create policy "Team sees ranking scan keywords of clients they can see"
  on public.rank_scan_keywords for select to authenticated
  using ((select private.is_team_member()) and private.can_see_client(client_id));

revoke insert, update, delete on public.rank_scans, public.rank_scan_keywords from anon, authenticated;
revoke all on public.rank_scans, public.rank_scan_keywords from anon;
