-- 0065 · Git sites: tables (docs/plans/git-cms/02-data-model.md)
-- A Git site is a client's GitHub repo with a Sveltia / Decap CMS config. Publishing an
-- article = one commit (post + images); the host (Vercel, Netlify…) builds on push.
-- Not in social_accounts: the Zernio sync marks rows it doesn't list as removed.

-- ---------------------------------------------------------------------------
-- Connected repos
-- ---------------------------------------------------------------------------
create table public.git_connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  auth_method public.git_auth_method not null,
  installation_id bigint check (installation_id is null or installation_id > 0),
  token_expires_at timestamptz,
  owner text not null check (owner ~ '^[A-Za-z0-9_.-]{1,100}$'),
  repo text not null check (repo ~ '^[A-Za-z0-9_.-]{1,100}$'),
  repo_id bigint check (repo_id is null or repo_id > 0),
  branch text not null default 'main' check (char_length(branch) between 1 and 200 and branch !~ '\.\.'),
  config_path text check (config_path is null or (char_length(config_path) <= 200 and config_path !~ '(^/|\.\.)')),
  collection text check (collection is null or char_length(collection) <= 100),
  folder text check (folder is null or (char_length(folder) <= 200 and folder !~ '(^/|\.\.)')),
  extension text not null default 'md' check (extension in ('md', 'markdown')),
  format text not null default 'yaml-frontmatter' check (format in ('yaml-frontmatter')),
  slug_template text not null default '{{slug}}' check (char_length(slug_template) between 1 and 200 and slug_template !~ '\.\.'),
  media_folder text check (media_folder is null or (char_length(media_folder) <= 200 and media_folder !~ '(^/|\.\.)')),
  public_folder text check (public_folder is null or (char_length(public_folder) <= 200 and public_folder !~ '\.\.')),
  date_format text check (date_format is null or char_length(date_format) <= 40),
  field_map jsonb not null default '{}' check (jsonb_typeof(field_map) = 'object' and octet_length(field_map::text) <= 20000),
  url_pattern text check (url_pattern is null or (char_length(url_pattern) <= 300 and url_pattern ~ '^/')),
  site_url text check (site_url is null or (site_url ~ '^https?://[^/\s]+$' and char_length(site_url) <= 300)),
  commit_name text check (commit_name is null or char_length(commit_name) <= 100),
  commit_email text check (commit_email is null or (commit_email ~ '^[^@\s]+@[^@\s]+$' and char_length(commit_email) <= 200)),
  status public.git_connection_status not null default 'connected',
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  last_checked_at timestamptz,
  detected jsonb not null default '{}' check (jsonb_typeof(detected) = 'object' and octet_length(detected::text) <= 200000),
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (auth_method <> 'github_app' or installation_id is not null)
);
comment on table public.git_connections is
  'GitHub repos with a Sveltia/Decap CMS that Content publishes articles to (one commit per send).';

create unique index git_connections_client_repo_idx on public.git_connections (client_id, lower(owner), lower(repo))
  where status <> 'removed';
create index git_connections_client_idx on public.git_connections (client_id);
create index git_connections_status_idx on public.git_connections (status, last_checked_at);
create index git_connections_installation_idx on public.git_connections (installation_id) where installation_id is not null;
create index git_connections_created_by_idx on public.git_connections (created_by);

-- Vault references, in their own table with no policies: only security definer functions
-- and the service role ever see them.
create table public.git_connection_secrets (
  connection_id uuid primary key references public.git_connections (id) on delete cascade,
  token_secret_id uuid,
  deploy_hook_secret_id uuid,
  updated_at timestamptz not null default now()
);
comment on table public.git_connection_secrets is 'Vault ids for a Git site''s token and deploy hook. Never readable by team roles.';

-- One-time "Connect with GitHub" attempts (the install state = attempt id + key; only the
-- key's sha256 is stored).
create table public.git_connect_attempts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  origin text not null check (origin in ('team', 'onboarding')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  onboarding_link_id uuid references public.onboarding_links (id) on delete cascade,
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  used_at timestamptz,
  connection_id uuid references public.git_connections (id) on delete set null,
  check (origin <> 'onboarding' or onboarding_link_id is not null)
);
comment on table public.git_connect_attempts is 'One-time states for the GitHub App install flow (team or onboarding link).';
create index git_connect_attempts_client_idx on public.git_connect_attempts (client_id, created_at desc);
create index git_connect_attempts_link_idx on public.git_connect_attempts (onboarding_link_id) where onboarding_link_id is not null;
create index git_connect_attempts_created_by_idx on public.git_connect_attempts (created_by);
create index git_connect_attempts_connection_idx on public.git_connect_attempts (connection_id) where connection_id is not null;

-- ---------------------------------------------------------------------------
-- Content: destination per client and per article
-- ---------------------------------------------------------------------------
alter table public.content_settings
  add column site_kind public.content_site_kind not null default 'wordpress',
  add column git_connection_id uuid references public.git_connections (id) on delete set null,
  add column git_default_author text check (git_default_author is null or char_length(git_default_author) <= 100),
  add column git_default_tags text[] not null default '{}' check (cardinality(git_default_tags) <= 20);
create index content_settings_git_connection_idx on public.content_settings (git_connection_id) where git_connection_id is not null;

alter table public.content_articles
  add column site_kind public.content_site_kind not null default 'wordpress',
  add column git_connection_id uuid references public.git_connections (id) on delete set null,
  add column git_path text check (git_path is null or (char_length(git_path) <= 300 and git_path !~ '(^/|\.\.)')),
  add column git_blob_sha text check (git_blob_sha is null or git_blob_sha ~ '^[0-9a-f]{40}$'),
  add column git_commit_sha text check (git_commit_sha is null or git_commit_sha ~ '^[0-9a-f]{40}$'),
  add column git_media text[] not null default '{}' check (cardinality(git_media) <= 40),
  add column git_deploy_state public.git_deploy_state not null default 'none',
  add column git_deploy_checked_at timestamptz,
  add column git_committed_at timestamptz,
  add column git_deploy_error text check (git_deploy_error is null or char_length(git_deploy_error) <= 1000),
  add column git_deploy_url text check (git_deploy_url is null or (git_deploy_url ~ '^https://' and char_length(git_deploy_url) <= 1000)),
  add column live_url text check (live_url is null or (live_url ~ '^https?://' and char_length(live_url) <= 1000)),
  add column author_name text check (author_name is null or char_length(author_name) <= 100);
create index content_articles_git_connection_idx on public.content_articles (git_connection_id) where git_connection_id is not null;
-- The content-publish cron: due scheduled Git articles and deployments to check.
create index content_articles_git_due_idx on public.content_articles (status, publish_at)
  where site_kind = 'git' and status in ('scheduled', 'publishing');

-- ---------------------------------------------------------------------------
-- RLS: the team reads connections of clients it can see; every write goes through functions
-- ---------------------------------------------------------------------------
alter table public.git_connections enable row level security;
alter table public.git_connection_secrets enable row level security;
alter table public.git_connect_attempts enable row level security;

create policy "Team sees Git sites of clients they can see"
  on public.git_connections for select to authenticated
  using ((select private.is_team_member()) and private.can_see_client(client_id));

revoke all on public.git_connections, public.git_connection_secrets, public.git_connect_attempts from anon;
revoke insert, update, delete on public.git_connections from authenticated;
revoke all on public.git_connection_secrets, public.git_connect_attempts from authenticated;

-- ---------------------------------------------------------------------------
-- Token the content-publish cron sends (scheduled in a later migration, with the route)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'content_cron_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'content_cron_token',
      'Bearer token the content-publish job sends to the app');
  end if;
end $$;

create or replace function public.verify_content_cron_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select extensions.digest(s.decrypted_secret, 'sha256') = extensions.digest(coalesce(p_token, ''), 'sha256')
    from vault.decrypted_secrets s where s.name = 'content_cron_token'
  ), false)
$$;
revoke execute on function public.verify_content_cron_token(text) from public, anon, authenticated;
grant execute on function public.verify_content_cron_token(text) to service_role;
