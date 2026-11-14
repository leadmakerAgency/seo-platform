-- 0021_overview_fix_client_log: text[] || 'literal' is read as an array literal;
-- append field names with array_append (same function as 0019, fixed there too).

create or replace function private.clients_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fields text[] := '{}';
  targets jsonb := '{}';
begin
  if new.name is distinct from old.name then fields := array_append(fields, 'name'); end if;
  if new.website is distinct from old.website then fields := array_append(fields, 'website'); end if;
  if new.city is distinct from old.city or new.region is distinct from old.region
     or new.country_code is distinct from old.country_code then
    fields := array_append(fields, 'location');
  end if;
  if new.industry is distinct from old.industry then fields := array_append(fields, 'industry'); end if;
  if new.owner_id is distinct from old.owner_id then fields := array_append(fields, 'owner'); end if;
  if new.stage is distinct from old.stage then fields := array_append(fields, 'stage'); end if;
  if new.started_on is distinct from old.started_on then fields := array_append(fields, 'start date'); end if;
  if new.package is distinct from old.package then fields := array_append(fields, 'package'); end if;

  if new.keywords_target is distinct from old.keywords_target then
    targets := targets || jsonb_build_object('keywords', jsonb_build_array(old.keywords_target, new.keywords_target));
  end if;
  if new.backlinks_target is distinct from old.backlinks_target then
    targets := targets || jsonb_build_object('backlinks', jsonb_build_array(old.backlinks_target, new.backlinks_target));
  end if;
  if new.articles_target is distinct from old.articles_target then
    targets := targets || jsonb_build_object('articles', jsonb_build_array(old.articles_target, new.articles_target));
  end if;
  if new.gbp_posts_target is distinct from old.gbp_posts_target then
    targets := targets || jsonb_build_object('gbp_posts', jsonb_build_array(old.gbp_posts_target, new.gbp_posts_target));
  end if;
  if new.review_requests_target is distinct from old.review_requests_target then
    targets := targets || jsonb_build_object('review_requests', jsonb_build_array(old.review_requests_target, new.review_requests_target));
  end if;
  if new.ai_fixes_target is distinct from old.ai_fixes_target then
    targets := targets || jsonb_build_object('ai_fixes', jsonb_build_array(old.ai_fixes_target, new.ai_fixes_target));
  end if;

  if cardinality(fields) > 0 then
    insert into public.activity_log (actor_id, client_id, action, meta)
    values (
      (select auth.uid()), new.id, 'client.updated',
      jsonb_build_object('fields', to_jsonb(fields))
        || case when new.stage is distinct from old.stage
             then jsonb_build_object('stage', new.stage) else '{}'::jsonb end
    );
  end if;

  if targets <> '{}'::jsonb then
    insert into public.activity_log (actor_id, client_id, action, meta)
    values ((select auth.uid()), new.id, 'client.targets_changed', jsonb_build_object('changes', targets));
  end if;

  -- This month's promise follows target edits; past months never change.
  if targets <> '{}'::jsonb or new.started_on is distinct from old.started_on then
    delete from public.client_month_plans where client_id = new.id and month = private.agency_month();
    perform private.ensure_month_plan(new.id, private.agency_month());
  end if;

  if targets <> '{}'::jsonb or new.stage is distinct from old.stage
     or new.started_on is distinct from old.started_on then
    perform private.check_client_pace(new.id);
  end if;

  return null;
end;
$$;
