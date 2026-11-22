# Content · 04 · WordPress

## Connecting (Connections → Website card, `connections.manage`)

1. **WordPress.com or Jetpack:** "WordPress.com sign-in" runs the usual Zernio connect flow (`startConnect(client, "wordpress")`). The callback route then runs `setupWordPress()`.
2. **Self-hosted:** "Self-hosted site" opens a dialog for the site address (https), the username and an **application password** (WordPress → Users → Profile → Application passwords). `connectWordPress()` sends them straight to `POST /v1/connect/wordpress/token`; they are never stored or logged by us. Then `syncClient()` mirrors the new account and `setupWordPress()` runs.

`setupWordPress()` saves the site in `content_settings` (`wp_account_id`, site address) and, when the site has exactly one blog, picks it. With several, Content → Settings → "Pick the blog" lists them (`loadBlogs`).

WordPress counts as one Zernio connected account (billing). It is listed in `WEBSITE_PLATFORMS`, not `PLATFORMS`, so the socials list, client links and the onboarding social step ignore it.

## Publishing (`content.write`)

| Action | What happens |
|---|---|
| Publish now | `createArticle` with `isPublished: true` (or `updateArticle` when the article is already on WordPress, e.g. it was scheduled) |
| Schedule | Same, plus `publishDate`; WordPress publishes it by itself (WP-Cron) |
| Update on WordPress | `updateArticle` with the current fields (enabled when there are changes since the last send) |
| Unpublish / Unschedule | `updateArticle {isPublished: false}`; the article is a draft again |
| Delete from WordPress | `deleteArticle` (permanent there); the article stays here as a draft |

- **Featured image:** a signed Storage URL valid 1 hour; WordPress copies it into its media library (10 MB at most).
- **Images in the text** live in the public `content-inline` bucket and are shown from there.
- **HTML** is cleaned by `sanitize.ts` on save and again before sending.
- **502:** Zernio may have written the article anyway, so we look it up by slug (`findArticleByHandle`) before calling it failed.

## What Zernio can't do (accepted for v1)

- **SEO plugin fields** (Yoast, Rank Math): after publishing, the editor shows "Paste the SEO fields into WordPress" with copy buttons, an "Open in WordPress" link and a Done tick (`seo_pasted_at`). The Articles list shows "To paste" until it's ticked.
- **Categories:** pick them in WordPress after publishing. Tags work.

## Status checks

There are no blog webhooks. The hourly cron (and a quiet check when the Content page opens) reads scheduled articles whose time has passed: `publish` → published (and the work item). Still `future` two hours later → a warning: "WP-Cron may be off on this site".
