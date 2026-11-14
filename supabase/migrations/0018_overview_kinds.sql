-- 0018_overview_kinds: enums for the client Overview (deliverables, work ledger,
-- packages) and for the ranking / AI-answer tables the Rankings and AI visibility
-- pages will fill. Kept apart so later migrations can use the new values.

create type public.package_kind as enum ('seo', 'geo', 'seo_geo', 'custom');

-- What we promise each month. Order = display order on the Overview.
create type public.deliverable_kind as enum (
  'backlinks', 'articles', 'gbp_posts', 'review_requests', 'ai_fixes'
);

-- Where a unit of delivered work came from. 'task' and 'manual' are used now;
-- the rest are written by the Backlinks, Content, Reviews and AI visibility pages.
create type public.work_source as enum (
  'task', 'manual', 'backlink', 'article', 'gbp_post', 'review_request', 'ai_fix'
);

create type public.rank_engine as enum ('google', 'bing', 'google_maps');

-- Copilot has no API (product plan), so it is not tracked.
create type public.ai_tool as enum ('chatgpt', 'perplexity', 'gemini', 'ai_overviews', 'claude');

create type public.check_status as enum ('running', 'done', 'failed');
