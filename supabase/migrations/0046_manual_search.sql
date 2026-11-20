-- 0046_manual_search: the Backlinks page's third tab (docs/plans/backlinks/09-manual-search.md).
--
--   backlink_catalog            the agency's fixed list of trusted sites (one per directory row)
--   backlink_submissions        one per approved place (from any tab): to do → doing → submitted → live
--   backlink_submission_events  the history of each submission
--
-- Every approved place gets a submission (trigger), whichever tab approved it. A live
-- submission writes one work_items row (source 'backlink'), so it counts toward the client's
-- monthly backlink target exactly once. People act only through the security-definer functions.

-- ---------------------------------------------------------------------------
-- The opportunity source gains 'manual' (picked from the catalog or added by hand)
-- ---------------------------------------------------------------------------

alter table public.backlink_opportunities drop constraint backlink_opportunities_source_check;
alter table public.backlink_opportunities add constraint backlink_opportunities_source_check
  check (source in ('search', 'core', 'brief', 'ai', 'manual'));

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.backlink_catalog (
  id uuid primary key default gen_random_uuid(),
  directory_id uuid not null unique references public.directories (id) on delete restrict,
  kind public.catalog_kind not null default 'site',
  category public.catalog_category not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  home_url text check (home_url is null or (home_url ~* '^https?://[^\s]+$' and char_length(home_url) <= 500)),
  submit_url text check (submit_url is null or (submit_url ~* '^https?://[^\s]+$' and char_length(submit_url) <= 500)),
  -- Empty = any. Countries are ISO codes; reach / buyer / offering use the brief's values.
  countries text[] not null default '{}' check (cardinality(countries) <= 60),
  reach text[] not null default '{}' check (reach <@ array['local', 'national', 'global']),
  buyer text[] not null default '{}' check (buyer <@ array['b2b', 'b2c']),
  offering text[] not null default '{}' check (offering <@ array['services', 'software', 'products']),
  -- Keywords matched against the client's category, services and topics (empty = any industry).
  industries text[] not null default '{}' check (cardinality(industries) <= 60),
  pricing public.catalog_pricing not null default 'free',
  price_note text check (price_note is null or char_length(price_note) <= 160),
  typical_link public.link_kind not null default 'unknown',
  priority smallint not null default 2 check (priority between 1 and 3),
  benefits text[] not null default '{}'
    check (benefits <@ array['ranking', 'citation', 'referral', 'ai_visibility', 'entity', 'reviews']),
  needs text[] not null default '{}'
    check (needs <@ array['address', 'phone_verification', 'postcard', 'video_verification', 'website',
                          'logo', 'photos', 'reviews', 'licence', 'payment', 'personal_profile', 'content']),
  how_to text check (how_to is null or char_length(how_to) <= 2000),
  warnings text check (warnings is null or char_length(warnings) <= 500),
  notes text check (notes is null or char_length(notes) <= 1000),
  active boolean not null default true,
  sort integer not null default 0,
  verified_at timestamptz,
  verified_by uuid references public.team_members (id) on delete set null,
  -- A VA's suggestion waits here (inactive) until a manager accepts it.
  suggestion_status text check (suggestion_status in ('pending', 'accepted', 'declined')),
  suggested_by uuid references public.team_members (id) on delete set null,
  suggested_client_id uuid references public.clients (id) on delete set null,
  -- "Report a problem with this entry" (cleared when a manager checks it again).
  problem_note text check (problem_note is null or char_length(problem_note) <= 500),
  problem_by uuid references public.team_members (id) on delete set null,
  problem_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.team_members (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.team_members (id) on delete set null
);
create index backlink_catalog_active_idx on public.backlink_catalog (active, category);
create index backlink_catalog_verified_by_idx on public.backlink_catalog (verified_by);
create index backlink_catalog_suggested_by_idx on public.backlink_catalog (suggested_by);
create index backlink_catalog_suggested_client_idx on public.backlink_catalog (suggested_client_id);
create index backlink_catalog_problem_by_idx on public.backlink_catalog (problem_by);
create index backlink_catalog_created_by_idx on public.backlink_catalog (created_by);
create index backlink_catalog_updated_by_idx on public.backlink_catalog (updated_by);

create table public.backlink_submissions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  opportunity_id uuid not null unique references public.backlink_opportunities (id) on delete cascade,
  directory_id uuid not null references public.directories (id) on delete restrict,
  catalog_id uuid references public.backlink_catalog (id) on delete set null,
  status public.submission_status not null default 'todo',
  block_reason public.submission_block,
  block_note text check (block_note is null or char_length(block_note) <= 500),
  assigned_to uuid references public.team_members (id) on delete set null,
  follow_up_on date,
  listing_url text check (listing_url is null or (listing_url ~* '^https?://[^\s]+$' and char_length(listing_url) <= 2000)),
  link_kind public.link_kind,
  submitted_on date,
  live_on date,
  login_id uuid references public.client_logins (id) on delete set null,
  cost_usd numeric(10, 2) check (cost_usd is null or cost_usd between 0 and 100000),
  cost_note text check (cost_note is null or char_length(cost_note) <= 200),
  notes text check (notes is null or char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  created_by uuid references public.team_members (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.team_members (id) on delete set null,
  constraint backlink_submissions_live_check
    check (status <> 'live' or (listing_url is not null and live_on is not null)),
  constraint backlink_submissions_blocked_check
    check (status <> 'blocked' or block_reason is not null)
);
create index backlink_submissions_client_idx on public.backlink_submissions (client_id, status);
create index backlink_submissions_directory_idx on public.backlink_submissions (directory_id);
create index backlink_submissions_catalog_idx on public.backlink_submissions (catalog_id);
create index backlink_submissions_assigned_idx on public.backlink_submissions (assigned_to, follow_up_on)
  where status in ('doing', 'submitted', 'blocked');
create index backlink_submissions_assigned_fk_idx on public.backlink_submissions (assigned_to);
create index backlink_submissions_login_idx on public.backlink_submissions (login_id);
create index backlink_submissions_created_by_idx on public.backlink_submissions (created_by);
create index backlink_submissions_updated_by_idx on public.backlink_submissions (updated_by);

create table public.backlink_submission_events (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.backlink_submissions (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  actor_id uuid references public.team_members (id) on delete set null,
  at timestamptz not null default now(),
  from_status public.submission_status,
  to_status public.submission_status,
  change jsonb not null default '{}',
  note text check (note is null or char_length(note) <= 500)
);
create index backlink_submission_events_submission_idx on public.backlink_submission_events (submission_id, at);
create index backlink_submission_events_client_idx on public.backlink_submission_events (client_id);
create index backlink_submission_events_actor_idx on public.backlink_submission_events (actor_id);

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

alter table public.backlink_catalog enable row level security;
alter table public.backlink_submissions enable row level security;
alter table public.backlink_submission_events enable row level security;

create policy "Team members read the backlink catalog"
  on public.backlink_catalog for select to authenticated using ((select private.is_team_member()));
create policy "See backlink submissions for clients you can see"
  on public.backlink_submissions for select to authenticated using ((select private.can_see_client(client_id)));
create policy "See backlink submission history for clients you can see"
  on public.backlink_submission_events for select to authenticated using ((select private.can_see_client(client_id)));

revoke all on public.backlink_catalog, public.backlink_submissions, public.backlink_submission_events from anon;
revoke insert, update, delete, truncate on public.backlink_catalog, public.backlink_submissions,
  public.backlink_submission_events from authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The signed-in team member's id, or null (cron, service role): safe for foreign keys.
create or replace function private.current_member_or_null()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.team_members m where m.id = (select auth.uid())
$$;

-- The directory type a catalog category maps to (for new directory rows).
create or replace function private.catalog_directory_type(p public.catalog_category)
returns public.directory_type
language sql
immutable
set search_path = ''
as $$
  select (case p
    when 'maps_core' then 'maps'
    when 'citation' then 'business_directory'
    when 'local_country' then 'business_directory'
    when 'home_services' then 'industry_directory'
    when 'professional' then 'industry_directory'
    when 'b2b_reviews' then 'review_site'
    when 'software' then 'marketplace'
    when 'company_profile' then 'business_directory'
    when 'social_profile' then 'social'
    when 'publishing' then 'news_blog'
    when 'journalist_requests' then 'news_blog'
    when 'press_release' then 'news_blog'
    when 'podcast' then 'podcast'
    when 'local_play' then 'sponsorship'
    when 'community' then 'community'
    when 'ecommerce' then 'review_site'
    when 'marketplace_paid' then 'guest_post'
  end)::public.directory_type
$$;

-- The registrable host of a website ("https://www.kingair.com/x" → "kingair.com").
create or replace function private.website_host(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(lower(btrim(coalesce(p, ''))), '^(https?://)?(www\.)?([^/:?#]+).*$', '\3'), '')
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Every approved place gets a submission; a place that stops being approved is skipped.
create or replace function private.backlink_opportunity_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignee uuid;
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    select m.id into assignee from public.team_members m
      where m.id = new.decided_by and m.role = 'va' and m.status = 'active';
    insert into public.backlink_submissions (client_id, opportunity_id, directory_id, catalog_id, status,
      assigned_to, created_by, updated_by)
    values (new.client_id, new.id, new.directory_id,
      (select c.id from public.backlink_catalog c where c.directory_id = new.directory_id),
      'todo', assignee, private.current_member_or_null(), private.current_member_or_null())
    on conflict (opportunity_id) do nothing;
    -- Approved again after being skipped: back to To do.
    update public.backlink_submissions s set status = 'todo', updated_at = now(),
        updated_by = private.current_member_or_null()
      where s.opportunity_id = new.id and s.status = 'skipped';
  elsif tg_op = 'UPDATE' and old.status = 'approved' and new.status <> 'approved' then
    perform set_config('app.submission_note', 'The place is no longer approved', true);
    update public.backlink_submissions s set status = 'skipped', live_on = null, block_reason = null,
        block_note = null, updated_at = now(), updated_by = private.current_member_or_null()
      where s.opportunity_id = new.id and s.status <> 'skipped';
    perform set_config('app.submission_note', '', true);
  end if;
  return null;
end;
$$;

create trigger backlink_opportunities_submission
  after insert or update of status on public.backlink_opportunities
  for each row execute function private.backlink_opportunity_submission();

-- A live submission is one unit of delivered work (work_items, source 'backlink').
create or replace function private.backlink_submission_work_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  site text;
begin
  if tg_op = 'DELETE' then
    delete from public.work_items where source = 'backlink' and source_id = old.id and client_id = old.client_id;
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status = 'live' and new.status = 'live'
     and old.live_on is not distinct from new.live_on and old.listing_url is not distinct from new.listing_url then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status = 'live' then
    delete from public.work_items where source = 'backlink' and source_id = old.id and client_id = old.client_id;
  end if;
  if new.status = 'live' then
    select d.name into site from public.directories d where d.id = new.directory_id;
    insert into public.work_items (client_id, kind, quantity, delivered_on, title, url, source, source_id, created_by)
    values (new.client_id, 'backlinks', 1, new.live_on, left('Backlink: ' || coalesce(site, 'listing'), 200),
      case when char_length(new.listing_url) <= 500 then new.listing_url end,
      'backlink', new.id, private.current_member_or_null())
    on conflict (source, source_id, client_id) where source_id is not null do update
      set delivered_on = excluded.delivered_on, url = excluded.url, title = excluded.title;
  end if;
  return null;
end;
$$;

create trigger backlink_submissions_work_item
  after insert or update or delete on public.backlink_submissions
  for each row execute function private.backlink_submission_work_item();

-- History: one event per insert and per change of a tracked field.
create or replace function private.backlink_submission_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch jsonb := '{}';
  note text := nullif(current_setting('app.submission_note', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.backlink_submission_events (submission_id, client_id, actor_id, to_status, note)
    values (new.id, new.client_id, private.current_member_or_null(), new.status, note);
    return null;
  end if;
  if old.assigned_to is distinct from new.assigned_to then ch := ch || jsonb_build_object('assigned_to', new.assigned_to); end if;
  if old.follow_up_on is distinct from new.follow_up_on then ch := ch || jsonb_build_object('follow_up_on', new.follow_up_on); end if;
  if old.listing_url is distinct from new.listing_url then ch := ch || jsonb_build_object('listing_url', new.listing_url); end if;
  if old.link_kind is distinct from new.link_kind then ch := ch || jsonb_build_object('link_kind', new.link_kind); end if;
  if old.submitted_on is distinct from new.submitted_on then ch := ch || jsonb_build_object('submitted_on', new.submitted_on); end if;
  if old.live_on is distinct from new.live_on then ch := ch || jsonb_build_object('live_on', new.live_on); end if;
  if old.login_id is distinct from new.login_id then ch := ch || jsonb_build_object('login', new.login_id is not null); end if;
  if old.cost_usd is distinct from new.cost_usd then ch := ch || jsonb_build_object('cost_usd', new.cost_usd); end if;
  if old.block_reason is distinct from new.block_reason then ch := ch || jsonb_build_object('block_reason', new.block_reason); end if;
  if old.notes is distinct from new.notes then ch := ch || jsonb_build_object('notes', true); end if;
  if old.status is distinct from new.status or ch <> '{}' then
    insert into public.backlink_submission_events (submission_id, client_id, actor_id, from_status, to_status, change, note)
    values (new.id, new.client_id, private.current_member_or_null(),
      case when old.status is distinct from new.status then old.status end,
      case when old.status is distinct from new.status then new.status end,
      ch, coalesce(note, case when new.status = 'blocked' and old.status is distinct from new.status then new.block_note end));
  end if;
  return null;
end;
$$;

create trigger backlink_submissions_event
  after insert or update on public.backlink_submissions
  for each row execute function private.backlink_submission_event();

-- ---------------------------------------------------------------------------
-- Picking and adding places
-- ---------------------------------------------------------------------------

-- Approve one directory for a client as a manual place. Returns 'added', 'approved' (was
-- waiting in Standard or AI), 'already' or 'refused:<status>'.
create or replace function private.manual_approve(p_client_id uuid, p_directory_id uuid, p_url text, p_title text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.backlink_opportunities;
begin
  select * into o from public.backlink_opportunities where client_id = p_client_id and directory_id = p_directory_id;
  if not found then
    insert into public.backlink_opportunities (client_id, directory_id, status, source, found_url, found_title,
      decided_by, decided_at)
    values (p_client_id, p_directory_id, 'approved', 'manual',
      case when p_url ~* '^https?://' and char_length(p_url) <= 2000 then p_url end, left(p_title, 300),
      (select auth.uid()), now());
    return 'added';
  end if;
  if o.status = 'approved' then
    -- An approved place from before Manual Search: make sure it has a submission.
    insert into public.backlink_submissions (client_id, opportunity_id, directory_id, catalog_id, created_by, updated_by)
    values (o.client_id, o.id, o.directory_id,
      (select c.id from public.backlink_catalog c where c.directory_id = o.directory_id),
      private.current_member_or_null(), private.current_member_or_null())
    on conflict (opportunity_id) do nothing;
    return 'already';
  end if;
  if o.status in ('pending_review', 'reserve') then
    update public.backlink_opportunities set status = 'approved', shortlist_rank = null, decided_by = (select auth.uid()),
      decided_at = now(), updated_at = now()
      where id = o.id;
    return 'approved';
  end if;
  return 'refused:' || o.status::text;
end;
$$;

-- Pick catalog sites for a client. Returns {added, approved, already, refused: [{id, name, status, reason}]}.
create or replace function public.pick_catalog_sites(p_client_id uuid, p_catalog_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[] := array(select distinct x from unnest(coalesce(p_catalog_ids, '{}')) x);
  c record;
  res text;
  n_added integer := 0;
  n_approved integer := 0;
  n_already integer := 0;
  refused jsonb := '[]';
  names text[] := '{}';
begin
  perform private.require_backlinks_worker(p_client_id);
  if (select stage from public.clients where id = p_client_id) = 'churned' then
    raise exception 'This client has left.' using errcode = 'P0001';
  end if;
  if cardinality(ids) = 0 then
    return jsonb_build_object('added', 0, 'approved', 0, 'already', 0, 'refused', '[]'::jsonb);
  end if;
  if cardinality(ids) > 100 then
    raise exception 'Add at most 100 sites at a time.' using errcode = '22023';
  end if;
  if (select count(*) from public.backlink_catalog where id = any(ids) and active) <> cardinality(ids) then
    raise exception 'Some of these sites are no longer in the catalog. Reload the page.' using errcode = 'P0002';
  end if;

  for c in
    select bc.id, bc.name, bc.directory_id, coalesce(bc.submit_url, bc.home_url) as url
    from public.backlink_catalog bc where bc.id = any(ids) order by bc.priority desc, bc.sort, bc.name
  loop
    res := private.manual_approve(p_client_id, c.directory_id, c.url, c.name);
    if res = 'added' then n_added := n_added + 1;
    elsif res = 'approved' then n_approved := n_approved + 1;
    elsif res = 'already' then n_already := n_already + 1;
    else
      refused := refused || jsonb_build_object(
        'id', c.id, 'name', c.name, 'status', split_part(res, ':', 2),
        'reason', (select coalesce(o.reject_reason::text, o.filter_reason) from public.backlink_opportunities o
                   where o.client_id = p_client_id and o.directory_id = c.directory_id));
    end if;
    if res in ('added', 'approved') and cardinality(names) < 10 then
      names := names || c.name;
    end if;
  end loop;

  if n_added + n_approved > 0 then
    perform private.log_backlinks(p_client_id, 'backlink.manual_picked',
      jsonb_build_object('count', n_added + n_approved, 'sites', to_jsonb(names)));
  end if;
  return jsonb_build_object('added', n_added, 'approved', n_approved, 'already', n_already, 'refused', refused);
end;
$$;

-- Add a site the VA found by hand. The app normalises the URL (siteKeyOf); the database checks it.
-- p: {site_key, domain, url, name, type, cost_type, note, suggest}
create or replace function public.add_manual_site(p_client_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := lower(btrim(coalesce(p->>'site_key', '')));
  v_domain text := lower(btrim(coalesce(p->>'domain', '')));
  v_url text := btrim(coalesce(p->>'url', ''));
  v_name text := btrim(coalesce(p->>'name', ''));
  v_type public.directory_type := coalesce(nullif(p->>'type', ''), 'other')::public.directory_type;
  v_cost text := coalesce(nullif(p->>'cost_type', ''), 'unknown');
  v_note text := nullif(btrim(coalesce(p->>'note', '')), '');
  d public.directories;
  res text;
  own text;
  opp uuid;
begin
  perform private.require_backlinks_worker(p_client_id);
  if v_key !~ '^[a-z0-9][a-z0-9.-]*[a-z0-9](/[^\s]*)?$' or char_length(v_key) > 300 or position(':' in v_key) > 0 then
    raise exception 'That doesn''t look like a website address.' using errcode = '22023';
  end if;
  if v_domain !~ '^[a-z0-9][a-z0-9.-]*\.[a-z0-9-]+$' or char_length(v_domain) > 253 then
    raise exception 'That doesn''t look like a website address.' using errcode = '22023';
  end if;
  if v_url !~* '^https?://[^\s]+$' or char_length(v_url) > 2000 then
    raise exception 'Use a full link starting with https://' using errcode = '22023';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'Give the site a name (up to 120 characters).' using errcode = '22023';
  end if;
  if v_cost not in ('free', 'paid', 'unknown') then
    raise exception 'Unknown cost.' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'Keep the note under 1,000 characters.' using errcode = '22023';
  end if;
  select private.website_host(website) into own from public.clients where id = p_client_id;
  if own is not null and (v_domain = own or own like '%.' || v_domain) then
    raise exception 'That''s the client''s own website.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.clients c where c.id <> p_client_id
             and private.website_host(c.website) in (v_domain, 'www.' || v_domain)) then
    raise exception 'That''s another agency client''s website.' using errcode = 'P0001';
  end if;

  insert into public.directories (site_key, domain, rank_target, name, type, type_source, submit_url, cost_type, notes)
  values (v_key, v_domain, v_domain, v_name, v_type, 'manual',
    case when char_length(v_url) <= 500 then v_url end, v_cost, v_note)
  on conflict (site_key) do nothing;
  select * into d from public.directories where site_key = v_key;
  if d.status = 'blocked' and not private.has_role('{admin,manager}') then
    raise exception 'This site is blocked for all clients (%). Ask a manager.', coalesce(d.blocked_reason, 'no reason given')
      using errcode = 'P0001';
  end if;

  res := private.manual_approve(p_client_id, d.id, v_url, v_name);
  if res like 'refused:%' then
    raise exception 'This place was % for this client before. Restore it in Standard Search first.',
      case split_part(res, ':', 2) when 'rejected' then 'rejected' else 'hidden' end
      using errcode = 'P0001';
  end if;
  select id into opp from public.backlink_opportunities where client_id = p_client_id and directory_id = d.id;

  if coalesce((p->>'suggest')::boolean, false) and not exists (select 1 from public.backlink_catalog where directory_id = d.id) then
    insert into public.backlink_catalog (directory_id, kind, category, name, home_url, active, suggestion_status,
      suggested_by, suggested_client_id, notes, created_by, updated_by)
    values (d.id, 'site',
      case d.type
        when 'maps' then 'maps_core' when 'review_site' then 'b2b_reviews' when 'marketplace' then 'software'
        when 'social' then 'social_profile' when 'news_blog' then 'publishing' when 'podcast' then 'podcast'
        when 'community' then 'community' when 'sponsorship' then 'local_play' when 'guest_post' then 'marketplace_paid'
        when 'industry_directory' then 'professional' else 'citation'
      end::public.catalog_category,
      v_name, case when char_length(v_url) <= 500 then v_url end, false, 'pending',
      private.current_member_or_null(), p_client_id, v_note, private.current_member_or_null(), private.current_member_or_null());
  end if;

  perform private.log_backlinks(p_client_id, 'backlink.manual_added', jsonb_build_object('site', v_name, 'result', res));
  return jsonb_build_object('result', res, 'opportunity_id', opp,
    'submission_id', (select s.id from public.backlink_submissions s where s.opportunity_id = opp));
end;
$$;

-- ---------------------------------------------------------------------------
-- Working a submission
-- ---------------------------------------------------------------------------

-- Apply a patch to one submission (shared by the single and bulk functions). Returns the old status.
create or replace function private.apply_submission_patch(p_id uuid, p jsonb)
returns public.submission_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.backlink_submissions;
  was public.submission_status;
  k text;
begin
  select * into s from public.backlink_submissions where id = p_id for update;
  if not found then
    raise exception 'This listing no longer exists. Reload the page.' using errcode = 'P0002';
  end if;
  perform private.require_backlinks_worker(s.client_id);
  was := s.status;

  for k in select jsonb_object_keys(coalesce(p, '{}')) loop
    if k not in ('status', 'block_reason', 'block_note', 'assigned_to', 'follow_up_on', 'listing_url', 'link_kind',
                 'submitted_on', 'live_on', 'login_id', 'cost_usd', 'cost_note', 'notes') then
      raise exception 'Unknown field %.', k using errcode = '22023';
    end if;
  end loop;

  if p ? 'status' then s.status := (p->>'status')::public.submission_status; end if;
  if p ? 'block_reason' then s.block_reason := nullif(p->>'block_reason', '')::public.submission_block; end if;
  if p ? 'block_note' then s.block_note := nullif(btrim(p->>'block_note'), ''); end if;
  if p ? 'follow_up_on' then s.follow_up_on := nullif(p->>'follow_up_on', '')::date; end if;
  if p ? 'listing_url' then s.listing_url := nullif(btrim(p->>'listing_url'), ''); end if;
  if p ? 'link_kind' then s.link_kind := nullif(p->>'link_kind', '')::public.link_kind; end if;
  if p ? 'submitted_on' then s.submitted_on := nullif(p->>'submitted_on', '')::date; end if;
  if p ? 'live_on' then s.live_on := nullif(p->>'live_on', '')::date; end if;
  if p ? 'cost_usd' then s.cost_usd := nullif(p->>'cost_usd', '')::numeric; end if;
  if p ? 'cost_note' then s.cost_note := nullif(btrim(p->>'cost_note'), ''); end if;
  if p ? 'notes' then s.notes := nullif(btrim(p->>'notes'), ''); end if;
  if p ? 'assigned_to' then
    s.assigned_to := nullif(p->>'assigned_to', '')::uuid;
    if s.assigned_to is not null and not exists (
      select 1 from public.team_members m where m.id = s.assigned_to and m.status = 'active' and m.role in ('admin', 'manager', 'va')
    ) then
      raise exception 'Assign it to an active admin, manager or VA.' using errcode = '22023';
    end if;
  end if;
  if p ? 'login_id' then
    s.login_id := nullif(p->>'login_id', '')::uuid;
    if s.login_id is not null and not exists (select 1 from public.client_logins l where l.id = s.login_id and l.client_id = s.client_id) then
      raise exception 'That login belongs to another client.' using errcode = '22023';
    end if;
  end if;

  if s.listing_url is not null and s.listing_url !~* '^https?://[^\s]+$' then
    raise exception 'Use a full link starting with https://' using errcode = '22023';
  end if;
  if s.live_on is not null and s.live_on > private.agency_today() then
    raise exception 'The live date can''t be in the future.' using errcode = '22023';
  end if;
  if s.status = 'submitted' then
    s.submitted_on := coalesce(s.submitted_on, private.agency_today());
  end if;
  if s.status = 'live' then
    if s.listing_url is null then
      raise exception 'Add the listing URL before marking it live.' using errcode = 'P0001';
    end if;
    s.live_on := coalesce(s.live_on, private.agency_today());
  elsif was = 'live' then
    s.live_on := null;
  end if;
  if s.status = 'blocked' and s.block_reason is null then
    raise exception 'Pick why it''s blocked.' using errcode = '22023';
  end if;
  if s.status <> 'blocked' then
    s.block_reason := null;
    s.block_note := null;
  end if;
  if s.status <> 'skipped' and not exists (
    select 1 from public.backlink_opportunities o where o.id = s.opportunity_id and o.status = 'approved'
  ) then
    raise exception 'This place is no longer approved. Approve it again first.' using errcode = 'P0001';
  end if;

  update public.backlink_submissions set
    status = s.status, block_reason = s.block_reason, block_note = s.block_note, assigned_to = s.assigned_to,
    follow_up_on = s.follow_up_on, listing_url = s.listing_url, link_kind = s.link_kind,
    submitted_on = s.submitted_on, live_on = s.live_on, login_id = s.login_id, cost_usd = s.cost_usd,
    cost_note = s.cost_note, notes = s.notes, updated_at = now(), updated_by = private.current_member_or_null()
  where id = p_id;
  return was;
end;
$$;

create or replace function public.update_submission(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  was public.submission_status;
  s record;
begin
  was := private.apply_submission_patch(p_id, p);
  select x.client_id, x.status, d.name into s from public.backlink_submissions x
    join public.directories d on d.id = x.directory_id where x.id = p_id;
  if s.status is distinct from was then
    perform private.log_backlinks(s.client_id,
      case when s.status = 'live' then 'backlink.went_live' else 'backlink.submission_status' end,
      jsonb_build_object('site', s.name, 'from', was, 'to', s.status));
  end if;
end;
$$;

-- Bulk: status (not live; that needs a URL each), assignee and follow-up date.
create or replace function public.bulk_update_submissions(p_ids uuid[], p jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[] := array(select distinct x from unnest(coalesce(p_ids, '{}')) x);
  k text;
  sid uuid;
  cid uuid;
  n integer := 0;
begin
  if cardinality(ids) = 0 then return 0; end if;
  if cardinality(ids) > 200 then
    raise exception 'Change at most 200 at a time.' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(coalesce(p, '{}')) loop
    if k not in ('status', 'assigned_to', 'follow_up_on') then
      raise exception 'Only status, assignee and follow-up date can be changed in bulk.' using errcode = '22023';
    end if;
  end loop;
  if p->>'status' in ('live', 'blocked') then
    raise exception 'Mark listings live or blocked one at a time.' using errcode = '22023';
  end if;
  foreach sid in array ids loop
    perform private.apply_submission_patch(sid, p);
    n := n + 1;
  end loop;
  for cid in select distinct client_id from public.backlink_submissions where id = any(ids) loop
    perform private.log_backlinks(cid, 'backlink.submissions_bulk', jsonb_build_object('count', n, 'change', p));
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- The catalog (admins and managers edit; everyone on the team reads)
-- ---------------------------------------------------------------------------

-- Create or update a catalog row. New rows need site_key, domain and url (normalised by the app).
create or replace function public.save_catalog_site(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_dir uuid;
  v_cat public.catalog_category := (p->>'category')::public.catalog_category;
  v_key text;
  v_domain text;
  v_url text;
begin
  perform private.require_backlinks_manager();
  if v_cat is null then
    raise exception 'Pick a category.' using errcode = '22023';
  end if;
  if v_id is null then
    v_key := lower(btrim(coalesce(p->>'site_key', '')));
    v_domain := lower(btrim(coalesce(p->>'domain', '')));
    v_url := btrim(coalesce(p->>'home_url', ''));
    if char_length(v_key) < 3 or char_length(v_domain) < 3 then
      raise exception 'Add the site''s address.' using errcode = '22023';
    end if;
    insert into public.directories (site_key, domain, rank_target, name, type, type_source, submit_url, cost_type)
    values (v_key, v_domain, v_domain, left(btrim(p->>'name'), 200), private.catalog_directory_type(v_cat), 'manual',
      nullif(btrim(coalesce(p->>'submit_url', '')), ''),
      case when p->>'pricing' in ('free', 'freemium') then 'free'
           when p->>'pricing' in ('paid', 'membership', 'lead_fees', 'trial') then 'paid' else 'unknown' end)
    on conflict (site_key) do nothing;
    select id into v_dir from public.directories where site_key = v_key;
    if exists (select 1 from public.backlink_catalog where directory_id = v_dir) then
      raise exception 'This site is already in the catalog.' using errcode = '23505';
    end if;
    insert into public.backlink_catalog (directory_id, category, name, created_by, updated_by)
    values (v_dir, v_cat, btrim(p->>'name'), private.current_member_or_null(), private.current_member_or_null())
    returning id into v_id;
  elsif not exists (select 1 from public.backlink_catalog where id = v_id) then
    raise exception 'This catalog entry no longer exists.' using errcode = 'P0002';
  end if;

  update public.backlink_catalog set
    kind = coalesce(nullif(p->>'kind', '')::public.catalog_kind, kind),
    category = v_cat,
    name = btrim(coalesce(p->>'name', name)),
    home_url = case when p ? 'home_url' then nullif(btrim(p->>'home_url'), '') else home_url end,
    submit_url = case when p ? 'submit_url' then nullif(btrim(p->>'submit_url'), '') else submit_url end,
    countries = case when p ? 'countries' then array(select distinct upper(btrim(x)) from jsonb_array_elements_text(p->'countries') x where btrim(x) <> '') else countries end,
    reach = case when p ? 'reach' then array(select distinct x from jsonb_array_elements_text(p->'reach') x) else reach end,
    buyer = case when p ? 'buyer' then array(select distinct x from jsonb_array_elements_text(p->'buyer') x) else buyer end,
    offering = case when p ? 'offering' then array(select distinct x from jsonb_array_elements_text(p->'offering') x) else offering end,
    industries = case when p ? 'industries' then array(select distinct lower(btrim(x)) from jsonb_array_elements_text(p->'industries') x where btrim(x) <> '') else industries end,
    pricing = coalesce(nullif(p->>'pricing', '')::public.catalog_pricing, pricing),
    price_note = case when p ? 'price_note' then nullif(btrim(p->>'price_note'), '') else price_note end,
    typical_link = coalesce(nullif(p->>'typical_link', '')::public.link_kind, typical_link),
    priority = coalesce(nullif(p->>'priority', '')::smallint, priority),
    benefits = case when p ? 'benefits' then array(select distinct x from jsonb_array_elements_text(p->'benefits') x) else benefits end,
    needs = case when p ? 'needs' then array(select distinct x from jsonb_array_elements_text(p->'needs') x) else needs end,
    how_to = case when p ? 'how_to' then nullif(btrim(p->>'how_to'), '') else how_to end,
    warnings = case when p ? 'warnings' then nullif(btrim(p->>'warnings'), '') else warnings end,
    notes = case when p ? 'notes' then nullif(btrim(p->>'notes'), '') else notes end,
    active = coalesce((p->>'active')::boolean, active),
    sort = coalesce(nullif(p->>'sort', '')::integer, sort),
    suggestion_status = case when suggestion_status = 'pending' and coalesce((p->>'active')::boolean, false) then 'accepted' else suggestion_status end,
    updated_at = now(),
    updated_by = private.current_member_or_null()
  where id = v_id
  returning directory_id into v_dir;

  -- Keep the shared library row's start page and cost in step.
  update public.directories d set
    submit_url = coalesce((select c.submit_url from public.backlink_catalog c where c.id = v_id), d.submit_url),
    cost_type = case (select c.pricing from public.backlink_catalog c where c.id = v_id)
      when 'free' then 'free' when 'freemium' then 'free'
      when 'paid' then 'paid' when 'membership' then 'paid' when 'lead_fees' then 'paid' when 'trial' then 'paid'
      else d.cost_type end,
    updated_at = now()
  where d.id = v_dir;

  perform private.log_backlinks(null, 'catalog.site_saved', jsonb_build_object('site', (select name from public.backlink_catalog where id = v_id)));
  return v_id;
end;
$$;

-- Mark an entry as checked today (clears a reported problem).
create or replace function public.verify_catalog_site(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_backlinks_manager();
  update public.backlink_catalog set verified_at = now(), verified_by = private.current_member_or_null(),
    problem_note = null, problem_by = null, problem_at = null, updated_at = now(), updated_by = private.current_member_or_null()
  where id = p_id;
  if not found then
    raise exception 'This catalog entry no longer exists.' using errcode = 'P0002';
  end if;
end;
$$;

-- Accept (make active) or decline a VA's suggestion.
create or replace function public.review_catalog_suggestion(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_backlinks_manager();
  update public.backlink_catalog set
    suggestion_status = case when p_accept then 'accepted' else 'declined' end,
    active = p_accept, updated_at = now(), updated_by = private.current_member_or_null()
  where id = p_id and suggestion_status = 'pending';
  if not found then
    raise exception 'This suggestion was already handled. Reload the page.' using errcode = 'P0002';
  end if;
  perform private.log_backlinks(null, 'catalog.suggestion_reviewed',
    jsonb_build_object('site', (select name from public.backlink_catalog where id = p_id), 'accepted', p_accept));
end;
$$;

-- Anyone working backlinks can flag a catalog entry that looks wrong.
create or replace function public.report_catalog_problem(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role('{admin,manager,va}') then
    raise exception 'Only admins, account managers and VAs can report problems.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) not between 3 and 500 then
    raise exception 'Say what''s wrong in 3 to 500 characters.' using errcode = '22023';
  end if;
  update public.backlink_catalog set problem_note = btrim(p_note), problem_by = private.current_member_or_null(),
    problem_at = now()
  where id = p_id;
  if not found then
    raise exception 'This catalog entry no longer exists.' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill: places approved before Manual Search get a submission
-- ---------------------------------------------------------------------------

insert into public.backlink_submissions (client_id, opportunity_id, directory_id, catalog_id, status)
select o.client_id, o.id, o.directory_id, null, 'todo'
from public.backlink_opportunities o
where o.status = 'approved'
on conflict (opportunity_id) do nothing;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.current_member_or_null()',
    'private.catalog_directory_type(public.catalog_category)',
    'private.website_host(text)',
    'private.manual_approve(uuid, uuid, text, text)',
    'private.apply_submission_patch(uuid, jsonb)',
    'private.backlink_opportunity_submission()',
    'private.backlink_submission_work_item()',
    'private.backlink_submission_event()'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
  end loop;
  foreach fn in array array[
    'public.pick_catalog_sites(uuid, uuid[])',
    'public.add_manual_site(uuid, jsonb)',
    'public.update_submission(uuid, jsonb)',
    'public.bulk_update_submissions(uuid[], jsonb)',
    'public.save_catalog_site(jsonb)',
    'public.verify_catalog_site(uuid)',
    'public.review_catalog_suggestion(uuid, boolean)',
    'public.report_catalog_problem(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
