-- 0067 · Onboarding: the website step for Git sites (docs/plans/git-cms/08-onboarding.md)
-- With "Sveltia, Decap or Netlify CMS" picked, the step is done only when a Git site is really
-- connected (an "I've invited you" answered earlier for another platform no longer counts);
-- "Later" still skips it. Same function as in 0066 otherwise.

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
  git_ok boolean;
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
    git_ok := exists (select 1 from public.git_connections where client_id = p_client_id and status = 'connected');
    if w.platform = 'git_cms' then
      -- A Git site counts only once its repository really is connected (or "Later").
      s_website := case when git_ok then 'done' when w.access_status = 'later' then 'skipped' else 'in_progress' end;
    elsif w.platform = 'none' or w.access_status in ('invited_us', 'login_in_vault') then
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
