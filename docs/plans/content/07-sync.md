# Content · 07 · Sync, notifications, work items

## Webhooks

`/api/webhooks/zernio`:

1. Checks the signature, stores the event (deduplicated on its id), answers 2xx, then processes it.
2. `processWebhookEvent` sends `post.*` events to `processPostEvent()`.
3. `processPostEvent()` finds our post (`metadata.content_post_id`, or `zernio_post_id`) and reads it back from Zernio with `getPost`.
4. It stores the result with `zernio_store_post_result`. Events that aren't ours are marked "ignored".
5. Failed processing is retried by the hourly cron (up to 5 attempts).

**After the deploy:** an admin clicks **Register webhook** once (Connections → Integration card) so the post events are subscribed, then **Send test**.

## Reconcile (`reconcileContent`)

**When it runs:**
- in the hourly `zernio-sync` cron;
- on the Content page, after the page is sent, when something is overdue (`needsReconcile`).

| What | When | Call |
|---|---|---|
| Scheduled or publishing posts | Their time passed 15 minutes ago and they weren't checked in the last 30 minutes | `getPost` |
| Published posts of the last 7 days | Once a day (notices posts removed on the platform) | `getPost` |
| Scheduled articles | Their time passed 5 minutes ago | `getArticle` (publish → published; still waiting after 2 hours → the WP-Cron warning) |

- **Budget:** 200 Zernio calls per cron run, 30 per page visit.
- **Gone posts:** a 404 from Zernio marks the post cancelled.

## Notifications (bell)

- `content_failed`: a post failed or partly failed, or an article failed. Goes to the writer and the client's owner, but not to whoever caused it. The bell links to the post, or to the article editor.
- `content_published`: a scheduled post or article went live. Goes to the writer.

## Activity (client history)

| Entry | When |
|---|---|
| `content.post_scheduled`, `_published`, `_partial`, `_failed`, `_cancelled`, `_deleted` | A post changes state |
| `content.article_scheduled`, `_published`, `_failed`, `_deleted` | An article changes state |

Wording lives in `features/team/activity.ts`.

## Work items (Overview)

Triggers count **published articles** (`articles`) and **published Google Business Profile posts** (`gbp_posts`, one per Google account of a post) toward the month's targets, once each. If they're taken down or unpublished, the count is removed.

New **content** tasks default to counting nothing, so an article isn't counted twice; pick "Articles" by hand for work published outside the Content page.
