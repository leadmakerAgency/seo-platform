# Content · 09 · Checks

Every phase passes `npm run lint`, `npm run typecheck` and `npm run build`.

## Done (2026-11-22)

**Database** (rolled-back SQL as an admin, on a client with fake Google, Facebook and WordPress accounts):
- **Saving posts:** a draft saves, and editing it bumps the version. A WordPress account is refused as a post target.
- **Server-only functions:** the store functions are refused for signed-in users.
- **Articles:** saving counts words (5) and de-duplicates tags (`{a,b}`). A bad slug is refused.
- **Settings:** save the time zone and the blog.
- **Send lock:** a claim succeeds once, and a second claim is refused.
- **Storing Zernio results:**
  - Scheduled is stored.
  - Google published → one `gbp_posts` work item.
  - Facebook failed → the post is partial, with events created, scheduled, partial and the matching activity.
  - An older event is skipped.
  - Taking the Google copy down removes its work item.
  - A published article → one `articles` work item, removed again on unpublish.
- **WordPress label:** `platform_label('wordpress')`.

**Advisors:**
- Security: only the intended "authenticated can call this function" notes.
- Performance: only "unused index" notes for the new tables.

**Pure checks** (`npx tsx --conditions=react-server scripts/content-check.ts`), 6 groups:
- time zones (Phoenix, New York summer and winter);
- platform rules;
- the Zernio body (custom text and files, Google button, YouTube, TikTok, publish now);
- parsing;
- slugs and words;
- HTML cleaning (scripts, styles, `on*`, `javascript:`, iframes and `http` images removed; `h1` becomes `h2`; links get `noopener`).

## Fixed (2026-11-23): "Publish now did nothing"

The composer asked "Publish now?" from inside `startTransition`. In React 19 a state update made inside a running async transition isn't shown until the transition ends, and this one was waiting for the answer, so the dialog never appeared, the buttons stayed pending and nothing was saved (no `content_posts` row). Reproduced on a test page and fixed twice over: `ConfirmProvider` opens its dialog outside any transition (`setTimeout`), and every call site asks before starting the work (post page, article editor). Verified: the dialog shows, "Keep it" and "Publish now" both answer.

## Fixed (2026-11-23): a sent post's page "couldn't load"

The post page (a server component) imported `EDITABLE` from `post-editor.tsx`, a `"use client"` file. A server file importing a value (not a component) from a client file gets a client reference, so `EDITABLE.has()` threw "is not a function" for every saved post (new posts skipped the check). Reproduced locally with the same digest-style error; the set moved to `constants.ts` as `EDITABLE_STATUSES`. An audit of every server file found no other value imported from a client file.

After publishing or scheduling, a post now returns to Content → Posts and an article to Content → Articles; the toast's "View" opens the item.

## Phase 0: needs your yes and a test client

- [ ] One account connected on a test client, and a test WordPress site (application password).
- [ ] "Check with Zernio" on a sample post (free).
- [ ] One post scheduled 10 minutes ahead to one test account with an image: the webhook moves it to Published with a link.
- [ ] One Google Business Profile post: the Overview's Google posts count goes up by one.
- [ ] One article published and one scheduled; the scheduled one becomes Published after its time (cron or page visit); the SEO paste step works.
- [ ] A forced failure (YouTube without a video is refused locally; a disconnected account is refused by Zernio): a clear error, and Try again works.
- [ ] Record the real answer shapes in `02-zernio-api.md` and remove the **(verify)** marks.

## Interface (you sign in)

- [ ] Every tab at 375 px and in dark mode; no horizontal page scroll.
- [ ] The composer: account tabs, custom text and files, platform options, previews, counts.
- [ ] Editor autosave, the "unsaved changes" warning, image upload with alt text, links.
- [ ] Calendar month and week, "+" on a day, the phone agenda; filters stay in the URL.
- [ ] Notifications link to the right post or article.

## After the deploy

- [ ] Supabase → Storage → Settings: raise the upload limit to 500 MB.
- [ ] Connections → Integration card: **Register webhook**, then **Send test**.
- [ ] Zernio billing: a card on file (accounts beyond 2), and a prepaid balance if X is used.
