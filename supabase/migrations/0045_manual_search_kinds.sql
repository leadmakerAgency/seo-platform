-- 0045_manual_search_kinds: enums for Manual Search (docs/plans/backlinks/09-manual-search.md).
-- `add value` is kept apart so the next migration can use the new notification kind.

alter type public.notification_kind add value if not exists 'backlink_follow_up';

-- What kind of catalog entry: a fixed site, or a play (the VA finds the local site and records it).
create type public.catalog_kind as enum ('site', 'play');

create type public.catalog_category as enum (
  'maps_core', 'citation', 'local_country', 'home_services', 'professional', 'b2b_reviews',
  'software', 'company_profile', 'social_profile', 'publishing', 'journalist_requests',
  'press_release', 'podcast', 'local_play', 'community', 'ecommerce', 'marketplace_paid'
);

create type public.catalog_pricing as enum (
  'free', 'freemium', 'trial', 'paid', 'lead_fees', 'membership', 'selection', 'retired'
);

create type public.link_kind as enum ('follow', 'nofollow', 'mixed', 'varies', 'none', 'unknown');

create type public.submission_status as enum ('todo', 'doing', 'submitted', 'live', 'blocked', 'skipped');

create type public.submission_block as enum (
  'verification', 'needs_client_info', 'needs_payment', 'site_rejected', 'site_broken',
  'duplicate_found', 'other'
);
