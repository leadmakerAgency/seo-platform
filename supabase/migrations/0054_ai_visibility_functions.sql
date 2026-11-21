-- 0054 · AI Visibility functions (docs/plans/ai-visibility/03-data-model.md)
-- Applied to the database in five parts (0054_ai_visibility_functions_1_helpers … _5_reads); same content.
-- Team RPCs are security definer and check the role and client. Read functions are security
-- invoker (RLS applies). dfs_* functions are for the service-role pipeline only.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function private.require_aiv_manager(p_client_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_role('{admin,manager}') or not private.can_see_client(p_client_id) then
    raise exception 'Only admins and account managers can change AI visibility.' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.require_aiv_worker(p_client_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_role('{admin,manager,va}') or not private.can_see_client(p_client_id) then
    raise exception 'Only admins, account managers and VAs working on this client can do this.' using errcode = '42501';
  end if;
end;
$$;

-- Next run, 06:00 Phoenix (13:00 UTC, no daylight saving there).
create or replace function private.aiv_next_run_at(p_frequency text, p_weekday smallint, p_from timestamptz default now())
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select min(t) from (
    select (d + interval '13 hours') at time zone 'UTC' as t
    from generate_series(date_trunc('day', p_from at time zone 'UTC'),
                         date_trunc('day', p_from at time zone 'UTC') + interval '8 days', interval '1 day') g(d)
    where (d + interval '13 hours') at time zone 'UTC' > p_from
      and case p_frequency
            when 'daily' then true
            when 'twice_weekly' then extract(dow from d) in (1, 4)
            else extract(dow from d) = p_weekday
          end
  ) x
$$;

-- All AI Visibility spend this month: DataForSEO calls of its runs plus its Claude calls.
create or replace function private.aiv_month_spend()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select sum(dc.cost_usd) from public.dfs_calls dc
                   where dc.created_at >= private.agency_month_start()
                     and dc.ref in (select r.id from public.aiv_runs r where r.created_at >= private.agency_month_start() - interval '2 days')), 0)
       + coalesce((select sum(ac.cost_usd) from public.ai_calls ac
                   where ac.created_at >= private.agency_month_start() and ac.feature like 'ai_visibility.%'), 0)
$$;

-- The Standard Search Claude budget no longer counts AI Visibility calls.
create or replace function private.ai_month_spend()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(cost_usd), 0) from public.ai_calls
  where created_at >= private.agency_month_start()
    and feature not like 'ai_search.%' and feature not like 'ai_visibility.%'
$$;

create or replace function public.aiv_budget_problem()
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
  if private.aiv_month_spend() >= s.aiv_monthly_budget_usd then
    return 'This month''s AI visibility budget is used up. An admin can raise it.';
  end if;
  return null;
end;
$$;

create or replace function private.aiv_norm_text(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'))
$$;

-- Clean list of short strings: trimmed, distinct, non-empty, each at most p_len, at most p_max.
create or replace function private.aiv_text_list(p jsonb, p_max integer, p_len integer, p_lower boolean default false)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(v order by ord), '{}') from (
    select distinct on (lower(v)) v, ord from (
      select case when p_lower then lower(private.aiv_norm_text(x)) else private.aiv_norm_text(x) end as v, ord
      from jsonb_array_elements_text(case jsonb_typeof(p) when 'array' then p else '[]'::jsonb end) with ordinality as e(x, ord)
    ) a
    where v <> '' and char_length(v) <= p_len
    order by lower(v), ord
  ) b
  where ord <= 1000
  limit p_max
$$;

-- Hosts: lower case, no scheme, no www., no path.
create or replace function private.aiv_host(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(regexp_replace(lower(btrim(coalesce(p, ''))), '^[a-z]+://', ''), '^www\.|[/?#:].*$', '', 'g'), '')
$$;

-- Whether a question mentions the client's own brand (any tracked name).
create or replace function private.aiv_is_branded(p_client_id uuid, p_text text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.aiv_brands b, unnest(b.tracked_names) n
    where b.client_id = p_client_id and b.is_own and position(lower(n) in lower(p_text)) > 0
  )
$$;

-- Snapshot of what a run covers.
create or replace function private.aiv_run_params(p_client_id uuid, p_prompt_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'caps', jsonb_build_object('max_usd', s.aiv_max_run_usd),
    'models', to_jsonb(p.models),
    'countries', to_jsonb(p.countries),
    'language', p.language,
    'project_version', p.version,
    'claude_model', s.aiv_claude_model,
    'perplexity_model', s.aiv_perplexity_model,
    'prompt_ids', coalesce((
      select jsonb_agg(q.id order by q.created_at) from public.aiv_prompts q
      where q.client_id = p_client_id and q.status = 'active'
        and (p_prompt_ids is null or q.id = any (p_prompt_ids))
    ), '[]'::jsonb)
  )
  from public.aiv_projects p, public.dfs_settings s
  where p.client_id = p_client_id and s.id
$$;

-- ---------------------------------------------------------------------------
-- Setup
-- ---------------------------------------------------------------------------

-- p: {brand_name, description, industry, personas[], brand_identity[], models[], countries[], language,
--     frequency, run_weekday, paused, own_names[], own_domains[]}
create or replace function public.save_aiv_project(p_client_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  old public.aiv_projects;
  v_brand text := private.aiv_norm_text(p->>'brand_name');
  v_models public.aiv_model[];
  v_countries text[];
  v_freq text := coalesce(nullif(p->>'frequency', ''), 'weekly');
  v_weekday smallint := coalesce((p->>'run_weekday')::smallint, 1);
  v_paused boolean := coalesce((p->>'paused')::boolean, false);
  v_lang text := coalesce(nullif(p->>'language', ''), 'en');
  v_names text[];
  v_domains text[];
  v_next timestamptz;
  v_version integer;
begin
  perform private.require_aiv_manager(p_client_id);
  if char_length(v_brand) not between 1 and 80 then
    raise exception 'Give the brand name (up to 80 characters).' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct m::public.aiv_model), '{}') into v_models
    from jsonb_array_elements_text(coalesce(p->'models', '[]')) m
    where m in ('chatgpt', 'gemini', 'ai_overview', 'ai_mode', 'claude', 'perplexity');
  if cardinality(v_models) = 0 then
    raise exception 'Pick at least one AI platform.' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct upper(c)), '{}') into v_countries
    from jsonb_array_elements_text(coalesce(p->'countries', '[]')) c where upper(c) ~ '^[A-Z]{2}$';
  if cardinality(v_countries) not between 1 and 3 then
    raise exception 'Pick 1 to 3 countries.' using errcode = '22023';
  end if;
  if v_freq not in ('weekly', 'twice_weekly', 'daily') then
    raise exception 'Unknown frequency.' using errcode = '22023';
  end if;
  select * into old from public.aiv_projects where client_id = p_client_id;
  if v_freq <> 'weekly' and v_freq is distinct from old.frequency and not private.has_role('{admin}') then
    raise exception 'Only admins can check a client more often than weekly.' using errcode = '42501';
  end if;
  if v_weekday not between 0 and 6 or v_lang !~ '^[a-z]{2}(-[A-Z]{2})?$' then
    raise exception 'Check the schedule and language.' using errcode = '22023';
  end if;
  if char_length(coalesce(p->>'description', '')) > 600 or char_length(coalesce(p->>'industry', '')) > 80 then
    raise exception 'Keep the description under 600 characters and the industry under 80.' using errcode = '22023';
  end if;

  v_next := case
    when old.client_id is null or old.next_run_at is null or old.frequency <> v_freq or old.run_weekday <> v_weekday
      or (old.paused and not v_paused)
    then private.aiv_next_run_at(v_freq, v_weekday)
    else old.next_run_at end;

  insert into public.aiv_projects as t (client_id, brand_name, description, industry, personas, brand_identity, models,
    countries, language, frequency, run_weekday, next_run_at, paused, updated_by)
  values (p_client_id, v_brand, nullif(private.aiv_norm_text(p->>'description'), ''),
    nullif(private.aiv_norm_text(p->>'industry'), ''),
    private.aiv_text_list(p->'personas', 8, 80), private.aiv_text_list(p->'brand_identity', 8, 40),
    v_models, v_countries, v_lang, v_freq, v_weekday, v_next, v_paused, private.current_member_or_null())
  on conflict (client_id) do update set
    brand_name = excluded.brand_name, description = excluded.description, industry = excluded.industry,
    personas = excluded.personas, brand_identity = excluded.brand_identity, models = excluded.models,
    countries = excluded.countries, language = excluded.language, frequency = excluded.frequency,
    run_weekday = excluded.run_weekday, next_run_at = excluded.next_run_at, paused = excluded.paused,
    updated_by = excluded.updated_by, updated_at = now(), version = t.version + 1
  returning version into v_version;

  -- The own brand follows the brand name; extra names and domains are optional.
  v_names := private.aiv_text_list(coalesce(p->'own_names', '[]') || to_jsonb(array[v_brand]), 10, 60);
  select coalesce(array_agg(distinct h), '{}') into v_domains from (
    select private.aiv_host(x) h from jsonb_array_elements_text(coalesce(p->'own_domains', '[]')) x
    union all
    select private.website_host(c.website) from public.clients c where c.id = p_client_id
  ) d where h is not null and h ~ '^[a-z0-9.-]+\.[a-z]{2,}$';
  insert into public.aiv_brands as ab (client_id, is_own, display_name, tracked_names, domains, color_slot, source, created_by)
  values (p_client_id, true, v_brand, v_names, v_domains[1:10], 0, 'team', private.current_member_or_null())
  on conflict (client_id) where is_own do update set
    display_name = excluded.display_name,
    tracked_names = case when p ? 'own_names' then excluded.tracked_names
                         else (select coalesce(array_agg(distinct x), '{}') from unnest(ab.tracked_names || array[v_brand]) x) end,
    domains = case when p ? 'own_domains' then excluded.domains else ab.domains end,
    active = true, updated_at = now();

  perform private.log_backlinks(p_client_id, 'ai.project_saved', jsonb_build_object('version', v_version));
  return jsonb_build_object('version', v_version, 'next_run_at', v_next);
end;
$$;

-- Fill a first setup from what the agency already knows. Does nothing when a project exists.
create or replace function public.seed_aiv_from_setup(p_client_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.clients;
  bp public.client_business_profiles;
  br public.backlink_briefs;
  v_countries text[];
  v_brand text;
  r record;
  slot smallint := 1;
begin
  perform private.require_aiv_manager(p_client_id);
  if exists (select 1 from public.aiv_projects where client_id = p_client_id) then
    return false;
  end if;
  select * into c from public.clients where id = p_client_id;
  select * into bp from public.client_business_profiles where client_id = p_client_id;
  select * into br from public.backlink_briefs where client_id = p_client_id;
  select coalesce(array_agg(x), '{}') into v_countries from (
    select distinct upper(t.country_iso) x from public.backlink_targets t where t.client_id = p_client_id and t.active limit 3
  ) a;
  if cardinality(v_countries) = 0 then
    v_countries := array[upper(coalesce(c.country_code, 'US'))];
  end if;
  v_brand := left(private.aiv_norm_text(coalesce(nullif(bp.business_name, ''), c.name)), 80);

  insert into public.aiv_projects (client_id, brand_name, description, industry, personas, countries, updated_by, next_run_at)
  values (p_client_id, v_brand, left(nullif(private.aiv_norm_text(bp.description), ''), 600),
    left(nullif(private.aiv_norm_text(coalesce(c.industry, bp.primary_category)), ''), 80),
    case when br.audience is not null and btrim(br.audience) <> '' then array[left(btrim(br.audience), 80)] else '{}' end,
    v_countries, private.current_member_or_null(), private.aiv_next_run_at('weekly', 1::smallint));

  insert into public.aiv_brands (client_id, is_own, display_name, tracked_names, domains, color_slot, source, created_by)
  values (p_client_id, true, v_brand, array[v_brand],
    coalesce(array_remove(array[private.website_host(c.website)], null), '{}'), 0, 'team', private.current_member_or_null())
  on conflict do nothing;

  for r in
    select cc.domain, coalesce(nullif(btrim(cc.name), ''), initcap(split_part(cc.domain, '.', 1))) as name
    from public.client_competitors cc
    where cc.client_id = p_client_id and cc.active
    order by cc.created_at
    limit 7
  loop
    insert into public.aiv_brands (client_id, is_own, display_name, tracked_names, domains, color_slot, source, created_by)
    values (p_client_id, false, left(r.name, 80), array[left(r.name, 60)], array[lower(r.domain)], slot, 'competitors',
      private.current_member_or_null())
    on conflict do nothing;
    slot := slot + 1;
  end loop;

  perform private.log_backlinks(p_client_id, 'ai.project_saved', jsonb_build_object('seeded', true));
  return true;
end;
$$;

-- p: {id?, display_name, tracked_names[], pattern, domains[], active}
create or replace function public.save_aiv_brand(p_client_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_name text := private.aiv_norm_text(p->>'display_name');
  v_names text[] := private.aiv_text_list(p->'tracked_names', 10, 60);
  v_pattern text := nullif(btrim(coalesce(p->>'pattern', '')), '');
  v_domains text[];
  v_active boolean := coalesce((p->>'active')::boolean, true);
  v_slot smallint;
  existing public.aiv_brands;
begin
  perform private.require_aiv_manager(p_client_id);
  if char_length(v_name) not between 1 and 80 then
    raise exception 'Give the brand a name (up to 80 characters).' using errcode = '22023';
  end if;
  if cardinality(v_names) = 0 then
    v_names := array[left(v_name, 60)];
  end if;
  if exists (select 1 from unnest(v_names) n where char_length(n) < 2) then
    raise exception 'Names to match need at least 2 characters.' using errcode = '22023';
  end if;
  if v_pattern is not null then
    if char_length(v_pattern) > 200 or v_pattern ~ '\\[1-9]' then
      raise exception 'The pattern is too long or uses back-references.' using errcode = '22023';
    end if;
    begin
      perform '' ~* v_pattern;
    exception when others then
      raise exception 'The pattern isn''t a valid regular expression.' using errcode = '22023';
    end;
  end if;
  select coalesce(array_agg(distinct h), '{}') into v_domains from (
    select private.aiv_host(x) h from jsonb_array_elements_text(coalesce(p->'domains', '[]')) x
  ) d where h is not null and h ~ '^[a-z0-9.-]+\.[a-z]{2,}$';

  if v_id is not null then
    select * into existing from public.aiv_brands where id = v_id and client_id = p_client_id;
    if existing.id is null then
      raise exception 'Unknown brand.' using errcode = 'P0001';
    end if;
    if existing.is_own and not v_active then
      raise exception 'The client''s own brand can''t be turned off.' using errcode = 'P0001';
    end if;
  end if;
  if v_active and not coalesce(existing.is_own, false) and not coalesce(existing.active, false)
     and (select count(*) from public.aiv_brands where client_id = p_client_id and active and not is_own) >= 12 then
    raise exception 'Track 12 competitors at most. Turn one off first.' using errcode = 'P0001';
  end if;

  if v_id is null then
    select g.s into v_slot from generate_series(1, 7) g(s)
      where g.s not in (select color_slot from public.aiv_brands where client_id = p_client_id and active and not is_own)
      order by g.s limit 1;
    v_slot := coalesce(v_slot, (1 + (select count(*) from public.aiv_brands where client_id = p_client_id and not is_own) % 7)::smallint);
    insert into public.aiv_brands (client_id, is_own, display_name, tracked_names, pattern, domains, color_slot, active, source, created_by)
    values (p_client_id, false, v_name, v_names, v_pattern, v_domains[1:10], v_slot, v_active,
      case when p->>'source' in ('team', 'suggested', 'competitors') then p->>'source' else 'team' end, private.current_member_or_null())
    returning id into v_id;
  else
    update public.aiv_brands set display_name = v_name, tracked_names = v_names, pattern = v_pattern,
      domains = v_domains[1:10], active = v_active, updated_at = now()
    where id = v_id;
  end if;
  perform private.log_backlinks(p_client_id, 'ai.brand_saved', jsonb_build_object('brand', v_name));
  return v_id;
end;
$$;

-- p: {id?, name, delete?}
create or replace function public.save_aiv_topic(p_client_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_name text := private.aiv_norm_text(p->>'name');
begin
  perform private.require_aiv_manager(p_client_id);
  if coalesce((p->>'delete')::boolean, false) then
    delete from public.aiv_topics where id = v_id and client_id = p_client_id;
    return v_id;
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'Give the topic a name (up to 60 characters).' using errcode = '22023';
  end if;
  if v_id is null then
    v_id := private.aiv_topic_id(p_client_id, v_name);
  else
    update public.aiv_topics set name = v_name where id = v_id and client_id = p_client_id;
  end if;
  return v_id;
end;
$$;

create or replace function private.aiv_topic_id(p_client_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(private.aiv_norm_text(p_name), 60);
  v_id uuid;
begin
  if v_name = '' then
    return null;
  end if;
  select id into v_id from public.aiv_topics where client_id = p_client_id and lower(name) = lower(v_name);
  if v_id is null then
    insert into public.aiv_topics (client_id, name, sort)
    values (p_client_id, v_name, (select coalesce(max(sort), 0) + 1 from public.aiv_topics where client_id = p_client_id))
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- p_items: [{text, country?, topic?, topic_id?, tags[], intent?, persona?, source?}]
create or replace function public.save_aiv_prompts(p_client_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  proj public.aiv_projects;
  cap smallint;
  active_n integer;
  item jsonb;
  v_text text;
  v_country text;
  v_intent public.aiv_intent;
  v_id uuid;
  added uuid[] := '{}';
  skipped integer := 0;
begin
  perform private.require_aiv_manager(p_client_id);
  select * into proj from public.aiv_projects where client_id = p_client_id;
  if proj.client_id is null then
    raise exception 'Set up AI visibility for this client first.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100 then
    raise exception 'Add up to 100 questions at a time.' using errcode = '22023';
  end if;
  select aiv_prompts_per_client into cap from public.dfs_settings where id;
  select count(*) into active_n from public.aiv_prompts where client_id = p_client_id and status = 'active';

  for item in select * from jsonb_array_elements(p_items) loop
    v_text := private.aiv_norm_text(item->>'text');
    if char_length(v_text) < 8 then
      skipped := skipped + 1;
      continue;
    end if;
    if char_length(v_text) > 400 then
      raise exception 'Keep each question under 400 characters.' using errcode = '22023';
    end if;
    v_country := upper(coalesce(nullif(item->>'country', ''), proj.countries[1]));
    if not v_country = any (proj.countries) then
      v_country := proj.countries[1];
    end if;
    if exists (select 1 from public.aiv_prompts where client_id = p_client_id and lower(text) = lower(v_text) and country = v_country) then
      skipped := skipped + 1;
      continue;
    end if;
    if active_n >= cap then
      raise exception 'This client already tracks % questions. Archive some first.', cap using errcode = 'P0001';
    end if;
    v_intent := case when item->>'intent' in ('informational', 'commercial', 'transactional', 'navigational')
                     then (item->>'intent')::public.aiv_intent end;
    insert into public.aiv_prompts (client_id, topic_id, text, country, language, tags, intent, branded, persona, head_phrase, source, created_by)
    values (p_client_id,
      coalesce((select t.id from public.aiv_topics t where t.id = nullif(item->>'topic_id', '')::uuid and t.client_id = p_client_id),
               private.aiv_topic_id(p_client_id, item->>'topic')),
      v_text, v_country, proj.language, private.aiv_text_list(item->'tags', 10, 40, true), v_intent,
      private.aiv_is_branded(p_client_id, v_text), left(nullif(private.aiv_norm_text(item->>'persona'), ''), 80),
      left(nullif(private.aiv_norm_text(item->>'head_phrase'), ''), 80),
      case when item->>'source' in ('suggested', 'team', 'import', 'keywords') then item->>'source' else 'team' end,
      private.current_member_or_null())
    returning id into v_id;
    added := added || v_id;
    active_n := active_n + 1;
  end loop;

  if cardinality(added) > 0 then
    perform private.log_backlinks(p_client_id, 'ai.prompts_added', jsonb_build_object('count', cardinality(added)));
  end if;
  return jsonb_build_object('added', cardinality(added), 'skipped', skipped, 'ids', to_jsonb(added));
end;
$$;

-- p: {tags_add[], tags_remove[], topic_id|topic (null clears), status, intent, text, delete}
create or replace function public.update_aiv_prompts(p_ids uuid[], p jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  n integer;
  cap smallint;
  reactivating integer;
  v_text text;
begin
  select min(client_id::text)::uuid into v_client from public.aiv_prompts where id = any (p_ids);
  if v_client is null or exists (select 1 from public.aiv_prompts where id = any (p_ids) and client_id <> v_client) then
    raise exception 'Pick questions of one client.' using errcode = '22023';
  end if;
  perform private.require_aiv_manager(v_client);
  n := cardinality(p_ids);

  if coalesce((p->>'delete')::boolean, false) then
    delete from public.aiv_prompts where id = any (p_ids);
    return n;
  end if;
  if p->>'status' = 'active' then
    select aiv_prompts_per_client into cap from public.dfs_settings where id;
    select count(*) into reactivating from public.aiv_prompts where id = any (p_ids) and status = 'archived';
    if (select count(*) from public.aiv_prompts where client_id = v_client and status = 'active') + reactivating > cap then
      raise exception 'This client can track % questions at most. Archive some first.', cap using errcode = 'P0001';
    end if;
    update public.aiv_prompts set status = 'active', archived_at = null where id = any (p_ids);
  elsif p->>'status' = 'archived' then
    update public.aiv_prompts set status = 'archived', archived_at = now() where id = any (p_ids) and status = 'active';
  end if;
  if p ? 'tags_add' then
    update public.aiv_prompts q set tags = (
      select coalesce(array_agg(distinct t), '{}') from (select unnest(q.tags) t union select unnest(private.aiv_text_list(p->'tags_add', 10, 40, true))) a
    )[1:10] where id = any (p_ids);
  end if;
  if p ? 'tags_remove' then
    update public.aiv_prompts q set tags = array(select t from unnest(q.tags) t where t <> all (private.aiv_text_list(p->'tags_remove', 10, 40, true)))
    where id = any (p_ids);
  end if;
  if p ? 'topic_id' or p ? 'topic' then
    update public.aiv_prompts set topic_id = coalesce(
      (select t.id from public.aiv_topics t where t.id = nullif(p->>'topic_id', '')::uuid and t.client_id = v_client),
      private.aiv_topic_id(v_client, p->>'topic'))
    where id = any (p_ids);
  end if;
  if p->>'intent' in ('informational', 'commercial', 'transactional', 'navigational') then
    update public.aiv_prompts set intent = (p->>'intent')::public.aiv_intent where id = any (p_ids);
  end if;
  if p ? 'text' then
    if n <> 1 then
      raise exception 'Edit one question at a time.' using errcode = '22023';
    end if;
    v_text := private.aiv_norm_text(p->>'text');
    if char_length(v_text) not between 8 and 400 then
      raise exception 'Questions need 8 to 400 characters.' using errcode = '22023';
    end if;
    update public.aiv_prompts set text = v_text, branded = private.aiv_is_branded(v_client, v_text) where id = p_ids[1];
  end if;
  if p ? 'persona' then
    update public.aiv_prompts set persona = left(nullif(private.aiv_norm_text(p->>'persona'), ''), 80) where id = any (p_ids);
  end if;
  return n;
end;
$$;

create or replace function public.review_aiv_suggestion(p_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.aiv_suggestions;
  res jsonb := '{}';
begin
  select * into s from public.aiv_suggestions where id = p_id;
  if s.id is null then
    raise exception 'Unknown suggestion.' using errcode = 'P0001';
  end if;
  perform private.require_aiv_manager(s.client_id);
  if p_accept and s.status <> 'accepted' then
    if s.kind = 'prompt' then
      res := public.save_aiv_prompts(s.client_id, jsonb_build_array(s.payload || jsonb_build_object('source', 'suggested')));
    elsif s.kind = 'brand' then
      res := jsonb_build_object('brand_id', public.save_aiv_brand(s.client_id, s.payload || jsonb_build_object('source', 'suggested')));
    elsif s.kind = 'topic' then
      res := jsonb_build_object('topic_id', private.aiv_topic_id(s.client_id, s.payload->>'name'));
    end if;
  end if;
  update public.aiv_suggestions set status = case when p_accept then 'accepted' else 'dismissed' end,
    decided_by = private.current_member_or_null(), decided_at = now()
  where id = p_id;
  return res;
end;
$$;

-- Admin: AI Visibility budgets. p: {monthly_budget_usd, max_run_usd, manual_runs_per_client_month}
create or replace function public.update_aiv_settings(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role('{admin}') then
    raise exception 'Only admins can change AI visibility budgets.' using errcode = '42501';
  end if;
  update public.dfs_settings set
    aiv_monthly_budget_usd = coalesce((p->>'monthly_budget_usd')::numeric, aiv_monthly_budget_usd),
    aiv_max_run_usd = coalesce((p->>'max_run_usd')::numeric, aiv_max_run_usd),
    aiv_manual_runs_per_client_month = coalesce((p->>'manual_runs_per_client_month')::smallint, aiv_manual_runs_per_client_month),
    updated_by = private.current_member_or_null(), updated_at = now()
  where id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Runs
-- ---------------------------------------------------------------------------

create or replace function public.request_aiv_run(p_client_id uuid, p_estimate numeric, p_prompt_ids uuid[] default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.dfs_settings%rowtype;
  c public.clients;
  problem text;
  used integer;
  params jsonb;
  rid uuid;
begin
  perform private.require_aiv_manager(p_client_id);
  select * into s from public.dfs_settings where id;
  select * into c from public.clients where id = p_client_id;
  if c.stage in ('paused', 'churned') then
    raise exception 'This client is paused or has left.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.aiv_projects where client_id = p_client_id) then
    raise exception 'Set up AI visibility for this client first.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.aiv_runs where client_id = p_client_id and status in ('queued', 'running')) then
    raise exception 'A check is already running for this client.' using errcode = 'P0001';
  end if;
  select count(*) into used from public.aiv_runs
    where client_id = p_client_id and trigger in ('manual', 'new_prompts') and status <> 'failed'
      and created_at >= private.agency_month_start();
  if used >= s.aiv_manual_runs_per_client_month then
    raise exception 'This client has used its % manual checks this month. The weekly check still runs.', s.aiv_manual_runs_per_client_month
      using errcode = 'P0001';
  end if;
  problem := public.aiv_budget_problem();
  if problem is not null then
    raise exception '%', problem using errcode = 'P0001';
  end if;
  if p_estimate is null or p_estimate <= 0 or p_estimate > s.aiv_max_run_usd then
    raise exception 'This check is estimated at $%, over the $% limit for one check. Track fewer questions or platforms, or ask an admin.',
      round(coalesce(p_estimate, 0), 2), s.aiv_max_run_usd using errcode = 'P0001';
  end if;
  params := private.aiv_run_params(p_client_id, p_prompt_ids);
  if jsonb_array_length(params->'prompt_ids') = 0 then
    raise exception 'Add at least one question first.' using errcode = 'P0001';
  end if;
  insert into public.aiv_runs (client_id, trigger, params, estimate_usd, created_by)
  values (p_client_id, case when p_prompt_ids is null then 'manual' else 'new_prompts' end, params, p_estimate,
    private.current_member_or_null())
  returning id into rid;
  perform private.log_backlinks(p_client_id, 'ai.run_started', jsonb_build_object('run_id', rid, 'estimate_usd', p_estimate));
  return rid;
end;
$$;

-- Scheduled runs: due, unpaused projects with questions and no open run. Returns the new run ids.
create or replace function public.dfs_queue_aiv_runs(p_limit integer default 10)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  rid uuid;
  params jsonb;
begin
  if public.aiv_budget_problem() is not null then
    return;
  end if;
  for r in
    select p.* from public.aiv_projects p
    join public.clients c on c.id = p.client_id
    where not p.paused and p.next_run_at is not null and p.next_run_at <= now()
      and c.stage not in ('paused', 'churned')
      and exists (select 1 from public.aiv_prompts q where q.client_id = p.client_id and q.status = 'active')
      and not exists (select 1 from public.aiv_runs x where x.client_id = p.client_id and x.status in ('queued', 'running'))
    order by p.next_run_at
    limit p_limit
    for update of p skip locked
  loop
    params := private.aiv_run_params(r.client_id, null);
    insert into public.aiv_runs (client_id, trigger, params)
    values (r.client_id, 'schedule', params)
    returning id into rid;
    update public.aiv_projects set next_run_at = private.aiv_next_run_at(r.frequency, r.run_weekday, greatest(now(), r.next_run_at))
      where client_id = r.client_id;
    return next rid;
  end loop;
  -- Projects that can't run now (no questions) still move on, so they don't pile up.
  update public.aiv_projects p set next_run_at = private.aiv_next_run_at(p.frequency, p.run_weekday)
    where not p.paused and p.next_run_at <= now() - interval '1 hour'
      and not exists (select 1 from public.aiv_prompts q where q.client_id = p.client_id and q.status = 'active');
end;
$$;

-- Claim the next run. A run handed back on purpose (released while waiting for results) doesn't
-- count as a stop; one whose worker vanished (stale heartbeat) does, and three of those fail it.
create or replace function public.dfs_claim_aiv_run()
returns setof public.aiv_runs
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.aiv_runs
    set status = 'failed', finished_at = now(), error = 'Stopped responding three times.'
    where status = 'running' and attempts >= 3
      and released_at is null and heartbeat_at < now() - interval '2 minutes';
  return query
  update public.aiv_runs r
    set status = 'running',
        attempts = r.attempts + case when r.status = 'running' and r.released_at is null then 1 else 0 end,
        started_at = coalesce(r.started_at, now()), heartbeat_at = now(), released_at = null
    where r.id = (
      select x.id from public.aiv_runs x
      where x.status = 'queued'
         or (x.status = 'running' and (x.released_at is not null or x.heartbeat_at < now() - interval '2 minutes'))
      order by x.released_at nulls first, x.created_at
      limit 1
      for update skip locked
    )
    returning r.*;
end;
$$;

create or replace function public.dfs_release_aiv_run(p_run_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.aiv_runs set released_at = now() where id = p_run_id and status = 'running'
$$;

-- Store one answer with its sources and ads. Idempotent per task.
-- p: {status, answer, model_version, fan_out[], brand_hints[], check_url, country_fallback, error, cost_usd,
--     sources: [{url, domain, title, retrieved, cited, cite_rank}], ads: [{advertiser, domain, title, url}]}
create or replace function public.dfs_store_aiv_chat(p_task_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.aiv_tasks;
  v_chat uuid;
  v_date date;
begin
  select * into t from public.aiv_tasks where id = p_task_id;
  if t.id is null then
    raise exception 'Unknown task.' using errcode = 'P0001';
  end if;
  select id into v_chat from public.aiv_chats where task_id = p_task_id;
  if v_chat is not null then
    return v_chat;
  end if;
  select (coalesce(r.started_at, r.created_at) at time zone 'America/Phoenix')::date into v_date
    from public.aiv_runs r where r.id = t.run_id;

  insert into public.aiv_chats (run_id, task_id, client_id, prompt_id, model, country, country_fallback, run_date, status,
    answer, model_version, fan_out, has_ads, brand_hints, check_url, error)
  values (t.run_id, t.id, t.client_id, t.prompt_id, t.model, t.country, coalesce((p->>'country_fallback')::boolean, false),
    v_date, coalesce(p->>'status', 'failed'), left(p->>'answer', 40000), left(p->>'model_version', 120),
    coalesce(array(select left(x, 300) from jsonb_array_elements_text(coalesce(p->'fan_out', '[]')) x limit 20), '{}'),
    jsonb_array_length(coalesce(p->'ads', '[]')) > 0,
    coalesce(array(select left(x, 80) from jsonb_array_elements_text(coalesce(p->'brand_hints', '[]')) x limit 40), '{}'),
    left(p->>'check_url', 2000), left(p->>'error', 500))
  returning id into v_chat;

  insert into public.aiv_sources as so (chat_id, client_id, run_date, model, url, domain, title, retrieved, cited, cite_rank)
  select v_chat, t.client_id, v_date, t.model, left(s->>'url', 2000), left(lower(s->>'domain'), 253), left(s->>'title', 300),
    coalesce((s->>'retrieved')::boolean, false), coalesce((s->>'cited')::boolean, false), (s->>'cite_rank')::smallint
  from jsonb_array_elements(coalesce(p->'sources', '[]')) s
  where s->>'url' ~* '^https?://' and coalesce(s->>'domain', '') <> ''
  on conflict (chat_id, url) do update set
    retrieved = so.retrieved or excluded.retrieved,
    cited = so.cited or excluded.cited,
    cite_rank = coalesce(least(so.cite_rank, excluded.cite_rank), so.cite_rank, excluded.cite_rank);

  insert into public.aiv_ads (chat_id, client_id, run_date, advertiser, domain, title, url)
  select v_chat, t.client_id, v_date, left(a->>'advertiser', 120), left(a->>'domain', 253), left(a->>'title', 300), left(a->>'url', 2000)
  from jsonb_array_elements(coalesce(p->'ads', '[]')) a;

  update public.aiv_tasks set status = case when p->>'status' = 'failed' then 'failed' else 'collected' end,
    collected_at = now(), cost_usd = coalesce((p->>'cost_usd')::numeric, cost_usd), error = left(p->>'error', 500)
  where id = p_task_id;
  return v_chat;
end;
$$;

-- Replace an answer's mentions. p: {version, mentions: [{brand_id, name, name_key, position, sentiment, quote}]}
create or replace function public.dfs_store_aiv_analysis(p_chat_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.aiv_chats;
begin
  select * into c from public.aiv_chats where id = p_chat_id;
  if c.id is null then
    return;
  end if;
  delete from public.aiv_mentions where chat_id = p_chat_id;
  insert into public.aiv_mentions (chat_id, client_id, run_date, model, brand_id, name, name_key, position, sentiment, quote)
  select p_chat_id, c.client_id, c.run_date, c.model,
    (select b.id from public.aiv_brands b where b.id = nullif(m->>'brand_id', '')::uuid and b.client_id = c.client_id),
    left(m->>'name', 80), left(m->>'name_key', 80), greatest(1, (m->>'position')::smallint),
    case when m->>'sentiment' is null then null else least(100, greatest(0, (m->>'sentiment')::numeric))::smallint end,
    left(m->>'quote', 300)
  from jsonb_array_elements(coalesce(p->'mentions', '[]')) m
  where coalesce(m->>'name', '') <> '' and coalesce(m->>'name_key', '') <> ''
  on conflict (chat_id, name_key) do nothing;
  update public.aiv_chats set analyzed_at = now(), analysis_version = left(p->>'version', 60) where id = p_chat_id;
end;
$$;

-- New suggestions, never repeating a dismissed or accepted key. p: [{kind, key, payload, reason, mentions}]
create or replace function public.dfs_store_aiv_suggestions(p_client_id uuid, p jsonb)
returns integer
language sql
security definer
set search_path = ''
as $$
  with ins as (
    insert into public.aiv_suggestions as sg (client_id, kind, key, payload, reason, mentions)
    select p_client_id, s->>'kind', left(lower(private.aiv_norm_text(s->>'key')), 400), coalesce(s->'payload', '{}'),
      left(s->>'reason', 300), coalesce((s->>'mentions')::integer, 0)
    from jsonb_array_elements(coalesce(p, '[]')) s
    where s->>'kind' in ('prompt', 'brand', 'topic') and private.aiv_norm_text(s->>'key') <> ''
    on conflict (client_id, kind, key) do update set mentions = excluded.mentions
      where sg.status = 'new'
    returning 1
  )
  select count(*)::integer from ins
$$;

-- New AI actions, skipping open duplicates. p: [{group, title, detail, evidence, impact, domain, url}]
create or replace function public.dfs_store_aiv_actions(p_client_id uuid, p_run_id uuid, p jsonb)
returns integer
language sql
security definer
set search_path = ''
as $$
  with ins as (
    insert into public.aiv_actions (client_id, "group", title, detail, evidence, impact, domain, url, source, created_run_id)
    select p_client_id, a->>'group', left(private.aiv_norm_text(a->>'title'), 140), left(a->>'detail', 1200),
      coalesce(a->'evidence', '{}'), coalesce(nullif(a->>'impact', ''), 'medium'), left(lower(nullif(a->>'domain', '')), 253),
      case when a->>'url' ~* '^https?://' then left(a->>'url', 2000) end, 'ai', p_run_id
    from jsonb_array_elements(coalesce(p, '[]')) a
    where a->>'group' in ('site', 'own_pages', 'earned', 'claims') and private.aiv_norm_text(a->>'title') <> ''
      and coalesce(a->>'impact', 'medium') in ('high', 'medium', 'low')
      and not exists (
        select 1 from public.aiv_actions x
        where x.client_id = p_client_id and x."group" = a->>'group'
          and (x.status in ('new', 'in_progress') or (x.status = 'declined' and x.updated_at > now() - interval '60 days'))
          and coalesce(x.domain, lower(x.title)) = coalesce(lower(nullif(a->>'domain', '')), lower(private.aiv_norm_text(a->>'title')))
      )
    on conflict do nothing
    returning 1
  )
  select count(*)::integer from ins
$$;

-- Daily housekeeping.
create or replace function public.aiv_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  keep smallint;
begin
  select aiv_answer_retention_days into keep from public.dfs_settings where id;
  update public.aiv_chats set answer = null where answer is not null and created_at < now() - make_interval(days => keep);
  delete from public.aiv_tasks t using public.aiv_runs r
    where t.run_id = r.id and r.status in ('done', 'failed') and r.finished_at < now() - interval '30 days';
  delete from public.aiv_runs where created_at < now() - interval '13 months';
  update public.aiv_runs set status = 'failed', finished_at = now(), error = 'Waited more than a day to start.'
    where status = 'queued' and created_at < now() - interval '1 day';
  update public.dfs_settings set aiv_last_cleanup_at = now() where id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Actions and Backlinks
-- ---------------------------------------------------------------------------

-- p: {status, title?, detail?}
create or replace function public.update_aiv_action(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.aiv_actions;
  v_status text := nullif(p->>'status', '');
  v_work uuid;
begin
  select * into a from public.aiv_actions where id = p_id;
  if a.id is null then
    raise exception 'Unknown action.' using errcode = 'P0001';
  end if;
  perform private.require_aiv_worker(a.client_id);
  if v_status is not null and v_status not in ('new', 'in_progress', 'done', 'declined') then
    raise exception 'Unknown status.' using errcode = '22023';
  end if;

  if v_status = 'done' and a.status <> 'done' then
    insert into public.work_items (client_id, kind, quantity, delivered_on, title, url, source, source_id, created_by)
    values (a.client_id, 'ai_fixes', 1, private.agency_today(), left('AI visibility fix: ' || a.title, 200),
      case when char_length(a.url) <= 500 then a.url end, 'ai_fix', a.id, private.current_member_or_null())
    on conflict (source, source_id, client_id) where source_id is not null do update set delivered_on = excluded.delivered_on
    returning id into v_work;
    update public.aiv_actions set status = 'done', work_item_id = v_work, done_by = private.current_member_or_null(),
      done_at = now(), updated_at = now() where id = p_id;
    perform private.log_backlinks(a.client_id, 'ai.action_done', jsonb_build_object('title', a.title));
  elsif v_status is not null and v_status <> 'done' then
    if a.status = 'done' then
      delete from public.work_items where source = 'ai_fix' and source_id = a.id and client_id = a.client_id;
    end if;
    update public.aiv_actions set status = v_status, work_item_id = null, done_by = null, done_at = null, updated_at = now()
      where id = p_id;
    perform private.log_backlinks(a.client_id, 'ai.action_' || v_status, jsonb_build_object('title', a.title));
  end if;

  if p ? 'title' or p ? 'detail' then
    update public.aiv_actions set
      title = coalesce(nullif(left(private.aiv_norm_text(p->>'title'), 140), ''), title),
      detail = case when p ? 'detail' then left(p->>'detail', 1200) else detail end,
      updated_at = now()
    where id = p_id;
  end if;
end;
$$;

-- p: {group, title, detail, domain, url, impact}
create or replace function public.add_aiv_action(p_client_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_title text := left(private.aiv_norm_text(p->>'title'), 140);
begin
  perform private.require_aiv_worker(p_client_id);
  if v_title = '' then
    raise exception 'Give the action a title.' using errcode = '22023';
  end if;
  if coalesce(p->>'group', '') not in ('site', 'own_pages', 'earned', 'claims') then
    raise exception 'Pick what kind of action it is.' using errcode = '22023';
  end if;
  insert into public.aiv_actions (client_id, "group", title, detail, impact, domain, url, source, created_by, status)
  values (p_client_id, p->>'group', v_title, left(p->>'detail', 1200),
    case when p->>'impact' in ('high', 'medium', 'low') then p->>'impact' else 'medium' end,
    private.aiv_host(p->>'domain'), case when p->>'url' ~* '^https?://' then left(p->>'url', 2000) end,
    'team', private.current_member_or_null(), 'in_progress')
  returning id into v_id;
  return v_id;
end;
$$;

-- Send a site AI answers rely on to Backlinks (Standard Search Review, with the evidence).
-- The app normalises the URL (siteKeyOf). p: {site_key, domain, url, name, type, reason, action_id}
create or replace function public.send_aiv_source_to_backlinks(p_client_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := lower(btrim(coalesce(p->>'site_key', '')));
  v_domain text := lower(btrim(coalesce(p->>'domain', '')));
  v_url text := nullif(btrim(coalesce(p->>'url', '')), '');
  v_name text := left(coalesce(nullif(private.aiv_norm_text(p->>'name'), ''), v_domain), 120);
  v_type public.directory_type := case
    when p->>'type' in (select unnest(enum_range(null::public.directory_type))::text) then (p->>'type')::public.directory_type
    else 'other' end;
  v_reason text := left(nullif(private.aiv_norm_text(p->>'reason'), ''), 200);
  v_action uuid := nullif(p->>'action_id', '')::uuid;
  d public.directories;
  own text;
  opp uuid;
  existed boolean := false;
begin
  perform private.require_aiv_worker(p_client_id);
  if v_key !~ '^[a-z0-9][a-z0-9.-]*[a-z0-9](/[^\s]*)?$' or char_length(v_key) > 300 or position(':' in v_key) > 0
     or v_domain !~ '^[a-z0-9][a-z0-9.-]*\.[a-z0-9-]+$' or char_length(v_domain) > 253 then
    raise exception 'That doesn''t look like a website address.' using errcode = '22023';
  end if;
  if v_url is not null and (v_url !~* '^https?://[^\s]+$' or char_length(v_url) > 2000) then
    v_url := null;
  end if;
  select private.website_host(website) into own from public.clients where id = p_client_id;
  if own is not null and (v_domain = own or own like '%.' || v_domain) then
    raise exception 'That''s the client''s own website.' using errcode = 'P0001';
  end if;

  insert into public.directories (site_key, domain, rank_target, name, type, type_source)
  values (v_key, v_domain, v_domain, v_name, v_type, 'auto')
  on conflict (site_key) do nothing;
  select * into d from public.directories where site_key = v_key;
  if d.status = 'blocked' then
    raise exception 'This site is blocked for all clients (%).', coalesce(d.blocked_reason, 'no reason given') using errcode = 'P0001';
  end if;

  select id into opp from public.backlink_opportunities where client_id = p_client_id and directory_id = d.id;
  if opp is not null then
    existed := true;
  else
    insert into public.backlink_opportunities (client_id, directory_id, status, source, found_url, found_title, ai_reason)
    values (p_client_id, d.id, 'pending_review', 'ai_visibility', v_url, left(v_name, 300), v_reason)
    returning id into opp;
  end if;

  if v_action is not null then
    update public.aiv_actions set opportunity_id = opp,
      status = case when status = 'new' then 'in_progress' else status end, updated_at = now()
    where id = v_action and client_id = p_client_id;
  end if;
  perform private.log_backlinks(p_client_id, 'ai.sent_to_backlinks', jsonb_build_object('site', v_domain, 'existed', existed));
  return jsonb_build_object('opportunity_id', opp, 'existed', existed);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads (security invoker: RLS applies)
-- ---------------------------------------------------------------------------

-- The answers in scope. f: {from, to, models[], countries[], tags[], tags_all, topics[], prompt_ids[]}
create or replace function private.aiv_scope(p_client_id uuid, f jsonb)
returns table (chat_id uuid, prompt_id uuid, model public.aiv_model, country text, run_date date, topic_id uuid, tags text[])
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.prompt_id, c.model, c.country, c.run_date, q.topic_id, q.tags
  from public.aiv_chats c
  join public.aiv_prompts q on q.id = c.prompt_id
  where c.client_id = p_client_id and c.status = 'ok'
    and c.run_date between coalesce((f->>'from')::date, '2000-01-01') and coalesce((f->>'to')::date, '2100-01-01')
    and (jsonb_array_length(coalesce(f->'models', '[]')) = 0 or c.model::text in (select jsonb_array_elements_text(f->'models')))
    and (jsonb_array_length(coalesce(f->'countries', '[]')) = 0 or c.country in (select jsonb_array_elements_text(f->'countries')))
    and (jsonb_array_length(coalesce(f->'topics', '[]')) = 0 or q.topic_id::text in (select jsonb_array_elements_text(f->'topics')))
    and (jsonb_array_length(coalesce(f->'prompt_ids', '[]')) = 0 or q.id::text in (select jsonb_array_elements_text(f->'prompt_ids')))
    and (jsonb_array_length(coalesce(f->'tags', '[]')) = 0 or case
          when coalesce((f->>'tags_all')::boolean, false)
          then q.tags @> array(select jsonb_array_elements_text(f->'tags'))
          else q.tags && array(select jsonb_array_elements_text(f->'tags')) end)
$$;

-- Brand metrics in scope.
create or replace function private.aiv_brand_metrics(p_client_id uuid, f jsonb)
returns table (brand_id uuid, answers integer, mentioned integer, visibility numeric, sov numeric, avg_position numeric,
               sentiment numeric, wins integer, win_rate numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (select * from private.aiv_scope(p_client_id, f)),
  tot as (select count(*)::integer n from s),
  named as (select count(distinct m.chat_id)::integer n from public.aiv_mentions m join s on s.chat_id = m.chat_id),
  b as (select id from public.aiv_brands where client_id = p_client_id and active),
  per as (
    select m.brand_id, count(distinct m.chat_id)::integer as mentioned, avg(m.position) as pos, avg(m.sentiment) as sent,
           count(distinct m.chat_id) filter (where m.position = 1)::integer as wins
    from public.aiv_mentions m join s on s.chat_id = m.chat_id
    where m.brand_id is not null
    group by m.brand_id
  ),
  sumv as (select coalesce(sum(per.mentioned), 0)::integer t from per join b on b.id = per.brand_id)
  select b.id, tot.n, coalesce(per.mentioned, 0),
    case when tot.n > 0 then round(100.0 * coalesce(per.mentioned, 0) / tot.n, 1) end,
    case when sumv.t > 0 then round(100.0 * coalesce(per.mentioned, 0) / sumv.t, 1) end,
    round(per.pos, 2), round(per.sent, 1), coalesce(per.wins, 0),
    case when named.n > 0 then round(100.0 * coalesce(per.wins, 0) / named.n, 1) end
  from b cross join tot cross join named cross join sumv
  left join per on per.brand_id = b.id
$$;

-- Overview: every active brand now and in the previous window of the same length.
create or replace function public.aiv_overview(p_client_id uuid, f jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with w as (
    select coalesce((f->>'from')::date, private.agency_today() - 29) as d_from, coalesce((f->>'to')::date, private.agency_today()) as d_to
  ),
  pf as (
    select f || jsonb_build_object('from', d_from - (d_to - d_from + 1), 'to', d_from - 1) as prev,
           f || jsonb_build_object('from', d_from, 'to', d_to) as cur
    from w
  ),
  cur as (select * from private.aiv_brand_metrics(p_client_id, (select cur from pf))),
  prev as (select * from private.aiv_brand_metrics(p_client_id, (select prev from pf)))
  select jsonb_build_object(
    'answers', coalesce((select max(answers) from cur), 0),
    'previous_answers', coalesce((select max(answers) from prev), 0),
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object(
        'brand_id', b.id, 'name', b.display_name, 'is_own', b.is_own, 'color_slot', b.color_slot,
        'mentioned', c.mentioned, 'visibility', c.visibility, 'sov', c.sov, 'position', c.avg_position,
        'sentiment', c.sentiment, 'win_rate', c.win_rate,
        'prev', jsonb_build_object('visibility', p.visibility, 'sov', p.sov, 'position', p.avg_position,
                                   'sentiment', p.sentiment, 'win_rate', p.win_rate, 'answers', p.answers)
      ) order by c.visibility desc nulls last, b.is_own desc)
      from public.aiv_brands b
      join cur c on c.brand_id = b.id
      left join prev p on p.brand_id = b.id
    ), '[]'::jsonb)
  )
$$;

-- Trend per bucket and brand. p_bucket: day | week | month.
create or replace function public.aiv_trend(p_client_id uuid, f jsonb, p_bucket text)
returns table (bucket date, brand_id uuid, answers integer, mentioned integer, avg_position numeric, sentiment numeric,
               wins integer, named integer, brand_total integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (
    select sc.*, date_trunc(case when p_bucket in ('week', 'month') then p_bucket else 'day' end, sc.run_date::timestamp)::date as bk
    from private.aiv_scope(p_client_id, f) sc
  ),
  tot as (select bk, count(*)::integer n from s group by bk),
  named as (select s.bk, count(distinct m.chat_id)::integer n from s join public.aiv_mentions m on m.chat_id = s.chat_id group by s.bk),
  per as (
    select s.bk, m.brand_id, count(distinct m.chat_id)::integer mentioned, avg(m.position) pos, avg(m.sentiment) sent,
           count(distinct m.chat_id) filter (where m.position = 1)::integer wins
    from s join public.aiv_mentions m on m.chat_id = s.chat_id
    where m.brand_id is not null
    group by s.bk, m.brand_id
  ),
  bt as (select per.bk, sum(per.mentioned)::integer t from per join public.aiv_brands b on b.id = per.brand_id and b.active group by per.bk)
  select tot.bk, b.id, tot.n, coalesce(per.mentioned, 0), round(per.pos, 2), round(per.sent, 1), coalesce(per.wins, 0),
         coalesce(named.n, 0), coalesce(bt.t, 0)
  from tot
  cross join public.aiv_brands b
  left join per on per.bk = tot.bk and per.brand_id = b.id
  left join named on named.bk = tot.bk
  left join bt on bt.bk = tot.bk
  where b.client_id = p_client_id and b.active
  order by tot.bk
$$;

-- Matrix of two dimensions (model, brand, topic, tag, country). Without a brand dimension the own brand is used.
create or replace function public.aiv_matrix(p_client_id uuid, f jsonb, p_rows text, p_cols text)
returns table (row_key text, col_key text, answers integer, mentioned integer, visibility numeric, avg_position numeric,
               sentiment numeric, win_rate numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (
    select sc.chat_id, sc.model::text as model, sc.country, sc.topic_id::text as topic, t.tag
    from private.aiv_scope(p_client_id, f) sc
    left join lateral (select unnest(case when 'tag' in (p_rows, p_cols) then sc.tags else array[null::text] end) as tag) t on true
  ),
  b as (
    select id from public.aiv_brands
    where client_id = p_client_id and active and ('brand' in (p_rows, p_cols) or is_own)
  ),
  base as (
    select s.*, b.id::text as brand, m.position, m.sentiment, (m.id is not null) as hit
    from s cross join b
    left join public.aiv_mentions m on m.chat_id = s.chat_id and m.brand_id = b.id
    where ('tag' not in (p_rows, p_cols) or s.tag is not null)
  ),
  keyed as (
    select case p_rows when 'model' then model when 'country' then country when 'topic' then topic when 'tag' then tag else brand end as rk,
           case p_cols when 'model' then model when 'country' then country when 'topic' then topic when 'tag' then tag else brand end as ck,
           chat_id, hit, position, sentiment
    from base
  )
  select rk, ck, count(distinct chat_id)::integer, count(distinct chat_id) filter (where hit)::integer,
    round(100.0 * count(distinct chat_id) filter (where hit) / nullif(count(distinct chat_id), 0), 1),
    round(avg(position), 2), round(avg(sentiment), 1),
    round(100.0 * count(distinct chat_id) filter (where position = 1) / nullif(count(distinct chat_id), 0), 1)
  from keyed
  where rk is not null and ck is not null
  group by rk, ck
$$;

-- Per question: the own brand's numbers in scope.
create or replace function public.aiv_prompt_table(p_client_id uuid, f jsonb)
returns table (prompt_id uuid, answers integer, mentioned integer, visibility numeric, avg_position numeric, sentiment numeric,
               last_date date)
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (select * from private.aiv_scope(p_client_id, f)),
  own as (select id from public.aiv_brands where client_id = p_client_id and is_own)
  select s.prompt_id, count(*)::integer, count(m.id)::integer, round(100.0 * count(m.id) / nullif(count(*), 0), 1),
    round(avg(m.position), 2), round(avg(m.sentiment), 1), max(s.run_date)
  from s
  left join public.aiv_mentions m on m.chat_id = s.chat_id and m.brand_id = (select id from own)
  group by s.prompt_id
$$;

-- Which tracked brand (if any) owns a domain.
create or replace function private.aiv_domain_brand(p_client_id uuid, p_domain text)
returns table (brand_id uuid, is_own boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, b.is_own from public.aiv_brands b, unnest(b.domains) d
  where b.client_id = p_client_id and b.active and (p_domain = d or p_domain like '%.' || d)
  order by b.is_own desc
  limit 1
$$;

create or replace function public.aiv_sources_domains(p_client_id uuid, f jsonb, p_type text default null,
  p_limit integer default 50, p_offset integer default 0)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (select chat_id from private.aiv_scope(p_client_id, f)),
  tot as (select count(*)::numeric n from s),
  src as (select so.* from public.aiv_sources so join s on s.chat_id = so.chat_id),
  cites as (select count(*)::numeric n from src where cited),
  per as (
    select src.domain, count(*)::integer retrievals,
      count(distinct src.chat_id)::integer chats,
      count(distinct src.chat_id) filter (where src.cited)::integer cited_chats,
      count(*) filter (where src.cited)::integer citations,
      round(avg(src.cite_rank) filter (where src.cited), 1) avg_rank
    from src group by src.domain
  ),
  rows as (
    select per.*, coalesce(d.type, 'other') as type, db.brand_id, coalesce(db.is_own, false) as is_own
    from per
    left join public.aiv_domains d on d.domain = per.domain
    left join lateral private.aiv_domain_brand(p_client_id, per.domain) db on true
    where p_type is null or (p_type = 'own' and db.is_own) or (p_type = 'competitor' and db.brand_id is not null and not db.is_own)
       or coalesce(d.type, 'other') = p_type
  )
  select jsonb_build_object(
    'answers', (select n from tot),
    'total', (select count(*) from rows),
    'types', (select coalesce(jsonb_object_agg(type, n), '{}') from (select type, count(*) n from rows group by type) x),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'domain', r.domain, 'type', r.type, 'retrievals', r.retrievals,
        'retrieved_pct', round(100 * r.chats / nullif((select n from tot), 0), 1),
        'cited_pct', round(100 * r.cited_chats / nullif((select n from tot), 0), 1),
        'citation_share', round(100 * r.citations / nullif((select n from cites), 0), 1),
        'avg_cite_rank', r.avg_rank, 'brand_id', r.brand_id, 'is_own', r.is_own
      ) order by r.chats desc, r.domain)
      from (select * from rows order by chats desc, domain limit p_limit offset p_offset) r), '[]'::jsonb)
  )
$$;

create or replace function public.aiv_sources_urls(p_client_id uuid, f jsonb, p_domain text default null,
  p_limit integer default 50, p_offset integer default 0)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (select chat_id from private.aiv_scope(p_client_id, f)),
  tot as (select count(*)::numeric n from s),
  src as (select so.* from public.aiv_sources so join s on s.chat_id = so.chat_id where p_domain is null or so.domain = p_domain),
  cites as (select count(*)::numeric n from public.aiv_sources so join s on s.chat_id = so.chat_id where so.cited),
  per as (
    select src.url, max(src.domain) domain, max(src.title) title, count(*)::integer retrievals,
      count(distinct src.chat_id)::integer chats, count(distinct src.chat_id) filter (where src.cited)::integer cited_chats,
      count(*) filter (where src.cited)::integer citations, round(avg(src.cite_rank) filter (where src.cited), 1) avg_rank
    from src group by src.url
  )
  select jsonb_build_object(
    'answers', (select n from tot),
    'total', (select count(*) from per),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'url', r.url, 'domain', r.domain, 'title', r.title, 'retrievals', r.retrievals,
        'retrieved_pct', round(100 * r.chats / nullif((select n from tot), 0), 1),
        'cited_pct', round(100 * r.cited_chats / nullif((select n from tot), 0), 1),
        'citation_share', round(100 * r.citations / nullif((select n from cites), 0), 1),
        'avg_cite_rank', r.avg_rank
      ) order by r.chats desc, r.url)
      from (select * from per order by chats desc, url limit p_limit offset p_offset) r), '[]'::jsonb)
  )
$$;

-- Sites AI relies on where competitors appear and the client doesn't.
create or replace function public.aiv_gap(p_client_id uuid, f jsonb, p_limit integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (select * from private.aiv_scope(p_client_id, f)),
  flags as (
    select s.chat_id, s.prompt_id, s.model,
      coalesce(bool_or(b.is_own) filter (where m.id is not null), false) as own_hit,
      array_agg(distinct b.display_name) filter (where m.id is not null and b.id is not null and not b.is_own) as comps
    from s
    left join public.aiv_mentions m on m.chat_id = s.chat_id and m.brand_id is not null
    left join public.aiv_brands b on b.id = m.brand_id and b.active
    group by s.chat_id, s.prompt_id, s.model
  ),
  gap as (select * from flags where not own_hit and coalesce(cardinality(comps), 0) > 0),
  gs as (select g.chat_id, g.prompt_id, g.model, g.comps, so.domain, so.url from gap g join public.aiv_sources so on so.chat_id = g.chat_id),
  per as (
    select gs.domain, count(distinct gs.chat_id)::integer gap_answers,
      array_agg(distinct gs.model::text) as models,
      (array_agg(distinct gs.url))[1:3] as urls,
      (array_agg(distinct gs.prompt_id))[1:5] as prompt_ids
    from gs group by gs.domain
  ),
  comps as (
    select x.domain, array_agg(distinct c) as competitors
    from (select distinct domain, chat_id, comps from gs) x, unnest(x.comps) c
    group by x.domain
  ),
  rows as (
    select per.*, comps.competitors, coalesce(d.type, 'other') as type, coalesce(cardinality(comps.competitors), 0) as comp_n
    from per
    join comps on comps.domain = per.domain
    left join public.aiv_domains d on d.domain = per.domain
    where not exists (select 1 from private.aiv_domain_brand(p_client_id, per.domain))
      and coalesce(d.type, 'other') <> 'social'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'domain', r.domain, 'type', r.type, 'gap_answers', r.gap_answers, 'competitors', to_jsonb(r.competitors),
      'gap_score', r.gap_answers * r.comp_n, 'models', to_jsonb(r.models), 'urls', to_jsonb(r.urls),
      'prompts', (select coalesce(jsonb_agg(q.text), '[]') from public.aiv_prompts q where q.id = any (r.prompt_ids)),
      'in_backlinks', exists (
        select 1 from public.backlink_opportunities o join public.directories dir on dir.id = o.directory_id
        where o.client_id = p_client_id and (dir.domain = r.domain or r.domain like '%.' || dir.domain)),
      'action_id', (select a.id from public.aiv_actions a where a.client_id = p_client_id and a.domain = r.domain
                    and a.status in ('new', 'in_progress') limit 1)
    ) order by r.gap_answers * r.comp_n desc, r.gap_answers desc, r.domain), '[]'::jsonb)
  from (select * from rows order by gap_answers * comp_n desc, gap_answers desc limit p_limit) r
$$;

create or replace function public.aiv_chats_page(p_client_id uuid, f jsonb, p_brand uuid default null, p_q text default null,
  p_limit integer default 25, p_offset integer default 0)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (select * from private.aiv_scope(p_client_id, f)),
  own as (select id from public.aiv_brands where client_id = p_client_id and is_own),
  filtered as (
    select s.*, q.text as prompt_text from s join public.aiv_prompts q on q.id = s.prompt_id
    where (p_brand is null or exists (select 1 from public.aiv_mentions m where m.chat_id = s.chat_id and m.brand_id = p_brand))
      and (p_q is null or q.text ilike '%' || p_q || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.chat_id, 'run_date', r.run_date, 'model', r.model, 'country', r.country, 'prompt_id', r.prompt_id,
        'prompt', r.prompt_text,
        'own_mentioned', exists (select 1 from public.aiv_mentions m where m.chat_id = r.chat_id and m.brand_id = (select id from own)),
        'mentions', (select coalesce(jsonb_agg(jsonb_build_object('name', mm.name, 'position', mm.position, 'brand_id', mm.brand_id)
                       order by mm.position), '[]') from (select * from public.aiv_mentions m where m.chat_id = r.chat_id order by position limit 8) mm),
        'sources', (select count(*) from public.aiv_sources so where so.chat_id = r.chat_id)
      ) order by r.run_date desc, r.chat_id)
      from (select * from filtered order by run_date desc, chat_id limit p_limit offset p_offset) r), '[]'::jsonb)
  )
$$;

create or replace function public.aiv_chat(p_chat_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'run_date', c.run_date, 'model', c.model, 'country', c.country, 'country_fallback', c.country_fallback,
    'status', c.status, 'answer', c.answer, 'model_version', c.model_version, 'fan_out', to_jsonb(c.fan_out),
    'check_url', c.check_url, 'prompt_id', c.prompt_id, 'prompt', q.text, 'error', c.error, 'analyzed', c.analyzed_at is not null,
    'mentions', (select coalesce(jsonb_agg(jsonb_build_object('name', m.name, 'position', m.position, 'brand_id', m.brand_id,
                   'sentiment', m.sentiment, 'quote', m.quote) order by m.position), '[]') from public.aiv_mentions m where m.chat_id = c.id),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('url', so.url, 'domain', so.domain, 'title', so.title,
                   'retrieved', so.retrieved, 'cited', so.cited, 'cite_rank', so.cite_rank, 'type', coalesce(d.type, 'other'))
                   order by so.cited desc, so.cite_rank nulls last, so.domain), '[]')
                from public.aiv_sources so left join public.aiv_domains d on d.domain = so.domain where so.chat_id = c.id),
    'ads', (select coalesce(jsonb_agg(jsonb_build_object('advertiser', a.advertiser, 'domain', a.domain, 'title', a.title, 'url', a.url)), '[]')
            from public.aiv_ads a where a.chat_id = c.id)
  )
  from public.aiv_chats c join public.aiv_prompts q on q.id = c.prompt_id
  where c.id = p_chat_id
$$;

-- Status of the setup, limits and runs for the page.
create or replace function public.aiv_quota(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.dfs_settings%rowtype;
  p public.aiv_projects;
  missing text[] := '{}';
  active_n integer;
  open_run public.aiv_runs;
  last_run public.aiv_runs;
begin
  if not private.can_see_client(p_client_id) then
    return null;
  end if;
  select * into s from public.dfs_settings where id;
  select * into p from public.aiv_projects where client_id = p_client_id;
  select count(*) into active_n from public.aiv_prompts where client_id = p_client_id and status = 'active';
  if p.client_id is null then
    missing := missing || 'Set up the brand and platforms'::text;
  end if;
  if active_n = 0 then
    missing := missing || 'Add at least one question'::text;
  end if;
  select * into open_run from public.aiv_runs where client_id = p_client_id and status in ('queued', 'running') limit 1;
  select * into last_run from public.aiv_runs where client_id = p_client_id order by created_at desc limit 1;
  return jsonb_build_object(
    'has_project', p.client_id is not null,
    'setup_missing', to_jsonb(missing),
    'active_prompts', active_n,
    'prompt_cap', s.aiv_prompts_per_client,
    'brands', (select count(*) from public.aiv_brands where client_id = p_client_id and active),
    'budget_problem', public.aiv_budget_problem(),
    'month_spend', round(private.aiv_month_spend(), 2),
    'monthly_budget', s.aiv_monthly_budget_usd,
    'max_run_usd', s.aiv_max_run_usd,
    'manual_limit', s.aiv_manual_runs_per_client_month,
    'manual_used', (select count(*) from public.aiv_runs where client_id = p_client_id and trigger in ('manual', 'new_prompts')
                      and status <> 'failed' and created_at >= private.agency_month_start()),
    'access', s.aiv_access,
    'open_run', case when open_run.id is null then null else jsonb_build_object(
      'id', open_run.id, 'status', open_run.status, 'stage', open_run.stage, 'counts', open_run.counts,
      'created_at', open_run.created_at, 'trigger', open_run.trigger,
      'tasks', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.aiv_tasks where run_id = open_run.id group by status) x)
    ) end,
    'last_run', case when last_run.id is null then null else jsonb_build_object(
      'id', last_run.id, 'status', last_run.status, 'error', last_run.error, 'counts', last_run.counts,
      'created_at', last_run.created_at, 'finished_at', last_run.finished_at, 'cost_usd', last_run.cost_usd
    ) end,
    'last_done_at', (select max(finished_at) from public.aiv_runs where client_id = p_client_id and status = 'done')
  );
end;
$$;

-- Runs and costs.
create or replace function public.aiv_run_history(p_client_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_see_client(p_client_id) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'trigger', r.trigger, 'status', r.status, 'created_at', r.created_at, 'finished_at', r.finished_at,
      'counts', r.counts, 'error', r.error, 'estimate_usd', r.estimate_usd,
      'dfs_usd', coalesce((select sum(cost_usd) from public.dfs_calls dc where dc.ref = r.id), 0),
      'ai_usd', coalesce((select sum(cost_usd) from public.ai_calls ac where ac.ref = r.id), 0),
      'answers', (select count(*) from public.aiv_chats c where c.run_id = r.id and c.status = 'ok'),
      'created_by', (select tm.full_name from public.team_members tm where tm.id = r.created_by)
    ) order by r.created_at desc)
    from (select * from public.aiv_runs where client_id = p_client_id order by created_at desc limit p_limit) r
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Overview: the AI tile now reads AI Visibility checks
-- ---------------------------------------------------------------------------

create or replace function private.ai_place(p_client_id uuid, p_started date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with checks as (
    select r.id, r.finished_at as checked_at,
      (select count(*) from public.aiv_chats c where c.run_id = r.id and c.status = 'ok')::integer as out_of,
      (select count(distinct m.chat_id) from public.aiv_mentions m join public.aiv_chats c on c.id = m.chat_id
        join public.aiv_brands b on b.id = m.brand_id and b.is_own
        where c.run_id = r.id)::integer as hits
    from public.aiv_runs r
    where r.client_id = p_client_id and r.status = 'done'
  ),
  ordered as (
    select *, row_number() over (order by checked_at desc) as rn from checks
  ),
  baseline as (
    select * from checks
    order by (checked_at::date >= p_started) desc,
             case when checked_at::date >= p_started then checked_at end asc,
             checked_at asc
    limit 1
  )
  select case when not exists (select 1 from checks) then null else jsonb_build_object(
    'current', (select hits from ordered where rn = 1),
    'out_of', (select out_of from ordered where rn = 1),
    'previous', (select hits from ordered where rn = 2),
    'baseline', (select hits from baseline),
    'baseline_checked_at', (select checked_at from baseline),
    'last_checked_at', (select checked_at from ordered where rn = 1),
    'checks', (select count(*) from checks)
  ) end
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.require_aiv_manager(uuid)', 'private.require_aiv_worker(uuid)',
    'private.aiv_next_run_at(text, smallint, timestamptz)', 'private.aiv_month_spend()', 'private.ai_month_spend()',
    'private.aiv_norm_text(text)', 'private.aiv_text_list(jsonb, integer, integer, boolean)', 'private.aiv_host(text)',
    'private.aiv_is_branded(uuid, text)', 'private.aiv_run_params(uuid, uuid[])', 'private.aiv_topic_id(uuid, text)',
    'private.aiv_scope(uuid, jsonb)', 'private.aiv_brand_metrics(uuid, jsonb)', 'private.aiv_domain_brand(uuid, text)',
    'public.aiv_budget_problem()'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;

  foreach fn in array array[
    'public.save_aiv_project(uuid, jsonb)', 'public.seed_aiv_from_setup(uuid)', 'public.save_aiv_brand(uuid, jsonb)',
    'public.save_aiv_topic(uuid, jsonb)', 'public.save_aiv_prompts(uuid, jsonb)', 'public.update_aiv_prompts(uuid[], jsonb)',
    'public.review_aiv_suggestion(uuid, boolean)', 'public.update_aiv_settings(jsonb)',
    'public.request_aiv_run(uuid, numeric, uuid[])', 'public.update_aiv_action(uuid, jsonb)', 'public.add_aiv_action(uuid, jsonb)',
    'public.send_aiv_source_to_backlinks(uuid, jsonb)',
    'public.aiv_overview(uuid, jsonb)', 'public.aiv_trend(uuid, jsonb, text)', 'public.aiv_matrix(uuid, jsonb, text, text)',
    'public.aiv_prompt_table(uuid, jsonb)', 'public.aiv_sources_domains(uuid, jsonb, text, integer, integer)',
    'public.aiv_sources_urls(uuid, jsonb, text, integer, integer)', 'public.aiv_gap(uuid, jsonb, integer)',
    'public.aiv_chats_page(uuid, jsonb, uuid, text, integer, integer)', 'public.aiv_chat(uuid)',
    'public.aiv_quota(uuid)', 'public.aiv_run_history(uuid, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;

  foreach fn in array array[
    'public.dfs_queue_aiv_runs(integer)', 'public.dfs_claim_aiv_run()', 'public.dfs_release_aiv_run(uuid)',
    'public.dfs_store_aiv_chat(uuid, jsonb)', 'public.dfs_store_aiv_analysis(uuid, jsonb)',
    'public.dfs_store_aiv_suggestions(uuid, jsonb)', 'public.dfs_store_aiv_actions(uuid, uuid, jsonb)', 'public.aiv_cleanup()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- The pipeline (service role) reads the gap, own-domain source stats and overview after a run.
grant execute on function public.aiv_gap(uuid, jsonb, integer) to service_role;
grant execute on function public.aiv_sources_domains(uuid, jsonb, text, integer, integer) to service_role;
grant execute on function public.aiv_overview(uuid, jsonb) to service_role;
