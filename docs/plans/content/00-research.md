# Content · 00 · Research (Zernio)

Researched on docs.zernio.com (the `/llms.txt` index and the `.mdx` pages) in November 2026.
Fields marked **(verify)** are confirmed in the phase 0 check and recorded in `02-zernio-api.md`.

## Posting

- `POST /v1/posts`: one post for many accounts.
  - **Body:** `content`, `mediaItems[{type, url, thumbnail?, altText?}]`, `platforms[{platform, accountId, customContent?, customMedia?, scheduledFor?, platformSpecificData?}]`.
  - **When it publishes:** `publishNow` publishes during the request; `scheduledFor` (local time) plus `timezone` (IANA) schedules it; sending neither saves a draft.
  - **Our ids:** `metadata` comes back in every webhook; `externalId` can be filtered with `GET /v1/posts?externalId=`.
  - **Not used in v1:** `tags`, `requiresApproval`, `queuedFromProfile`, `queueId`, `recycling`.
- **Answers:**
  - `201` when created;
  - `207` when some or all platforms failed (still a success response: read `post.status`);
  - `409` when the same content was posted recently (content-hash guard);
  - `402 insufficient_balance` when X posts need prepaid balance.
- **Retry safety:** the `Idempotency-Key` header (24 hours; a replay returns `200` with the first result); `x-request-id` on every answer.
- **Statuses:**
  - Post: `draft`, `pending_approval`, `scheduled`, `publishing`, `published`, `partial`, `failed`, `cancelled`.
  - Platform entry: `pending`, `processing`, `uploading`, `published`, `failed`, `cancelled`. Each has `platformPostId`, `platformPostUrl`, `errorMessage`, `errorCategory` and `errorSource`.
  - `errorCategory` values: `auth_expired`, `user_content`, `user_abuse`, `platform_rate_limit`, `quota_exhausted`, `account_issue`, `platform_rejected`, `platform_error`, `system_error`, `unknown`.
- **Changing a post:**

  | Call | When it's allowed |
  |---|---|
  | `PUT /v1/posts/{id}` | draft, scheduled, failed, partial, cancelled. A draft becomes scheduled with `isDraft: false` plus `scheduledFor` |
  | `DELETE /v1/posts/{id}` | Anything not published |
  | `POST /v1/posts/{id}/retry` | failed, partial (only the failed platforms) |
  | `POST /v1/posts/{id}/unpublish` | published, partial (per platform) |
  | `POST /v1/posts/{id}/edit` | Text of a published post, on platforms that allow it |
- **Checking:** `POST /v1/tools/validate/post` takes the create body and returns `errors` and `warnings` (a warning above 90% of a limit). Also `validate-post-length` and `POST /v1/tools/validate/media`.

## Media

- `POST /v1/media/presign {filename, contentType, size}` returns `uploadUrl` (valid 1 hour) and `publicUrl`. We `PUT` the bytes with no auth header.
- **Size and types:** up to 5 GB. Images JPEG, PNG, GIF, WebP; videos MP4, MOV, AVI, WebM, M4V, MPEG; PDF for LinkedIn documents only. Google Drive share links work too.
- **Lifetime:** an upload is temporary for **7 days**, then deleted, unless a post uses it; creating the post copies it to permanent storage.

## Webhooks

- **Events:** `post.scheduled`, `post.published`, `post.partial`, `post.failed`, `post.cancelled`, `post.recycled`; per platform `post.platform.published`, `post.platform.failed`, `post.platform.deleted`; `post.tiktok.url_resolved` (TikTok's real URL can take up to 48 hours); `analytics.synced`.
- **Delivery:** `X-Zernio-Signature` (HMAC-SHA256 of the raw body); answer `2xx` within 5 s; 7 retries over about 51 hours; deduplicate on `id` (`X-Zernio-Event-Id`).
- **Payload:** carries the post with `metadata`, and the platform entry for per-platform events **(verify field names)**.

## Limits and costs

- **Requests:** 600 a minute for 3 to 2,000 accounts (`X-RateLimit-Remaining`, `X-RateLimit-Reset`).
- **Posting caps:** 25 posts an hour per account. Daily: Instagram 100, Facebook 250, Threads 250, X 50, Pinterest 25, TikTok 15 (+15 drafts), others 50. Facebook Reels 30 per 24 hours.
- **X costs (prepaid):** $0.015 a post, $0.20 with a link.
- **Accounts:** the first 2 are free, then $6, $3 or $1 a month per account by tier. WordPress counts as an account.

## Platform specifics

| Platform | Notes |
|---|---|
| Instagram | Image = feed post; a single video = Reel; `platformSpecificData.contentType: "story"`; carousels up to 20; `altText` |
| Google Business (`googlebusiness`) | At most 1 image, no video; `callToAction {type: LEARN_MORE, BOOK, ORDER, SHOP, SIGN_UP, CALL; url}`; `topicType` for events and offers; published text can be edited, nothing else |
| YouTube | Needs a video; `title`, `visibility` (public, unlisted, private) |
| Pinterest | Needs an image or video; `boardId` **(verify how to list boards)**; `title`, `link` |
| TikTok | Needs a video or photos; `tiktokSettings` with `privacy_level` and the consent flags it requires |
| LinkedIn | A PDF is posted as a document |
| X | Up to 4 images; costs above |
| Reddit, Snapchat | Not offered (Reddit is paused at Zernio, Snapchat isn't open) |

## Blogs API (WordPress)

- **What it is:** WordPress, Shopify, Wix and Webflow are blog platforms. For WordPress, Zernio is connect-only: no social posting, only the Blogs API.
- **Connecting:**
  - **OAuth** (WordPress.com and Jetpack sites): `GET /v1/connect/wordpress?profileId&redirect_url` returns `authUrl`.
  - **Self-hosted:** `POST /v1/connect/wordpress/token {profileId, siteUrl (https), username, applicationPassword}` returns `account {_id, platform: "wordpress", username, displayName, profileId}`. A `401` means bad credentials; `402` is a billing gate (`dashboard_url`). Zernio stores the credentials encrypted.
- **Blogs:** `GET /v1/accounts/{accountId}/blogs` lists the site's blogs.
- **Articles:** `POST /v1/accounts/{accountId}/blogs/{blogId}/articles`.
  - **Body:** `title` (required), `bodyHtml`, `handle` (slug), `tags`, `author` (the WordPress user id as a string), `excerpt`, `image {url}` (featured image, downloaded into the media library, ≤ 10 MB), `isPublished`, `publishDate` (ISO with offset; a future date schedules through WP-Cron).
  - **Draft by default:** omitting both `isPublished` and `publishDate` saves a WordPress draft.
  - **WordPress refuses `seo`, and there is no categories field.**
  - **Retry safety:** `Idempotency-Key` works. A `502` may still have written the article, so look it up with `GET …/articles?handle=` (WordPress and Webflow only).
- **Other calls:** update with `PATCH` (partial); `DELETE` is permanent; list with `limit` 1–50 and `cursor`.
- **No blog webhooks.** We check the status ourselves.
