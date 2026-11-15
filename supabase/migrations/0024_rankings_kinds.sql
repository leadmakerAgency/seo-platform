-- 0024_rankings_kinds: enums for Rankings (DataForSEO). Kept apart so the next
-- migrations can use the new values (an enum value can't be used in the
-- transaction that adds it).

create type public.check_scope as enum ('full', 'partial');
create type public.rank_run_trigger as enum ('schedule', 'manual', 'new_keywords');
create type public.rank_run_status as enum ('queued', 'running', 'done', 'partial', 'failed');
create type public.serp_task_status as enum ('posted', 'done', 'failed', 'expired');
create type public.research_status as enum ('queued', 'running', 'done', 'failed');
create type public.research_trigger as enum ('manual', 'setup', 'monthly');
create type public.candidate_status as enum ('new', 'tracked', 'dismissed');
create type public.keyword_source as enum ('manual', 'research', 'onboarding', 'ranked');
create type public.dfs_api as enum ('serp_google', 'serp_maps', 'serp_bing', 'labs', 'google_ads', 'appendix');

alter type public.notification_kind add value if not exists 'research_finished';
alter type public.notification_kind add value if not exists 'dfs_low_balance';
