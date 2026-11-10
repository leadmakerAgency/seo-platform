-- 0003_setup_required_grants: only the anon role may call setup_required().
-- Functions are executable by PUBLIC by default, which authenticated inherits.
revoke execute on function public.setup_required() from public, authenticated;
grant execute on function public.setup_required() to anon;
