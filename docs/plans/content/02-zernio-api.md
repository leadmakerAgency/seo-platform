# Content · 02 · Zernio API (what we call)

Client code: `src/lib/zernio/client.ts` (`request()`), `src/lib/zernio/content.ts` (calls), `src/lib/zernio/content-schemas.ts` (loose zod shapes and normalisers).

- **Writes** never retry automatically. Posts and articles send an `Idempotency-Key` (`lm-<kind>-<id>-v<version>-<action>`), so a manual retry or double click replays Zernio's first answer for 24 hours instead of posting twice.
- **Timeouts:** reads 10 s; publishing calls (`createPost` with `publishNow`, retry, edit, unpublish, articles) 60 s.
- **Errors** become `ZernioError(status, code, details)`; `zernioProblem()` in `features/content/server.ts` turns them into words a person can act on (402 balance or billing, 409 duplicate, 429 busy, 5xx try again).

## Posts

| Function | Call | Used for |
|---|---|---|
| `createPost(body, key)` | `POST /v1/posts` | Schedule (`scheduledFor` wall clock + `timezone`) or publish now (`publishNow: true`). A `207` still counts as an answer: we store `post.status` and each platform's result |
| `updatePost(id, body, key)` | `PUT /v1/posts/{id}` | A scheduled post's edit (version > sent_version) |
| `deletePost(id)` | `DELETE /v1/posts/{id}` | Cancel a scheduled post; delete a failed one. 404 = already gone |
| `retryPost(id, key)` | `POST /v1/posts/{id}/retry` | Failed or partial posts: only the failed platforms go again |
| `editPublished(id, {platform, accountId, content})` | `POST /v1/posts/{id}/edit` | Change the text of a published post where the platform allows it |
| `unpublishPost(id, {platform, accountId})` | `POST /v1/posts/{id}/unpublish` | Take a published post down from one platform |
| `getPost(id)` | `GET /v1/posts/{id}` | Webhooks (we read the post back) and the reconcile |
| `findPostsByExternalId(id)` | `GET /v1/posts?externalId=` | Recovery: find our post at Zernio by its id |
| `validatePost(body)` | `POST /v1/tools/validate/post` | "Check with Zernio" in the composer (free, posts nothing) |

**Body** (`features/content/body.ts`, `buildPostBody`): `content`; `mediaItems[{type, url, altText}]`; `platforms[{platform, accountId, customContent?, customMedia?, platformSpecificData?}]`; `metadata {content_post_id, client_id}`; `externalId = our post id`; `tiktokSettings` when TikTok is a target.

**`platformSpecificData`** from each account's settings:

| Platform | Fields |
|---|---|
| Instagram | `contentType: "story"` (a single video is a Reel by itself) |
| Facebook | `contentType: "story" \| "reel"` **(verify)** |
| YouTube | `title`, `visibility` |
| Pinterest | `boardId`, `title`, `link` |
| Google Business | `callToAction {type, url}` (CALL has no url) |
| TikTok (top level) | `tiktokSettings {privacy_level, allow_comment, allow_duet, allow_stitch, content_preview_confirmed, express_consent_given}` **(verify names)** |

**Parsing:** `zPostEnvelope` accepts `{post}` or the post itself; `platformResults()` reads `accountId` as a string or a populated `{_id}`.

## Media

`presignMedia({filename, contentType, size})` → `POST /v1/media/presign` → `{uploadUrl, publicUrl}`. The server streams the file from Supabase Storage to `uploadUrl` with `PUT` (bodies over 25 MB stream with `duplex: "half"` and `Content-Length`). The `publicUrl` is reused for 6 days (`content_media.zernio_uploaded_at`); Zernio keeps uploads 7 days unless a post uses them.

## WordPress

| Function | Call |
|---|---|
| `getConnectUrl({platform: "wordpress", …})` | `GET /v1/connect/wordpress` (WordPress.com / Jetpack OAuth, the existing connect flow) |
| `connectWordPressToken({profileId, siteUrl, username, applicationPassword})` | `POST /v1/connect/wordpress/token`. The password is never stored or logged by us |
| `listBlogs(accountId)` | `GET /v1/accounts/{id}/blogs` |
| `createArticle(accountId, blogId, body, key)` | `POST …/blogs/{blogId}/articles` |
| `updateArticle(…, articleId, body)` | `PATCH …/articles/{articleId}` (also `isPublished: false` to unpublish) |
| `deleteArticle(…)` | `DELETE …/articles/{articleId}` (permanent on WordPress) |
| `getArticle(…)` | `GET …/articles/{articleId}` (the reconcile; there are no blog webhooks) |
| `findArticleByHandle(…, handle)` | `GET …/articles?handle=` after a 502 |

**Article body:** `title`, `bodyHtml` (cleaned again by `sanitize.ts`), `handle`, `tags`, `excerpt` (or the first 300 characters), `author`, `image {url}` (a 1-hour signed Storage URL; ≤ 10 MB), `isPublished: true`, and `publishDate` (ISO with offset) to schedule. `articleFields()` reads `id | articleId | _id`, `url | link | permalink`, `status | isPublished` **(verify the exact names)**.

## Webhooks

`WEBHOOK_EVENTS` now also lists `post.scheduled`, `post.published`, `post.partial`, `post.failed`, `post.cancelled`, `post.platform.published`, `post.platform.failed`, `post.platform.deleted`. **After the deploy an admin clicks Register webhook** (Connections → Integration card) so Zernio sends them.

`processPostEvent()` finds our post by `post.metadata.content_post_id` (or `zernio_post_id`), then **reads the post back with `getPost`**: the payload is only a hint, exactly like account events.

## Phase 0 findings

Not run yet (needs your yes and a test client with a connected account and a test WordPress site). Confirm and record here:

- [ ] The `POST /v1/posts` answer shape and `platforms[].accountId` type.
- [ ] `scheduledFor` wall-clock + `timezone` is read in that zone.
- [ ] The Facebook Reel / Story and TikTok setting names.
- [ ] Pinterest boards: is there a list endpoint (we ask for the board ID by hand until then).
- [ ] The webhook payload keys for `post.*` (we only need `post._id` / `post.metadata`).
- [ ] The Blogs API answer shape (`id`, `url`, `status`) for create, get and list.
