-- 0026_rankings_functions: the logic behind Rankings.
--   * keywords: normalized, 1–80 chars / 10 words, at most clients.keywords_target active
--   * team RPCs (admins, managers): add / archive / replace keywords, track / dismiss /
--     restore candidates, settings, "check now", "run research"
--   * job RPCs (service role only): queue due runs, claim runs, store a result once,
--     fail a task, finalize runs (summary, status, history, alerts), claim research runs
--   * client_visibility(): only full checks, compared like for like

-- ---------------------------------------------------------------------------
-- Keywords: shape and limit
-- ---------------------------------------------------------------------------

create or replace function private.keywords_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lim integer;
  active integer;
begin
  new.phrase := private.normalize_keyword(new.phrase);
  if char_length(new.phrase) = 0 or char_length(new.phrase) > 80 then
    raise exception 'A keyword has 1 to 80 characters.' using errcode = 'P0001';
  end if;
  if cardinality(string_to_array(new.phrase, ' ')) > 10 then
    raise exception 'A keyword has 10 words or fewer.' using errcode = 'P0001';
  end if;
  if new.archived_at is null and new.tracked
     and (tg_op = 'INSERT' or old.archived_at is not null or not old.tracked) then
    select keywords_target into lim from public.clients where id = new.client_id for update;
    select count(*) into active from public.keywords
      where client_id = new.client_id and archived_at is null and tracked and id <> new.id;
    if active >= lim then
      raise exception 'This client tracks % keywords. Raise the limit in Edit details or replace one.', lim
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger keywords_before_write
  before insert or update on public.keywords
  for each row execute function private.keywords_before_write();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function private.require_rankings_manager(p_client_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_role('{admin,manager}') or not private.can_see_client(p_client_id) then
    raise exception 'Only admins and account managers can change rankings.' using errcode = '42501';
  end if;
end;
$$;

-- Next check: the given weekday at 09:00 UTC (02:00 in Phoenix), after p_from.
create or replace function private.next_rank_run_at(p_weekday smallint, p_from timestamptz default now())
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (d + interval '9 hours') at time zone 'UTC'
  from generate_series(date_trunc('day', p_from at time zone 'UTC'), date_trunc('day', p_from at time zone 'UTC') + interval '8 days', interval '1 day') g(d)
  where extract(dow from d) = p_weekday and (d + interval '9 hours') at time zone 'UTC' > p_from
  order by d
  limit 1
$$;

create or replace function private.dfs_month_spend()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(cost_usd), 0)
  from public.dfs_calls
  where created_at >= (date_trunc('month', now() at time zone 'America/Phoenix') at time zone 'America/Phoenix')
$$;

create or replace function private.log_rankings(p_client_id uuid, p_action text, p_meta jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_log (actor_id, client_id, action, meta)
  values ((select auth.uid()), p_client_id, p_action, coalesce(p_meta, '{}'))
$$;

create or replace function private.queue_partial_run(p_client_id uuid, p_keyword_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid;
begin
  if coalesce(cardinality(p_keyword_ids), 0) = 0 then
    return null;
  end if;
  insert into public.rank_runs (client_id, trigger, scope, status, keyword_ids, keywords_count, created_by)
  values (p_client_id, 'new_keywords', 'partial', 'queued', p_keyword_ids, cardinality(p_keyword_ids), (select auth.uid()))
  returning id into rid;
  return rid;
end;
$$;

-- Adds one keyword (or brings back an archived one, keeping its history). Returns its id.
create or replace function private.track_phrase(
  p_client_id uuid, p_phrase text, p_source public.keyword_source, p_topic text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  norm text := private.normalize_keyword(p_phrase);
  kid uuid;
begin
  select id into kid from public.keywords
    where client_id = p_client_id and private.normalize_keyword(phrase) = norm and archived_at is null;
  if found then
    return null; -- already tracked
  end if;
  select id into kid from public.keywords
    where client_id = p_client_id and private.normalize_keyword(phrase) = norm
    order by archived_at desc nulls last limit 1;
  if found then
    update public.keywords
      set archived_at = null, archived_reason = null, archived_by = null, replaced_by = null,
          tracked = true, topic = coalesce(p_topic, topic)
      where id = kid;
  else
    insert into public.keywords (client_id, phrase, source, topic, created_by)
    values (p_client_id, norm, p_source, p_topic, (select auth.uid()))
    returning id into kid;
  end if;
  update public.keyword_candidates
    set status = 'tracked', decided_by = (select auth.uid()), decided_at = now(), updated_at = now()
    where client_id = p_client_id and keyword_norm = norm;
  return kid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Team RPCs
-- ---------------------------------------------------------------------------

create or replace function public.add_keywords(
  p_client_id uuid, p_phrases text[], p_source public.keyword_source default 'manual', p_topic text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p text;
  kid uuid;
  added uuid[] := '{}';
  added_phrases text[] := '{}';
  skipped text[] := '{}';
  rid uuid;
begin
  perform private.require_rankings_manager(p_client_id);
  if coalesce(cardinality(p_phrases), 0) = 0 then
    raise exception 'Add at least one keyword.' using errcode = 'P0001';
  end if;
  if cardinality(p_phrases) > 100 then
    raise exception 'Add 100 keywords or fewer at a time.' using errcode = 'P0001';
  end if;
  for p in select distinct private.normalize_keyword(x) from unnest(p_phrases) x
           where private.normalize_keyword(x) <> '' loop
    kid := private.track_phrase(p_client_id, p, p_source, p_topic);
    if kid is null then
      skipped := skipped || p;
    else
      added := added || kid;
      added_phrases := added_phrases || p;
    end if;
  end loop;
  if cardinality(added) > 0 then
    perform private.log_rankings(p_client_id, 'keyword.added',
      jsonb_build_object('count', cardinality(added), 'phrases', to_jsonb(added_phrases[1:20])));
    rid := private.queue_partial_run(p_client_id, added);
  end if;
  return jsonb_build_object('added', to_jsonb(added), 'skipped', to_jsonb(skipped), 'run_id', rid);
end;
$$;

create or replace function public.archive_keyword(p_keyword_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k record;
begin
  select id, client_id, phrase, archived_at into k from public.keywords where id = p_keyword_id;
  if not found then
    raise exception 'That keyword doesn''t exist.' using errcode = 'P0001';
  end if;
  perform private.require_rankings_manager(k.client_id);
  if k.archived_at is not null then
    return;
  end if;
  update public.keywords
    set archived_at = now(), archived_by = (select auth.uid()),
        archived_reason = left(coalesce(nullif(btrim(p_reason), ''), 'Stopped tracking'), 300)
    where id = p_keyword_id;
  update public.keyword_candidates set status = 'new', updated_at = now()
    where client_id = k.client_id and keyword_norm = k.phrase and status = 'tracked';
  perform private.log_rankings(k.client_id, 'keyword.removed',
    jsonb_build_object('phrase', k.phrase, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end;
$$;

create or replace function public.replace_keyword(p_keyword_id uuid, p_new_phrase text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k record;
  norm text := private.normalize_keyword(p_new_phrase);
  cand_topic text;
  has_cand boolean;
  new_id uuid;
  rid uuid;
begin
  select id, client_id, phrase, archived_at into k from public.keywords where id = p_keyword_id;
  if not found or k.archived_at is not null then
    raise exception 'That keyword isn''t being tracked.' using errcode = 'P0001';
  end if;
  perform private.require_rankings_manager(k.client_id);
  if norm = '' or norm = k.phrase then
    raise exception 'Pick a different keyword.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.keywords where client_id = k.client_id and phrase = norm and archived_at is null) then
    raise exception '“%” is already tracked.', norm using errcode = 'P0001';
  end if;

  update public.keywords
    set archived_at = now(), archived_by = (select auth.uid()),
        archived_reason = left('Replaced by “' || norm || '”', 300)
    where id = p_keyword_id;

  select topic into cand_topic from public.keyword_candidates where client_id = k.client_id and keyword_norm = norm;
  has_cand := found;
  new_id := private.track_phrase(
    k.client_id, norm,
    case when has_cand then 'research'::public.keyword_source else 'manual'::public.keyword_source end,
    cand_topic
  );
  update public.keywords set replaced_by = new_id where id = p_keyword_id;
  update public.keyword_candidates
    set status = 'dismissed', dismiss_reason = left('Replaced by “' || norm || '”', 300),
        decided_by = (select auth.uid()), decided_at = now(), updated_at = now()
    where client_id = k.client_id and keyword_norm = k.phrase;

  perform private.log_rankings(k.client_id, 'keyword.replaced',
    jsonb_build_object('from', k.phrase, 'to', norm));
  rid := private.queue_partial_run(k.client_id, array[new_id]);
  return jsonb_build_object('keyword_id', new_id, 'run_id', rid);
end;
$$;

create or replace function public.track_candidate(p_client_id uuid, p_keyword_norm text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  perform private.require_rankings_manager(p_client_id);
  select phrase, topic into c from public.keyword_candidates
    where client_id = p_client_id and keyword_norm = p_keyword_norm;
  if not found then
    raise exception 'That suggestion isn''t there any more.' using errcode = 'P0001';
  end if;
  return public.add_keywords(p_client_id, array[c.phrase], 'research', c.topic);
end;
$$;

create or replace function public.set_candidate_status(
  p_client_id uuid, p_keyword_norm text, p_dismiss boolean, p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_rankings_manager(p_client_id);
  update public.keyword_candidates
    set status = case when p_dismiss then 'dismissed'::public.candidate_status else 'new'::public.candidate_status end,
        dismiss_reason = case when p_dismiss then left(nullif(btrim(coalesce(p_reason, '')), ''), 300) end,
        decided_by = (select auth.uid()), decided_at = now(), updated_at = now()
    where client_id = p_client_id and keyword_norm = p_keyword_norm and status <> 'tracked';
end;
$$;

create or replace function public.update_rank_settings(p_client_id uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.rank_settings%rowtype;
  loc record;
  fields text[] := '{}';
begin
  perform private.require_rankings_manager(p_client_id);
  insert into public.rank_settings (client_id, check_weekday)
  values (p_client_id, (abs(hashtext(p_client_id::text)) % 7)::smallint)
  on conflict (client_id) do nothing;
  select * into s from public.rank_settings where client_id = p_client_id for update;

  if p_data ? 'location_code' then
    select code, name into loc from public.dfs_locations
      where source = 'google' and code = (p_data->>'location_code')::integer;
    if not found then
      raise exception 'Pick a location from the list.' using errcode = 'P0001';
    end if;
    s.location_code := loc.code;
    s.location_name := loc.name;
    fields := array_append(fields, 'location');
  end if;
  if p_data ? 'bing_location_code' then
    s.bing_location_code := nullif(p_data->>'bing_location_code', '')::integer;
    fields := array_append(fields, 'bing location');
  end if;
  if p_data ? 'country_location_code' then
    s.country_location_code := nullif(p_data->>'country_location_code', '')::integer;
  end if;
  if p_data ? 'language_code' then
    s.language_code := p_data->>'language_code';
    fields := array_append(fields, 'language');
  end if;
  if p_data ? 'engines' then
    s.engines := array(select jsonb_array_elements_text(p_data->'engines'))::public.rank_engine[];
    fields := array_append(fields, 'engines');
  end if;
  if p_data ? 'check_weekday' then
    s.check_weekday := (p_data->>'check_weekday')::smallint;
    fields := array_append(fields, 'check day');
  end if;
  if p_data ? 'paused' then
    s.paused := (p_data->>'paused')::boolean;
    fields := array_append(fields, case when s.paused then 'paused' else 'resumed' end);
  end if;
  if p_data ? 'topic_terms' then
    s.topic_terms := array(select private.normalize_keyword(x) from jsonb_array_elements_text(p_data->'topic_terms') x
                           where private.normalize_keyword(x) <> '');
    fields := array_append(fields, 'topic terms');
  end if;
  if p_data ? 'negative_terms' then
    s.negative_terms := array(select private.normalize_keyword(x) from jsonb_array_elements_text(p_data->'negative_terms') x
                              where private.normalize_keyword(x) <> '');
    fields := array_append(fields, 'excluded terms');
  end if;
  if p_data ? 'maps_place_id' then
    s.maps_place_id := nullif(p_data->>'maps_place_id', '');
    s.maps_cid := nullif(p_data->>'maps_cid', '');
    s.maps_name := nullif(p_data->>'maps_name', '');
    fields := array_append(fields, 'Maps business');
  end if;

  if s.location_code is not null and not s.paused
     and (s.next_run_at is null or p_data ? 'check_weekday' or p_data ? 'paused') then
    s.next_run_at := private.next_rank_run_at(s.check_weekday);
  end if;

  update public.rank_settings
    set location_code = s.location_code, location_name = s.location_name,
        country_location_code = s.country_location_code, bing_location_code = s.bing_location_code,
        language_code = s.language_code, engines = s.engines, check_weekday = s.check_weekday,
        paused = s.paused, topic_terms = s.topic_terms, negative_terms = s.negative_terms,
        maps_place_id = s.maps_place_id, maps_cid = s.maps_cid, maps_name = s.maps_name,
        next_run_at = s.next_run_at, updated_by = (select auth.uid()), updated_at = now()
    where client_id = p_client_id;

  if cardinality(fields) > 0 then
    perform private.log_rankings(p_client_id, 'rankings.settings_changed', jsonb_build_object('fields', to_jsonb(fields)));
  end if;
end;
$$;

create or replace function public.request_rank_check(p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  last_manual timestamptz;
  rid uuid;
begin
  perform private.require_rankings_manager(p_client_id);
  select location_code, paused into s from public.rank_settings where client_id = p_client_id;
  if not found or s.location_code is null then
    raise exception 'Pick the client''s location in Rankings settings first.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.keywords where client_id = p_client_id and archived_at is null and tracked) then
    raise exception 'Add keywords to check first.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.rank_runs where client_id = p_client_id and scope = 'full' and status in ('queued', 'running')) then
    raise exception 'A check is already running.' using errcode = 'P0001';
  end if;
  select max(created_at) into last_manual from public.rank_runs
    where client_id = p_client_id and trigger = 'manual' and scope = 'full';
  if last_manual > now() - interval '24 hours' then
    raise exception 'Rankings can be checked by hand once a day. Try again after %.',
      to_char((last_manual + interval '24 hours') at time zone 'America/Phoenix', 'Dy HH12:MI AM')
      using errcode = 'P0001';
  end if;
  if private.dfs_month_spend() >= (select monthly_budget_usd from public.dfs_settings) then
    raise exception 'This month''s DataForSEO budget is used up. An admin can raise it in Rankings settings.' using errcode = 'P0001';
  end if;
  insert into public.rank_runs (client_id, trigger, scope, status, created_by)
  values (p_client_id, 'manual', 'full', 'queued', (select auth.uid()))
  returning id into rid;
  perform private.log_rankings(p_client_id, 'rank.check_requested', '{}');
  return rid;
end;
$$;

create or replace function public.request_keyword_research(
  p_client_id uuid, p_trigger public.research_trigger default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  lim integer;
  used integer;
  rid uuid;
begin
  perform private.require_rankings_manager(p_client_id);
  if exists (select 1 from public.keyword_research_runs where client_id = p_client_id and status in ('queued', 'running')) then
    raise exception 'Keyword research is already running for this client.' using errcode = 'P0001';
  end if;
  select research_runs_per_client_month into lim from public.dfs_settings;
  select count(*) into used from public.keyword_research_runs
    where client_id = p_client_id and status <> 'failed'
      and created_at >= (date_trunc('month', now() at time zone 'America/Phoenix') at time zone 'America/Phoenix');
  if used >= lim then
    raise exception 'This client has used its % research runs this month. An admin can raise the limit.', lim
      using errcode = 'P0001';
  end if;
  if private.dfs_month_spend() >= (select monthly_budget_usd from public.dfs_settings) then
    raise exception 'This month''s DataForSEO budget is used up. An admin can raise it in Rankings settings.' using errcode = 'P0001';
  end if;
  insert into public.keyword_research_runs (client_id, trigger, created_by)
  values (p_client_id, p_trigger, (select auth.uid()))
  returning id into rid;
  return rid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Job RPCs (service role)
-- ---------------------------------------------------------------------------

-- Queues this week's full run for clients whose check is due; moves their next date on.
create or replace function public.dfs_queue_due_runs(p_limit integer default 25)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  n integer := 0;
begin
  for s in
    select rs.client_id, rs.check_weekday
    from public.rank_settings rs
    join public.clients c on c.id = rs.client_id
    where not rs.paused and rs.location_code is not null and rs.next_run_at <= now()
      and c.stage in ('onboarding', 'active')
      and exists (select 1 from public.keywords k where k.client_id = rs.client_id and k.archived_at is null and k.tracked)
      and not exists (select 1 from public.rank_runs r where r.client_id = rs.client_id and r.scope = 'full' and r.status in ('queued', 'running'))
    order by rs.next_run_at
    limit p_limit
    for update of rs skip locked
  loop
    insert into public.rank_runs (client_id, trigger, scope, status) values (s.client_id, 'schedule', 'full', 'queued');
    update public.rank_settings set next_run_at = private.next_rank_run_at(s.check_weekday, now() + interval '1 day')
      where client_id = s.client_id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Claims the oldest queued run (safe with several workers).
create or replace function public.dfs_claim_rank_run()
returns setof public.rank_runs
language sql
security definer
set search_path = ''
as $$
  update public.rank_runs set status = 'running', started_at = now()
  where id = (
    select id from public.rank_runs where status = 'queued'
    order by created_at limit 1 for update skip locked
  )
  returning *
$$;

-- Stores one task's result exactly once. Returns stored | duplicate | unknown.
create or replace function public.dfs_store_rank(p_task_id uuid, p_rank jsonb, p_cost numeric default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.serp_tasks%rowtype;
begin
  select * into t from public.serp_tasks where id = p_task_id for update;
  if not found then
    return 'unknown';
  end if;
  if t.status <> 'posted' then
    return 'duplicate';
  end if;
  insert into public.keyword_ranks (
    check_id, keyword_id, client_id, engine, position, url, rank_absolute, local_pack_position,
    serp_features, in_ai_overview, matched_domain, title, check_url, maps_rating, maps_reviews
  ) values (
    t.check_id, t.keyword_id, t.client_id, t.engine,
    nullif(p_rank->>'position', '')::smallint,
    left(p_rank->>'url', 2000),
    nullif(p_rank->>'rank_absolute', '')::smallint,
    nullif(p_rank->>'local_pack_position', '')::smallint,
    coalesce(array(select jsonb_array_elements_text(coalesce(p_rank->'serp_features', '[]'))), '{}'),
    coalesce((p_rank->>'in_ai_overview')::boolean, false),
    left(p_rank->>'matched_domain', 300),
    left(p_rank->>'title', 500),
    left(p_rank->>'check_url', 2000),
    nullif(p_rank->>'maps_rating', '')::numeric,
    nullif(p_rank->>'maps_reviews', '')::integer
  )
  on conflict (check_id, keyword_id) do update set
    position = excluded.position, url = excluded.url, rank_absolute = excluded.rank_absolute,
    local_pack_position = excluded.local_pack_position, serp_features = excluded.serp_features,
    in_ai_overview = excluded.in_ai_overview, matched_domain = excluded.matched_domain,
    title = excluded.title, check_url = excluded.check_url, maps_rating = excluded.maps_rating,
    maps_reviews = excluded.maps_reviews;
  update public.serp_tasks set status = 'done', completed_at = now(), cost_usd = p_cost where id = p_task_id;
  update public.rank_checks set tasks_done = tasks_done + 1 where id = t.check_id;
  return 'stored';
end;
$$;

-- Marks a task failed / expired once. Returns failed | duplicate | unknown.
create or replace function public.dfs_fail_task(
  p_task_id uuid, p_status public.serp_task_status, p_code integer, p_message text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.serp_tasks%rowtype;
begin
  if p_status not in ('failed', 'expired') then
    raise exception 'Use failed or expired.';
  end if;
  select * into t from public.serp_tasks where id = p_task_id for update;
  if not found then
    return 'unknown';
  end if;
  if t.status <> 'posted' then
    return 'duplicate';
  end if;
  update public.serp_tasks
    set status = p_status, completed_at = now(), error_code = p_code, error_message = left(p_message, 500)
    where id = p_task_id;
  update public.rank_checks set tasks_failed = tasks_failed + 1 where id = t.check_id;
  return 'failed';
end;
$$;

create or replace function private.rank_summary(p_check_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'keywords', count(*),
    'top3', count(*) filter (where position <= 3),
    'top10', count(*) filter (where position <= 10),
    'top20', count(*) filter (where position <= 20),
    'top100', count(*) filter (where position <= 100),
    'not_found', count(*) filter (where position is null),
    'avg_position', round(avg(position)::numeric, 1),
    'in_local_pack', count(*) filter (where local_pack_position is not null),
    'in_ai_overview', count(*) filter (where in_ai_overview)
  )
  from public.keyword_ranks where check_id = p_check_id
$$;

-- Finishes every running run that has no open tasks left: summaries, status, cost,
-- first-check dates, history and alerts. Safe to call often (postback and cron).
create or replace function public.dfs_finalize_runs()
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  c record;
  total integer;
  failed integer;
  new_status public.rank_run_status;
  g_now uuid;
  g_prev uuid;
  moved_out text[];
  moved_in text[];
  slug text;
begin
  for r in
    select rr.* from public.rank_runs rr
    where rr.status = 'running'
      and exists (select 1 from public.rank_checks rc where rc.run_id = rr.id)
      and not exists (
        select 1 from public.serp_tasks st join public.rank_checks rc on rc.id = st.check_id
        where rc.run_id = rr.id and st.status = 'posted'
      )
    for update of rr skip locked
  loop
    select coalesce(sum(tasks_total), 0), coalesce(sum(tasks_failed), 0) into total, failed
      from public.rank_checks where run_id = r.id;

    for c in select id, tasks_done from public.rank_checks where run_id = r.id loop
      update public.rank_checks
        set summary = private.rank_summary(c.id),
            status = case when c.tasks_done > 0 then 'done'::public.check_status else 'failed'::public.check_status end,
            checked_at = now()
        where id = c.id;
    end loop;

    new_status := case
      when total = 0 or failed * 2 > total then 'failed'
      when failed > 0 then 'partial'
      else 'done'
    end;

    update public.rank_runs
      set status = new_status, finished_at = now(),
          cost_usd = coalesce((select sum(st.cost_usd) from public.serp_tasks st
                               join public.rank_checks rc on rc.id = st.check_id where rc.run_id = r.id), 0)
      where id = r.id;

    update public.keywords k set first_checked_at = now()
      where k.first_checked_at is null and exists (
        select 1 from public.keyword_ranks kr join public.rank_checks rc on rc.id = kr.check_id
        where rc.run_id = r.id and kr.keyword_id = k.id);

    -- Week-on-week Google top 10 movement (full runs only).
    moved_out := '{}';
    moved_in := '{}';
    g_now := null;
    g_prev := null;
    if r.scope = 'full' then
      select id into g_now from public.rank_checks where run_id = r.id and engine = 'google';
      select rc.id into g_prev from public.rank_checks rc
        where rc.client_id = r.client_id and rc.engine = 'google' and rc.scope = 'full'
          and rc.status = 'done' and rc.run_id <> r.id
        order by rc.checked_at desc limit 1;
      if g_now is not null and g_prev is not null then
        select coalesce(array_agg(k.phrase order by k.phrase), '{}') into moved_out
          from public.keyword_ranks p
          join public.keyword_ranks n on n.keyword_id = p.keyword_id and n.check_id = g_now
          join public.keywords k on k.id = p.keyword_id
          where p.check_id = g_prev and p.position <= 10 and (n.position is null or n.position > 10);
        select coalesce(array_agg(k.phrase order by k.phrase), '{}') into moved_in
          from public.keyword_ranks n
          join public.keyword_ranks p on p.keyword_id = n.keyword_id and p.check_id = g_prev
          join public.keywords k on k.id = n.keyword_id
          where n.check_id = g_now and n.position <= 10 and (p.position is null or p.position > 10);
      end if;
    end if;

    insert into public.activity_log (actor_id, client_id, action, meta)
    values (null, r.client_id, 'rank.check_finished', jsonb_build_object(
      'scope', r.scope, 'status', new_status, 'keywords', r.keywords_count,
      'top10', (select (summary->>'top10')::integer from public.rank_checks where run_id = r.id and engine = 'google'),
      'moved_into_top10', cardinality(moved_in), 'moved_out_of_top10', cardinality(moved_out),
      'moved_in', to_jsonb(moved_in[1:10]), 'moved_out', to_jsonb(moved_out[1:10])
    ));

    if r.scope = 'full' then
      select c2.slug into slug from public.clients c2 where c2.id = r.client_id;
      if new_status = 'failed' or (total > 0 and failed * 5 > total) then
        perform private.raise_alert(r.client_id, 'rankings:failed:' || r.client_id, 'needs_look',
          'The ranking check didn''t finish',
          failed || ' of ' || total || ' ranking lookups failed. They run again next week, or use Check now.',
          'Open Rankings', '/clients/' || slug || '/rankings');
      else
        perform private.resolve_alert('rankings:failed:' || r.client_id);
      end if;
      if cardinality(moved_out) >= 3 then
        perform private.raise_alert(r.client_id, 'rankings:drop:' || r.client_id, 'needs_look',
          cardinality(moved_out) || ' keywords dropped out of the Google top 10',
          array_to_string(moved_out[1:5], ', ') || case when cardinality(moved_out) > 5 then ' and more' else '' end || '.',
          'Open Rankings', '/clients/' || slug || '/rankings');
      elsif g_prev is not null then
        perform private.resolve_alert('rankings:drop:' || r.client_id);
      end if;
    end if;

    return next r.id;
  end loop;
end;
$$;

-- Claims a queued research run, or resumes one whose worker stopped (3 attempts max).
create or replace function public.dfs_claim_research_run()
returns setof public.keyword_research_runs
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.keyword_research_runs
    set status = 'failed', finished_at = now(), error = 'Stopped responding three times.'
    where status = 'running' and heartbeat_at < now() - interval '10 minutes' and attempts >= 3;
  return query
  update public.keyword_research_runs
    set status = 'running', attempts = attempts + 1, started_at = coalesce(started_at, now()), heartbeat_at = now()
    where id = (
      select id from public.keyword_research_runs
      where status = 'queued' or (status = 'running' and heartbeat_at < now() - interval '10 minutes')
      order by created_at limit 1 for update skip locked
    )
    returning *;
end;
$$;

-- ---------------------------------------------------------------------------
-- Overview: only full checks, compared like for like
-- ---------------------------------------------------------------------------

create or replace function private.rank_place(
  p_client_id uuid, p_engine public.rank_engine, p_top integer, p_started date
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with checks as (
    select rc.id, rc.checked_at from public.rank_checks rc
    where rc.client_id = p_client_id and rc.engine = p_engine and rc.status = 'done' and rc.scope = 'full'
  ),
  latest as (select id, checked_at from checks order by checked_at desc limit 1),
  previous as (select id from checks order by checked_at desc offset 1 limit 1),
  baseline as (
    select id, checked_at from checks
    order by (checked_at::date >= p_started) desc,
             case when checked_at::date >= p_started then checked_at end asc,
             checked_at asc
    limit 1
  ),
  now_ranks as (select keyword_id, position from public.keyword_ranks where check_id = (select id from latest)),
  base_ranks as (
    select b.keyword_id, b.position from public.keyword_ranks b
    where b.check_id = (select id from baseline) and b.keyword_id in (select keyword_id from now_ranks)
  ),
  prev_ranks as (
    select p.keyword_id, p.position from public.keyword_ranks p
    where p.check_id = (select id from previous) and p.keyword_id in (select keyword_id from now_ranks)
  )
  select case when not exists (select 1 from latest) then null else jsonb_build_object(
    'current', (select count(*) from now_ranks where position <= p_top),
    'out_of', (select count(*) from now_ranks),
    'previous', case when exists (select 1 from previous) then (select count(*) from prev_ranks where position <= p_top) end,
    'baseline', (select count(*) from base_ranks where position <= p_top),
    'compared', (select count(*) from base_ranks),
    'baseline_checked_at', (select checked_at from baseline),
    'last_checked_at', (select checked_at from latest),
    'checks', (select count(*) from checks)
  ) end
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Only the functions this migration adds; existing grants are untouched.
revoke execute on function private.keywords_before_write() from public, anon;
revoke execute on function private.require_rankings_manager(uuid) from public, anon;
revoke execute on function private.next_rank_run_at(smallint, timestamptz) from public, anon;
revoke execute on function private.dfs_month_spend() from public, anon;
revoke execute on function private.log_rankings(uuid, text, jsonb) from public, anon;
revoke execute on function private.queue_partial_run(uuid, uuid[]) from public, anon;
revoke execute on function private.track_phrase(uuid, text, public.keyword_source, text) from public, anon;
revoke execute on function private.rank_summary(uuid) from public, anon;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.add_keywords(uuid, text[], public.keyword_source, text)',
    'public.archive_keyword(uuid, text)',
    'public.replace_keyword(uuid, text)',
    'public.track_candidate(uuid, text)',
    'public.set_candidate_status(uuid, text, boolean, text)',
    'public.update_rank_settings(uuid, jsonb)',
    'public.request_rank_check(uuid)',
    'public.request_keyword_research(uuid, public.research_trigger)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.dfs_queue_due_runs(integer)',
    'public.dfs_claim_rank_run()',
    'public.dfs_store_rank(uuid, jsonb, numeric)',
    'public.dfs_fail_task(uuid, public.serp_task_status, integer, text)',
    'public.dfs_finalize_runs()',
    'public.dfs_claim_research_run()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
