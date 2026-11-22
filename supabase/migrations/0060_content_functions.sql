-- 0060 · Content functions (docs/plans/content/03-data-model.md)
-- Applied in three parts (0060_content_functions_1_team, _2_store, _3_triggers); same content.
-- Team RPCs are security definer and check the role and client. content_claim_send and the
-- zernio_store_* functions are for the server (service role) after it talks to Zernio.
-- Triggers write history, activity, notifications and work items, so no caller can forget.

-- ===========================================================================
-- Part 1 · Helpers and team RPCs
-- ===========================================================================

create or replace function private.require_content_writer(p_client_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_role('{admin,manager,writer}') or not private.can_see_client(p_client_id) then
    raise exception 'Only admins, account managers and writers on this client can change its content.' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.require_content_admin(p_client_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_role('{admin,manager}') or not private.can_see_client(p_client_id) then
    raise exception 'Only admins and account managers can change content settings.' using errcode = '42501';
  end if;
end;
$$;

-- Ordered, de-duplicated uuids of this client's media.
create or replace function private.content_media_list(p_client_id uuid, p jsonb)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ids uuid[];
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if jsonb_typeof(p) <> 'array' then
    raise exception 'Media must be a list.' using errcode = '22023';
  end if;
  begin
    select coalesce(array_agg(m order by ord), '{}') into ids from (
      select distinct on (x) x::uuid as m, ord
      from jsonb_array_elements_text(p) with ordinality as e(x, ord)
      order by x, ord
    ) s;
  exception when invalid_text_representation then
    raise exception 'Unknown media.' using errcode = '22023';
  end;
  if cardinality(ids) > 20 then
    raise exception 'Add up to 20 files to a post.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(ids) m
    where not exists (select 1 from public.content_media cm where cm.id = m and cm.client_id = p_client_id)
  ) then
    raise exception 'A file isn''t in this client''s media library.' using errcode = '22023';
  end if;
  return ids;
end;
$$;

create or replace function private.content_word_count(p_html text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when t = '' then 0 else cardinality(regexp_split_to_array(t, ' ')) end
  from (select btrim(regexp_replace(regexp_replace(coalesce(p_html, ''), '<[^>]*>', ' ', 'g'), '(\s|&nbsp;)+', ' ', 'g')) as t) x
$$;

create or replace function private.content_ts(p text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return p::timestamptz;
exception when others then
  raise exception 'That date and time isn''t valid.' using errcode = '22023';
end;
$$;

-- Saves a social post. Drafts, cancelled and scheduled posts can be edited; a scheduled
-- post's edit is sent to Zernio by the server right after (version > sent_version).
create or replace function public.save_content_post(p_client_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  old public.content_posts;
  v_content text := coalesce(p->>'content', '');
  v_title text := nullif(btrim(coalesce(p->>'title', '')), '');
  v_media uuid[];
  v_targets jsonb := coalesce(p->'targets', '[]');
  v_when timestamptz := private.content_ts(p->>'scheduled_for');
  v_tz text := nullif(p->>'timezone', '');
  v_status public.content_status := 'draft';
  v_version integer;
  v_keep text[] := '{}';
  t jsonb;
  acc record;
  v_settings jsonb;
begin
  perform private.require_content_writer(p_client_id);
  begin
    v_id := nullif(p->>'id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Unknown post.' using errcode = '22023';
  end;
  if char_length(v_content) > 63206 then
    raise exception 'The text is too long (63,206 characters at most).' using errcode = '22023';
  end if;
  if char_length(coalesce(v_title, '')) > 120 then
    raise exception 'Keep the internal name under 120 characters.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_targets) <> 'array' or jsonb_array_length(v_targets) > 30 then
    raise exception 'Pick up to 30 accounts.' using errcode = '22023';
  end if;
  if v_tz is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then
    raise exception 'Unknown time zone.' using errcode = '22023';
  end if;
  v_media := coalesce(private.content_media_list(p_client_id, coalesce(p->'media_ids', '[]')), '{}');

  if v_id is null then
    insert into public.content_posts (client_id, title, content, media_ids, scheduled_for, timezone, created_by, updated_by)
    values (p_client_id, v_title, v_content, v_media, v_when, v_tz, private.current_member_or_null(), private.current_member_or_null())
    returning id, version into v_id, v_version;
  else
    select * into old from public.content_posts where id = v_id for update;
    if not found or old.client_id <> p_client_id then
      raise exception 'Unknown post.' using errcode = 'P0001';
    end if;
    if old.status not in ('draft', 'cancelled', 'scheduled') then
      raise exception 'A post that is publishing, published or failed can''t be edited. Duplicate it instead.' using errcode = 'P0001';
    end if;
    if old.sending_at is not null and old.sending_at > now() - interval '3 minutes' then
      raise exception 'This post is being sent to Zernio right now. Try again in a moment.' using errcode = 'P0001';
    end if;
    if old.status = 'scheduled' and (v_when is null or v_when < now() + interval '2 minutes') then
      raise exception 'Pick a time at least 2 minutes from now, or cancel the post first.' using errcode = '22023';
    end if;
    v_status := case when old.status = 'cancelled' then 'draft'::public.content_status else old.status end;
    update public.content_posts set
      title = v_title, content = v_content, media_ids = v_media, scheduled_for = v_when,
      timezone = coalesce(v_tz, timezone), status = v_status,
      zernio_post_id = case when old.status = 'cancelled' then null else zernio_post_id end,
      sent_version = case when old.status = 'cancelled' then null else sent_version end,
      last_error = case when old.status = 'cancelled' then null else last_error end,
      version = version + 1, updated_by = private.current_member_or_null(), updated_at = now()
    where id = v_id
    returning version into v_version;
  end if;

  for t in select * from jsonb_array_elements(v_targets) loop
    begin
      select a.id, a.zernio_account_id, a.platform, coalesce(a.location_name, a.display_name, a.username) as name
        into acc
        from public.social_accounts a
        where a.id = (t->>'social_account_id')::uuid and a.client_id = p_client_id
          and a.status <> 'removed' and a.platform <> 'wordpress';
    exception when invalid_text_representation then
      raise exception 'Unknown account.' using errcode = '22023';
    end;
    if acc.id is null then
      raise exception 'An account isn''t connected to this client any more.' using errcode = 'P0001';
    end if;
    v_settings := coalesce(t->'settings', '{}');
    if jsonb_typeof(v_settings) <> 'object' or pg_column_size(v_settings) > 8000 then
      raise exception 'The platform options are too large.' using errcode = '22023';
    end if;
    if char_length(coalesce(t->>'custom_content', '')) > 63206 then
      raise exception 'A custom text is too long.' using errcode = '22023';
    end if;
    insert into public.content_post_targets as ct (post_id, client_id, social_account_id, zernio_account_id, platform,
      account_name, custom_content, custom_media_ids, settings)
    values (v_id, p_client_id, acc.id, acc.zernio_account_id, acc.platform, left(acc.name, 300),
      t->>'custom_content', private.content_media_list(p_client_id, t->'custom_media_ids'), v_settings)
    on conflict (post_id, zernio_account_id) do update set
      social_account_id = excluded.social_account_id, account_name = excluded.account_name,
      custom_content = excluded.custom_content, custom_media_ids = excluded.custom_media_ids,
      settings = excluded.settings,
      status = case when v_status = 'draft' then 'pending'::public.content_target_status else ct.status end,
      error_message = case when v_status = 'draft' then null else ct.error_message end,
      error_category = case when v_status = 'draft' then null else ct.error_category end,
      updated_at = now();
    v_keep := v_keep || acc.zernio_account_id;
  end loop;
  delete from public.content_post_targets where post_id = v_id and zernio_account_id <> all (v_keep);

  if old.id is not null and old.status = 'scheduled' then
    insert into public.content_events (client_id, post_id, kind, actor_id, detail)
    values (p_client_id, v_id, 'edited', private.current_member_or_null(), jsonb_build_object('version', v_version));
  end if;
  return jsonb_build_object('id', v_id, 'version', v_version, 'status', v_status);
end;
$$;

create or replace function public.delete_content_post(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.content_posts;
begin
  select * into r from public.content_posts where id = p_id for update;
  if not found then raise exception 'Unknown post.' using errcode = 'P0001'; end if;
  perform private.require_content_writer(r.client_id);
  if r.status not in ('draft', 'cancelled', 'failed') then
    raise exception 'Only drafts, cancelled and failed posts can be deleted. Cancel a scheduled post first.' using errcode = 'P0001';
  end if;
  delete from public.content_posts where id = p_id;
  perform private.log_backlinks(r.client_id, 'content.post_deleted', jsonb_build_object('title', coalesce(r.title, left(r.content, 80))));
end;
$$;

-- Saves an article. The server cleans the HTML before calling this, and again before
-- sending it to WordPress.
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
begin
  perform private.require_content_writer(p_client_id);
  begin
    v_id := nullif(p->>'id', '')::uuid;
    v_featured := nullif(p->>'featured_media_id', '')::uuid;
    v_keyword := nullif(p->>'keyword_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Unknown article, image or keyword.' using errcode = '22023';
  end;
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
      meta_description, focus_keyword, keyword_id, topic, author, word_count, publish_at, created_by, updated_by)
    values (p_client_id, v_title, v_slug, v_body, v_excerpt, private.aiv_text_list(p->'tags', 20, 50), v_featured, v_seo_title,
      v_meta, v_focus, v_keyword, v_topic, v_author, private.content_word_count(v_body), private.content_ts(p->>'publish_at'),
      private.current_member_or_null(), private.current_member_or_null())
    returning id, version into v_id, v_version;
  else
    select * into old from public.content_articles where id = v_id for update;
    if not found or old.client_id <> p_client_id then raise exception 'Unknown article.' using errcode = 'P0001'; end if;
    if old.status = 'publishing' or (old.sending_at is not null and old.sending_at > now() - interval '3 minutes') then
      raise exception 'This article is being sent to WordPress right now. Try again in a moment.' using errcode = 'P0001';
    end if;
    v_status := case when old.status = 'cancelled' then 'draft'::public.content_status else old.status end;
    update public.content_articles set
      title = v_title, slug = v_slug, body_html = v_body, excerpt = v_excerpt,
      tags = private.aiv_text_list(p->'tags', 20, 50), featured_media_id = v_featured, seo_title = v_seo_title,
      meta_description = v_meta, focus_keyword = v_focus, keyword_id = v_keyword, topic = v_topic, author = v_author,
      word_count = private.content_word_count(v_body),
      publish_at = case when old.status in ('draft', 'cancelled', 'failed') then private.content_ts(p->>'publish_at') else publish_at end,
      status = v_status, version = version + 1, updated_by = private.current_member_or_null(), updated_at = now()
    where id = v_id
    returning version into v_version;
  end if;
  return jsonb_build_object('id', v_id, 'version', v_version, 'status', v_status);
end;
$$;

create or replace function public.delete_content_article(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.content_articles;
begin
  select * into r from public.content_articles where id = p_id for update;
  if not found then raise exception 'Unknown article.' using errcode = 'P0001'; end if;
  perform private.require_content_writer(r.client_id);
  if r.status not in ('draft', 'cancelled', 'failed') then
    raise exception 'Only drafts and failed articles can be deleted here. Unpublish it first.' using errcode = 'P0001';
  end if;
  delete from public.content_articles where id = p_id;
  perform private.log_backlinks(r.client_id, 'content.article_deleted', jsonb_build_object('title', r.title));
end;
$$;

-- The "SEO fields pasted into WordPress" checklist tick.
create or replace function public.set_content_article_seo(p_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
begin
  select client_id into cid from public.content_articles where id = p_id;
  if cid is null then raise exception 'Unknown article.' using errcode = 'P0001'; end if;
  perform private.require_content_writer(cid);
  update public.content_articles set seo_pasted_at = case when p_done then now() end where id = p_id;
end;
$$;

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
  v_author text := nullif(btrim(coalesce(p->>'wp_default_author', '')), '');
  v_site text := nullif(btrim(coalesce(p->>'wp_site_url', '')), '');
begin
  perform private.require_content_admin(p_client_id);
  begin
    v_wp := nullif(p->>'wp_account_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Unknown WordPress site.' using errcode = '22023';
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
  if v_site is not null and (v_site !~ '^https?://' or char_length(v_site) > 500) then v_site := null; end if;
  if v_wp is not null and not exists (
    select 1 from public.social_accounts where id = v_wp and client_id = p_client_id and platform = 'wordpress'
  ) then
    raise exception 'That WordPress site isn''t connected to this client.' using errcode = '22023';
  end if;

  insert into public.content_settings as s (client_id, timezone, default_cta_url, signature, wp_account_id, wp_blog_id,
    wp_blog_name, wp_site_url, wp_default_author, wp_default_tags, updated_by)
  values (p_client_id, coalesce(v_tz, 'America/Phoenix'), v_cta, v_sig, v_wp, left(nullif(p->>'wp_blog_id', ''), 100),
    left(nullif(p->>'wp_blog_name', ''), 300), v_site, v_author, private.aiv_text_list(p->'wp_default_tags', 20, 50),
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
    updated_by = excluded.updated_by, updated_at = now();
end;
$$;

-- Records an uploaded file (insert), or changes its alt text and title (update).
create or replace function public.save_content_media(p_client_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_path text := p->>'storage_path';
  v_mime text := p->>'mime';
  v_alt text := nullif(btrim(coalesce(p->>'alt_text', '')), '');
  v_title text := nullif(btrim(coalesce(p->>'title', '')), '');
begin
  perform private.require_content_writer(p_client_id);
  begin
    v_id := (p->>'id')::uuid;
  exception when invalid_text_representation then
    raise exception 'Unknown file.' using errcode = '22023';
  end;
  if v_id is null then raise exception 'Unknown file.' using errcode = '22023'; end if;
  if char_length(coalesce(v_alt, '')) > 500 or char_length(coalesce(v_title, '')) > 200 then
    raise exception 'Keep alt text under 500 characters and the title under 200.' using errcode = '22023';
  end if;

  if exists (select 1 from public.content_media where id = v_id) then
    update public.content_media set
      alt_text = case when p ? 'alt_text' then v_alt else alt_text end,
      title = case when p ? 'title' then v_title else title end
    where id = v_id and client_id = p_client_id;
    if not found then raise exception 'Unknown file.' using errcode = 'P0001'; end if;
    return v_id;
  end if;

  if v_path is null or split_part(v_path, '/', 1) <> p_client_id::text or split_part(v_path, '/', 2) <> v_id::text then
    raise exception 'The file was uploaded to the wrong place.' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'content-media' and o.name = v_path) then
    raise exception 'The upload didn''t finish. Try again.' using errcode = 'P0001';
  end if;
  if p->>'thumb_path' is not null and split_part(p->>'thumb_path', '/', 2) <> v_id::text then
    raise exception 'The preview image was uploaded to the wrong place.' using errcode = '22023';
  end if;
  insert into public.content_media (id, client_id, kind, storage_path, file_name, mime, bytes, width, height,
    duration_s, thumb_path, alt_text, title, created_by)
  values (v_id, p_client_id,
    case when v_mime like 'image/%' then 'image' when v_mime like 'video/%' then 'video' else 'document' end::public.content_media_kind,
    v_path, left(coalesce(nullif(btrim(p->>'file_name'), ''), 'file'), 200), v_mime, (p->>'bytes')::bigint,
    nullif(p->>'width', '')::integer, nullif(p->>'height', '')::integer, nullif(p->>'duration_s', '')::numeric,
    nullif(p->>'thumb_path', ''), v_alt, v_title, private.current_member_or_null());
  return v_id;
end;
$$;

-- Deletes a file that no post or article waiting to go out uses. Returns the storage
-- paths so the server removes the objects.
create or replace function public.delete_content_media(p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.content_media;
begin
  select * into r from public.content_media where id = p_id;
  if not found then raise exception 'Unknown file.' using errcode = 'P0001'; end if;
  perform private.require_content_writer(r.client_id);
  if exists (
    select 1 from public.content_posts cp
    where cp.client_id = r.client_id and cp.status in ('draft', 'scheduled', 'publishing')
      and (p_id = any (cp.media_ids) or exists (
        select 1 from public.content_post_targets t where t.post_id = cp.id and p_id = any (coalesce(t.custom_media_ids, '{}'))
      ))
  ) or exists (
    select 1 from public.content_articles a
    where a.featured_media_id = p_id and a.status in ('draft', 'scheduled', 'publishing')
  ) then
    raise exception 'A draft or scheduled post or article uses this file. Remove it there first.' using errcode = 'P0001';
  end if;
  delete from public.content_media where id = p_id;
  return array_remove(array[r.storage_path, r.thumb_path], null);
end;
$$;

-- ===========================================================================
-- Part 2 · Server (service role): claim a send, store what Zernio said
-- ===========================================================================

-- One send at a time per post or article. Returns the version to send, or ok=false.
create or replace function public.content_claim_send(p_kind text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  if p_kind = 'post' then
    update public.content_posts set sending_at = now()
      where id = p_id and (sending_at is null or sending_at < now() - interval '3 minutes')
      returning version into v;
  elsif p_kind = 'article' then
    update public.content_articles set sending_at = now()
      where id = p_id and (sending_at is null or sending_at < now() - interval '3 minutes')
      returning version into v;
  else
    raise exception 'Unknown kind.' using errcode = '22023';
  end if;
  return jsonb_build_object('ok', v is not null, 'version', v);
end;
$$;

create or replace function private.content_post_status_of(p text)
returns public.content_status
language sql
immutable
set search_path = ''
as $$
  select case p
    when 'draft' then 'draft' when 'pending_approval' then 'scheduled' when 'scheduled' then 'scheduled'
    when 'publishing' then 'publishing' when 'published' then 'published' when 'partial' then 'partial'
    when 'failed' then 'failed' when 'cancelled' then 'cancelled'
  end::public.content_status
$$;

create or replace function private.content_target_status_of(p text)
returns public.content_target_status
language sql
immutable
set search_path = ''
as $$
  select case p
    when 'pending' then 'pending' when 'scheduled' then 'pending'
    when 'processing' then 'publishing' when 'uploading' then 'publishing' when 'publishing' then 'publishing'
    when 'published' then 'published' when 'failed' then 'failed' when 'cancelled' then 'cancelled'
    when 'deleted' then 'deleted'
  end::public.content_target_status
$$;

-- What Zernio says about a post: its status, and each account's status, link and error.
-- p: {release, status, zernio_post_id, sent_version, scheduled_for, error, event_at, force,
--     retry, event, actor, platforms: [{accountId, status, platformPostId, platformPostUrl,
--     errorMessage, errorCategory, errorSource, publishedAt}]}
create or replace function public.zernio_store_post_result(p_post_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.content_posts;
  v_event_at timestamptz := private.content_ts(p->>'event_at');
  v_force boolean := coalesce((p->>'force')::boolean, false);
  v_status public.content_status := private.content_post_status_of(p->>'status');
  pl jsonb;
  ts public.content_target_status;
  n_total integer; n_pub integer; n_fail integer; n_open integer;
  v_url text;
begin
  select * into r from public.content_posts where id = p_post_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown post'); end if;
  if p->>'actor' is not null then perform set_config('app.content_actor', p->>'actor', true); end if;

  -- An older webhook never overwrites a newer answer.
  if not v_force and v_event_at is not null and r.last_event_at is not null and v_event_at < r.last_event_at then
    return jsonb_build_object('ok', true, 'skipped', 'older event');
  end if;

  if coalesce((p->>'retry')::boolean, false) then
    update public.content_post_targets set status = 'publishing', error_message = null, error_category = null,
      error_source = null, updated_at = now()
      where post_id = p_post_id and status = 'failed';
  end if;

  for pl in select * from jsonb_array_elements(case jsonb_typeof(p->'platforms') when 'array' then p->'platforms' else '[]' end) loop
    ts := private.content_target_status_of(pl->>'status');
    v_url := pl->>'platformPostUrl';
    if v_url is not null and (v_url !~ '^https://' or char_length(v_url) > 2000) then v_url := null; end if;
    update public.content_post_targets t set
      status = case
        when ts is null then t.status
        -- A late "publishing" never undoes "published".
        when not v_force and t.status in ('published', 'deleted') and ts in ('pending', 'publishing') then t.status
        else ts end,
      platform_post_id = coalesce(left(pl->>'platformPostId', 300), t.platform_post_id),
      platform_post_url = coalesce(v_url, t.platform_post_url),
      error_message = case when ts = 'failed' then left(nullif(pl->>'errorMessage', ''), 1000)
                           when ts in ('published', 'pending', 'publishing') then null else t.error_message end,
      error_category = case when ts = 'failed' then left(nullif(pl->>'errorCategory', ''), 50)
                            when ts in ('published', 'pending', 'publishing') then null else t.error_category end,
      error_source = case when ts = 'failed' then left(nullif(pl->>'errorSource', ''), 20)
                          when ts in ('published', 'pending', 'publishing') then null else t.error_source end,
      published_at = case when ts = 'published' then coalesce(t.published_at, private.content_ts(pl->>'publishedAt'), now())
                          else t.published_at end,
      updated_at = now()
    where t.post_id = p_post_id and t.zernio_account_id = pl->>'accountId';
  end loop;

  -- No post status given (per-account events): work it out once every account is done.
  if v_status is null and r.status not in ('draft', 'cancelled') and r.zernio_post_id is not null then
    select count(*), count(*) filter (where status = 'published'), count(*) filter (where status = 'failed'),
           count(*) filter (where status in ('pending', 'publishing'))
      into n_total, n_pub, n_fail, n_open
      from public.content_post_targets where post_id = p_post_id and status <> 'cancelled';
    if n_total > 0 and n_open = 0 then
      v_status := case when n_fail = 0 then 'published' when n_pub > 0 then 'partial' else 'failed' end;
    end if;
  end if;
  if not v_force and r.status = 'published' and v_status in ('scheduled', 'publishing', 'draft') then
    v_status := null;
  end if;
  -- Accounts left waiting when the post is over.
  if v_status = 'cancelled' then
    update public.content_post_targets set status = 'cancelled', updated_at = now()
      where post_id = p_post_id and status in ('pending', 'publishing');
  end if;

  update public.content_posts set
    status = coalesce(v_status, status),
    zernio_post_id = coalesce(left(p->>'zernio_post_id', 64), zernio_post_id),
    sent_version = coalesce((p->>'sent_version')::integer, sent_version),
    scheduled_for = case when p ? 'scheduled_for' then private.content_ts(p->>'scheduled_for') else scheduled_for end,
    last_error = case when p ? 'error' then left(nullif(p->>'error', ''), 1000)
                      when v_status in ('scheduled', 'published', 'publishing') then null else last_error end,
    published_at = case when coalesce(v_status, status) in ('published', 'partial')
                        then coalesce(published_at, (select max(published_at) from public.content_post_targets where post_id = p_post_id), now())
                        else published_at end,
    sending_at = case when coalesce((p->>'release')::boolean, false) then null else sending_at end,
    last_event_at = greatest(last_event_at, v_event_at),
    last_synced_at = now(),
    updated_at = now()
  where id = p_post_id;

  if p->>'event' in ('retried', 'unpublished', 'deleted_on_platform') then
    insert into public.content_events (client_id, post_id, kind, actor_id, detail)
    values (r.client_id, p_post_id, p->>'event', nullif(p->>'actor', '')::uuid, coalesce(p->'detail', '{}'));
  end if;
  return jsonb_build_object('ok', true, 'status', coalesce(v_status, r.status));
end;
$$;

-- What WordPress (through Zernio) says about an article.
-- p: {release, status, wp_article_id, wp_url, wp_status, wp_account_id, wp_blog_id, sent_version,
--     publish_at, error, force, event, actor}
create or replace function public.zernio_store_article_result(p_article_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.content_articles;
  v_status public.content_status := nullif(p->>'status', '')::public.content_status;
  v_url text := p->>'wp_url';
begin
  select * into r from public.content_articles where id = p_article_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown article'); end if;
  if p->>'actor' is not null then perform set_config('app.content_actor', p->>'actor', true); end if;
  if v_url is not null and (v_url !~ '^https?://' or char_length(v_url) > 2000) then v_url := null; end if;
  if not coalesce((p->>'force')::boolean, false) and r.status = 'published' and v_status in ('scheduled', 'publishing') then
    v_status := null;
  end if;

  update public.content_articles set
    status = coalesce(v_status, status),
    wp_article_id = coalesce(left(p->>'wp_article_id', 100), wp_article_id),
    wp_url = coalesce(v_url, wp_url),
    wp_status = coalesce(left(p->>'wp_status', 30), wp_status),
    wp_account_id = coalesce(nullif(p->>'wp_account_id', '')::uuid, wp_account_id),
    wp_blog_id = coalesce(left(p->>'wp_blog_id', 100), wp_blog_id),
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
-- Part 3 · Triggers: history, activity, notifications, work items; existing functions
-- ===========================================================================

create or replace function private.content_actor()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.current_member_or_null(),
    (select m.id from public.team_members m
      where m.id::text = nullif(current_setting('app.content_actor', true), ''))
  )
$$;

create or replace function private.content_post_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.content_actor();
  owner uuid;
  label text;
begin
  if tg_op = 'INSERT' then
    insert into public.content_events (client_id, post_id, kind, actor_id) values (new.client_id, new.id, 'created', actor);
    return null;
  end if;
  if new.status is not distinct from old.status then return null; end if;

  insert into public.content_events (client_id, post_id, kind, actor_id, detail)
  values (new.client_id, new.id, new.status::text, actor,
    jsonb_strip_nulls(jsonb_build_object('from', old.status, 'error', new.last_error, 'scheduled_for', new.scheduled_for)));

  label := coalesce(new.title, nullif(left(btrim(regexp_replace(new.content, '\s+', ' ', 'g')), 80), ''), 'Post');
  if new.status in ('scheduled', 'published', 'partial', 'failed', 'cancelled') then
    insert into public.activity_log (actor_id, client_id, action, meta)
    values (actor, new.client_id, 'content.post_' || new.status::text,
      jsonb_strip_nulls(jsonb_build_object('post_id', new.id, 'title', label, 'scheduled_for', new.scheduled_for, 'error', new.last_error)));
  end if;

  if new.status in ('failed', 'partial') then
    select c.owner_id into owner from public.clients c where c.id = new.client_id;
    insert into public.notifications (recipient_id, kind, client_id, content_post_id)
    select distinct x, 'content_failed'::public.notification_kind, new.client_id, new.id
    from unnest(array[new.created_by, owner]) x
    where x is not null and x is distinct from actor;
  elsif new.status = 'published' and old.status in ('scheduled', 'publishing') and new.scheduled_for is not null
        and new.created_by is not null and new.created_by is distinct from actor then
    insert into public.notifications (recipient_id, kind, client_id, content_post_id)
    values (new.created_by, 'content_published', new.client_id, new.id);
  end if;
  return null;
end;
$$;

create trigger content_posts_after_write
  after insert or update of status on public.content_posts
  for each row execute function private.content_post_after_write();

create or replace function private.content_article_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.content_actor();
  owner uuid;
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
      case when char_length(new.wp_url) <= 500 then new.wp_url end, 'article', new.id, new.created_by)
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
        'url', new.wp_url, 'publish_at', new.publish_at, 'error', new.last_error)));
  end if;

  if new.status = 'failed' then
    select c.owner_id into owner from public.clients c where c.id = new.client_id;
    insert into public.notifications (recipient_id, kind, client_id, content_article_id)
    select distinct x, 'content_failed'::public.notification_kind, new.client_id, new.id
    from unnest(array[new.created_by, owner]) x
    where x is not null and x is distinct from actor;
  elsif new.status = 'published' and old.status = 'scheduled'
        and new.created_by is not null and new.created_by is distinct from actor then
    insert into public.notifications (recipient_id, kind, client_id, content_article_id)
    values (new.created_by, 'content_published', new.client_id, new.id);
  end if;
  return null;
end;
$$;

create trigger content_articles_after_write
  after insert or update of status, wp_url, title on public.content_articles
  for each row execute function private.content_article_after_write();

-- Work item: one per published Google Business Profile post.
create or replace function private.content_target_work_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  body text;
  writer uuid;
begin
  if tg_op = 'DELETE' then
    if old.platform = 'googlebusiness' then
      delete from public.work_items where source = 'gbp_post' and source_id = old.id and client_id = old.client_id;
    end if;
    return null;
  end if;
  if new.platform <> 'googlebusiness' then return null; end if;
  if new.status = 'published' then
    select content, created_by into body, writer from public.content_posts where id = new.post_id;
    insert into public.work_items (client_id, kind, quantity, delivered_on, title, url, source, source_id, created_by)
    values (new.client_id, 'gbp_posts', 1, (coalesce(new.published_at, now()) at time zone 'America/Phoenix')::date,
      left('Google post: ' || coalesce(nullif(btrim(regexp_replace(coalesce(new.custom_content, body, ''), '\s+', ' ', 'g')), ''), '(image)'), 200),
      case when char_length(new.platform_post_url) <= 500 then new.platform_post_url end, 'gbp_post', new.id, writer)
    on conflict (source, source_id, client_id) where source_id is not null do update set url = excluded.url;
  elsif tg_op = 'UPDATE' and old.status = 'published' then
    delete from public.work_items where source = 'gbp_post' and source_id = new.id and client_id = new.client_id;
  end if;
  return null;
end;
$$;

create trigger content_post_targets_work_item
  after insert or update of status, platform_post_url or delete on public.content_post_targets
  for each row execute function private.content_target_work_item();

-- WordPress gets a label like the other platforms.
create or replace function private.platform_label(p_platform public.social_platform)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_platform
    when 'googlebusiness' then 'Google Business Profile'
    when 'facebook' then 'Facebook'
    when 'instagram' then 'Instagram'
    when 'linkedin' then 'LinkedIn'
    when 'youtube' then 'YouTube'
    when 'twitter' then 'X'
    when 'tiktok' then 'TikTok'
    when 'pinterest' then 'Pinterest'
    when 'threads' then 'Threads'
    when 'wordpress' then 'WordPress'
  end
$$;

-- Onboarding's social step counts social platforms only: a WordPress site isn't one of them.
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
  total integer := (select count(*) from unnest(enum_range(null::public.social_platform)) e where e <> 'wordpress');
  login_count integer;
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
  where p <> 'wordpress';
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
    if w.platform = 'none' or w.access_status in ('invited_us', 'login_in_vault') then
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

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'private.require_content_writer(uuid)', 'private.require_content_admin(uuid)',
    'private.content_media_list(uuid, jsonb)', 'private.content_word_count(text)', 'private.content_ts(text)',
    'private.content_post_status_of(text)', 'private.content_target_status_of(text)', 'private.content_actor()',
    'public.save_content_post(uuid, jsonb)', 'public.delete_content_post(uuid)',
    'public.save_content_article(uuid, jsonb)', 'public.delete_content_article(uuid)',
    'public.set_content_article_seo(uuid, boolean)', 'public.save_content_settings(uuid, jsonb)',
    'public.save_content_media(uuid, jsonb)', 'public.delete_content_media(uuid)',
    'public.content_claim_send(text, uuid)', 'public.zernio_store_post_result(uuid, jsonb)',
    'public.zernio_store_article_result(uuid, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
  foreach f in array array[
    'public.save_content_post(uuid, jsonb)', 'public.delete_content_post(uuid)',
    'public.save_content_article(uuid, jsonb)', 'public.delete_content_article(uuid)',
    'public.set_content_article_seo(uuid, boolean)', 'public.save_content_settings(uuid, jsonb)',
    'public.save_content_media(uuid, jsonb)', 'public.delete_content_media(uuid)'
  ] loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array[
    'public.content_claim_send(text, uuid)', 'public.zernio_store_post_result(uuid, jsonb)',
    'public.zernio_store_article_result(uuid, jsonb)'
  ] loop
    execute format('revoke execute on function %s from authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
