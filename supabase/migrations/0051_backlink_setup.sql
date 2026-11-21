-- 0051 · Shared backlink setup (docs/plans/backlinks/12-shared-setup.md)
--
-- The brief and the places are one setup for all three Backlinks tabs. The page reads the
-- places and what is still missing from here, and locks the tabs until `missing` is empty.
-- `missing` is the exact text the run RPCs use (private.backlink_brief_missing), so the gate
-- and the server rule can never disagree.

drop function if exists public.backlink_setup_missing(uuid);

create or replace function public.backlink_setup(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_see_client(p_client_id) then
    return null;
  end if;
  return jsonb_build_object(
    'missing', to_jsonb(private.backlink_brief_missing(p_client_id)),
    'targets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'label', t.label, 'kind', t.kind, 'country_iso', t.country_iso,
        'location_name', t.location_name, 'search_name', t.search_name, 'active', t.active,
        'last_searched_at', ls.at,
        'searchable_at', case when ls.at > now() - interval '24 hours' then ls.at + interval '24 hours' end,
        'places', (select count(*) from public.backlink_opportunities o
                   where o.client_id = p_client_id and t.id = any (o.target_ids) and o.status <> 'filtered')
      ) order by t.created_at)
      from public.backlink_targets t
      cross join lateral (select private.backlink_target_last_search(t.id) as at) ls
      where t.client_id = p_client_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.backlink_setup(uuid) from public, anon;
grant execute on function public.backlink_setup(uuid) to authenticated, service_role;
