-- Competitor backlinks for Shockwave AI Search (docs/plans/backlinks/11-competitor-backlinks.md).
-- Where the client's competitors get their links: DataForSEO's link index finds the sites, Claude
-- judges whether the client can get the same link. Tables, columns and settings; functions in 0050.

-- The client's competitors (≤ 5 active). Start of the separate competitors system.
create table public.client_competitors (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  domain text not null check (domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' and char_length(domain) <= 253),
  name text check (name is null or char_length(name) <= 120),
  source text not null default 'team' check (source in ('ai', 'dataforseo', 'team')),
  active boolean not null default true,
  evidence jsonb not null default '{}',
  added_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, domain)
);
create index client_competitors_client_idx on public.client_competitors (client_id) where active;
create index client_competitors_added_by_idx on public.client_competitors (added_by);
alter table public.client_competitors enable row level security;
create policy "See competitors of clients you can see" on public.client_competitors
  for select to authenticated using ((select private.can_see_client(client_id)));
comment on table public.client_competitors is 'Competitors per client (≤ 5 active). Written through save_client_competitors and the AI search pipeline.';

-- Link data per competitor set, reused for 30 days. Service role only.
create table public.backlink_gap_cache (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (char_length(key) <= 400),
  client_id uuid references public.clients (id) on delete cascade,
  competitors text[] not null,
  client_domain text,
  intersection jsonb not null default '[]',
  pages jsonb not null default '{}',
  rows integer not null default 0,
  cost_usd numeric(9, 5) not null default 0,
  fetched_at timestamptz not null default now()
);
create index backlink_gap_cache_client_idx on public.backlink_gap_cache (client_id);
alter table public.backlink_gap_cache enable row level security;
comment on table public.backlink_gap_cache is 'DataForSEO link-gap results per competitor set (30 days). Service role only, no policies on purpose.';

alter table public.ai_search_runs
  add column kind text not null default 'full' check (kind in ('full', 'competitors')),
  add column competitors text[] not null default '{}';

alter table public.ai_link_prospects
  add column shared_count smallint check (shared_count is null or shared_count between 0 and 20),
  add column competitor_links jsonb not null default '[]',
  add column link_kind text check (link_kind is null or char_length(link_kind) <= 40),
  add column replicability text check (replicability is null or replicability in ('easy', 'possible', 'hard', 'no'));

alter table public.ai_link_prospects drop constraint ai_link_prospects_filter_reason_check;
alter table public.ai_link_prospects add constraint ai_link_prospects_filter_reason_check check (filter_reason in (
  'own_site', 'competitor', 'blocked', 'excluded_term', 'ai_rejected', 'gone', 'ai_invented',
  'not_reachable', 'paid_only', 'language_mismatch', 'spam', 'social_profile', 'not_replicable'
));

alter table public.dfs_settings
  add column ai_gap_runs_per_client_month smallint not null default 6 check (ai_gap_runs_per_client_month between 0 and 100),
  add column ai_gap_max_sites smallint not null default 150 check (ai_gap_max_sites between 20 and 500),
  add column ai_gap_min_shared smallint not null default 2 check (ai_gap_min_shared between 1 and 5);
