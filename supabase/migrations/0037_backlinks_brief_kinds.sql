-- 0037_backlinks_brief_kinds: enum values the strategy brief work (0038) uses. Only
-- `add value`, kept apart so the next migration can use them.
-- Plan: docs/plans/backlinks/07-strategy-brief.md

-- Places outside the top 30: kept, undecided, shown in the More tab.
alter type public.opportunity_status add value if not exists 'reserve';

alter type public.directory_type add value if not exists 'marketplace';
alter type public.directory_type add value if not exists 'podcast';
alter type public.directory_type add value if not exists 'community';
alter type public.directory_type add value if not exists 'sponsorship';
alter type public.directory_type add value if not exists 'resource_page';

alter type public.footprint_scope add value if not exists 'topic';
alter type public.footprint_scope add value if not exists 'buyer';
