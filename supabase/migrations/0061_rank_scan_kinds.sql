-- 0061 · Ranking scan kinds (docs/plans/ranking-scan/03-data-model.md)
-- Kept apart so 0062 and 0063 can use the new values.

-- Google Search Console through Zernio (read-only; never a social post target).
alter type public.social_platform add value if not exists 'googlesearchconsole';

alter type public.notification_kind add value if not exists 'rank_scan_finished';

create type public.rank_scan_status as enum ('queued', 'running', 'done', 'partial', 'failed');
create type public.rank_scan_trigger as enum ('manual', 'monthly', 'connected');
create type public.rank_scan_source as enum ('dataforseo', 'search_console', 'google_business');
create type public.rank_verdict as enum ('keep', 'quick_win', 'brand', 'watch', 'skip');
