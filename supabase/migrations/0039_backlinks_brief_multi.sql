-- Strategy brief: reach, buyer and offering take one or more values.
--   reach    ⊆ {local, national, global}   (local + national = both kinds of searches)
--   buyer    ⊆ {b2b, b2c}                  ("both" is now ticking both)
--   offering ⊆ {services, software, products}
-- Footprints and core listings already hold arrays; they match when the lists overlap.

alter table public.backlink_briefs
  drop constraint backlink_briefs_reach_check,
  drop constraint backlink_briefs_buyer_check,
  drop constraint backlink_briefs_offering_check;

alter table public.backlink_briefs
  alter column reach type text[] using array[reach],
  alter column buyer type text[] using (case when buyer = 'both' then array['b2b', 'b2c'] else array[buyer] end),
  alter column offering type text[] using array[offering];

alter table public.backlink_briefs
  add constraint backlink_briefs_reach_check
    check (cardinality(reach) between 1 and 3 and reach <@ array['local', 'national', 'global']),
  add constraint backlink_briefs_buyer_check
    check (cardinality(buyer) between 1 and 2 and buyer <@ array['b2b', 'b2c']),
  add constraint backlink_briefs_offering_check
    check (cardinality(offering) between 1 and 3 and offering <@ array['services', 'software', 'products']);

create or replace function private.backlink_brief_missing(p_client_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b public.backlink_briefs%rowtype;
  missing text[] := '{}';
  topics integer;
begin
  select * into b from public.backlink_briefs where client_id = p_client_id;
  if b.client_id is null then
    return array['Fill in the strategy brief'];
  end if;
  topics := cardinality(b.core_topics) + cardinality(b.adjacent_topics);
  if topics < 5 then
    missing := missing || format('Add %s more topics (5 at least, 10–15 is best)', 5 - topics);
  end if;
  if 'local' = any (b.reach) and not exists (
    select 1 from public.backlink_targets t where t.client_id = p_client_id and t.active and t.kind in ('city', 'region')
  ) then
    missing := missing || 'Add a city or region to the places (the client has local customers)'::text;
  end if;
  if b.reach && array['national', 'global'] and not exists (
    select 1 from public.backlink_targets t where t.client_id = p_client_id and t.active and t.kind = 'country'
  ) then
    missing := missing || 'Add a country to the places (the client has national or global customers)'::text;
  end if;
  return missing;
end;
$$;

-- One value or a list ("local" or ["local","national"]) as a sorted, distinct text[].
create or replace function private.jsonb_text_set(p jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct btrim(x) order by btrim(x)), '{}')
  from jsonb_array_elements_text(
    case jsonb_typeof(p) when 'array' then p when 'string' then jsonb_build_array(p) else '[]'::jsonb end
  ) x
  where btrim(x) <> ''
$$;

create or replace function public.save_backlink_brief(p_client_id uuid, p jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v integer;
  clean_list text;
  v_reach text[];
  v_buyer text[];
  v_offering text[];
begin
  if not private.has_role('{admin,manager}') or not private.can_see_client(p_client_id) then
    raise exception 'Only admins and account managers can change the strategy brief.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'Client not found.' using errcode = 'P0002';
  end if;

  v_reach := private.jsonb_text_set(p->'reach');
  v_buyer := private.jsonb_text_set(p->'buyer');
  v_offering := private.jsonb_text_set(p->'offering');
  if 'both' = any (v_buyer) then
    v_buyer := array['b2b', 'b2c'];
  end if;
  if cardinality(v_reach) = 0 or not v_reach <@ array['local', 'national', 'global'] then
    raise exception 'Choose where the customers are (one or more).' using errcode = 'P0001';
  end if;
  if cardinality(v_buyer) = 0 or not v_buyer <@ array['b2b', 'b2c'] then
    raise exception 'Choose who buys (one or both).' using errcode = 'P0001';
  end if;
  if cardinality(v_offering) = 0 or not v_offering <@ array['services', 'software', 'products'] then
    raise exception 'Choose what the client sells (one or more).' using errcode = 'P0001';
  end if;

  insert into public.backlink_briefs as b (
    client_id, reach, buyer, offering, audience, core_topics, adjacent_topics, trusted_sites,
    competitors, exclude_terms, site_types, notes, updated_by
  )
  select
    p_client_id, v_reach, v_buyer, v_offering,
    nullif(btrim(coalesce(p->>'audience', '')), ''),
    array(select distinct lower(btrim(x)) from jsonb_array_elements_text(coalesce(p->'core_topics', '[]')) x where btrim(x) <> ''),
    array(select distinct lower(btrim(x)) from jsonb_array_elements_text(coalesce(p->'adjacent_topics', '[]')) x where btrim(x) <> ''),
    array(select distinct lower(btrim(x)) from jsonb_array_elements_text(coalesce(p->'trusted_sites', '[]')) x where btrim(x) <> ''),
    array(select distinct lower(btrim(x)) from jsonb_array_elements_text(coalesce(p->'competitors', '[]')) x where btrim(x) <> ''),
    array(select distinct lower(btrim(x)) from jsonb_array_elements_text(coalesce(p->'exclude_terms', '[]')) x where btrim(x) <> ''),
    array(select distinct btrim(x) from jsonb_array_elements_text(coalesce(p->'site_types', '[]')) x where btrim(x) <> ''),
    nullif(btrim(coalesce(p->>'notes', '')), ''),
    (select auth.uid())
  on conflict (client_id) do update set
    reach = excluded.reach, buyer = excluded.buyer, offering = excluded.offering,
    audience = excluded.audience, core_topics = excluded.core_topics,
    adjacent_topics = excluded.adjacent_topics, trusted_sites = excluded.trusted_sites,
    competitors = excluded.competitors, exclude_terms = excluded.exclude_terms,
    site_types = excluded.site_types, notes = excluded.notes,
    version = b.version + 1, updated_by = excluded.updated_by, updated_at = now()
  returning version into v;

  select string_agg(x, ', ') into clean_list from (
    select unnest(core_topics || adjacent_topics || exclude_terms) x from public.backlink_briefs where client_id = p_client_id
  ) s where x ~ '[:{}"]';
  if clean_list is not null then
    raise exception 'Remove : { } or " from: %', clean_list using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.backlink_briefs, unnest(trusted_sites || competitors) d
    where client_id = p_client_id and d !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+(/[^\s]*)?$'
  ) then
    raise exception 'Trusted sites and competitors must be web addresses like clutch.co.' using errcode = 'P0001';
  end if;

  perform private.log_backlinks(p_client_id, 'backlink.brief_saved', jsonb_build_object('version', v));
  return v;
end;
$$;

revoke execute on function public.save_backlink_brief(uuid, jsonb) from public, anon;
grant execute on function public.save_backlink_brief(uuid, jsonb) to authenticated;
revoke execute on function private.backlink_brief_missing(uuid) from public, anon;
revoke execute on function private.jsonb_text_set(jsonb) from public, anon;
