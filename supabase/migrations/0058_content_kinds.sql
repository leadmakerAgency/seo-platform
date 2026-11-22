-- 0058 · Content kinds (docs/plans/content/03-data-model.md)
-- Kept apart so 0059 and 0060 can use the new values (a new enum value can't be used in the
-- transaction that adds it).

-- WordPress sites are Zernio accounts too (Blogs API only, never social posts).
alter type public.social_platform add value if not exists 'wordpress';

alter type public.notification_kind add value if not exists 'content_failed';
alter type public.notification_kind add value if not exists 'content_published';

-- One logical post or article. Mirrors Zernio's post statuses.
create type public.content_status as enum (
  'draft', 'scheduled', 'publishing', 'published', 'partial', 'failed', 'cancelled'
);

-- One account of a post.
create type public.content_target_status as enum (
  'pending', 'publishing', 'published', 'failed', 'cancelled', 'deleted'
);

create type public.content_media_kind as enum ('image', 'video', 'document');
