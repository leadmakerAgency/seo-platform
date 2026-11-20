-- 0048_manual_search_logins: VAs create accounts on directories while working a listing, so they
-- may save that login to the vault for that listing (add_client_login stays admin/manager only).
-- The password goes straight to Supabase Vault; only the secret id is stored.

create or replace function public.add_backlink_login(
  p_submission_id uuid, p_site_name text, p_site_url text, p_username text, p_password text, p_has_2fa boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.backlink_submissions;
  secret uuid;
  new_id uuid;
begin
  select * into s from public.backlink_submissions where id = p_submission_id;
  if not found then
    raise exception 'This listing no longer exists. Reload the page.' using errcode = 'P0002';
  end if;
  perform private.require_backlinks_worker(s.client_id);
  if char_length(btrim(coalesce(p_site_name, ''))) not between 1 and 120 then
    raise exception 'Name the site (up to 120 characters).' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_username, ''))) not between 1 and 200 then
    raise exception 'Enter the username or email (up to 200 characters).' using errcode = 'P0001';
  end if;
  if coalesce(char_length(p_password), 0) not between 1 and 500 then
    raise exception 'Enter the password (up to 500 characters).' using errcode = 'P0001';
  end if;
  if p_site_url is not null and btrim(p_site_url) <> '' and (btrim(p_site_url) !~* '^https?://[^\s]+$' or char_length(p_site_url) > 500) then
    raise exception 'Use a full link starting with https://' using errcode = 'P0001';
  end if;
  secret := vault.create_secret(p_password, null, 'Client login (backlink listing)');
  insert into public.client_logins (client_id, site_name, site_url, username, secret_id, has_2fa, source, created_by)
  values (s.client_id, btrim(p_site_name), nullif(btrim(coalesce(p_site_url, '')), ''), btrim(p_username), secret,
    coalesce(p_has_2fa, false), 'team', (select auth.uid()))
  returning id into new_id;
  update public.backlink_submissions set login_id = new_id, updated_at = now(),
    updated_by = private.current_member_or_null()
  where id = p_submission_id;
  perform private.log_onboarding(s.client_id, 'vault.added', jsonb_build_object('site', btrim(p_site_name)));
  return new_id;
end;
$$;

revoke execute on function public.add_backlink_login(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.add_backlink_login(uuid, text, text, text, text, boolean) to authenticated;
