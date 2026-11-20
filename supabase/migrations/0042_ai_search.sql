-- Shockwave AI Search (docs/plans/backlinks/08-shockwave-ai-search.md): the Backlinks page's second
-- tab. Claude (Haiku 5.5 with web search) researches link sources from the strategy brief and the
-- places; no DataForSEO. Every unit of work is a checkpointed task so a redeploy resumes the run.
--
--   ai_search_runs       one run per client at a time (and never next to an open Find places run)
--   ai_search_tasks      the checkpoints (stage, key, status, input, output, usage)
--   ai_client_dossiers   what the AI understood about the client (latest per client)
--   ai_link_prospects    what the AI tab lists; approving one writes it into backlink_opportunities
--
-- The pipeline writes with the service role; people act through the security-definer functions below.

-- ---------------------------------------------------------------------------
-- Settings and the AI ledger
-- ---------------------------------------------------------------------------

alter table public.dfs_settings
  add column ai_search_monthly_budget_usd numeric(8, 2) not null default 30
    check (ai_search_monthly_budget_usd between 0 and 100000),
  add column ai_search_max_run_usd numeric(6, 2) not null default 4
    check (ai_search_max_run_usd between 0.1 and 1000),
  add column ai_search_runs_per_client_month smallint not null default 4
    check (ai_search_runs_per_client_month between 0 and 100),
  add column ai_search_max_web_searches smallint not null default 80
    check (ai_search_max_web_searches between 1 and 1000),
  add column web_search_price_usd numeric(6, 4) not null default 0.01
    check (web_search_price_usd between 0 and 1);

alter table public.ai_calls
  add column stage text check (stage is null or char_length(stage) <= 40),
  add column task_id uuid,
  add column web_searches integer not null default 0 check (web_searches >= 0),
  add column cache_read_tokens integer not null default 0,
  add column cache_write_tokens integer not null default 0;
create index ai_calls_task_idx on public.ai_calls (task_id) where task_id is not null;

-- The Claude review budget (Standard Search) no longer counts AI Search; AI Search has its own.
create or replace function private.ai_month_spend()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(cost_usd), 0) from public.ai_calls
  where created_at >= private.agency_month_start() and feature not like 'ai_search.%'
$$;

create or replace function private.ai_search_month_spend()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(cost_usd), 0) from public.ai_calls
  where created_at >= private.agency_month_start() and feature like 'ai_search.%'
$$;

create or replace function public.dfs_ai_search_budget_problem()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.ai_search_month_spend() >= (select ai_search_monthly_budget_usd from public.dfs_settings where id)
    then 'This month''s Shockwave AI Search budget is used up. An admin can raise it.' end
$$;

-- Approved AI places join the shared list of places (Standard Search's Approved tab).
alter table public.backlink_opportunities drop constraint backlink_opportunities_source_check;
alter table public.backlink_opportunities add constraint backlink_opportunities_source_check
  check (source in ('search', 'core', 'brief', 'ai'));

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.ai_search_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  status public.backlink_run_status not null default 'queued',
  -- 0 queued · 1 dossier · 2 where to rank · 3 competitors · 4 research · 5 merge · 6 verify
  -- · 7 (reserved) · 8 judge · 9 pick · 10 done
  stage smallint not null default 0 check (stage between 0 and 10),
  brief_version integer,
  target_ids uuid[] not null default '{}',
  params jsonb not null default '{}',
  estimate_usd numeric(8, 4) not null default 0,
  cost_usd numeric(8, 4) not null default 0,
  web_searches integer not null default 0,
  counts jsonb not null default '{}',
  error text check (error is null or char_length(error) <= 500),
  attempts smallint not null default 0,
  -- Set when a worker stops on purpose (redeploy): the next cron tick resumes at once.
  released_at timestamptz,
  heartbeat_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index ai_search_runs_one_open_idx on public.ai_search_runs (client_id)
  where status in ('queued', 'running');
create index ai_search_runs_client_idx on public.ai_search_runs (client_id, created_at desc);
create index ai_search_runs_created_by_idx on public.ai_search_runs (created_by);
comment on table public.ai_search_runs is 'Shockwave AI Search runs (Backlinks, second tab). Written by the pipeline (service role).';

create table public.ai_search_tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ai_search_runs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  stage smallint not null check (stage between 1 and 9),
  kind text not null check (char_length(kind) <= 40),
  key text not null check (char_length(key) <= 300),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'skipped')),
  attempts smallint not null default 0,
  input jsonb not null default '{}',
  output jsonb,
  error text check (error is null or char_length(error) <= 500),
  prompt_version text,
  model text,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  web_searches integer not null default 0,
  cost_usd numeric(9, 5) not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, key)
);
create index ai_search_tasks_run_stage_idx on public.ai_search_tasks (run_id, stage, status);
create index ai_search_tasks_client_idx on public.ai_search_tasks (client_id);

create table public.ai_client_dossiers (
  client_id uuid primary key references public.clients (id) on delete cascade,
  run_id uuid references public.ai_search_runs (id) on delete set null,
  brief_version integer,
  dossier jsonb not null default '{}',
  ranking_map jsonb not null default '[]',
  competitors jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
create index ai_client_dossiers_run_idx on public.ai_client_dossiers (run_id);

create table public.ai_link_prospects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  directory_id uuid not null references public.directories (id) on delete restrict,
  status public.opportunity_status not null default 'reserve',
  filter_reason text check (filter_reason in (
    'own_site', 'competitor', 'blocked', 'excluded_term', 'ai_rejected', 'gone', 'ai_invented',
    'not_reachable', 'paid_only', 'language_mismatch', 'spam', 'social_profile'
  )),
  target_ids uuid[] not null default '{}',
  category text not null default 'other' check (char_length(category) <= 40),
  found_by text[] not null default '{}',
  page_url text check (page_url is null or (page_url ~ '^https?://' and char_length(page_url) <= 2000)),
  page_title text check (page_title is null or char_length(page_title) <= 300),
  evidence jsonb not null default '[]',
  verification jsonb not null default '{}',
  scores jsonb not null default '{}',
  fit smallint check (fit is null or fit between 0 and 100),
  authority smallint check (authority is null or authority between 1 and 5),
  verdict text check (verdict is null or verdict in (
    'keep', 'competitor', 'irrelevant', 'paid_link_seller', 'spam', 'not_a_link_opportunity', 'already_have'
  )),
  reason text check (reason is null or char_length(reason) <= 200),
  action text check (action is null or char_length(action) <= 200),
  effort text check (effort is null or effort in ('minutes', 'hours', 'days', 'unknown')),
  cost_type text check (cost_type is null or cost_type in ('free', 'paid_optional', 'paid_only', 'unknown')),
  link_type text check (link_type is null or link_type in ('dofollow', 'nofollow', 'sponsored', 'mention_only', 'unknown')),
  shortlist_rank smallint check (shortlist_rank is null or shortlist_rank between 1 and 30),
  first_run_id uuid references public.ai_search_runs (id) on delete set null,
  last_run_id uuid references public.ai_search_runs (id) on delete set null,
  reject_reason public.backlink_reject_reason,
  reject_note text check (reject_note is null or char_length(reject_note) <= 500),
  notes text check (notes is null or char_length(notes) <= 2000),
  decided_by uuid references public.team_members (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, directory_id),
  check ((status = 'filtered') = (filter_reason is not null)),
  check (status <> 'rejected' or reject_reason is not null)
);
create index ai_link_prospects_client_status_idx on public.ai_link_prospects (client_id, status);
create index ai_link_prospects_directory_idx on public.ai_link_prospects (directory_id);
create index ai_link_prospects_first_run_idx on public.ai_link_prospects (first_run_id);
create index ai_link_prospects_last_run_idx on public.ai_link_prospects (last_run_id);
create index ai_link_prospects_decided_by_idx on public.ai_link_prospects (decided_by);

alter table public.ai_search_runs enable row level security;
alter table public.ai_search_tasks enable row level security;
alter table public.ai_client_dossiers enable row level security;
alter table public.ai_link_prospects enable row level security;

create policy "See AI searches for clients you can see" on public.ai_search_runs
  for select to authenticated using ((select private.can_see_client(client_id)));
create policy "See AI search tasks for clients you can see" on public.ai_search_tasks
  for select to authenticated using ((select private.can_see_client(client_id)));
create policy "See AI dossiers for clients you can see" on public.ai_client_dossiers
  for select to authenticated using ((select private.can_see_client(client_id)));
create policy "See AI prospects for clients you can see" on public.ai_link_prospects
  for select to authenticated using ((select private.can_see_client(client_id)));

-- One search at a time per client across both tabs.
create or replace function private.no_parallel_backlink_runs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.ai_search_runs a
    where a.client_id = new.client_id and a.status in ('queued', 'running')
  ) then
    raise exception 'A Shockwave AI Search is running for this client. Wait for it to finish.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger backlink_runs_no_parallel_ai before insert on public.backlink_runs
  for each row execute function private.no_parallel_backlink_runs();

-- ---------------------------------------------------------------------------
-- Starting, claiming and releasing runs
-- ---------------------------------------------------------------------------

create or replace function public.request_ai_search(
  p_client_id uuid, p_target_ids uuid[], p_options jsonb, p_brief_version integer, p_estimate numeric
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
  n_ok integer;
  used integer;
  missing text[];
  problem text;
begin
  perform private.require_backlinks_worker(p_client_id);
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

  select * into s from public.dfs_settings where id;
  select count(*) into used from public.ai_search_runs
    where client_id = p_client_id and status <> 'failed' and created_at >= private.agency_month_start();
  if used >= s.ai_search_runs_per_client_month then
    raise exception 'This client has used its % AI searches this month. An admin can raise the limit.',
      s.ai_search_runs_per_client_month using errcode = 'P0001';
  end if;
  problem := public.dfs_ai_search_budget_problem();
  if problem is not null then
    raise exception '%', problem using errcode = 'P0001';
  end if;
  if p_estimate is null or p_estimate < 0 then
    raise exception 'Missing cost estimate. Reload the page.' using errcode = 'P0001';
  end if;
  if p_estimate > s.ai_search_max_run_usd then
    raise exception 'This search is estimated at $%, over the $% limit for one run. Pick fewer places or kinds of sites.',
      round(p_estimate, 2), s.ai_search_max_run_usd using errcode = 'P0001';
  end if;

  begin
    insert into public.ai_search_runs (client_id, created_by, target_ids, brief_version, estimate_usd, params)
    values (p_client_id, (select auth.uid()), ids, b.version, round(p_estimate, 4),
      jsonb_build_object(
        'brief', to_jsonb(b) - 'client_id' - 'updated_by' - 'created_at' - 'updated_at',
        'options', coalesce(p_options, '{}'::jsonb),
        'caps', jsonb_build_object(
          'max_usd', s.ai_search_max_run_usd,
          'max_web_searches', s.ai_search_max_web_searches,
          'web_search_price', s.web_search_price_usd
        )
      ))
    returning id into rid;
  exception when unique_violation then
    select id into rid from public.ai_search_runs where client_id = p_client_id and status in ('queued', 'running');
    return rid;
  end;
  perform private.log_backlinks(p_client_id, 'backlink.ai_search_started',
    jsonb_build_object('places', cardinality(ids), 'estimate', round(p_estimate, 2)));
  return rid;
end;
$$;

create or replace function public.dfs_claim_ai_search_run()
returns setof public.ai_search_runs
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_search_runs
    set status = 'failed', finished_at = now(), error = 'Stopped responding three times.'
    where status = 'running' and attempts >= 3
      and released_at is null and heartbeat_at < now() - interval '10 minutes';
  return query
  update public.ai_search_runs
    set status = 'running', attempts = attempts + 1, started_at = coalesce(started_at, now()),
        heartbeat_at = now(), released_at = null
    where id = (
      select id from public.ai_search_runs
      where status = 'queued'
         or (status = 'running' and (released_at is not null or heartbeat_at < now() - interval '10 minutes'))
      order by created_at
      limit 1
      for update skip locked
    )
    returning *;
end;
$$;

-- A worker that is shutting down (redeploy) hands its run back.
create or replace function public.dfs_release_ai_search_run(p_run_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_search_tasks set status = 'queued', started_at = null
    where run_id = p_run_id and status = 'running';
  update public.ai_search_runs set released_at = now(), attempts = greatest(attempts - 1, 0)
    where id = p_run_id and status = 'running';
$$;

-- ---------------------------------------------------------------------------
-- Storing prospects and the top 30
-- ---------------------------------------------------------------------------

-- Candidates after the merge step: library sites and one prospect row each. Decided rows only gain
-- evidence; their status never changes. Returns the prospect ids by site key.
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
      page_url, page_title, evidence, first_run_id, last_run_id
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
      run.id, run.id
    )
    on conflict (client_id, directory_id) do update set
      last_run_id = excluded.last_run_id,
      target_ids = array(select distinct x from unnest(p.target_ids || excluded.target_ids) x),
      found_by = array(select distinct x from unnest(p.found_by || excluded.found_by) x),
      evidence = coalesce((select jsonb_agg(e) from (
        select e from jsonb_array_elements(excluded.evidence || p.evidence) e limit 8) s), '[]'),
      page_url = coalesce(p.page_url, excluded.page_url),
      page_title = coalesce(p.page_title, excluded.page_title),
      category = case when p.decided_by is null then excluded.category else p.category end,
      -- A new run re-checks undecided rows from scratch.
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

-- The top 30: picks to Review, other keeps to More, misfits to Hidden. Never touches decided rows.
create or replace function public.dfs_apply_ai_shortlist(p_run_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.ai_search_runs%rowtype;
  n_review integer;
  n_more integer;
  n_hidden integer;
begin
  select * into run from public.ai_search_runs where id = p_run_id;
  if run.id is null then
    raise exception 'Unknown AI search %', p_run_id using errcode = 'P0002';
  end if;

  update public.ai_link_prospects p set
    status = case it.status
      when 'pending_review' then 'pending_review'::public.opportunity_status
      when 'filtered' then 'filtered'::public.opportunity_status
      else 'reserve'::public.opportunity_status end,
    filter_reason = case when it.status = 'filtered' then coalesce(it.filter_reason, 'ai_rejected') end,
    shortlist_rank = case when it.status = 'pending_review' and it.shortlist_rank between 1 and 30 then it.shortlist_rank end,
    fit = least(100, greatest(0, it.fit)),
    authority = case when it.authority between 1 and 5 then it.authority end,
    verdict = it.verdict,
    reason = left(it.reason, 200),
    action = left(it.action, 200),
    effort = it.effort,
    cost_type = it.cost_type,
    link_type = it.link_type,
    scores = coalesce(it.scores, p.scores),
    updated_at = now()
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as it(
    id uuid, status text, shortlist_rank smallint, filter_reason text, fit smallint, authority smallint,
    verdict text, reason text, action text, effort text, cost_type text, link_type text, scores jsonb
  )
  where p.id = it.id and p.client_id = run.client_id and p.decided_by is null
    and not (p.status = 'filtered' and p.filter_reason = 'blocked');

  with ranked as (
    select id, row_number() over (order by shortlist_rank nulls last, fit desc nulls last, created_at) rn
    from public.ai_link_prospects
    where client_id = run.client_id and status = 'pending_review'
  )
  update public.ai_link_prospects p set status = 'reserve', shortlist_rank = null, updated_at = now()
    from ranked r where r.id = p.id and r.rn > 30 and p.decided_by is null;

  select count(*) filter (where status = 'pending_review'), count(*) filter (where status = 'reserve'),
         count(*) filter (where status = 'filtered')
    into n_review, n_more, n_hidden
    from public.ai_link_prospects where client_id = run.client_id;
  return jsonb_build_object('review', n_review, 'more', n_more, 'hidden', n_hidden);
end;
$$;

-- ---------------------------------------------------------------------------
-- People: review, quota
-- ---------------------------------------------------------------------------

create or replace function public.review_ai_prospects(
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
  p record;
  n_found integer;
  waiting integer;
  total integer := 0;
begin
  if p_decision not in ('approve', 'reject', 'restore', 'promote') then
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
  select count(*) into n_found from public.ai_link_prospects where id = any (ids);
  if n_found <> cardinality(ids) then
    raise exception 'Some of these places no longer exist. Reload the page.' using errcode = 'P0002';
  end if;
  for cid in select distinct client_id from public.ai_link_prospects where id = any (ids) loop
    perform private.require_backlinks_worker(cid);
  end loop;

  for p in
    select x.*, d.name as dname from public.ai_link_prospects x join public.directories d on d.id = x.directory_id
    where x.id = any (ids) order by x.shortlist_rank nulls last, x.fit desc nulls last
  loop
    if p.status = 'filtered' and p.filter_reason = 'blocked' then
      continue;
    end if;
    if p_decision = 'approve' then
      if p.status = 'approved' then continue; end if;
      update public.ai_link_prospects set status = 'approved', filter_reason = null, shortlist_rank = null,
        reject_reason = null, reject_note = null, decided_by = (select auth.uid()), decided_at = now(), updated_at = now()
        where id = p.id;
      insert into public.backlink_opportunities as o (
        client_id, directory_id, status, source, found_url, found_title, ai_reason, target_ids, decided_by, decided_at
      ) values (
        p.client_id, p.directory_id, 'approved', 'ai', p.page_url, p.page_title, left(p.reason, 200), p.target_ids,
        (select auth.uid()), now()
      )
      on conflict (client_id, directory_id) do update set
        status = 'approved', filter_reason = null, shortlist_rank = null, reject_reason = null, reject_note = null,
        found_url = coalesce(o.found_url, excluded.found_url), found_title = coalesce(o.found_title, excluded.found_title),
        decided_by = excluded.decided_by, decided_at = now(), updated_at = now();
    elsif p_decision = 'reject' then
      if p.status = 'rejected' then continue; end if;
      update public.ai_link_prospects set status = 'rejected', filter_reason = null, shortlist_rank = null,
        reject_reason = p_reason, reject_note = nullif(btrim(p_note), ''),
        decided_by = (select auth.uid()), decided_at = now(), updated_at = now()
        where id = p.id;
      -- A place only the AI tab had approved leaves the shared list too.
      update public.backlink_opportunities set status = 'rejected', reject_reason = p_reason,
        reject_note = nullif(btrim(p_note), ''), decided_by = (select auth.uid()), decided_at = now(), updated_at = now()
        where client_id = p.client_id and directory_id = p.directory_id and source = 'ai';
    else
      if p_decision = 'promote' and p.status <> 'reserve' then continue; end if;
      if p_decision = 'restore' and p.status in ('pending_review', 'reserve') then continue; end if;
      select count(*) into waiting from public.ai_link_prospects
        where client_id = p.client_id and status = 'pending_review';
      if waiting >= 30 and p_decision = 'promote' then
        raise exception 'Review already has 30 places. Approve or reject some first.' using errcode = 'P0001';
      end if;
      update public.ai_link_prospects set
        status = case when waiting >= 30 then 'reserve'::public.opportunity_status else 'pending_review'::public.opportunity_status end,
        filter_reason = null, reject_reason = null, reject_note = null,
        decided_by = null, decided_at = null, updated_at = now()
        where id = p.id;
      delete from public.backlink_opportunities
        where client_id = p.client_id and directory_id = p.directory_id and source = 'ai';
    end if;
    total := total + 1;
  end loop;

  if total > 0 then
    perform private.log_backlinks(
      (select client_id from public.ai_link_prospects where id = ids[1]),
      'backlink.ai_reviewed', jsonb_build_object('decision', p_decision, 'count', total,
        'reason', case when p_decision = 'reject' then p_reason end));
  end if;
  return total;
end;
$$;

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
  r public.ai_search_runs%rowtype;
  last_run public.ai_search_runs%rowtype;
begin
  if not private.can_see_client(p_client_id) then
    return null;
  end if;
  select * into s from public.dfs_settings where id;
  select count(*) into used from public.ai_search_runs
    where client_id = p_client_id and status <> 'failed' and created_at >= private.agency_month_start();
  select * into r from public.ai_search_runs where client_id = p_client_id and status in ('queued', 'running') limit 1;
  select * into last_run from public.ai_search_runs where client_id = p_client_id order by created_at desc limit 1;
  return jsonb_build_object(
    'used', used,
    'limit', s.ai_search_runs_per_client_month,
    'max_run_usd', s.ai_search_max_run_usd,
    'max_web_searches', s.ai_search_max_web_searches,
    'web_search_price', s.web_search_price_usd,
    'budget_problem', public.dfs_ai_search_budget_problem(),
    'standard_running', exists (
      select 1 from public.backlink_runs where client_id = p_client_id and status in ('queued', 'running')),
    'open_run', case when r.id is null then null else jsonb_build_object(
      'id', r.id, 'status', r.status, 'stage', r.stage, 'counts', r.counts, 'created_at', r.created_at,
      'target_ids', to_jsonb(r.target_ids), 'cost_usd', r.cost_usd, 'web_searches', r.web_searches,
      'tasks', (
        select coalesce(jsonb_object_agg(stage::text, jsonb_build_object('total', total, 'done', done)), '{}'::jsonb)
        from (
          select stage, count(*) total, count(*) filter (where status in ('done', 'failed', 'skipped')) done
          from public.ai_search_tasks where run_id = r.id group by stage
        ) t
      )
    ) end,
    'last_run', case when last_run.id is null then null else jsonb_build_object(
      'id', last_run.id, 'status', last_run.status, 'error', last_run.error, 'counts', last_run.counts,
      'created_at', last_run.created_at, 'finished_at', last_run.finished_at
    ) end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Runs and costs: AI runs join the history (Claude tokens and web searches)
-- ---------------------------------------------------------------------------

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
      a.id, 'ai', a.status::text, a.created_at, a.finished_at,
      null, a.counts, a.error, a.target_ids, a.created_by,
      0, 0, 0, 0, 0, 0,
      coalesce(x.cost, 0), coalesce(x.calls, 0), x.input_tokens, x.output_tokens, coalesce(x.searches, 0)
    from public.ai_search_runs a
    left join lateral (
      select sum(c.cost_usd) cost, count(*) calls, sum(c.input_tokens) input_tokens, sum(c.output_tokens) output_tokens,
        sum(c.web_searches) searches
      from public.ai_calls c where c.ref = a.id
    ) x on true
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

revoke execute on function private.ai_search_month_spend() from public, anon;
revoke execute on function private.no_parallel_backlink_runs() from public, anon;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.request_ai_search(uuid, uuid[], jsonb, integer, numeric)',
    'public.review_ai_prospects(uuid[], text, public.backlink_reject_reason, text)',
    'public.ai_search_quota(uuid)',
    'public.backlink_run_history(uuid, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.dfs_claim_ai_search_run()',
    'public.dfs_release_ai_search_run(uuid)',
    'public.dfs_store_ai_prospects(uuid, jsonb)',
    'public.dfs_apply_ai_shortlist(uuid, jsonb)',
    'public.dfs_ai_search_budget_problem()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
-- The quota function calls the budget check as the signed-in user: it runs as definer, so no grant needed.
