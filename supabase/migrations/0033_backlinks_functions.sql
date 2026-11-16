-- 0033_backlinks_functions: the logic behind Backlinks.
--   * team RPCs (admins, managers, VAs who can see the client): Find places, review places,
--     Check site strength; admins and managers also edit, block and unblock sites
--   * job RPCs (service role only): claim a search, store found places once, store strength
--   * backlink_quota(): what the buttons need to know (no amounts)
-- Spend: every request checks the shared DataForSEO budget and the Backlinks sub-budget.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function private.agency_month_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', now() at time zone 'America/Phoenix') at time zone 'America/Phoenix'
$$;

-- This month's DataForSEO spend on Backlinks (searches and strength checks).
create or replace function private.backlinks_month_spend()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(c.cost_usd), 0)
  from public.dfs_calls c
  where c.created_at >= private.agency_month_start()
    and c.ref is not null
    and (
      exists (select 1 from public.backlink_runs r where r.id = c.ref)
      or exists (select 1 from public.backlink_strength_checks s where s.id = c.ref)
    )
$$;

-- Null when spending is allowed, else the reason.
create or replace function private.backlinks_budget_problem()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.dfs_settings%rowtype;
begin
  select * into s from public.dfs_settings where id;
  if private.dfs_month_spend() >= s.monthly_budget_usd then
    return 'This month''s DataForSEO budget is used up. An admin can raise it in Rankings settings.';
  end if;
  if private.backlinks_month_spend() >= s.backlinks_budget_usd then
    return 'This month''s Backlinks budget is used up. An admin can raise it.';
  end if;
  return null;
end;
$$;

create or replace function private.require_backlinks_worker(p_client_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_role('{admin,manager,va}') or not private.can_see_client(p_client_id) then
    raise exception 'Only admins, account managers and VAs working on this client can do this.'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function private.require_backlinks_manager()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_role('{admin,manager}') then
    raise exception 'Only admins and account managers can change sites in the library.' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.log_backlinks(p_client_id uuid, p_action text, p_meta jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_log (actor_id, client_id, action, meta)
  values ((select auth.uid()), p_client_id, p_action, coalesce(p_meta, '{}'))
$$;

-- ---------------------------------------------------------------------------
-- Find places
-- ---------------------------------------------------------------------------

create or replace function public.request_backlink_discovery(p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  rid uuid;
  last_at timestamptz;
  lim integer;
  used integer;
  problem text;
begin
  perform private.require_backlinks_worker(p_client_id);
  select id, stage, city into c from public.clients where id = p_client_id;
  if not found then
    raise exception 'Client not found.' using errcode = 'P0002';
  end if;
  if c.stage in ('paused', 'churned') then
    raise exception 'This client is paused or has left. Searches are off.' using errcode = 'P0001';
  end if;
  if coalesce(trim(c.city), '') = '' then
    raise exception 'Add the client''s city in Edit details first.' using errcode = 'P0001';
  end if;

  -- A second click returns the search that is already open.
  select id into rid from public.backlink_runs
    where client_id = p_client_id and status in ('queued', 'running');
  if rid is not null then
    return rid;
  end if;

  select max(created_at) into last_at from public.backlink_runs
    where client_id = p_client_id and status <> 'failed';
  if last_at > now() - interval '24 hours' then
    raise exception 'This client was searched in the last 24 hours. Try again after %.',
      to_char((last_at + interval '24 hours') at time zone 'America/Phoenix', 'Dy FMDD Mon, FMHH12:MI AM')
      using errcode = 'P0001';
  end if;

  select backlink_runs_per_client_month into lim from public.dfs_settings where id;
  select count(*) into used from public.backlink_runs
    where client_id = p_client_id and status <> 'failed' and created_at >= private.agency_month_start();
  if used >= lim then
    raise exception 'This client has used its % searches this month. An admin can raise the limit.', lim
      using errcode = 'P0001';
  end if;

  problem := private.backlinks_budget_problem();
  if problem is not null then
    raise exception '%', problem using errcode = 'P0001';
  end if;

  begin
    insert into public.backlink_runs (client_id, created_by)
    values (p_client_id, (select auth.uid()))
    returning id into rid;
  exception when unique_violation then
    select id into rid from public.backlink_runs
      where client_id = p_client_id and status in ('queued', 'running');
  end;
  return rid;
end;
$$;

-- Claims a queued search, or resumes one whose worker stopped (3 attempts max).
create or replace function public.dfs_claim_backlink_run()
returns setof public.backlink_runs
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.backlink_runs
    set status = 'failed', finished_at = now(), error = 'Stopped responding three times.'
    where status = 'running' and heartbeat_at < now() - interval '10 minutes' and attempts >= 3;
  return query
  update public.backlink_runs
    set status = 'running', attempts = attempts + 1, started_at = coalesce(started_at, now()), heartbeat_at = now()
    where id = (
      select id from public.backlink_runs
      where status = 'queued' or (status = 'running' and heartbeat_at < now() - interval '10 minutes')
      order by created_at limit 1 for update skip locked
    )
    returning *;
end;
$$;

-- Stores the places one search found. Safe to run twice: directories and places are matched
-- by key, hits are unique per (place, search), and a place a person approved, rejected or
-- restored keeps its status. Returns {"new": n, "known": n}.
create or replace function public.dfs_store_backlink_candidates(p_run_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.backlink_runs%rowtype;
  it jsonb;
  dir record;
  opp record;
  st public.opportunity_status;
  reason text;
  n_new integer := 0;
  n_known integer := 0;
begin
  select * into run from public.backlink_runs where id = p_run_id;
  if run.id is null then
    raise exception 'Unknown search %', p_run_id using errcode = 'P0002';
  end if;

  for it in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into public.directories (site_key, domain, rank_target, name, type, geo_scope, country_code, region, city, industries)
    values (
      it->>'site_key', it->>'domain', coalesce(it->>'rank_target', it->>'site_key'),
      left(coalesce(nullif(it->>'name', ''), it->>'site_key'), 200),
      coalesce((it->>'type')::public.directory_type, 'other'),
      coalesce(it->>'geo_scope', 'unknown'), it->>'country_code', it->>'region', it->>'city',
      coalesce(array(select jsonb_array_elements_text(it->'industries')), '{}')
    )
    on conflict (site_key) do update set
      last_seen_at = now(),
      type = case
        when public.directories.type_source = 'auto' and public.directories.type = 'other' then excluded.type
        else public.directories.type end,
      industries = array(select distinct x from unnest(public.directories.industries || excluded.industries) x limit 30)
    returning id, status, is_core into dir;

    st := coalesce((it->>'status')::public.opportunity_status, 'pending_review');
    reason := case when st = 'filtered' then coalesce(it->>'filter_reason', 'looks_like_business') end;
    if st not in ('pending_review', 'filtered') then
      st := 'pending_review';
      reason := null;
    end if;
    -- Blocked here or at the root domain (core listings excepted).
    if dir.status = 'blocked' or (not dir.is_core and exists (
      select 1 from public.directories b
      where b.site_key = it->>'domain' and b.status = 'blocked' and b.id <> dir.id
    )) then
      st := 'filtered';
      reason := 'blocked';
    end if;

    insert into public.backlink_opportunities as o (
      client_id, directory_id, status, filter_reason, is_core, found_url, found_title, found_snippet,
      best_position, is_local, relevance, first_run_id, last_run_id
    )
    values (
      run.client_id, dir.id, st, reason, coalesce((it->>'is_core')::boolean, false),
      case when it->>'found_url' ~ '^https?://' then left(it->>'found_url', 2000) end,
      left(it->>'found_title', 300), left(it->>'found_snippet', 600),
      (it->>'best_position')::smallint, coalesce((it->>'is_local')::boolean, false),
      least(1, greatest(0, coalesce((it->>'relevance')::numeric, 0))), run.id, run.id
    )
    on conflict (client_id, directory_id) do update set
      last_run_id = excluded.last_run_id,
      is_core = o.is_core or excluded.is_core,
      is_local = o.is_local or excluded.is_local,
      found_url = case when o.found_url is null or excluded.best_position < coalesce(o.best_position, 32767)
        then coalesce(excluded.found_url, o.found_url) else o.found_url end,
      found_title = case when o.found_title is null or excluded.best_position < coalesce(o.best_position, 32767)
        then coalesce(excluded.found_title, o.found_title) else o.found_title end,
      found_snippet = case when o.found_snippet is null or excluded.best_position < coalesce(o.best_position, 32767)
        then coalesce(excluded.found_snippet, o.found_snippet) else o.found_snippet end,
      best_position = least(o.best_position, excluded.best_position),
      relevance = greatest(o.relevance, excluded.relevance),
      -- Only rows nobody decided: a hidden place becomes visible when found for a good reason.
      status = case
        when o.decided_by is null and o.status = 'filtered' and o.filter_reason <> 'blocked'
          and excluded.status = 'pending_review' then 'pending_review'::public.opportunity_status
        when o.decided_by is null and o.status = 'pending_review' and excluded.filter_reason = 'blocked'
          then 'filtered'::public.opportunity_status
        else o.status end,
      filter_reason = case
        when o.decided_by is null and o.status = 'filtered' and o.filter_reason <> 'blocked'
          and excluded.status = 'pending_review' then null
        when o.decided_by is null and o.status = 'pending_review' and excluded.filter_reason = 'blocked'
          then 'blocked'
        else o.filter_reason end,
      updated_at = now()
    returning o.id, (o.xmax = 0) as inserted into opp;

    if opp.inserted then n_new := n_new + 1; else n_known := n_known + 1; end if;

    insert into public.backlink_opportunity_hits (opportunity_id, client_id, query_id, footprint_id, query, position, url)
    select opp.id, run.client_id, (h->>'query_id')::uuid, nullif(h->>'footprint_id', '')::uuid,
      left(h->>'query', 700), (h->>'position')::smallint,
      case when h->>'url' ~ '^https?://' then left(h->>'url', 2000) end
    from jsonb_array_elements(coalesce(it->'hits', '[]'::jsonb)) h
    where exists (
      select 1 from public.backlink_run_queries q
      where q.id = (h->>'query_id')::uuid and q.client_id = run.client_id
    )
    on conflict (opportunity_id, query_id) do nothing;
  end loop;

  return jsonb_build_object('new', n_new, 'known', n_known);
end;
$$;

-- ---------------------------------------------------------------------------
-- Review
-- ---------------------------------------------------------------------------

-- p_decision: approve, reject (needs a reason) or restore (back to Pending review).
create or replace function public.review_backlink_opportunities(
  p_ids uuid[], p_decision text, p_reason public.backlink_reject_reason default null, p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[] := array(select distinct x from unnest(coalesce(p_ids, '{}')) x);
  cid uuid;
  n_found integer;
  changed integer;
  total integer := 0;
  sites text[];
begin
  if p_decision not in ('approve', 'reject', 'restore') then
    raise exception 'Unknown decision.' using errcode = '22023';
  end if;
  if cardinality(ids) = 0 then
    return 0;
  end if;
  if cardinality(ids) > 500 then
    raise exception 'Review at most 500 places at a time.' using errcode = '22023';
  end if;
  if p_decision = 'reject' and p_reason is null then
    raise exception 'Pick a reason for rejecting.' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'Keep the note under 500 characters.' using errcode = '22023';
  end if;

  select count(*) into n_found from public.backlink_opportunities where id = any(ids);
  if n_found <> cardinality(ids) then
    raise exception 'Some of these places no longer exist. Reload the page.' using errcode = 'P0002';
  end if;
  -- Every client the ids belong to, checked before anything changes.
  for cid in select distinct client_id from public.backlink_opportunities where id = any(ids) loop
    perform private.require_backlinks_worker(cid);
  end loop;

  for cid in select distinct client_id from public.backlink_opportunities where id = any(ids) loop
    with changed_rows as (
      update public.backlink_opportunities o set
        status = case p_decision
          when 'approve' then 'approved'::public.opportunity_status
          when 'reject' then 'rejected'::public.opportunity_status
          else 'pending_review'::public.opportunity_status end,
        filter_reason = null,
        reject_reason = case when p_decision = 'reject' then p_reason end,
        reject_note = case when p_decision = 'reject' then nullif(trim(p_note), '') end,
        decided_by = (select auth.uid()),
        decided_at = now(),
        updated_at = now()
      where o.id = any(ids) and o.client_id = cid
        and case p_decision
          when 'approve' then o.status <> 'approved'
          when 'reject' then o.status <> 'rejected'
          else o.status <> 'pending_review' end
        -- A place on a blocked site stays hidden until the site is unblocked.
        and not (o.status = 'filtered' and o.filter_reason = 'blocked')
      returning o.directory_id
    )
    select count(*), array(select d.name from changed_rows r join public.directories d on d.id = r.directory_id limit 10)
      into changed, sites from changed_rows;
    if changed > 0 then
      perform private.log_backlinks(cid, 'backlink.reviewed', jsonb_build_object(
        'decision', p_decision, 'count', changed, 'sites', to_jsonb(sites),
        'reason', case when p_decision = 'reject' then p_reason end
      ));
    end if;
    total := total + changed;
  end loop;
  return total;
end;
$$;

-- ---------------------------------------------------------------------------
-- The library (admins, managers)
-- ---------------------------------------------------------------------------

create or replace function public.set_directory(
  p_id uuid, p_type public.directory_type, p_submit_url text, p_cost_type text, p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_backlinks_manager();
  if nullif(trim(p_submit_url), '') is not null and trim(p_submit_url) !~ '^https?://' then
    raise exception 'The sign-up link must start with http:// or https://.' using errcode = '22023';
  end if;
  if p_cost_type not in ('free', 'paid', 'unknown') then
    raise exception 'Unknown cost.' using errcode = '22023';
  end if;
  update public.directories set
    type = p_type,
    type_source = case when type is distinct from p_type then 'manual' else type_source end,
    submit_url = nullif(trim(p_submit_url), ''),
    cost_type = p_cost_type,
    notes = nullif(trim(p_notes), ''),
    updated_by = (select auth.uid()),
    updated_at = now()
  where id = p_id;
  if not found then
    raise exception 'Site not found.' using errcode = 'P0002';
  end if;
end;
$$;

-- Hides the site for every client: undecided and pending places move to Hidden ("blocked").
create or replace function public.block_directory(p_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  site text;
begin
  perform private.require_backlinks_manager();
  if coalesce(trim(p_reason), '') = '' or char_length(p_reason) > 300 then
    raise exception 'Say why in up to 300 characters.' using errcode = '22023';
  end if;
  update public.directories set
    status = 'blocked', blocked_reason = trim(p_reason), blocked_by = (select auth.uid()), blocked_at = now(),
    updated_by = (select auth.uid()), updated_at = now()
  where id = p_id and status = 'active'
  returning name into site;
  if site is null then
    raise exception 'Site not found or already blocked.' using errcode = 'P0002';
  end if;
  update public.backlink_opportunities
    set status = 'filtered', filter_reason = 'blocked', updated_at = now()
    where directory_id = p_id and status in ('pending_review', 'filtered');
  get diagnostics n = row_count;
  perform private.log_backlinks(null, 'backlink.directory_blocked',
    jsonb_build_object('site', site, 'reason', trim(p_reason), 'places', n));
  return n;
end;
$$;

create or replace function public.unblock_directory(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  site text;
begin
  perform private.require_backlinks_manager();
  update public.directories set
    status = 'active', blocked_reason = null, blocked_by = null, blocked_at = null,
    updated_by = (select auth.uid()), updated_at = now()
  where id = p_id and status = 'blocked'
  returning name into site;
  if site is null then
    raise exception 'Site not found or not blocked.' using errcode = 'P0002';
  end if;
  update public.backlink_opportunities
    set status = 'pending_review', filter_reason = null, updated_at = now()
    where directory_id = p_id and status = 'filtered' and filter_reason = 'blocked';
  get diagnostics n = row_count;
  perform private.log_backlinks(null, 'backlink.directory_unblocked', jsonb_build_object('site', site, 'places', n));
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Site strength
-- ---------------------------------------------------------------------------

-- Returns {"check_id": uuid|null, "targets": [...]}: the sites never checked or checked more
-- than 30 days ago (every site with p_force, managers only). No check when there is nothing to do.
create or replace function public.request_strength_check(
  p_client_id uuid, p_ids uuid[] default null, p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t text[];
  cid uuid;
  problem text;
begin
  perform private.require_backlinks_worker(p_client_id);
  if p_force and not private.has_role('{admin,manager}') then
    raise exception 'Only admins and account managers can re-check sites checked in the last 30 days.'
      using errcode = '42501';
  end if;
  if (select backlinks_access from public.dfs_settings where id) = 'denied' then
    raise exception 'Backlinks API access isn''t active on the DataForSEO account. An admin can turn it on in DataForSEO.'
      using errcode = 'P0001';
  end if;

  update public.backlink_strength_checks
    set status = 'failed', error = 'Did not finish.', finished_at = now()
    where client_id = p_client_id and status = 'running' and created_at < now() - interval '10 minutes';
  if exists (select 1 from public.backlink_strength_checks where client_id = p_client_id and status = 'running') then
    raise exception 'A strength check is already running for this client.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.backlink_strength_checks
    where client_id = p_client_id and created_at > now() - interval '1 minute'
  ) then
    raise exception 'Sites were just checked. Wait a minute and try again.' using errcode = 'P0001';
  end if;

  problem := private.backlinks_budget_problem();
  if problem is not null then
    raise exception '%', problem using errcode = 'P0001';
  end if;

  t := array(
    select distinct d.rank_target
    from public.backlink_opportunities o
    join public.directories d on d.id = o.directory_id
    where o.client_id = p_client_id
      and d.status = 'active'
      and (
        (p_ids is null and o.status in ('pending_review', 'approved'))
        or (p_ids is not null and o.id = any(p_ids))
      )
      and (p_force or d.authority_checked_at is null or d.authority_checked_at < now() - interval '30 days')
    limit 1000
  );
  if cardinality(t) = 0 then
    return jsonb_build_object('check_id', null, 'targets', '[]'::jsonb);
  end if;

  begin
    insert into public.backlink_strength_checks (client_id, targets, domains, forced, created_by)
    values (p_client_id, t, cardinality(t), p_force, (select auth.uid()))
    returning id into cid;
  exception when unique_violation then
    raise exception 'A strength check is already running for this client.' using errcode = 'P0001';
  end;
  return jsonb_build_object('check_id', cid, 'targets', to_jsonb(t));
end;
$$;

-- p_ranks / p_spam: {"yelp.com": 694, ...}. Targets missing from p_ranks get "no data".
create or replace function public.dfs_store_strength(
  p_check_id uuid, p_ranks jsonb, p_spam jsonb, p_cost numeric default 0, p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  chk public.backlink_strength_checks%rowtype;
begin
  select * into chk from public.backlink_strength_checks where id = p_check_id for update;
  if chk.id is null or chk.status <> 'running' then
    return;
  end if;
  if p_error is not null then
    update public.backlink_strength_checks
      set status = 'failed', error = left(p_error, 500), cost_usd = coalesce(p_cost, 0), finished_at = now()
      where id = p_check_id;
    return;
  end if;

  update public.directories d set
    authority_raw = case when p_ranks ? d.rank_target and jsonb_typeof(p_ranks->d.rank_target) = 'number'
      then least(1000, greatest(0, round((p_ranks->>d.rank_target)::numeric)))::smallint end,
    authority_status = case when p_ranks ? d.rank_target and jsonb_typeof(p_ranks->d.rank_target) = 'number'
      then 'ok' else 'no_data' end,
    spam_score = case when p_spam ? d.rank_target and jsonb_typeof(p_spam->d.rank_target) = 'number'
      then least(100, greatest(0, round((p_spam->>d.rank_target)::numeric)))::smallint else d.spam_score end,
    authority_source = 'dfs_backlinks',
    authority_checked_at = now()
  where d.rank_target = any(chk.targets);

  update public.backlink_strength_checks
    set status = 'done', cost_usd = coalesce(p_cost, 0), finished_at = now()
    where id = p_check_id;
  update public.dfs_settings set backlinks_access = 'ok', backlinks_access_checked_at = now() where id;
  insert into public.activity_log (actor_id, client_id, action, meta)
  values (chk.created_by, chk.client_id, 'backlink.strength_checked',
    jsonb_build_object('count', chk.domains, 'cost', round(coalesce(p_cost, 0), 2)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

-- What the Backlinks buttons need (no amounts): searches used / allowed, the open search,
-- when the next search is allowed, budget and API access.
create or replace function public.backlink_quota(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.dfs_settings%rowtype;
  used integer;
  last_at timestamptz;
  open_run public.backlink_runs%rowtype;
begin
  if not private.can_see_client(p_client_id) then
    return null;
  end if;
  select * into s from public.dfs_settings where id;
  select count(*) into used from public.backlink_runs
    where client_id = p_client_id and status <> 'failed' and created_at >= private.agency_month_start();
  select max(created_at) into last_at from public.backlink_runs
    where client_id = p_client_id and status <> 'failed';
  select * into open_run from public.backlink_runs
    where client_id = p_client_id and status in ('queued', 'running') limit 1;
  return jsonb_build_object(
    'used', used,
    'limit', s.backlink_runs_per_client_month,
    'next_search_at', case when last_at > now() - interval '24 hours' then last_at + interval '24 hours' end,
    'budget_problem', private.backlinks_budget_problem(),
    'access', s.backlinks_access,
    'open_run', case when open_run.id is null then null else jsonb_build_object(
      'id', open_run.id, 'status', open_run.status,
      'queries_done', open_run.queries_done, 'queries_total', open_run.queries_total
    ) end,
    'strength_running', exists (
      select 1 from public.backlink_strength_checks
      where client_id = p_client_id and status = 'running' and created_at > now() - interval '10 minutes'
    )
  );
end;
$$;

-- For the search job (service role): null when it may keep spending.
create or replace function public.dfs_backlinks_budget_problem()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.backlinks_budget_problem()
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function private.agency_month_start() from public, anon;
revoke execute on function private.backlinks_month_spend() from public, anon;
revoke execute on function private.backlinks_budget_problem() from public, anon;
revoke execute on function private.require_backlinks_worker(uuid) from public, anon;
revoke execute on function private.require_backlinks_manager() from public, anon;
revoke execute on function private.log_backlinks(uuid, text, jsonb) from public, anon;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.request_backlink_discovery(uuid)',
    'public.review_backlink_opportunities(uuid[], text, public.backlink_reject_reason, text)',
    'public.set_directory(uuid, public.directory_type, text, text, text)',
    'public.block_directory(uuid, text)',
    'public.unblock_directory(uuid)',
    'public.request_strength_check(uuid, uuid[], boolean)',
    'public.backlink_quota(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.dfs_claim_backlink_run()',
    'public.dfs_store_backlink_candidates(uuid, jsonb)',
    'public.dfs_store_strength(uuid, jsonb, jsonb, numeric, text)',
    'public.dfs_backlinks_budget_problem()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
