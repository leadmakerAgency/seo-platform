-- 0064 · Git sites: enums (docs/plans/git-cms/02-data-model.md)
-- Publishing articles to Git-based CMS sites (Sveltia, Decap / Netlify CMS) on GitHub.
-- New enum values live in their own migration: a value added inside a transaction can't be
-- used in that same transaction (same reason as 0058 and 0061).

alter type public.website_platform add value if not exists 'git_cms';
alter type public.website_access_status add value if not exists 'connected';
alter type public.notification_kind add value if not exists 'site_connection_problem';

create type public.git_auth_method as enum ('github_app', 'token');
create type public.git_connection_status as enum ('connected', 'needs_attention', 'removed');
create type public.content_site_kind as enum ('wordpress', 'git');
create type public.git_deploy_state as enum ('none', 'waiting', 'building', 'live', 'failed');
