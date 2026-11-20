-- Competitor backlinks: functions (docs/plans/backlinks/11-competitor-backlinks.md §3).

-- Big platforms are never "competitors".
create or replace function private.competitor_platform(p_domain text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_domain = any (array[
    'google.com', 'youtube.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com',
    'tiktok.com', 'pinterest.com', 'reddit.com', 'wikipedia.org', 'amazon.com', 'ebay.com', 'yelp.com',
    'g2.com', 'capterra.com', 'clutch.co', 'trustpilot.com', 'bbb.org', 'apple.com', 'microsoft.com',
    'medium.com', 'quora.com', 'github.com', 'yahoo.com', 'bing.com', 'indeed.com', 'glassdoor.com'
  ])
$$;

-- The client's own domain(s), from the client record and its business profile.
create or replace function private.client_domains(p_client_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct d), '{}') from (
    select lower(regexp_replace(regexp_replace(coalesce(w, ''), '^https?://(www\.)?', ''), '[/:?#].*$', '')) d
    from (
      select website w from public.clients where id = p_client_id
      union all
      select website from public.client_business_profiles where client_id = p_client_id
    ) s
  ) x where d ~ '\.'
$$;

-- The team's list: the given domains become the active competitors (≤ 5); others stay as suggestions.
create or replace function public.save_client_competitors(p_client_id uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  it jsonb;
  d text;
  own text[];
  keep text[] := '{}';
  n integer;
begin
  perform private.require_backlinks_worker(p_client_id);
  own := private.client_domains(p_client_id);
  for it in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    d := lower(btrim(regexp_replace(regexp_replace(coalesce(it->>'domain', ''), '^https?://(www\.)?', ''), '[/:?#].*$', '')));
    d := regexp_replace(d, '^www\.', '');
    if d !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then
      raise exception '"%" isn''t a web address. Use a domain like competitor.com.', it->>'domain' using errcode = 'P0001';
    end if;
    if d = any (own) or exists (select 1 from unnest(own) o where d like '%.' || o or o like '%.' || d) then
      raise exception '% is the client''s own site.', d using errcode = 'P0001';
    end if;
    if private.competitor_platform(d) then
      raise exception '% is a big platform, not a competitor.', d using errcode = 'P0001';
    end if;
    keep := keep || d;
    insert into public.client_competitors as c (client_id, domain, name, source, active, added_by)
    values (p_client_id, d, nullif(left(btrim(coalesce(it->>'name', '')), 120), ''), 'team', true, (select auth.uid()))
    on conflict (client_id, domain) do update set
      active = true, name = coalesce(excluded.name, c.name), updated_at = now();
  end loop;
  select count(distinct x) into n from unnest(keep) x;
  if n > 5 then
    raise exception 'Keep 5 competitors at most.' using errcode = 'P0001';
  end if;
  update public.client_competitors set active = false, updated_at = now()
    where client_id = p_client_id and active and not (domain = any (keep));
  perform private.log_backlinks(p_client_id, 'backlink.competitors_saved', jsonb_build_object('count', n));
  return n;
end;
$$;

-- Competitors the pipeline found: new ones are saved as suggestions; with none active yet, the first
-- 5 become the active list.
create or replace function public.dfs_save_found_competitors(p_client_id uuid, p_items jsonb, p_source text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  it jsonb;
  d text;
  own text[] := private.client_domains(p_client_id);
  had integer;
  n integer := 0;
begin
  select count(*) into had from public.client_competitors where client_id = p_client_id and active;
  for it in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    d := regexp_replace(lower(btrim(coalesce(it->>'domain', ''))), '^www\.', '');
    continue when d !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' or d = any (own) or private.competitor_platform(d);
    insert into public.client_competitors as c (client_id, domain, name, source, active, evidence)
    values (p_client_id, d, nullif(left(coalesce(it->>'name', ''), 120), ''),
      case when p_source in ('ai', 'dataforseo') then p_source else 'ai' end,
      had = 0 and n < 5, coalesce(it->'evidence', '{}'))
    on conflict (client_id, domain) do update set
      evidence = c.evidence || excluded.evidence,
      name = coalesce(c.name, excluded.name),
      updated_at = now();
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Starting runs: full (with or without competitors' backlinks) or competitors only
-- ---------------------------------------------------------------------------

create or replace function public.request_ai_search(
  p_client_id uuid, p_target_ids uuid[], p_options jsonb, p_brief_version integer, p_estimate numeric,
  p_kind text, p_competitors text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  b public.backlink_briefs%rowtype;
  s public.dfs_settings%rowtype;
  rid uuid;
  ids uuid[];
  comps text[];
  n_ok integer;
  used integer;
  missing text[];
  problem text;
  gap boolean;
begin
  perform private.require_backlinks_worker(p_client_id);
  if p_kind not in ('full', 'competitors') then
    raise exception 'Unknown kind of search.' using errcode = '22023';
  end if;
  select id, stage into c from public.clients where id = p_client_id;
  if not found then
    raise exception 'Client not found.' using errcode = 'P0002';
  end if;
  if c.stage in ('paused', 'churned') then
    raise exception 'This client is paused or has left. Searches are off.' using errcode = 'P0001';
  end if;

  select id into rid from public.ai_search_runs where client_id = p_client_id and status in ('queued', 'running');
  if rid is not null then
    return rid;
  end if;
  if exists (select 1 from public.backlink_runs where client_id = p_client_id and status in ('queued', 'running')) then
    raise exception 'A Standard Search is running for this client. Wait for it to finish.' using errcode = 'P0001';
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
    raise exception 'Pick at least one place.' using errcode = 'P0001';
  end if;
  if cardinality(ids) > 8 then
    raise exception 'Pick 8 places at most for one AI search.' using errcode = 'P0001';
  end if;
  select count(*) into n_ok from public.backlink_targets where id = any (ids) and client_id = p_client_id and active;
  if n_ok <> cardinality(ids) then
    raise exception 'Some of these places were removed or turned off. Reload the page.' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct lower(x)), '{}') into comps from unnest(coalesce(p_competitors, '{}')) x
    where lower(x) ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$';
  gap := p_kind = 'competitors' or coalesce((p_options->>'gap')::boolean, false);
  if p_kind = 'competitors' and cardinality(comps) < 2 then
    raise exception 'Pick at least 2 competitors.' using errcode = 'P0001';
  end if;
  if cardinality(comps) > 5 then
    raise exception 'Pick 5 competitors at most.' using errcode = 'P0001';
  end if;

  select * into s from public.dfs_settings where id;
  if p_kind = 'full' then
    select count(*) into used from public.ai_search_runs
      where client_id = p_client_id and kind = 'full' and status <> 'failed' and created_at >= private.agency_month_start();
    if used >= s.ai_search_runs_per_client_month then
      raise exception 'This client has used its % AI searches this month. An admin can raise the limit.',
        s.ai_search_runs_per_client_month using errcode = 'P0001';
    end if;
  else
    select count(*) into used from public.ai_search_runs
      where client_id = p_client_id and kind = 'competitors' and status <> 'failed' and created_at >= private.agency_month_start();
    if used >= s.ai_gap_runs_per_client_month then
      raise exception 'This client has used its % competitor backlink searches this month. An admin can raise the limit.',
        s.ai_gap_runs_per_client_month using errcode = 'P0001';
    end if;
  end if;
  problem := public.dfs_ai_search_budget_problem();
  if problem is not null then
    raise exception '%', problem using errcode = 'P0001';
  end if;
  -- DataForSEO budget only matters when its link data will be used (the AI-only fallback doesn't).
  if gap and coalesce((p_options->>'use_dataforseo')::boolean, true) then
    problem := private.backlinks_budget_problem();
    if problem is not null then
      raise exception '%', problem using errcode = 'P0001';
    end if;
  end if;
  if p_estimate is null or p_estimate < 0 then
    raise exception 'Missing cost estimate. Reload the page.' using errcode = 'P0001';
  end if;
  if p_estimate > s.ai_search_max_run_usd then
    raise exception 'This search is estimated at $%, over the $% limit for one run. Pick fewer places or kinds of sites.',
      round(p_estimate, 2), s.ai_search_max_run_usd using errcode = 'P0001';
  end if;

  begin
    insert into public.ai_search_runs (client_id, created_by, target_ids, brief_version, estimate_usd, kind, competitors, params)
    values (p_client_id, (select auth.uid()), ids, b.version, round(p_estimate, 4), p_kind, comps,
      jsonb_build_object(
        'brief', to_jsonb(b) - 'client_id' - 'updated_by' - 'created_at' - 'updated_at',
        'options', coalesce(p_options, '{}'::jsonb) || jsonb_build_object('gap', gap),
        'caps', jsonb_build_object(
          'max_usd', s.ai_search_max_run_usd,
          'max_web_searches', s.ai_search_max_web_searches,
          'web_search_price', s.web_search_price_usd,
          'gap_max_sites', s.ai_gap_max_sites,
          'gap_min_shared', s.ai_gap_min_shared
        )
      ))
    returning id into rid;
  exception when unique_violation then
    select id into rid from public.ai_search_runs where client_id = p_client_id and status in ('queued', 'running');
    return rid;
  end;
  perform private.log_backlinks(p_client_id, 'backlink.ai_search_started',
    jsonb_build_object('places', cardinality(ids), 'estimate', round(p_estimate, 2), 'kind', p_kind,
      'competitors', cardinality(comps)));
  return rid;
end;
$$;

-- The original call keeps working: a full run without competitors' backlinks.
create or replace function public.request_ai_search(
  p_client_id uuid, p_target_ids uuid[], p_options jsonb, p_brief_version integer, p_estimate numeric
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.request_ai_search(p_client_id, p_target_ids, p_options, p_brief_version, p_estimate, 'full', '{}'::text[])
$$;

-- ---------------------------------------------------------------------------
-- Storing places (now with competitor links) and site strength
-- ---------------------------------------------------------------------------

create or replace function public.dfs_store_ai_prospects(p_run_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.ai_search_runs%rowtype;
  it jsonb;
  dir record;
  pid uuid;
  ins boolean;
  st public.opportunity_status;
  reason text;
  out jsonb := '{}'::jsonb;
  n_new integer := 0;
begin
  select * into run from public.ai_search_runs where id = p_run_id;
  if run.id is null then
    raise exception 'Unknown AI search %', p_run_id using errcode = 'P0002';
  end if;

  for it in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into public.directories (site_key, domain, rank_target, name, type)
    values (
      it->>'site_key', it->>'domain', coalesce(it->>'rank_target', it->>'domain'),
      left(coalesce(nullif(it->>'name', ''), it->>'site_key'), 200),
      coalesce((it->>'type')::public.directory_type, 'other')
    )
    on conflict (site_key) do update set last_seen_at = now()
    returning id, status into dir;

    st := case when it->>'status' = 'filtered' then 'filtered'::public.opportunity_status else 'reserve'::public.opportunity_status end;
    reason := case when st = 'filtered' then coalesce(it->>'filter_reason', 'ai_rejected') end;
    if dir.status = 'blocked' then
      st := 'filtered';
      reason := 'blocked';
    end if;

    insert into public.ai_link_prospects as p (
      client_id, directory_id, status, filter_reason, target_ids, category, found_by,
      page_url, page_title, evidence, first_run_id, last_run_id, shared_count, competitor_links
    )
    values (
      run.client_id, dir.id, st, reason,
      array(select distinct x::uuid from jsonb_array_elements_text(coalesce(it->'target_ids', '[]')) x
            where x ~ '^[0-9a-f-]{36}$' and x::uuid = any (run.target_ids)),
      left(coalesce(it->>'category', 'other'), 40),
      array(select distinct left(x, 40) from jsonb_array_elements_text(coalesce(it->'found_by', '[]')) x),
      case when it->>'page_url' ~ '^https?://' then left(it->>'page_url', 2000) end,
      left(it->>'page_title', 300),
      coalesce((select jsonb_agg(e) from (select e from jsonb_array_elements(coalesce(it->'evidence', '[]')) e limit 8) s), '[]'),
      run.id, run.id,
      case when it->>'shared_count' ~ '^\d+$' then least(20, (it->>'shared_count')::int)::smallint end,
      coalesce((select jsonb_agg(e) from (select e from jsonb_array_elements(coalesce(it->'competitor_links', '[]')) e limit 5) s), '[]')
    )
    on conflict (client_id, directory_id) do update set
      last_run_id = excluded.last_run_id,
      target_ids = array(select distinct x from unnest(p.target_ids || excluded.target_ids) x),
      found_by = array(select distinct x from unnest(p.found_by || excluded.found_by) x),
      evidence = coalesce((select jsonb_agg(e) from (
        select e from jsonb_array_elements(excluded.evidence || p.evidence) e limit 8) s), '[]'),
      page_url = case when jsonb_array_length(excluded.competitor_links) > 0 and p.decided_by is null
        then coalesce(excluded.page_url, p.page_url) else coalesce(p.page_url, excluded.page_url) end,
      page_title = coalesce(p.page_title, excluded.page_title),
      category = case when p.decided_by is null then excluded.category else p.category end,
      shared_count = greatest(p.shared_count, excluded.shared_count),
      competitor_links = case when jsonb_array_length(excluded.competitor_links) > 0 then excluded.competitor_links else p.competitor_links end,
      status = case
        when p.decided_by is not null then p.status
        when p.status = 'filtered' and p.filter_reason = 'blocked' then p.status
        else excluded.status end,
      filter_reason = case
        when p.decided_by is not null then p.filter_reason
        when p.status = 'filtered' and p.filter_reason = 'blocked' then p.filter_reason
        else excluded.filter_reason end,
      shortlist_rank = case when p.decided_by is null then null else p.shortlist_rank end,
      updated_at = now()
    returning p.id, (p.xmax = 0) into pid, ins;
    if ins then
      n_new := n_new + 1;
    end if;
    out := out || jsonb_build_object(it->>'site_key', pid);
  end loop;
  return jsonb_build_object('ids', out, 'new', n_new);
end;
$$;

-- Domain Rank and spam score for the sites a link-gap step found (shared site library).
create or replace function public.dfs_store_site_strength(p_ranks jsonb, p_spam jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.directories d set
    authority_raw = case when p_ranks ? d.rank_target and jsonb_typeof(p_ranks->d.rank_target) = 'number'
      then least(1000, greatest(0, round((p_ranks->>d.rank_target)::numeric)))::smallint else d.authority_raw end,
    authority_status = case when p_ranks ? d.rank_target and jsonb_typeof(p_ranks->d.rank_target) = 'number'
      then 'ok' else coalesce(d.authority_status, 'no_data') end,
    spam_score = case when p_spam ? d.rank_target and jsonb_typeof(p_spam->d.rank_target) = 'number'
      then least(100, greatest(0, round((p_spam->>d.rank_target)::numeric)))::smallint else d.spam_score end,
    authority_source = 'dfs_backlinks',
    authority_checked_at = now()
  where d.rank_target in (select jsonb_object_keys(coalesce(p_ranks, '{}')) union select jsonb_object_keys(coalesce(p_spam, '{}')));
  get diagnostics n = row_count;
  update public.dfs_settings set backlinks_access = 'ok', backlinks_access_checked_at = now() where id;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quota and costs
-- ---------------------------------------------------------------------------

create or replace function public.ai_search_quota(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.dfs_settings%rowtype;
  used integer;
  used_gap integer;
  r public.ai_search_runs%rowtype;
  last_run public.ai_search_runs%rowtype;
begin
  if not private.can_see_client(p_client_id) then
    return null;
  end if;
  select * into s from public.dfs_settings where id;
  select count(*) filter (where kind = 'full'), count(*) filter (where kind = 'competitors') into used, used_gap
    from public.ai_search_runs
    where client_id = p_client_id and status <> 'failed' and created_at >= private.agency_month_start();
  select * into r from public.ai_search_runs where client_id = p_client_id and status in ('queued', 'running') limit 1;
  select * into last_run from public.ai_search_runs where client_id = p_client_id order by created_at desc limit 1;
  return jsonb_build_object(
    'used', used,
    'limit', s.ai_search_runs_per_client_month,
    'gap_used', used_gap,
    'gap_limit', s.ai_gap_runs_per_client_month,
    'gap_max_sites', s.ai_gap_max_sites,
    'gap_min_shared', s.ai_gap_min_shared,
    'max_run_usd', s.ai_search_max_run_usd,
    'max_web_searches', s.ai_search_max_web_searches,
    'web_search_price', s.web_search_price_usd,
    'budget_problem', public.dfs_ai_search_budget_problem(),
    'dfs_budget_problem', private.backlinks_budget_problem(),
    'backlinks_access', s.backlinks_access,
    'dfs_low_balance', s.last_balance_usd is not null and s.last_balance_usd < s.low_balance_usd,
    'standard_running', exists (
      select 1 from public.backlink_runs where client_id = p_client_id and status in ('queued', 'running')),
    'competitors', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'domain', c.domain, 'name', c.name, 'source', c.source,
        'active', c.active, 'evidence', c.evidence) order by c.active desc, c.created_at)
      from public.client_competitors c where c.client_id = p_client_id
    ), '[]'::jsonb),
    'gap_cached_at', (
      select max(g.fetched_at) from public.backlink_gap_cache g
      where g.client_id = p_client_id and g.fetched_at > now() - interval '30 days'
    ),
    'open_run', case when r.id is null then null else jsonb_build_object(
      'id', r.id, 'status', r.status, 'stage', r.stage, 'kind', r.kind, 'counts', r.counts, 'created_at', r.created_at,
      'target_ids', to_jsonb(r.target_ids), 'competitors', to_jsonb(r.competitors),
      'cost_usd', r.cost_usd, 'web_searches', r.web_searches,
      'tasks', (
        select coalesce(jsonb_object_agg(stage::text, jsonb_build_object('total', total, 'done', done)), '{}'::jsonb)
        from (
          select stage, count(*) total, count(*) filter (where status in ('done', 'failed', 'skipped')) done
          from public.ai_search_tasks where run_id = r.id group by stage
        ) t
      )
    ) end,
    'last_run', case when last_run.id is null then null else jsonb_build_object(
      'id', last_run.id, 'status', last_run.status, 'kind', last_run.kind, 'error', last_run.error,
      'counts', last_run.counts, 'created_at', last_run.created_at, 'finished_at', last_run.finished_at
    ) end
  );
end;
$$;

create or replace function public.backlink_run_history(p_client_id uuid, p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  out jsonb;
  month_start timestamptz := private.agency_month_start();
begin
  if not private.can_see_client(p_client_id) then
    return null;
  end if;

  with entries as (
    select
      r.id, r.kind::text as kind, r.status::text as status, r.created_at, r.finished_at,
      r.queries_total, r.counts, r.error, r.target_ids, r.created_by,
      coalesce(g.cost, 0) as google, coalesce(g.calls, 0) as google_calls,
      coalesce(m.cost, 0) as maps, coalesce(m.calls, 0) as maps_calls,
      coalesce(st.cost, 0) as strength, coalesce(st.domains, 0) as strength_domains,
      coalesce(ai.cost, 0) as ai, coalesce(ai.calls, 0) as ai_calls, ai.input_tokens, ai.output_tokens,
      0::bigint as web_searches
    from public.backlink_runs r
    left join lateral (
      select sum(d.cost_usd) cost, count(*) calls from public.dfs_calls d where d.ref = r.id and d.api = 'serp_google'
    ) g on true
    left join lateral (
      select sum(d.cost_usd) cost, count(*) calls from public.dfs_calls d where d.ref = r.id and d.api <> 'serp_google'
    ) m on true
    left join lateral (
      select sum(d.cost_usd) cost, (select sum(s2.domains) from public.backlink_strength_checks s2 where s2.run_id = r.id) domains
      from public.backlink_strength_checks s join public.dfs_calls d on d.ref = s.id
      where s.run_id = r.id
    ) st on true
    left join lateral (
      select sum(a.cost_usd) cost, count(*) calls, sum(a.input_tokens) input_tokens, sum(a.output_tokens) output_tokens
      from public.ai_calls a where a.ref = r.id
    ) ai on true
    where r.client_id = p_client_id
    union all
    select
      s.id, 'strength', s.status::text, s.created_at, s.finished_at,
      null, null, s.error, null, s.created_by,
      0, 0, 0, 0,
      coalesce((select sum(d.cost_usd) from public.dfs_calls d where d.ref = s.id), 0), s.domains,
      0, 0, null, null, 0
    from public.backlink_strength_checks s
    where s.client_id = p_client_id and s.run_id is null
    union all
    select
      a.id, case when a.kind = 'competitors' then 'ai_competitors' else 'ai' end, a.status::text, a.created_at, a.finished_at,
      null, a.counts, a.error, a.target_ids, a.created_by,
      0, 0, 0, 0,
      coalesce(dl.cost, 0), coalesce((a.counts->>'gap_sites')::int, 0),
      coalesce(x.cost, 0), coalesce(x.calls, 0), x.input_tokens, x.output_tokens, coalesce(x.searches, 0)
    from public.ai_search_runs a
    left join lateral (
      select sum(c.cost_usd) cost, count(*) calls, sum(c.input_tokens) input_tokens, sum(c.output_tokens) output_tokens,
        sum(c.web_searches) searches
      from public.ai_calls c where c.ref = a.id
    ) x on true
    left join lateral (
      select sum(d.cost_usd) cost from public.dfs_calls d where d.ref = a.id
    ) dl on true
    where a.client_id = p_client_id
  ),
  priced as (
    select e.*, (e.google + e.maps + e.strength + e.ai) as total from entries e
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'all_time', coalesce(sum(total), 0),
        'this_month', coalesce(sum(total) filter (where created_at >= month_start), 0),
        'last_month', coalesce(sum(total) filter (
          where created_at >= month_start - interval '1 month' and created_at < month_start), 0),
        'runs', count(*) filter (where kind <> 'strength'),
        'runs_this_month', count(*) filter (where kind <> 'strength' and created_at >= month_start),
        'google', coalesce(sum(google), 0),
        'maps', coalesce(sum(maps), 0),
        'strength', coalesce(sum(strength), 0),
        'ai', coalesce(sum(ai), 0)
      )
      from priced
    ),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'status', p.status,
        'created_at', p.created_at, 'finished_at', p.finished_at,
        'searches', p.queries_total, 'counts', p.counts, 'error', p.error,
        'places', (
          select coalesce(jsonb_agg(t.label order by t.created_at), '[]'::jsonb)
          from public.backlink_targets t where t.id = any (p.target_ids)
        ),
        'by', (select tm.full_name from public.team_members tm where tm.id = p.created_by),
        'google', p.google, 'google_calls', p.google_calls,
        'maps', p.maps, 'maps_calls', p.maps_calls,
        'strength', p.strength, 'strength_domains', p.strength_domains,
        'ai', p.ai, 'ai_calls', p.ai_calls, 'ai_input_tokens', p.input_tokens, 'ai_output_tokens', p.output_tokens,
        'web_searches', p.web_searches,
        'total', p.total
      ) order by p.created_at desc)
      from (select * from priced order by created_at desc limit greatest(1, least(coalesce(p_limit, 100), 500))) p
    ), '[]'::jsonb)
  ) into out;
  return out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function private.competitor_platform(text) from public, anon;
revoke execute on function private.client_domains(uuid) from public, anon;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.save_client_competitors(uuid, jsonb)',
    'public.request_ai_search(uuid, uuid[], jsonb, integer, numeric, text, text[])',
    'public.request_ai_search(uuid, uuid[], jsonb, integer, numeric)',
    'public.ai_search_quota(uuid)',
    'public.backlink_run_history(uuid, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.dfs_save_found_competitors(uuid, jsonb, text)',
    'public.dfs_store_ai_prospects(uuid, jsonb)',
    'public.dfs_store_site_strength(jsonb, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
