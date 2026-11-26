# Ranking scan · 08 · Checks

Every phase passes `npm run lint`, `npm run typecheck` and `npm run build`.

## Done (2026-11-26)

- **Database** (rolled-back SQL as an admin):
  - Connecting a fake Search Console account:
    - verified onboarding with the site as property;
    - set `gsc_account_id`;
    - queued a `connected` scan;
    - left the social step "in progress", not done.
  - Refusals:
    - a second scan while one was open;
    - the store function, called by a signed-in user.
  - Settings: brand terms were saved lower-cased.
  - Two sources for one keyword merged into one row (both sources, all columns), and the verdict was stored on top.
  - Finishing:
    - set `last_scan_id` and the next date 30 days ahead;
    - sent one notification.
  - Reads: `rank_scan_page` works with the source filters (`several`, `google_business`).
  - Content refuses Search Console as a post target. The platform label is right.
- **Pure checks** (`scripts/ranking-scan-check.ts`), 10 groups pass: normalising, DataForSEO items, Search Console aggregation (weighted position, top page), Business Profile reach, merging, brand terms, every verdict rule and edge, reasons and the low-CTR flag, dates and countries, CSV.
- **Typecheck, lint and `next build` pass.**
- **Not done yet:** the phase 0 live checks, and the browser check (needs sign-in; the local dev port was taken by another project).

## Phase 0 (live; needs your yes; about $0.15)

- [ ] Connect Search Console on a test client (Connections → Search data). The callback carries `accountId`, and the account is mirrored in `social_accounts`.
- [ ] `GET /v1/accounts` lists it, or `category=analytics` is needed (recorded in `02`).
- [ ] Client links: does a platform invite for `googlesearchconsole` work?
- [ ] One `search-analytics` call and one `search-keywords` call: answer shapes recorded; is the Analytics add-on active?
- [ ] One full scan of a US client: real DataForSEO costs in `dfs_calls`.

## Database (rolled-back SQL)

- [ ] A second `request_rank_scan` while one is open is refused. The manual quota is refused at the limit. A client with no source is refused.
- [ ] Calling `store_rank_scan_rows` twice for the same keyword from two sources gives one row, both sources, and every column filled.
- [ ] `dfs_claim_rank_scan`: a stale scan is reclaimed; after 3 attempts it fails.
- [ ] `finish_rank_scan`:
  - sets `last_scan_id` and `scan_next_at`;
  - logs the activity and sends the notification;
  - keeps 6 scans.
- [ ] Connecting Search Console (the trigger):
  - onboarding is verified with the site as property;
  - `gsc_account_id` is set;
  - a scan is queued;
  - it isn't counted as a social account in onboarding;
  - Content refuses it as a post target.
- [ ] `rank_scan_page` returns the previous position, new, tracked and the city position.
- [ ] The advisors show no new findings.

## Pure checks (`npx tsx --conditions=react-server scripts/ranking-scan-check.ts`)

- [ ] Search Console aggregation: the same query on several pages gives summed clicks, weighted position and the top page.
- [ ] Merging three sources: case and spacing don't split a keyword, sources are unioned, and the position rule holds.
- [ ] Every verdict rule and its edge cases (thresholds exactly at 10, 20, 50; brand plus excluded term; informational with a topic).
- [ ] Brand terms: the domain stem and name; short terms are ignored.
- [ ] The low-CTR flag, and the CSV export (quoting).

## Live (needs your yes)

- [ ] A US client with DataForSEO data: the scan finishes as done, with the source chips and counts right.
- [ ] novachkidev.com: DataForSEO "No data for this site yet"; Search Console (once connected) carries the scan.
- [ ] Forced failures (Search Console disconnected; budget at 0) finish as partial with clear chips.
- [ ] A tracked keyword judged Keep loses its weak flag and is never offered as a swap.

## Browser (you sign in)

- [ ] The Ranking now tab at 375 px and in dark mode; filters survive a reload.
- [ ] Bulk Track and Track all Keep, including the limit message.
- [ ] The detail sheet and CSV export.
- [ ] The Settings section, and the Search data card in Connections.

## Before pushing

- [ ] No open runs (rank runs, research, backlinks, AI visibility, scans).
- [ ] `git add` only this feature's paths and the shared files it changed.
