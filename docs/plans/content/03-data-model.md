# Content · 03 · Data model

Migrations: `0058_content_kinds.sql` (enums), `0059_content.sql` (tables, RLS, storage), `0060_content_functions.sql` (functions and triggers; applied in three parts `_1_team`, `_2_store`, `_3_triggers`).

## Enums

- `social_platform` + `wordpress` (a website account at Zernio; never a social post target).
- `notification_kind` + `content_failed`, `content_published`.
- `content_status`: draft, scheduled, publishing, published, partial, failed, cancelled.
- `content_target_status`: pending, publishing, published, failed, cancelled, deleted.
- `content_media_kind`: image, video, document.

## Tables

| Table | What | Notes |
|---|---|---|
| `content_settings` | One per client: `timezone`, `default_cta_url`, `signature`, `wp_account_id` (the WordPress `social_accounts` row), `wp_blog_id`, `wp_blog_name`, `wp_site_url`, `wp_default_author`, `wp_default_tags` | Written by `save_content_settings` (admins, managers) |
| `content_media` | Files in bucket `content-media` at `<client_id>/<media_id>/<file>`; `zernio_url` + `zernio_uploaded_at` cache the Zernio copy | `storage_path` must start with the client id |
| `content_posts` | One logical post: `content`, ordered `media_ids`, `status`, `scheduled_for`, `timezone`, `zernio_post_id`, `version` / `sent_version`, `sending_at` (send lock), `last_error`, `last_event_at` | |
| `content_post_targets` | One account of a post: snapshots (`zernio_account_id`, `platform`, `account_name`), `custom_content`, `custom_media_ids`, `settings` jsonb, `status`, `platform_post_url`, error fields | Unique (post, account). Never `wordpress` |
| `content_articles` | A WordPress article: `title`, `slug`, `body_html` (cleaned), excerpt, tags, featured image, SEO title + meta (for pasting), focus keyword, `publish_at`, `wp_*` ids and status, `version` / `sent_version`, `seo_pasted_at` | |
| `content_events` | History per post or article: created, edited, scheduled, publishing, published, partial, failed, cancelled, retried, unpublished, deleted_on_platform, draft | Written by triggers and the store functions |
| `notifications` | + `content_post_id`, `content_article_id` | Bell links to the post or the editor |

**RLS:** select for team members on clients they can see (`private.can_see_client`), on every table. No insert, update or delete grants: all writes go through the functions below.

## Storage

- `content-media`: private, 500 MB a file; JPEG, PNG, WebP, GIF, MP4, MOV, WebM, PDF.
- `content-inline`: public, 20 MB images, at `<client_id>/<random uuid>.<ext>`: images inside article bodies, shown by WordPress from this URL.
- **Policies:** read for team members who can see the client (`private.can_read_content_object`); upload and delete for admins, managers and writers on that client (`private.can_write_content_object`). The client id is the first path segment.
- **Project limit:** Supabase's global upload limit (Storage → Settings) must be raised to 500 MB for large videos.

## Team functions (security definer; check role and client)

| Function | Who | Does |
|---|---|---|
| `save_content_post(client, p)` | `content.write` | Create or edit a draft, cancelled or scheduled post; replaces its targets; refuses WordPress and other clients' accounts, files not in the client's library, edits while sending, a scheduled time under 2 minutes away. Cancelled → draft. Bumps `version` |
| `delete_content_post(id)` | `content.write` | Drafts, cancelled and failed only |
| `save_content_article(client, p)` | `content.write` | Create or edit an article (the server cleans the HTML first); counts words; checks the slug, the featured image and the keyword belong to the client |
| `delete_content_article(id)` | `content.write` | Drafts, cancelled and failed only |
| `set_content_article_seo(id, done)` | `content.write` | The "SEO fields pasted" tick |
| `save_content_settings(client, p)` | `content.settings` | Partial update; checks the time zone and the WordPress account |
| `save_content_media(client, p)` / `delete_content_media(id)` | `content.write` | Records an upload (the object must exist) or edits alt text; delete refuses files used by drafts or scheduled items and returns the paths to remove |

## Server functions (service role only)

- `content_claim_send(kind, id)`: one send at a time (`sending_at`, 3-minute lease); returns the version to send.
- `zernio_store_post_result(post, p)`: Zernio's post status and each account's status, link and error. Ignores events older than `last_event_at`, never turns published back into publishing (unless `force`), works out the post status from its accounts when an event carries none, cancels waiting accounts on cancel, `retry` resets failed accounts.
- `zernio_store_article_result(article, p)`: WordPress ids, link and status.

## Triggers

- **Posts and articles:** history events, activity (`content.post_*`, `content.article_*`), notifications (failed → the writer and the client owner; published after a schedule → the writer), never to the person who did it.
- **Work items:** a published Google Business Profile target → `work_items (gbp_posts, source gbp_post)`; a published article → `work_items (articles, source article)`. Leaving published removes it. These count toward the Overview's monthly targets.

## Changed existing pieces

- `private.platform_label` knows WordPress.
- `private.onboarding_refresh` ignores WordPress in the social step.
- New **content** tasks no longer count as an article by default (`defaultCountsAs`): the Content page counts the article when it's published. Existing tasks keep what they had.
