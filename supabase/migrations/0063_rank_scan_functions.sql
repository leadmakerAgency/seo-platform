-- 0063 · Ranking scan functions (docs/plans/ranking-scan/03-data-model.md)
-- Team RPCs check the role and client; dfs_* / store / finish are for the service-role pipeline;
-- reads are security invoker (RLS). Also: Search Console is not a social platform (onboarding),
-- and connecting it verifies onboarding and queues a first scan.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function private.is_social_platform(p public.social_platform)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p not in ('wordpress', 'googlesearchconsole')
$$;

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
    when 'googlesearchconsole' then 'Google Search Console'
  end
$$;

-- A scan needs at least one source: a website (DataForSEO) or a connected Search Console /
-- Google Business Profile.
create or replace function private.client_has_scan_source(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.clients c where c.id = p_client_id and coalesce(btrim(c.website), '') <> '')
      or exists (
        select 1 from public.social_accounts a
        where a.client_id = p_client_id and a.status = 'connected'
          and a.platform in ('googlesearchconsole', 'googlebusiness')
      )
$$;

-- ---------------------------------------------------------------------------
-- Team RPCs
-- ---------------------------------------------------------------------------

create or replace function public.request_rank_scan(p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  lim integer;
  used integer;
  sid uuid;
begin
  perform private.require_rankings_manager(p_client_id);
  if exists (select 1 from public.rank_scans where client_id = p_client_id and status in ('queued', 'running')) then
    raise exception 'A ranking scan is already running for this client.' using errcode = 'P0001';
  end if;
  if not private.client_has_scan_source(p_client_id) then
    raise exception 'Add the client''s website, or connect Search Console or Google Business Profile, first.' using errcode = 'P0001';
  end if;
  select rank_scans_per_client_month into lim from public.dfs_settings;
  select count(*) into used from public.rank_scans
    where client_id = p_client_id and trigger = 'manual' and status <> 'failed'
      and created_at >= (date_trunc('month', now() at time zone 'America/Phoenix') at time zone 'America/Phoenix');
  if used >= coalesce(lim, 4) then
    raise exception 'This client has used its % scans this month. The monthly scan still runs.', coalesce(lim, 4)
      using errcode = 'P0001';
  end if;
  insert into public.rank_scans (client_id, trigger, created_by)
  values (p_client_id, 'manual', private.current_member_or_null())
  returning id into sid;
  perform private.log_rankings(p_client_id, 'rank.scan_requested', '{}');
  return sid;
end;
$$;

create or replace function public.save_rank_scan_settings(p_client_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gsc uuid;
begin
  perform private.require_rankings_manager(p_client_id);
  if not exists (select 1 from public.rank_settings where client_id = p_client_id) then
    raise exception 'Open the Rankings page once so its settings exist.' using errcode = 'P0001';
  end if;
  if p ? 'gsc_account_id' then
    begin
      v_gsc := nullif(p->>'gsc_account_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Unknown Search Console site.' using errcode = '22023';
    end;
    if v_gsc is not null and not exists (
      select 1 from public.social_accounts
      where id = v_gsc and client_id = p_client_id and platform = 'googlesearchconsole'
    ) then
      raise exception 'That Search Console site isn''t connected to this client.' using errcode = '22023';
    end if;
  end if;
  update public.rank_settings set
    scan_auto = case when p ? 'scan_auto' then coalesce((p->>'scan_auto')::boolean, scan_auto) else scan_auto end,
    scan_next_at = case when (p->>'scan_auto')::boolean is true and scan_next_at is null then now() else scan_next_at end,
    gsc_account_id = case when p ? 'gsc_account_id' then v_gsc else gsc_account_id end,
    gsc_country_only = case when p ? 'gsc_country_only' then coalesce((p->>'gsc_country_only')::boolean, gsc_country_only) else gsc_country_only end,
    brand_terms = case when p ? 'brand_terms' then private.aiv_text_list(p->'brand_terms', 20, 60, true) else brand_terms end,
    updated_at = now()
  where client_id = p_client_id;
  perform private.log_rankings(p_client_id, 'rank.scan_settings_saved', '{}');
end;
$$;

-- ---------------------------------------------------------------------------
-- Pipeline (service role)
-- ---------------------------------------------------------------------------

-- Monthly scans for onboarding and active clients whose scan is due. Moves their next date on.
create or replace function public.dfs_queue_monthly_scans(p_limit integer default 10)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  r record;
begin
  for r in
    select rs.client_id
    from public.rank_settings rs
    join public.clients c on c.id = rs.client_id
    where rs.scan_auto
      and c.stage in ('onboarding', 'active')
      and coalesce(rs.scan_next_at, now()) <= now()
      and not exists (select 1 from public.rank_scans s where s.client_id = rs.client_id and s.status in ('queued', 'running'))
      and private.client_has_scan_source(rs.client_id)
    order by rs.scan_next_at nulls first
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update of rs skip locked
  loop
    insert into public.rank_scans (client_id, trigger) values (r.client_id, 'monthly')
      on conflict (client_id) where status in ('queued', 'running') do nothing;
    update public.rank_settings set scan_next_at = now() + interval '30 days' where client_id = r.client_id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.dfs_claim_rank_scan()
returns setof public.rank_scans
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.rank_scans
    set status = 'failed', finished_at = now(), error = 'Stopped responding three times.'
    where status = 'running' and heartbeat_at < now() - interval '10 minutes' and attempts >= 3;
  return query
  update public.rank_scans
    set status = 'running', attempts = attempts + 1, started_at = coalesce(started_at, now()), heartbeat_at = now()
    where id = (
      select id from public.rank_scans
      where status = 'queued' or (status = 'running' and heartbeat_at < now() - interval '10 minutes')
      order by created_at limit 1 for update skip locked
    )
    returning *;
end;
$$;

-- Upserts keywords of a scan. Each source stores its own columns; non-null values win,
-- sources are unioned and flags only ever turn on, so a source can be stored again safely.
create or replace function public.store_rank_scan_rows(p_scan_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  n integer;
begin
  select client_id into v_client from public.rank_scans where id = p_scan_id;
  if v_client is null then
    raise exception 'Unknown scan.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows must be an array.' using errcode = '22023';
  end if;
  insert into public.rank_scan_keywords as t (
    scan_id, client_id, keyword_norm, phrase, sources, verdict, reasons, is_brand, low_ctr, score, position, topic,
    dfs_position, dfs_type, dfs_url, dfs_previous_position, dfs_volume, dfs_etv, dfs_check_url, dfs_updated_at,
    other_language, gsc_clicks, gsc_impressions, gsc_ctr, gsc_position, gsc_page, gbp_reach, gbp_below_threshold,
    city_volume, national_volume, difficulty, intent, cpc
  )
  select p_scan_id, v_client, r.keyword_norm, left(coalesce(r.phrase, r.keyword_norm), 200), coalesce(r.sources, '{}'),
    r.verdict, coalesce(r.reasons, '{}'), coalesce(r.is_brand, false), coalesce(r.low_ctr, false), r.score, r.position,
    left(r.topic, 120),
    r.dfs_position, left(r.dfs_type, 40), left(r.dfs_url, 2000), r.dfs_previous_position, r.dfs_volume, r.dfs_etv,
    left(r.dfs_check_url, 2000), r.dfs_updated_at, coalesce(r.other_language, false),
    r.gsc_clicks, r.gsc_impressions, r.gsc_ctr, r.gsc_position, left(r.gsc_page, 2000), r.gbp_reach,
    coalesce(r.gbp_below_threshold, false), r.city_volume, r.national_volume, r.difficulty, r.intent, r.cpc
  from jsonb_populate_recordset(null::public.rank_scan_keywords, p_rows) r
  where r.keyword_norm is not null and char_length(r.keyword_norm) between 1 and 200
  on conflict (scan_id, keyword_norm) do update set
    phrase = coalesce(excluded.phrase, t.phrase),
    sources = (select coalesce(array_agg(distinct s order by s), '{}') from unnest(t.sources || excluded.sources) s),
    verdict = coalesce(excluded.verdict, t.verdict),
    reasons = case when cardinality(excluded.reasons) > 0 then excluded.reasons else t.reasons end,
    is_brand = t.is_brand or excluded.is_brand,
    low_ctr = t.low_ctr or excluded.low_ctr,
    score = coalesce(excluded.score, t.score),
    position = coalesce(excluded.position, t.position),
    topic = coalesce(excluded.topic, t.topic),
    dfs_position = coalesce(excluded.dfs_position, t.dfs_position),
    dfs_type = coalesce(excluded.dfs_type, t.dfs_type),
    dfs_url = coalesce(excluded.dfs_url, t.dfs_url),
    dfs_previous_position = coalesce(excluded.dfs_previous_position, t.dfs_previous_position),
    dfs_volume = coalesce(excluded.dfs_volume, t.dfs_volume),
    dfs_etv = coalesce(excluded.dfs_etv, t.dfs_etv),
    dfs_check_url = coalesce(excluded.dfs_check_url, t.dfs_check_url),
    dfs_updated_at = coalesce(excluded.dfs_updated_at, t.dfs_updated_at),
    other_language = t.other_language or excluded.other_language,
    gsc_clicks = coalesce(excluded.gsc_clicks, t.gsc_clicks),
    gsc_impressions = coalesce(excluded.gsc_impressions, t.gsc_impressions),
    gsc_ctr = coalesce(excluded.gsc_ctr, t.gsc_ctr),
    gsc_position = coalesce(excluded.gsc_position, t.gsc_position),
    gsc_page = coalesce(excluded.gsc_page, t.gsc_page),
    gbp_reach = coalesce(excluded.gbp_reach, t.gbp_reach),
    gbp_below_threshold = t.gbp_below_threshold or excluded.gbp_below_threshold,
    city_volume = coalesce(excluded.city_volume, t.city_volume),
    national_volume = coalesce(excluded.national_volume, t.national_volume),
    difficulty = coalesce(excluded.difficulty, t.difficulty),
    intent = coalesce(excluded.intent, t.intent),
    cpc = coalesce(excluded.cpc, t.cpc);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Finishes a scan: status, counts, cost; next monthly date; history; notification; keeps the
-- client's last 6 scans. p: {status, sources, counts, error}
create or replace function public.finish_rank_scan(p_scan_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.rank_scans;
  v_status public.rank_scan_status := coalesce(nullif(p->>'status', '')::public.rank_scan_status, 'done');
  v_cost numeric;
  v_owner uuid;
  v_to uuid;
begin
  select * into s from public.rank_scans where id = p_scan_id for update;
  if not found then raise exception 'Unknown scan.' using errcode = 'P0001'; end if;
  select coalesce(sum(cost_usd), 0) into v_cost from public.dfs_calls where ref = p_scan_id;
  update public.rank_scans set
    status = v_status,
    step = 5,
    sources = coalesce(p->'sources', sources),
    counts = coalesce(p->'counts', counts),
    error = left(nullif(p->>'error', ''), 500),
    cost_usd = round(v_cost, 4),
    finished_at = now(),
    heartbeat_at = now()
  where id = p_scan_id;

  if v_status in ('done', 'partial') then
    update public.rank_settings set last_scan_id = p_scan_id, scan_next_at = now() + interval '30 days'
      where client_id = s.client_id;
  end if;

  insert into public.activity_log (actor_id, client_id, action, meta)
  values (s.created_by, s.client_id, case when v_status = 'failed' then 'rank.scan_failed' else 'rank.scan_finished' end,
    jsonb_strip_nulls(coalesce(p->'counts', '{}') || jsonb_build_object('cost', round(v_cost, 2), 'trigger', s.trigger,
      'error', left(nullif(p->>'error', ''), 200))));

  select owner_id into v_owner from public.clients where id = s.client_id;
  v_to := case when s.trigger = 'manual' then coalesce(s.created_by, v_owner) else v_owner end;
  if v_to is not null then
    insert into public.notifications (recipient_id, kind, client_id) values (v_to, 'rank_scan_finished', s.client_id);
  end if;

  delete from public.rank_scans
  where client_id = s.client_id and status not in ('queued', 'running')
    and id not in (
      select id from public.rank_scans where client_id = s.client_id and status not in ('queued', 'running')
      order by created_at desc limit 6
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads (security invoker: RLS applies)
-- ---------------------------------------------------------------------------

-- The previous finished scan before p_scan_id (for change, new and lost).
create or replace function public.rank_scan_previous(p_client_id uuid, p_scan_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select s.id from public.rank_scans s
  where s.client_id = p_client_id and s.status in ('done', 'partial') and s.id <> p_scan_id
    and s.created_at < (select created_at from public.rank_scans where id = p_scan_id)
  order by s.created_at desc limit 1
$$;

-- One page of a scan, with the previous scan's position, new, tracked and the latest city
-- position of tracked keywords. Returns {total, rows}.
create or replace function public.rank_scan_page(
  p_client_id uuid,
  p_scan_id uuid,
  p_verdict public.rank_verdict default null,
  p_source text default null,
  p_q text default null,
  p_untracked boolean default false,
  p_limit integer default 500,
  p_offset integer default 0
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with prev as (select public.rank_scan_previous(p_client_id, p_scan_id) as id),
  base as (
    select r.*, k.id as tracked_id
    from public.rank_scan_keywords r
    left join public.keywords k
      on k.client_id = r.client_id and k.phrase = r.keyword_norm and k.archived_at is null and k.tracked
    where r.scan_id = p_scan_id and r.client_id = p_client_id
      and (p_verdict is null or r.verdict = p_verdict)
      and (p_source is null
        or (p_source = 'several' and cardinality(r.sources) > 1)
        or (p_source <> 'several' and p_source = any (r.sources::text[])))
      and (coalesce(btrim(p_q), '') = '' or r.keyword_norm like '%' || lower(btrim(p_q)) || '%')
      and (not coalesce(p_untracked, false) or k.id is null)
  ),
  page as (
    select b.* from base b
    order by b.score desc nulls last, b.gsc_clicks desc nulls last, b.keyword_norm
    limit greatest(1, least(coalesce(p_limit, 500), 1000)) offset greatest(0, coalesce(p_offset, 0))
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'rows', coalesce((
      select jsonb_agg(
        to_jsonb(pg) - 'tracked_id' || jsonb_build_object(
          'tracked_id', pg.tracked_id,
          'prev_position', pr.position,
          'is_new', (select id from prev) is not null and pr.keyword_norm is null,
          'city_position', (
            select kr.position from public.keyword_ranks kr
            join public.rank_checks rc on rc.id = kr.check_id
            where pg.tracked_id is not null and kr.keyword_id = pg.tracked_id and kr.engine = 'google' and rc.status = 'done'
            order by rc.checked_at desc limit 1
          )
        )
        order by pg.score desc nulls last, pg.gsc_clicks desc nulls last, pg.keyword_norm
      )
      from page pg
      left join public.rank_scan_keywords pr
        on pr.scan_id = (select id from prev) and pr.keyword_norm = pg.keyword_norm
    ), '[]'::jsonb)
  )
$$;

-- Keep / Quick win keywords of the previous scan that aren't in this one.
create or replace function public.rank_scan_lost(p_client_id uuid, p_scan_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'keyword_norm', pr.keyword_norm, 'phrase', pr.phrase, 'verdict', pr.verdict, 'position', pr.position,
      'sources', pr.sources, 'gsc_clicks', pr.gsc_clicks
    ) order by pr.score desc nulls last), '[]'::jsonb)
  from public.rank_scan_keywords pr
  where pr.scan_id = public.rank_scan_previous(p_client_id, p_scan_id)
    and pr.verdict in ('keep', 'quick_win')
    and not exists (
      select 1 from public.rank_scan_keywords cur where cur.scan_id = p_scan_id and cur.keyword_norm = pr.keyword_norm
    )
$$;

-- ---------------------------------------------------------------------------
-- Search Console connected: verify onboarding, remember the site, queue a first scan
-- ---------------------------------------------------------------------------

create or replace function private.social_accounts_gsc_connected()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  site text := left(nullif(coalesce(new.username, new.display_name), ''), 300);
begin
  if new.platform <> 'googlesearchconsole' or new.status <> 'connected' then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status = 'connected' then
    return null;
  end if;

  insert into public.onboarding_google_access as g (client_id, sc_status, sc_property, sc_verified_at)
  values (new.client_id, 'added', site, now())
  on conflict (client_id) do update set
    sc_status = 'added',
    sc_property = coalesce(nullif(g.sc_property, ''), excluded.sc_property),
    sc_verified_at = coalesce(g.sc_verified_at, now()),
    updated_at = now();
  perform private.onboarding_refresh(new.client_id, false);

  update public.rank_settings set gsc_account_id = new.id
    where client_id = new.client_id and gsc_account_id is null;

  insert into public.rank_scans (client_id, trigger, created_by)
  values (new.client_id, 'connected', new.connected_by)
  on conflict (client_id) where status in ('queued', 'running') do nothing;
  return null;
end;
$$;

create trigger social_accounts_gsc_connected
  after insert or update of status on public.social_accounts
  for each row execute function private.social_accounts_gsc_connected();

-- ---------------------------------------------------------------------------
-- Onboarding's social step counts social platforms only (not WordPress, not Search Console)
-- ---------------------------------------------------------------------------

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
    'private.is_social_platform(public.social_platform)', 'private.client_has_scan_source(uuid)',
    'private.social_accounts_gsc_connected()',
    'public.request_rank_scan(uuid)', 'public.save_rank_scan_settings(uuid, jsonb)',
    'public.dfs_queue_monthly_scans(integer)', 'public.dfs_claim_rank_scan()',
    'public.store_rank_scan_rows(uuid, jsonb)', 'public.finish_rank_scan(uuid, jsonb)',
    'public.rank_scan_previous(uuid, uuid)',
    'public.rank_scan_page(uuid, uuid, public.rank_verdict, text, text, boolean, integer, integer)',
    'public.rank_scan_lost(uuid, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
  foreach f in array array[
    'public.request_rank_scan(uuid)', 'public.save_rank_scan_settings(uuid, jsonb)',
    'public.rank_scan_previous(uuid, uuid)',
    'public.rank_scan_page(uuid, uuid, public.rank_verdict, text, text, boolean, integer, integer)',
    'public.rank_scan_lost(uuid, uuid)', 'private.is_social_platform(public.social_platform)'
  ] loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array[
    'public.dfs_queue_monthly_scans(integer)', 'public.dfs_claim_rank_scan()',
    'public.store_rank_scan_rows(uuid, jsonb)', 'public.finish_rank_scan(uuid, jsonb)'
  ] loop
    execute format('revoke execute on function %s from authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
