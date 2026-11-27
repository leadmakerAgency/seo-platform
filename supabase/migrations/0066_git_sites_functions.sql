-- 0066 · Git sites: functions (docs/plans/git-cms/02-data-model.md)
-- Team functions are security definer and check the role and client again.
-- git_finish_connect, git_connection_secret, git_set_connection_status and
-- git_store_article_result are for the server (service role) after it talks to GitHub.
-- Applied as 0066_git_sites_functions, then 0066_git_sites_functions_fix_media (git_media
-- only read from a JSON array).

-- ===========================================================================
-- Part 1 · Helpers and team functions
-- ===========================================================================

alter table public.git_connect_attempts
  add column installation_id bigint check (installation_id is null or installation_id > 0);

create or replace function private.require_site_manager(p_client_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_role('{admin,manager}') or not private.can_see_client(p_client_id) then
    raise exception 'Only admins and account managers can connect websites.' using errcode = '42501';
  end if;
end;
$$;

-- "owner/repo" for messages.
create or replace function private.git_label(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select owner || '/' || repo from public.git_connections where id = p_id
$$;

-- A new one-time install state. Only the sha256 of the key is stored.
create or replace function private.git_new_attempt(p_client_id uuid, p_origin text, p_link_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := encode(extensions.gen_random_bytes(32), 'hex');
  v_id uuid;
begin
  if (select count(*) from public.git_connect_attempts
      where client_id = p_client_id and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many connection attempts. Wait a few minutes and try again.' using errcode = 'P0001';
  end if;
  insert into public.git_connect_attempts (client_id, origin, key_hash, onboarding_link_id, created_by)
  values (p_client_id, p_origin, encode(extensions.digest(v_key, 'sha256'), 'hex'), p_link_id, private.current_member_or_null())
  returning id into v_id;
  return jsonb_build_object('attempt_id', v_id, 'key', v_key);
end;
$$;

create or replace function public.start_git_connect(p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_site_manager(p_client_id);
  return private.git_new_attempt(p_client_id, 'team', null);
end;
$$;

-- Set up site: collection, paths, field map, URL pattern, commit identity.
create or replace function public.save_git_connection(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.git_connections;
  v_site text := nullif(rtrim(btrim(coalesce(p->>'site_url', '')), '/'), '');
begin
  select * into c from public.git_connections where id = p_id for update;
  if not found or c.status = 'removed' then raise exception 'Unknown site.' using errcode = 'P0001'; end if;
  perform private.require_site_manager(c.client_id);
  if p ? 'field_map' and jsonb_typeof(p->'field_map') <> 'object' then
    raise exception 'The field map is not valid.' using errcode = '22023';
  end if;
  if v_site is not null and v_site !~ '^https?://[^/\s]+$' then
    raise exception 'The site address must look like https://example.com.' using errcode = '22023';
  end if;
  begin
    update public.git_connections set
      branch = case when p ? 'branch' then coalesce(nullif(btrim(p->>'branch'), ''), branch) else branch end,
      collection = case when p ? 'collection' then nullif(btrim(p->>'collection'), '') else collection end,
      folder = case when p ? 'folder' then nullif(trim(both '/' from btrim(p->>'folder')), '') else folder end,
      extension = case when p ? 'extension' then coalesce(nullif(p->>'extension', ''), 'md') else extension end,
      slug_template = case when p ? 'slug_template' then coalesce(nullif(btrim(p->>'slug_template'), ''), '{{slug}}') else slug_template end,
      media_folder = case when p ? 'media_folder' then nullif(trim(both '/' from btrim(p->>'media_folder')), '') else media_folder end,
      public_folder = case when p ? 'public_folder' then nullif(rtrim(btrim(p->>'public_folder'), '/'), '') else public_folder end,
      date_format = case when p ? 'date_format' then nullif(btrim(p->>'date_format'), '') else date_format end,
      field_map = case when p ? 'field_map' then p->'field_map' else field_map end,
      url_pattern = case when p ? 'url_pattern' then nullif(btrim(p->>'url_pattern'), '') else url_pattern end,
      site_url = case when p ? 'site_url' then v_site else site_url end,
      commit_name = case when p ? 'commit_name' then nullif(btrim(p->>'commit_name'), '') else commit_name end,
      commit_email = case when p ? 'commit_email' then nullif(btrim(p->>'commit_email'), '') else commit_email end,
      updated_at = now()
    where id = p_id;
  exception when check_violation then
    raise exception 'Some settings aren''t valid: paths must be inside the repo (no "..") and the URL pattern must start with /.' using errcode = '22023';
  end;
end;
$$;

-- Token connection (team). The server checks the token right after and sets the status.
create or replace function private.git_upsert_token(
  p_client_id uuid, p_connection_id uuid, p_owner text, p_repo text, p_token text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_connection_id;
  v_secret uuid;
begin
  if coalesce(char_length(p_token), 0) not between 20 and 400 or p_token ~ '\s' then
    raise exception 'That doesn''t look like a GitHub token.' using errcode = '22023';
  end if;
  if p_owner !~ '^[A-Za-z0-9_.-]{1,100}$' or p_repo !~ '^[A-Za-z0-9_.-]{1,100}$' then
    raise exception 'Enter the repo as owner/name, for example acme/website.' using errcode = '22023';
  end if;
  if v_id is not null then
    if not exists (select 1 from public.git_connections where id = v_id and client_id = p_client_id and status <> 'removed') then
      raise exception 'Unknown site.' using errcode = 'P0001';
    end if;
  else
    select id into v_id from public.git_connections
      where client_id = p_client_id and lower(owner) = lower(p_owner) and lower(repo) = lower(p_repo) and status <> 'removed';
  end if;

  if v_id is null then
    insert into public.git_connections (client_id, auth_method, owner, repo, status, last_error, created_by)
    values (p_client_id, 'token', p_owner, p_repo, 'needs_attention', 'Checking the token…', private.current_member_or_null())
    returning id into v_id;
  else
    update public.git_connections set auth_method = 'token', owner = p_owner, repo = p_repo,
      status = 'needs_attention', last_error = 'Checking the token…', updated_at = now()
    where id = v_id;
  end if;

  select token_secret_id into v_secret from public.git_connection_secrets where connection_id = v_id;
  if v_secret is null then
    v_secret := vault.create_secret(p_token, null, 'GitHub token for a Git site');
    insert into public.git_connection_secrets (connection_id, token_secret_id) values (v_id, v_secret)
    on conflict (connection_id) do update set token_secret_id = excluded.token_secret_id, updated_at = now();
  else
    perform vault.update_secret(v_secret, p_token);
    update public.git_connection_secrets set updated_at = now() where connection_id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.save_git_token(
  p_client_id uuid, p_connection_id uuid, p_owner text, p_repo text, p_token text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_site_manager(p_client_id);
  return private.git_upsert_token(p_client_id, p_connection_id, btrim(p_owner), btrim(p_repo), btrim(p_token));
end;
$$;

-- Optional build hook (Vercel / Netlify) for hosts that don't build on push. Null removes it.
create or replace function public.save_git_deploy_hook(p_id uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.git_connections;
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
  v_secret uuid;
begin
  select * into c from public.git_connections where id = p_id;
  if not found or c.status = 'removed' then raise exception 'Unknown site.' using errcode = 'P0001'; end if;
  perform private.require_site_manager(c.client_id);
  if v_url is not null and v_url !~ '^https://(api\.vercel\.com/v1/integrations/deploy/|api\.netlify\.com/build_hooks/)[A-Za-z0-9_/?=&.-]{4,300}$' then
    raise exception 'Paste the Vercel or Netlify deploy hook URL.' using errcode = '22023';
  end if;
  select deploy_hook_secret_id into v_secret from public.git_connection_secrets where connection_id = p_id;
  if v_url is null then
    if v_secret is not null then
      update public.git_connection_secrets set deploy_hook_secret_id = null, updated_at = now() where connection_id = p_id;
      delete from vault.secrets where id = v_secret;
    end if;
  elsif v_secret is null then
    v_secret := vault.create_secret(v_url, null, 'Deploy hook for a Git site');
    insert into public.git_connection_secrets (connection_id, deploy_hook_secret_id) values (p_id, v_secret)
    on conflict (connection_id) do update set deploy_hook_secret_id = excluded.deploy_hook_secret_id, updated_at = now();
  else
    perform vault.update_secret(v_secret, v_url);
  end if;
end;
$$;

create or replace function public.remove_git_connection(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.git_connections;
  s public.git_connection_secrets;
begin
  select * into c from public.git_connections where id = p_id for update;
  if not found or c.status = 'removed' then raise exception 'Unknown site.' using errcode = 'P0001'; end if;
  perform private.require_site_manager(c.client_id);
  update public.git_connections set status = 'removed', last_error = null, updated_at = now() where id = p_id;
  select * into s from public.git_connection_secrets where connection_id = p_id;
  if found then
    delete from public.git_connection_secrets where connection_id = p_id;
    delete from vault.secrets where id in (s.token_secret_id, s.deploy_hook_secret_id);
  end if;
  update public.content_settings set git_connection_id = null,
    site_kind = case when site_kind = 'git' then 'wordpress'::public.content_site_kind else site_kind end
  where client_id = c.client_id and git_connection_id = p_id;
  perform private.log_connection_activity(c.client_id, 'connection.site_removed',
    jsonb_build_object('repo', c.owner || '/' || c.repo));
end;
$$;

-- save_content_article (from 0060) + destination: site_kind, git_connection_id, author_name.
create or replace function public.save_content_article(p_client_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  old public.content_articles;
  v_title text := btrim(coalesce(p->>'title', ''));
  v_slug text := nullif(lower(btrim(coalesce(p->>'slug', ''))), '');
  v_body text := coalesce(p->>'body_html', '');
  v_excerpt text := nullif(btrim(coalesce(p->>'excerpt', '')), '');
  v_featured uuid;
  v_keyword uuid;
  v_status public.content_status := 'draft';
  v_version integer;
  v_seo_title text := nullif(btrim(coalesce(p->>'seo_title', '')), '');
  v_meta text := nullif(btrim(coalesce(p->>'meta_description', '')), '');
  v_focus text := nullif(btrim(coalesce(p->>'focus_keyword', '')), '');
  v_topic text := nullif(btrim(coalesce(p->>'topic', '')), '');
  v_author text := nullif(btrim(coalesce(p->>'author', '')), '');
  v_author_name text := nullif(btrim(coalesce(p->>'author_name', '')), '');
  v_site public.content_site_kind;
  v_git uuid;
  st public.content_settings;
begin
  perform private.require_content_writer(p_client_id);
  begin
    v_id := nullif(p->>'id', '')::uuid;
    v_featured := nullif(p->>'featured_media_id', '')::uuid;
    v_keyword := nullif(p->>'keyword_id', '')::uuid;
    v_git := nullif(p->>'git_connection_id', '')::uuid;
    v_site := nullif(p->>'site_kind', '')::public.content_site_kind;
  exception when invalid_text_representation then
    raise exception 'Unknown article, image, keyword or site.' using errcode = '22023';
  end;
  select * into st from public.content_settings where client_id = p_client_id;
  if v_site is null then v_site := coalesce(st.site_kind, 'wordpress'); end if;
  if v_site = 'git' then
    v_git := coalesce(v_git, st.git_connection_id);
    if v_git is null or not exists (
      select 1 from public.git_connections where id = v_git and client_id = p_client_id and status <> 'removed'
    ) then
      raise exception 'Connect the client''s Git site first (Connections → Website).' using errcode = '22023';
    end if;
  else
    v_git := null;
  end if;

  if char_length(v_title) > 300 then raise exception 'Keep the title under 300 characters.' using errcode = '22023'; end if;
  if v_slug is not null and (v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) > 200) then
    raise exception 'The web address can use a–z, 0–9 and single dashes (200 characters at most).' using errcode = '22023';
  end if;
  if octet_length(v_body) > 400000 then raise exception 'The article is too long (400 KB at most).' using errcode = '22023'; end if;
  if char_length(coalesce(v_excerpt, '')) > 600 then raise exception 'Keep the excerpt under 600 characters.' using errcode = '22023'; end if;
  if char_length(coalesce(v_seo_title, '')) > 70 then raise exception 'Keep the SEO title under 70 characters.' using errcode = '22023'; end if;
  if char_length(coalesce(v_meta, '')) > 170 then raise exception 'Keep the meta description under 170 characters.' using errcode = '22023'; end if;
  if char_length(coalesce(v_focus, '')) > 120 or char_length(coalesce(v_topic, '')) > 120 then
    raise exception 'Keep the keyword and topic under 120 characters.' using errcode = '22023';
  end if;
  if v_author is not null and v_author !~ '^[0-9]{1,12}$' then
    raise exception 'The author is the WordPress user number (for example 1).' using errcode = '22023';
  end if;
  if char_length(coalesce(v_author_name, '')) > 100 then raise exception 'Keep the author under 100 characters.' using errcode = '22023'; end if;
  if v_featured is not null and not exists (
    select 1 from public.content_media where id = v_featured and client_id = p_client_id and kind = 'image'
  ) then
    raise exception 'The featured image must be an image in this client''s media library.' using errcode = '22023';
  end if;
  if v_keyword is not null and not exists (select 1 from public.keywords where id = v_keyword and client_id = p_client_id) then
    raise exception 'That keyword isn''t tracked for this client.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.content_articles (client_id, title, slug, body_html, excerpt, tags, featured_media_id, seo_title,
      meta_description, focus_keyword, keyword_id, topic, author, author_name, site_kind, git_connection_id, word_count,
      publish_at, created_by, updated_by)
    values (p_client_id, v_title, v_slug, v_body, v_excerpt, private.aiv_text_list(p->'tags', 20, 50), v_featured, v_seo_title,
      v_meta, v_focus, v_keyword, v_topic, v_author, v_author_name, v_site, v_git, private.content_word_count(v_body),
      private.content_ts(p->>'publish_at'), private.current_member_or_null(), private.current_member_or_null())
    returning id, version into v_id, v_version;
  else
    select * into old from public.content_articles where id = v_id for update;
    if not found or old.client_id <> p_client_id then raise exception 'Unknown article.' using errcode = 'P0001'; end if;
    if old.status = 'publishing' or (old.sending_at is not null and old.sending_at > now() - interval '3 minutes') then
      raise exception 'This article is being sent to the site right now. Try again in a moment.' using errcode = 'P0001';
    end if;
    -- The destination is fixed once the article has been sent anywhere.
    if (old.sent_version is not null or old.wp_article_id is not null or old.git_path is not null)
       and (v_site is distinct from old.site_kind or v_git is distinct from old.git_connection_id) then
      v_site := old.site_kind;
      v_git := old.git_connection_id;
    end if;
    v_status := case when old.status = 'cancelled' then 'draft'::public.content_status else old.status end;
    update public.content_articles set
      title = v_title, slug = v_slug, body_html = v_body, excerpt = v_excerpt,
      tags = private.aiv_text_list(p->'tags', 20, 50), featured_media_id = v_featured, seo_title = v_seo_title,
      meta_description = v_meta, focus_keyword = v_focus, keyword_id = v_keyword, topic = v_topic, author = v_author,
      author_name = v_author_name, site_kind = v_site, git_connection_id = v_git,
      word_count = private.content_word_count(v_body),
      publish_at = case when old.status in ('draft', 'cancelled', 'failed') then private.content_ts(p->>'publish_at') else publish_at end,
      status = v_status, version = version + 1, updated_by = private.current_member_or_null(), updated_at = now()
    where id = v_id
    returning version into v_version;
  end if;
  return jsonb_build_object('id', v_id, 'version', v_version, 'status', v_status);
end;
$$;

-- save_content_settings (from 0060) + the destination and the Git defaults.
create or replace function public.save_content_settings(p_client_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text := nullif(p->>'timezone', '');
  v_cta text := nullif(btrim(coalesce(p->>'default_cta_url', '')), '');
  v_sig text := nullif(btrim(coalesce(p->>'signature', '')), '');
  v_wp uuid;
  v_git uuid;
  v_kind public.content_site_kind;
  v_author text := nullif(btrim(coalesce(p->>'wp_default_author', '')), '');
  v_git_author text := nullif(btrim(coalesce(p->>'git_default_author', '')), '');
  v_site text := nullif(btrim(coalesce(p->>'wp_site_url', '')), '');
begin
  perform private.require_content_admin(p_client_id);
  begin
    v_wp := nullif(p->>'wp_account_id', '')::uuid;
    v_git := nullif(p->>'git_connection_id', '')::uuid;
    v_kind := nullif(p->>'site_kind', '')::public.content_site_kind;
  exception when invalid_text_representation then
    raise exception 'Unknown site.' using errcode = '22023';
  end;
  if v_tz is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then
    raise exception 'Unknown time zone.' using errcode = '22023';
  end if;
  if v_cta is not null and (v_cta !~ '^https://' or char_length(v_cta) > 500) then
    raise exception 'The button link must start with https://.' using errcode = '22023';
  end if;
  if char_length(coalesce(v_sig, '')) > 300 then raise exception 'Keep the signature under 300 characters.' using errcode = '22023'; end if;
  if v_author is not null and v_author !~ '^[0-9]{1,12}$' then
    raise exception 'The author is the WordPress user number (for example 1).' using errcode = '22023';
  end if;
  if char_length(coalesce(v_git_author, '')) > 100 then raise exception 'Keep the author under 100 characters.' using errcode = '22023'; end if;
  if v_site is not null and (v_site !~ '^https?://' or char_length(v_site) > 500) then v_site := null; end if;
  if v_wp is not null and not exists (
    select 1 from public.social_accounts where id = v_wp and client_id = p_client_id and platform = 'wordpress'
  ) then
    raise exception 'That WordPress site isn''t connected to this client.' using errcode = '22023';
  end if;
  if v_git is not null and not exists (
    select 1 from public.git_connections where id = v_git and client_id = p_client_id and status <> 'removed'
  ) then
    raise exception 'That Git site isn''t connected to this client.' using errcode = '22023';
  end if;

  insert into public.content_settings as s (client_id, timezone, default_cta_url, signature, wp_account_id, wp_blog_id,
    wp_blog_name, wp_site_url, wp_default_author, wp_default_tags, site_kind, git_connection_id, git_default_author,
    git_default_tags, updated_by)
  values (p_client_id, coalesce(v_tz, 'America/Phoenix'), v_cta, v_sig, v_wp, left(nullif(p->>'wp_blog_id', ''), 100),
    left(nullif(p->>'wp_blog_name', ''), 300), v_site, v_author, private.aiv_text_list(p->'wp_default_tags', 20, 50),
    coalesce(v_kind, 'wordpress'), v_git, v_git_author, private.aiv_text_list(p->'git_default_tags', 20, 50),
    private.current_member_or_null())
  on conflict (client_id) do update set
    timezone = case when p ? 'timezone' then coalesce(v_tz, 'America/Phoenix') else s.timezone end,
    default_cta_url = case when p ? 'default_cta_url' then v_cta else s.default_cta_url end,
    signature = case when p ? 'signature' then v_sig else s.signature end,
    wp_account_id = case when p ? 'wp_account_id' then v_wp else s.wp_account_id end,
    wp_blog_id = case when p ? 'wp_blog_id' then excluded.wp_blog_id else s.wp_blog_id end,
    wp_blog_name = case when p ? 'wp_blog_name' then excluded.wp_blog_name else s.wp_blog_name end,
    wp_site_url = case when p ? 'wp_site_url' then v_site else s.wp_site_url end,
    wp_default_author = case when p ? 'wp_default_author' then v_author else s.wp_default_author end,
    wp_default_tags = case when p ? 'wp_default_tags' then excluded.wp_default_tags else s.wp_default_tags end,
    site_kind = case when p ? 'site_kind' then coalesce(v_kind, 'wordpress') else s.site_kind end,
    git_connection_id = case when p ? 'git_connection_id' then v_git else s.git_connection_id end,
    git_default_author = case when p ? 'git_default_author' then v_git_author else s.git_default_author end,
    git_default_tags = case when p ? 'git_default_tags' then excluded.git_default_tags else s.git_default_tags end,
    updated_by = excluded.updated_by, updated_at = now();

  if (select site_kind = 'git' and git_connection_id is null from public.content_settings where client_id = p_client_id) then
    raise exception 'Pick the Git site to publish to.' using errcode = '22023';
  end if;
end;
$$;

-- ===========================================================================
-- Part 2 · Onboarding link (anon, checked by the link token)
-- ===========================================================================

create or replace function public.onboarding_start_git_connect(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := private.onboarding_client(p_token, true);
  v_link uuid;
begin
  if cid is null then raise exception 'This link isn''t active.' using errcode = '42501'; end if;
  perform private.onboarding_writable(cid);
  select id into v_link from public.onboarding_links where token = p_token;
  return private.git_new_attempt(cid, 'onboarding', v_link);
end;
$$;

create or replace function public.onboarding_save_git_token(p_token text, p_owner text, p_repo text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := private.onboarding_client(p_token, true);
  v_id uuid;
begin
  if cid is null then raise exception 'This link isn''t active.' using errcode = '42501'; end if;
  perform private.onboarding_writable(cid);
  v_id := private.git_upsert_token(cid, null, btrim(p_owner), btrim(p_repo), btrim(p_value));
  insert into public.onboarding_website (client_id, platform) values (cid, 'git_cms')
  on conflict (client_id) do update set platform = 'git_cms', updated_at = now();
  return private.onboarding_refresh(cid, true) || jsonb_build_object('connection_id', v_id);
end;
$$;

-- What the website step shows for a Git site (no secrets).
create or replace function public.onboarding_git_status(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object('id', g.id, 'repo', g.owner || '/' || g.repo, 'status', g.status,
      'auth_method', g.auth_method, 'error', g.last_error)
    from public.git_connections g
    where g.client_id = private.onboarding_client(p_token, false) and g.status <> 'removed'
    order by (g.status = 'connected') desc, g.updated_at desc
    limit 1
  ), '{}'::jsonb)
$$;

-- ===========================================================================
-- Part 3 · Server (service role) functions
-- ===========================================================================

-- Checks a one-time install state without using it up (the repo picker reads it first).
create or replace function public.git_check_connect_attempt(p_attempt_id uuid, p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.git_connect_attempts;
begin
  select * into a from public.git_connect_attempts where id = p_attempt_id;
  if not found or a.used_at is not null or a.expires_at < now()
     or a.key_hash <> encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex') then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true, 'client_id', a.client_id, 'origin', a.origin,
    'installation_id', a.installation_id, 'onboarding_link_id', a.onboarding_link_id);
end;
$$;

-- Records the installation the person proved access to (after GET /user/installations).
create or replace function public.git_attempt_set_installation(p_attempt_id uuid, p_key text, p_installation_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.git_connect_attempts set installation_id = p_installation_id
  where id = p_attempt_id and used_at is null and expires_at > now()
    and key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex');
  return found;
end;
$$;

-- Uses up the state and saves the connection. p: owner, repo, repo_id, branch, config_path,
-- detected, site_url, collection, folder, media_folder, public_folder, slug_template,
-- date_format, field_map, url_pattern (all optional except owner/repo).
create or replace function public.git_finish_connect(p_attempt_id uuid, p_key text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.git_connect_attempts;
  v_id uuid;
  v_owner text := btrim(coalesce(p->>'owner', ''));
  v_repo text := btrim(coalesce(p->>'repo', ''));
  v_link text;
begin
  select * into a from public.git_connect_attempts where id = p_attempt_id for update;
  if not found or a.used_at is not null or a.expires_at < now() or a.installation_id is null
     or a.key_hash <> encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex') then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if a.origin = 'onboarding' and not exists (
    select 1 from public.onboarding_links where id = a.onboarding_link_id and status = 'active' and expires_at > now()
  ) then
    return jsonb_build_object('ok', false, 'reason', 'link');
  end if;
  if a.created_by is not null then perform set_config('app.content_actor', a.created_by::text, true); end if;

  select id into v_id from public.git_connections
    where client_id = a.client_id and lower(owner) = lower(v_owner) and lower(repo) = lower(v_repo) and status <> 'removed'
    for update;
  if v_id is null then
    insert into public.git_connections (client_id, auth_method, installation_id, owner, repo, repo_id, branch,
      config_path, collection, folder, media_folder, public_folder, slug_template, date_format, field_map, url_pattern,
      site_url, detected, status, last_checked_at, created_by)
    values (a.client_id, 'github_app', a.installation_id, v_owner, v_repo, nullif(p->>'repo_id', '')::bigint,
      coalesce(nullif(p->>'branch', ''), 'main'), nullif(p->>'config_path', ''), nullif(p->>'collection', ''),
      nullif(p->>'folder', ''), nullif(p->>'media_folder', ''), nullif(p->>'public_folder', ''),
      coalesce(nullif(p->>'slug_template', ''), '{{slug}}'), nullif(p->>'date_format', ''),
      coalesce(p->'field_map', '{}'), nullif(p->>'url_pattern', ''), nullif(p->>'site_url', ''),
      coalesce(p->'detected', '{}'), 'connected', now(), a.created_by)
    returning id into v_id;
  else
    update public.git_connections set auth_method = 'github_app', installation_id = a.installation_id,
      repo_id = coalesce(nullif(p->>'repo_id', '')::bigint, repo_id),
      config_path = coalesce(nullif(p->>'config_path', ''), config_path),
      detected = coalesce(p->'detected', detected),
      status = 'connected', last_error = null, last_checked_at = now(), updated_at = now()
    where id = v_id;
  end if;
  update public.git_connect_attempts set used_at = now(), connection_id = v_id where id = a.id;

  perform private.log_connection_activity(a.client_id, 'connection.site_connected',
    jsonb_build_object('repo', v_owner || '/' || v_repo, 'via', a.origin));
  if a.origin = 'onboarding' then
    insert into public.onboarding_website (client_id, platform, access_status) values (a.client_id, 'git_cms', 'connected')
    on conflict (client_id) do update set platform = 'git_cms', access_status = 'connected', updated_at = now();
    perform private.onboarding_refresh(a.client_id, true);
    select l.token into v_link from public.onboarding_links l where l.id = a.onboarding_link_id;
  end if;
  return jsonb_build_object('ok', true, 'connection_id', v_id, 'client_id', a.client_id, 'origin', a.origin,
    'onboarding_token', v_link);
end;
$$;

-- The decrypted token ('token') or deploy hook ('deploy_hook') of a connection.
create or replace function public.git_connection_secret(p_id uuid, p_kind text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.decrypted_secret
  from public.git_connection_secrets s
  join vault.decrypted_secrets d
    on d.id = case p_kind when 'token' then s.token_secret_id when 'deploy_hook' then s.deploy_hook_secret_id end
  where s.connection_id = p_id
$$;

-- Health and setup results. p (optional): repo_id, branch, config_path, detected, token_expires_at,
-- and any Set up site default (collection, folder, media_folder, public_folder, slug_template,
-- date_format, field_map, url_pattern, site_url) to fill only where still empty.
create or replace function public.git_set_connection_status(
  p_id uuid, p_status public.git_connection_status, p_error text, p jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.git_connections;
begin
  select * into c from public.git_connections where id = p_id for update;
  if not found or c.status = 'removed' then return; end if;
  update public.git_connections set
    status = p_status,
    last_error = case when p_status = 'connected' then null else left(nullif(p_error, ''), 1000) end,
    last_checked_at = now(),
    repo_id = coalesce(nullif(p->>'repo_id', '')::bigint, repo_id),
    branch = coalesce(nullif(p->>'branch', ''), branch),
    config_path = coalesce(nullif(p->>'config_path', ''), config_path),
    detected = coalesce(p->'detected', detected),
    token_expires_at = case when p ? 'token_expires_at' then nullif(p->>'token_expires_at', '')::timestamptz else token_expires_at end,
    collection = coalesce(collection, nullif(p->>'collection', '')),
    folder = coalesce(folder, nullif(p->>'folder', '')),
    media_folder = coalesce(media_folder, nullif(p->>'media_folder', '')),
    public_folder = coalesce(public_folder, nullif(p->>'public_folder', '')),
    slug_template = case when collection is null and p ? 'slug_template' then coalesce(nullif(p->>'slug_template', ''), slug_template) else slug_template end,
    date_format = coalesce(date_format, nullif(p->>'date_format', '')),
    field_map = case when field_map = '{}'::jsonb and p ? 'field_map' then p->'field_map' else field_map end,
    url_pattern = coalesce(url_pattern, nullif(p->>'url_pattern', '')),
    site_url = coalesce(site_url, nullif(p->>'site_url', '')),
    updated_at = now()
  where id = p_id;

  if p_status = 'needs_attention' and c.status = 'connected' then
    perform private.notify_client_owner(c.client_id, 'site_connection_problem');
    perform private.log_connection_activity(c.client_id, 'connection.site_problem',
      jsonb_build_object('repo', c.owner || '/' || c.repo, 'error', left(p_error, 300)));
  elsif p_status = 'connected' and c.status <> 'connected' then
    perform private.log_connection_activity(c.client_id, 'connection.site_connected',
      jsonb_build_object('repo', c.owner || '/' || c.repo, 'via', c.auth_method));
    if exists (select 1 from public.onboarding_website where client_id = c.client_id and platform = 'git_cms') then
      update public.onboarding_website set access_status = 'connected', updated_at = now() where client_id = c.client_id;
      perform private.onboarding_refresh(c.client_id, false);
    end if;
  end if;
end;
$$;

-- Like zernio_store_article_result, for Git sites.
create or replace function public.git_store_article_result(p_article_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.content_articles;
  v_status public.content_status := nullif(p->>'status', '')::public.content_status;
  v_url text := nullif(p->>'live_url', '');
  v_deploy_url text := nullif(p->>'git_deploy_url', '');
begin
  select * into r from public.content_articles where id = p_article_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown article'); end if;
  if p->>'actor' is not null then perform set_config('app.content_actor', p->>'actor', true); end if;
  if v_url is not null and (v_url !~ '^https?://' or char_length(v_url) > 1000) then v_url := null; end if;
  if v_deploy_url is not null and (v_deploy_url !~ '^https://' or char_length(v_deploy_url) > 1000) then v_deploy_url := null; end if;

  update public.content_articles set
    status = coalesce(v_status, status),
    git_path = case when p ? 'git_path' then nullif(p->>'git_path', '') else git_path end,
    git_blob_sha = case when p ? 'git_blob_sha' then nullif(p->>'git_blob_sha', '') else git_blob_sha end,
    git_commit_sha = coalesce(nullif(p->>'git_commit_sha', ''), git_commit_sha),
    git_committed_at = case when nullif(p->>'git_commit_sha', '') is not null then now() else git_committed_at end,
    git_media = case when jsonb_typeof(p->'git_media') = 'array' then
      coalesce((select array_agg(left(x, 300)) from jsonb_array_elements_text(p->'git_media') x), '{}') else git_media end,
    git_deploy_state = coalesce(nullif(p->>'git_deploy_state', '')::public.git_deploy_state, git_deploy_state),
    git_deploy_checked_at = case when p ? 'git_deploy_state' then now() else git_deploy_checked_at end,
    git_deploy_error = case when p ? 'git_deploy_error' then left(nullif(p->>'git_deploy_error', ''), 1000)
                            when p->>'git_deploy_state' = 'live' then null else git_deploy_error end,
    git_deploy_url = case when p ? 'git_deploy_url' then v_deploy_url else git_deploy_url end,
    live_url = case when p ? 'live_url' then v_url else live_url end,
    sent_version = coalesce((p->>'sent_version')::integer, sent_version),
    publish_at = case when p ? 'publish_at' then private.content_ts(p->>'publish_at') else publish_at end,
    last_error = case when p ? 'error' then left(nullif(p->>'error', ''), 1000)
                      when v_status in ('scheduled', 'published') then null else last_error end,
    published_at = case when coalesce(v_status, status) = 'published' then coalesce(published_at, now())
                        when v_status = 'draft' then null else published_at end,
    sending_at = case when coalesce((p->>'release')::boolean, false) then null else sending_at end,
    last_synced_at = now(),
    updated_at = now()
  where id = p_article_id;

  if p->>'event' in ('unpublished', 'edited') then
    insert into public.content_events (client_id, article_id, kind, actor_id, detail)
    values (r.client_id, p_article_id, p->>'event', nullif(p->>'actor', '')::uuid, coalesce(p->'detail', '{}'));
  end if;
  return jsonb_build_object('ok', true, 'status', coalesce(v_status, r.status));
end;
$$;

-- ===========================================================================
-- Part 4 · Triggers, onboarding progress, grants
-- ===========================================================================

-- content_article_after_write (from 0060): the work item and activity use the live URL of either
-- destination; a scheduled Git article goes scheduled → publishing → published.
create or replace function private.content_article_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.content_actor();
  owner uuid;
  v_url text := coalesce(new.wp_url, new.live_url);
begin
  if tg_op = 'INSERT' then
    insert into public.content_events (client_id, article_id, kind, actor_id) values (new.client_id, new.id, 'created', actor);
    return null;
  end if;

  -- Work item: one per published article.
  if new.status = 'published' then
    insert into public.work_items (client_id, kind, quantity, delivered_on, title, url, source, source_id, created_by)
    values (new.client_id, 'articles', 1, (coalesce(new.published_at, now()) at time zone 'America/Phoenix')::date,
      left('Article: ' || coalesce(nullif(btrim(new.title), ''), 'Untitled'), 200),
      case when char_length(v_url) <= 500 then v_url end, 'article', new.id, new.created_by)
    on conflict (source, source_id, client_id) where source_id is not null do update
      set url = excluded.url, title = excluded.title;
  elsif old.status = 'published' then
    delete from public.work_items where source = 'article' and source_id = new.id and client_id = new.client_id;
  end if;

  if new.status is not distinct from old.status then return null; end if;
  insert into public.content_events (client_id, article_id, kind, actor_id, detail)
  values (new.client_id, new.id, new.status::text, actor,
    jsonb_strip_nulls(jsonb_build_object('from', old.status, 'error', new.last_error, 'publish_at', new.publish_at)));

  if new.status in ('scheduled', 'published', 'failed') then
    insert into public.activity_log (actor_id, client_id, action, meta)
    values (actor, new.client_id, 'content.article_' || new.status::text,
      jsonb_strip_nulls(jsonb_build_object('article_id', new.id, 'title', coalesce(nullif(new.title, ''), 'Untitled'),
        'url', v_url, 'publish_at', new.publish_at, 'error', new.last_error,
        'site', case when new.site_kind = 'git' then private.git_label(new.git_connection_id) end)));
  end if;

  if new.status = 'failed' then
    select c.owner_id into owner from public.clients c where c.id = new.client_id;
    insert into public.notifications (recipient_id, kind, client_id, content_article_id)
    select distinct x, 'content_failed'::public.notification_kind, new.client_id, new.id
    from unnest(array[new.created_by, owner]) x
    where x is not null and x is distinct from actor;
  elsif new.status = 'published'
        and (old.status = 'scheduled' or (old.status = 'publishing' and new.site_kind = 'git' and new.publish_at is not null))
        and new.created_by is not null and new.created_by is distinct from actor then
    insert into public.notifications (recipient_id, kind, client_id, content_article_id)
    values (new.created_by, 'content_published', new.client_id, new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists content_articles_after_write on public.content_articles;
create trigger content_articles_after_write
  after insert or update of status, wp_url, live_url, title on public.content_articles
  for each row execute function private.content_article_after_write();

-- onboarding_refresh (from 0063) + the Git site rule for the website step.
create or replace function private.onboarding_refresh(p_client_id uuid, p_client_edit boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.client_onboarding%rowtype;
  b public.onboarding_business_details%rowtype;
  g public.onboarding_google_access%rowtype;
  w public.onboarding_website%rowtype;
  s_business public.onboarding_step_status := 'todo';
  s_social public.onboarding_step_status := 'todo';
  s_google public.onboarding_step_status := 'todo';
  s_website public.onboarding_step_status := 'todo';
  s_logins public.onboarding_step_status := 'todo';
  covered integer;
  total integer := (select count(*) from unnest(enum_range(null::public.social_platform)) e where private.is_social_platform(e));
  login_count integer;
  git_ok boolean;
  new_status public.onboarding_status;
begin
  insert into public.client_onboarding (client_id) values (p_client_id) on conflict (client_id) do nothing;
  select * into o from public.client_onboarding where client_id = p_client_id for update;

  select * into b from public.onboarding_business_details where client_id = p_client_id;
  if found then
    if coalesce(b.business_name, '') <> '' and coalesce(b.phone, '') <> ''
       and coalesce(b.primary_category, '') <> '' and coalesce(b.contact_name, '') <> ''
       and (coalesce(b.contact_email, '') <> '' or coalesce(b.contact_phone, '') <> '')
       and (
         (not b.service_area_business and coalesce(b.street, '') <> '' and coalesce(b.city, '') <> '')
         or (b.service_area_business and cardinality(b.service_areas) > 0)
       ) then
      s_business := 'done';
    else
      s_business := 'in_progress';
    end if;
  end if;

  select count(distinct p) into covered from (
    select platform as p from public.social_accounts
      where client_id = p_client_id and status <> 'removed'
    union
    select platform from public.onboarding_social_choices where client_id = p_client_id
  ) x
  where private.is_social_platform(p);
  s_social := case when covered >= total then 'done' when covered > 0 then 'in_progress' else 'todo' end;

  select * into g from public.onboarding_google_access where client_id = p_client_id;
  if found then
    if g.sc_status in ('added', 'no_access', 'not_using') and g.ga4_status in ('added', 'no_access', 'not_using') then
      s_google := 'done';
    elsif g.sc_status <> 'todo' or g.ga4_status <> 'todo' or g.sc_property is not null or g.ga4_property is not null then
      s_google := 'in_progress';
    end if;
  end if;

  select * into w from public.onboarding_website where client_id = p_client_id;
  if found then
    git_ok := exists (select 1 from public.git_connections where client_id = p_client_id and status = 'connected');
    if w.platform = 'none' or w.access_status in ('invited_us', 'login_in_vault')
       or (w.platform = 'git_cms' and git_ok) then
      s_website := 'done';
    elsif w.access_status = 'later' then
      s_website := 'skipped';
    elsif w.platform is not null or w.url is not null then
      s_website := 'in_progress';
    end if;
  end if;

  select count(*) into login_count from public.client_logins where client_id = p_client_id;
  s_logins := case when login_count > 0 then 'done' when o.logins_skipped then 'skipped' else 'todo' end;

  new_status := o.status;
  if p_client_edit then
    if o.status in ('not_started', 'submitted') then new_status := 'in_progress'; end if;
  elsif o.status = 'not_started'
        and (s_business <> 'todo' or s_social <> 'todo' or s_google <> 'todo' or s_website <> 'todo' or s_logins <> 'todo') then
    new_status := 'in_progress';
  end if;

  if s_business = 'done' and o.business_status <> 'done' then
    perform private.log_onboarding(p_client_id, 'onboarding.step_done', '{"step":"business"}');
  end if;
  if s_social = 'done' and o.social_status <> 'done' then
    perform private.log_onboarding(p_client_id, 'onboarding.step_done', '{"step":"social"}');
  end if;
  if s_google = 'done' and o.google_access_status <> 'done' then
    perform private.log_onboarding(p_client_id, 'onboarding.step_done', '{"step":"google"}');
  end if;
  if s_website in ('done', 'skipped') and o.website_status not in ('done', 'skipped') then
    perform private.log_onboarding(p_client_id, 'onboarding.step_done', '{"step":"website"}');
  end if;
  if s_logins in ('done', 'skipped') and o.logins_status not in ('done', 'skipped') then
    perform private.log_onboarding(p_client_id, 'onboarding.step_done', '{"step":"logins"}');
  end if;

  update public.client_onboarding
    set business_status = s_business,
        social_status = s_social,
        google_access_status = s_google,
        website_status = s_website,
        logins_status = s_logins,
        status = new_status,
        started_at = coalesce(started_at, case when new_status <> 'not_started' then now() end),
        updated_at = now()
    where client_id = p_client_id;

  return jsonb_build_object(
    'status', new_status,
    'business', s_business,
    'social', s_social,
    'google', s_google,
    'website', s_website,
    'logins', s_logins
  );
end;
$$;

do $$
declare
  f text;
begin
  -- Internal helpers: only the security definer functions above call these.
  foreach f in array array[
    'private.require_site_manager(uuid)', 'private.git_label(uuid)', 'private.git_new_attempt(uuid, text, uuid)',
    'private.git_upsert_token(uuid, uuid, text, text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  -- Team.
  foreach f in array array[
    'public.start_git_connect(uuid)', 'public.save_git_connection(uuid, jsonb)',
    'public.save_git_token(uuid, uuid, text, text, text)', 'public.save_git_deploy_hook(uuid, text)',
    'public.remove_git_connection(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- Onboarding link.
  foreach f in array array[
    'public.onboarding_start_git_connect(text)', 'public.onboarding_save_git_token(text, text, text, text)',
    'public.onboarding_git_status(text)'
  ] loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
  -- Server only.
  foreach f in array array[
    'public.git_check_connect_attempt(uuid, text)', 'public.git_attempt_set_installation(uuid, text, bigint)',
    'public.git_finish_connect(uuid, text, jsonb)', 'public.git_connection_secret(uuid, text)',
    'public.git_set_connection_status(uuid, public.git_connection_status, text, jsonb)',
    'public.git_store_article_result(uuid, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
