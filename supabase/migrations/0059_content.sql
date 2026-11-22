-- 0059 · Content tables, RLS and storage (docs/plans/content/03-data-model.md)
-- Social posts and WordPress articles, both delivered through Zernio. The team reads through
-- RLS; every write goes through the 0060 functions (team RPCs or the service-role store_*).

-- ---------------------------------------------------------------------------
-- Settings: one row per client
-- ---------------------------------------------------------------------------
create table public.content_settings (
  client_id uuid primary key references public.clients (id) on delete cascade,
  timezone text not null default 'America/Phoenix'
    check (char_length(timezone) <= 64 and timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$'),
  default_cta_url text check (default_cta_url is null or (default_cta_url ~ '^https://' and char_length(default_cta_url) <= 500)),
  signature text check (signature is null or char_length(signature) <= 300),
  wp_account_id uuid references public.social_accounts (id) on delete set null,
  wp_blog_id text check (wp_blog_id is null or char_length(wp_blog_id) <= 100),
  wp_blog_name text check (wp_blog_name is null or char_length(wp_blog_name) <= 300),
  wp_site_url text check (wp_site_url is null or (wp_site_url ~ '^https?://' and char_length(wp_site_url) <= 500)),
  wp_default_author text check (wp_default_author is null or wp_default_author ~ '^[0-9]{1,12}$'),
  wp_default_tags text[] not null default '{}' check (cardinality(wp_default_tags) <= 20),
  updated_by uuid references public.team_members (id) on delete set null,
  updated_at timestamptz not null default now()
);
comment on table public.content_settings is 'Content defaults per client: time zone, button link, WordPress site and blog.';

-- ---------------------------------------------------------------------------
-- Media library (files in the private content-media bucket)
-- ---------------------------------------------------------------------------
create table public.content_media (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  kind public.content_media_kind not null,
  storage_path text not null unique check (char_length(storage_path) <= 400),
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime text not null check (mime in (
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf'
  )),
  bytes bigint not null check (bytes > 0 and bytes <= 524288000),
  width integer check (width is null or width between 1 and 20000),
  height integer check (height is null or height between 1 and 20000),
  duration_s numeric(8, 2) check (duration_s is null or duration_s between 0 and 86400),
  thumb_path text check (thumb_path is null or char_length(thumb_path) <= 400),
  alt_text text check (alt_text is null or char_length(alt_text) <= 500),
  title text check (title is null or char_length(title) <= 200),
  -- The copy at Zernio (temporary for 7 days unless a post uses it).
  zernio_url text check (zernio_url is null or (zernio_url ~ '^https://' and char_length(zernio_url) <= 2000)),
  zernio_uploaded_at timestamptz,
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint content_media_kind_mime check (
    (kind = 'image' and mime like 'image/%') or (kind = 'video' and mime like 'video/%')
    or (kind = 'document' and mime = 'application/pdf')
  ),
  constraint content_media_path check (split_part(storage_path, '/', 1) = client_id::text)
);
comment on table public.content_media is 'Images, videos and PDFs for a client''s posts and articles.';

-- ---------------------------------------------------------------------------
-- Social posts: one logical post, one target per account
-- ---------------------------------------------------------------------------
create table public.content_posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  title text check (title is null or char_length(title) <= 120),
  content text not null default '' check (char_length(content) <= 63206),
  media_ids uuid[] not null default '{}' check (cardinality(media_ids) <= 20),
  status public.content_status not null default 'draft',
  scheduled_for timestamptz,
  timezone text check (timezone is null or char_length(timezone) <= 64),
  zernio_post_id text unique check (zernio_post_id is null or zernio_post_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  -- version goes up on every save; sent_version is the one Zernio has.
  version integer not null default 1,
  sent_version integer,
  sending_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  last_event_at timestamptz,
  last_synced_at timestamptz,
  published_at timestamptz,
  created_by uuid references public.team_members (id) on delete set null,
  updated_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.content_posts is 'A social post for one client, sent to one or more connected accounts through Zernio.';

create table public.content_post_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.content_posts (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  social_account_id uuid references public.social_accounts (id) on delete set null,
  -- Snapshots, so history survives an account being removed.
  zernio_account_id text not null check (zernio_account_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  platform public.social_platform not null check (platform <> 'wordpress'),
  account_name text check (account_name is null or char_length(account_name) <= 300),
  custom_content text check (custom_content is null or char_length(custom_content) <= 63206),
  custom_media_ids uuid[] check (custom_media_ids is null or cardinality(custom_media_ids) <= 20),
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 8000),
  status public.content_target_status not null default 'pending',
  platform_post_id text check (platform_post_id is null or char_length(platform_post_id) <= 300),
  platform_post_url text check (platform_post_url is null or (platform_post_url ~ '^https://' and char_length(platform_post_url) <= 2000)),
  error_message text check (error_message is null or char_length(error_message) <= 1000),
  error_category text check (error_category is null or char_length(error_category) <= 50),
  error_source text check (error_source is null or char_length(error_source) <= 20),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (post_id, zernio_account_id)
);
comment on table public.content_post_targets is 'One account of a social post, with its own status, link and error.';

-- ---------------------------------------------------------------------------
-- Articles for the client's WordPress site
-- ---------------------------------------------------------------------------
create table public.content_articles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 300),
  slug text check (slug is null or (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 200)),
  body_html text not null default '' check (octet_length(body_html) <= 400000),
  excerpt text check (excerpt is null or char_length(excerpt) <= 600),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  featured_media_id uuid references public.content_media (id) on delete set null,
  seo_title text check (seo_title is null or char_length(seo_title) <= 70),
  meta_description text check (meta_description is null or char_length(meta_description) <= 170),
  focus_keyword text check (focus_keyword is null or char_length(focus_keyword) <= 120),
  keyword_id uuid references public.keywords (id) on delete set null,
  topic text check (topic is null or char_length(topic) <= 120),
  author text check (author is null or author ~ '^[0-9]{1,12}$'),
  word_count integer not null default 0 check (word_count >= 0),
  status public.content_status not null default 'draft',
  publish_at timestamptz,
  wp_account_id uuid references public.social_accounts (id) on delete set null,
  wp_blog_id text check (wp_blog_id is null or char_length(wp_blog_id) <= 100),
  wp_article_id text check (wp_article_id is null or char_length(wp_article_id) <= 100),
  wp_url text check (wp_url is null or (wp_url ~ '^https?://' and char_length(wp_url) <= 2000)),
  wp_status text check (wp_status is null or char_length(wp_status) <= 30),
  version integer not null default 1,
  sent_version integer,
  sending_at timestamptz,
  seo_pasted_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  last_synced_at timestamptz,
  published_at timestamptz,
  created_by uuid references public.team_members (id) on delete set null,
  updated_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.content_articles is 'A blog article for the client''s WordPress site, published through Zernio''s Blogs API.';

-- ---------------------------------------------------------------------------
-- History of each post and article (written by triggers)
-- ---------------------------------------------------------------------------
create table public.content_events (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients (id) on delete cascade,
  post_id uuid references public.content_posts (id) on delete cascade,
  article_id uuid references public.content_articles (id) on delete cascade,
  kind text not null check (kind in (
    'created', 'edited', 'scheduled', 'publishing', 'published', 'partial', 'failed',
    'cancelled', 'retried', 'unpublished', 'deleted_on_platform', 'draft'
  )),
  detail jsonb not null default '{}',
  actor_id uuid references public.team_members (id) on delete set null,
  at timestamptz not null default now(),
  check ((post_id is null) <> (article_id is null))
);
comment on table public.content_events is 'What happened to each post and article, and who did it.';

alter table public.notifications
  add column content_post_id uuid references public.content_posts (id) on delete cascade,
  add column content_article_id uuid references public.content_articles (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index content_settings_wp_account_idx on public.content_settings (wp_account_id);
create index content_settings_updated_by_idx on public.content_settings (updated_by);
create index content_media_client_idx on public.content_media (client_id, created_at desc);
create index content_media_created_by_idx on public.content_media (created_by);
create index content_posts_client_idx on public.content_posts (client_id, status);
create index content_posts_client_time_idx on public.content_posts (client_id, scheduled_for);
create index content_posts_open_idx on public.content_posts (scheduled_for) where status in ('scheduled', 'publishing');
create index content_posts_created_by_idx on public.content_posts (created_by);
create index content_posts_updated_by_idx on public.content_posts (updated_by);
create index content_post_targets_post_idx on public.content_post_targets (post_id);
create index content_post_targets_client_idx on public.content_post_targets (client_id, platform, status);
create index content_post_targets_account_idx on public.content_post_targets (social_account_id);
create index content_articles_client_idx on public.content_articles (client_id, status);
create index content_articles_client_time_idx on public.content_articles (client_id, publish_at);
create index content_articles_open_idx on public.content_articles (publish_at) where status in ('scheduled', 'publishing');
create index content_articles_featured_idx on public.content_articles (featured_media_id);
create index content_articles_keyword_idx on public.content_articles (keyword_id);
create index content_articles_wp_account_idx on public.content_articles (wp_account_id);
create index content_articles_created_by_idx on public.content_articles (created_by);
create index content_articles_updated_by_idx on public.content_articles (updated_by);
create index content_events_post_idx on public.content_events (post_id, at desc);
create index content_events_article_idx on public.content_events (article_id, at desc);
create index content_events_client_idx on public.content_events (client_id);
create index content_events_actor_idx on public.content_events (actor_id);
create index notifications_content_post_idx on public.notifications (content_post_id);
create index notifications_content_article_idx on public.notifications (content_article_id);

-- ---------------------------------------------------------------------------
-- Row level security: read for the team on clients they can see; no direct writes
-- ---------------------------------------------------------------------------
alter table public.content_settings enable row level security;
alter table public.content_media enable row level security;
alter table public.content_posts enable row level security;
alter table public.content_post_targets enable row level security;
alter table public.content_articles enable row level security;
alter table public.content_events enable row level security;

create policy "Team sees content settings of clients they can see"
  on public.content_settings for select to authenticated
  using ((select private.is_team_member()) and private.can_see_client(client_id));
create policy "Team sees content media of clients they can see"
  on public.content_media for select to authenticated
  using ((select private.is_team_member()) and private.can_see_client(client_id));
create policy "Team sees posts of clients they can see"
  on public.content_posts for select to authenticated
  using ((select private.is_team_member()) and private.can_see_client(client_id));
create policy "Team sees post targets of clients they can see"
  on public.content_post_targets for select to authenticated
  using ((select private.is_team_member()) and private.can_see_client(client_id));
create policy "Team sees articles of clients they can see"
  on public.content_articles for select to authenticated
  using ((select private.is_team_member()) and private.can_see_client(client_id));
create policy "Team sees content history of clients they can see"
  on public.content_events for select to authenticated
  using ((select private.is_team_member()) and private.can_see_client(client_id));

revoke insert, update, delete on public.content_settings, public.content_media, public.content_posts,
  public.content_post_targets, public.content_articles, public.content_events from anon, authenticated;
revoke all on public.content_settings, public.content_media, public.content_posts,
  public.content_post_targets, public.content_articles, public.content_events from anon;

-- ---------------------------------------------------------------------------
-- Storage
--   content-media  (private, 500 MB): "<client_id>/<media_id>/<file>"
--   content-inline (public, 20 MB images): "<client_id>/<random>.<ext>" for images inside
--   article bodies, which WordPress shows straight from this URL.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('content-media', 'content-media', false, 524288000,
   array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf']),
  ('content-inline', 'content-inline', true, 20971520,
   array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create or replace function private.content_object_client(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid end
$$;

create or replace function private.can_write_content_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.content_object_client(p_name) is not null
    and private.has_role('{admin,manager,writer}')
    and private.can_see_client(private.content_object_client(p_name))
$$;

create or replace function private.can_read_content_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.content_object_client(p_name) is not null
    and private.is_team_member()
    and private.can_see_client(private.content_object_client(p_name))
$$;

create policy "Team reads content files"
  on storage.objects for select to authenticated
  using (bucket_id in ('content-media', 'content-inline') and private.can_read_content_object(name));
create policy "Writers upload content files"
  on storage.objects for insert to authenticated
  with check (bucket_id in ('content-media', 'content-inline') and private.can_write_content_object(name));
create policy "Writers delete content files"
  on storage.objects for delete to authenticated
  using (bucket_id in ('content-media', 'content-inline') and private.can_write_content_object(name));

revoke execute on function private.content_object_client(text) from public, anon;
revoke execute on function private.can_write_content_object(text) from public, anon;
revoke execute on function private.can_read_content_object(text) from public, anon;
grant execute on function private.content_object_client(text) to authenticated;
grant execute on function private.can_write_content_object(text) to authenticated;
grant execute on function private.can_read_content_object(text) to authenticated;
