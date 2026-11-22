# Content · 01 · Overview

## What it is

`/clients/[slug]/content` is where the team plans, writes, schedules and publishes a client's:

1. **Social posts** to every account connected in Connections (Google Business Profile, Facebook, Instagram, LinkedIn, YouTube, X, TikTok, Pinterest, Threads);
2. **Blog articles** to the client's WordPress site.

Both go out through **Zernio**, the vendor already used for Connections.

## Decisions

| Question | Answer |
|---|---|
| Approval step | None. Whoever writes can schedule or publish |
| AI drafting | None. The team writes everything |
| WordPress SEO fields | Zernio can't set Yoast or Rank Math fields or categories. The editor keeps an SEO title and meta description, and after publishing shows a checklist step to paste them into WordPress |
| Platforms | Every platform the client has connected |
| Who can write | Admins, managers and writers (`content.write`). Viewers read only. VAs don't see Content |
| Client settings | Admins and managers (`content.settings`). Connecting WordPress uses `connections.manage` |

## How it fits together

```
Team ──► Content page ──► our database (drafts, media, history)
                           │
             schedule or publish (server action)
                           │
                     media ─► Zernio presign ─► Zernio storage
                           │
           POST /v1/posts ─┴─ POST /v1/accounts/{wp}/blogs/{blog}/articles
                           │
   Zernio publishes on time ──► webhooks (posts) ──► our database
   Hourly cron ──► GET post / GET article (no blog webhooks) ──► our database
                           │
   Published article / Google post ──► work_items ──► Overview targets
```

## Phases

| # | Phase | Ends with |
|---|---|---|
| 1 | These docs | Committed |
| 2 | Phase 0 check (needs your yes): read-only Zernio calls plus one test post and one draft article | Field shapes confirmed in `02` |
| 3 | Database `0058`–`0060`, SQL tests, advisors, types | Tables, functions and triggers live |
| 4 | Zernio client (`posts.ts`, `blogs.ts`, `media.ts`) | Body building checked |
| 5 | WordPress connection (Connections website card) | A site can be connected |
| 6 | Media library and the push to Zernio | Files upload and are reused |
| 7 | Social composer and publishing | A post publishes |
| 8 | Webhooks, reconcile, notifications, Google post work items | Statuses update by themselves |
| 9 | Article editor and WordPress publishing | An article publishes |
| 10 | Calendar, lists, progress strip, settings, nav, docs | Shipped |

## Later (not in v1)

- Approvals (internal and through the client portal)
- AI drafting
- Post analytics (`GET /v1/analytics`)
- Zernio queue slots ("best time") and evergreen recycling
- Bulk CSV import
- Setting WordPress SEO fields through the WordPress REST API directly
- Replying to comments and messages
