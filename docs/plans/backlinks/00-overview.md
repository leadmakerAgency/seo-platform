# Plan: Backlinks foundation (find places → review queue → site strength)

Phase docs: `01-foundation.md`, `02-find-places.md`, `03-site-strength.md`, `04-page.md`,
`05-later-upgrades.md`. This overview is the full plan; the phase docs are the checklists.

## Context

`/clients/[slug]/backlinks` is "Coming soon". VAs will manage each client's backlinks here. The
foundation answers one question: **where should we apply for a listing for this client?**

1. **Find places.** Google searches through the DataForSEO SERP API for footprints built from the
   client's city, state, services and industry ("hvac peoria az directory", "add your business
   peoria az", "peoria az chamber of commerce"). Results are parsed, cleaned, classified and
   deduped into a **Pending review** queue, best first, so the top ~20 (`clients.backlinks_target`)
   are obvious. A curated **core listings** set (Google Business Profile, Yelp, BBB, …) is added too.
2. **Review.** The team approves or rejects each place (reject needs a reason).
3. **Check site strength.** A button sends the places' domains to the DataForSEO Backlinks API
   (`bulk_ranks`, `bulk_spam_score`) and saves Domain Rank (0–100) and spam score in Supabase, so
   VAs see a real authority score (mockup: Google 100, Yelp 93, BBB 91).

**Later upgrades (not now; the schema leaves room):** VA tasks per approved place, submission
tracking in a separate `backlinks` table, live-checking listings (NAP match), `work_items` rows
(`source = 'backlink'`) when a listing goes live, an agency Directory library page, places found
from competitors' backlinks (`backlinks/domain_intersection`), several service-area cities,
automatic searches.

**Your decisions:**

- Admins, managers **and VAs** can run Find places and Check site strength (clients they can see).
  Admins, managers and VAs approve/reject. Writers and Read only: view only (Writers don't see the
  page; navigation already limits Backlinks to admin, manager, va, viewer).
- Every client also gets the **core listings** for its country (industry ones like Angi/Houzz only
  when the industry matches), marked "Core listing".
- **Never automatic**: a search starts only from the Find places button.
- The **Directory library page** is a later upgrade; managers set a site's type or block it from
  the client's page.

## Prerequisite

Rankings (commit `0c7ae8e`) is in: Backlinks reuses its DataForSEO client, spend ledger, budget,
locations and `rank_settings`. Backlinks migrations start at `0031`.

## What the research found (DataForSEO v3)

| Need                             | Endpoint                                                     | Price                                                    | Notes                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Footprint searches               | `POST serp/google/organic/live/advanced` (one task per call) | $0.002 per 10 results; depth 30 = **$0.006/search**      | ~6 s average. `location_code` (city), `language_code`, `device`, `depth`. Keyword ≤ 700 chars. **Operators (`site:`, `inurl:`, `intitle:` …) cost 5× per operator → banned in footprints.** Organic items: `type`, `rank_group`, `rank_absolute`, `domain`, `url`, `title`, `description`, `breadcrumb`, `website_name`. `local_pack` items (businesses): `domain`, `title`, `cid`, `phone` |
| Competitor businesses (optional) | `POST serp/google/maps/live/advanced`                        | ~$0.002                                                  | Business domains for "{service} {city}", cached per location                                                                                                                                                                                                                                                                                                                                |
| Domain Rank                      | `POST backlinks/bulk_ranks/live`                             | **$0.024 per call + $0.000036 per row**, ≤ 1,000 targets | Targets: domain/subdomain without scheme and `www.`. `rank_scale` `one_thousand` (default) or `one_hundred` = `round(sin(rank/636.62)·100)`. Items `{target, rank}`. Typical: small sites 25–35/1000 (≈4–5/100), big 500+ (≈71+). Not Ahrefs DR                                                                                                                                             |
| Spam score                       | `POST backlinks/bulk_spam_score/live`                        | same                                                     | ≤ 1,000 targets; items `{target, spam_score}` 0–100, higher = worse                                                                                                                                                                                                                                                                                                                         |
| Balance, errors                  | `appendix/user_data` (free)                                  | —                                                        | Backlinks is **Live only**, 30 simultaneous, 2 s average. **`40204` "Access denied… activate your subscription"**: Backlinks may need a monthly minimum (product plan: "check its monthly minimum"); confirmed on the first real call                                                                                                                                                       |

**Cost per client:** one Find places ≈ 25 searches × $0.006 ≈ **$0.15** (geo searches another
client in the same city already ran are free from the cache); Check site strength ≈ **$0.05**
per click whatever the count. Every call's real `cost` lands in `dfs_calls`.

Why Live, not the standard queue: the difference is ~$0.10 a run, and the queue would need its
own task ledger, postback and recovery (`serp_tasks` is tied to rank checks). Live fits a
resumable background job like keyword research.

## How it works (end to end)

```
Find places ─► request_backlink_discovery (role, limits, budget) ─► run queued
   └─ after() / backlinks cron ─► claim run (SKIP LOCKED) ─► discovery job:
        1 context (city, state, services, location_code via Rankings setup)
        2 build ≤ 30 queries from footprints (skip any with an empty placeholder)
        3 run each query: cache hit (same query+location ≤ 90 days) or Live call → cache row
        4 parse organic items → site key → classify → filter → score
        5 store via dfs_store_backlink_candidates (idempotent merge) + core listings
        6 finish: counts, cost, notify requester, history
Pending review ─► VA approves / rejects (reason) ─► Approved list (upgrade: tasks, live-check)
Check site strength ─► request_strength_check (role, throttle, budget, 30-day freshness)
   ─► bulk_ranks + bulk_spam_score ─► dfs_store_strength ─► directories.authority, spam
```

## Phase 1: foundation (schema, seeds, DataForSEO wrappers, spike)

**Spike first (before any migration):** sandbox, then real calls: one Live SERP
("peoria az chamber of commerce", Peoria's city code) and one `bulk_ranks` + `bulk_spam_score`
for `google.com, yelp.com, bbb.org` with both scales. Record field names, real cost, the
`one_hundred` formula, and whether `40204` comes back. If Backlinks access is denied or needs a
paid minimum, **stop and ask you** (options: activate it; fall back to DataForSEO Labs traffic
estimation as the strength signal; manual score). The columns are named by meaning
(`authority`, `authority_source`) so a fallback needs no schema change.

**Dependency:** none. `site-key.ts` keeps a small list of two-part suffixes and hosting platforms (a `tldts` install was not possible here).

**Migration `0031_backlinks_kinds`** (only `add value`, so later migrations can use them):
`dfs_api` + `backlinks`; `notification_kind` + `backlinks_found`.

**Migration `0032_backlinks`** (enums, tables, RLS, seeds):

- Enums: `directory_type` (business_directory, industry_directory, maps, chamber, association,
  review_site, news_blog, guest_post, social, government, aggregator, other),
  `directory_status` (active, blocked), `opportunity_status` (pending_review, approved, rejected,
  filtered), `reject_reason` (not_relevant, competitor, paid_only, not_accepting, duplicate,
  spam, broken, other), `backlink_run_status` (queued, running, done, failed),
  `footprint_scope` (geo, service, industry), `discovery_query_status` (queued, done, cached,
  failed), `strength_check_status` (running, done, failed).
- **`directories`** (global library, no client data):
  - Keys: `site_key` unique (where you apply: the host without `www.`/`m.`, or host + city path
    for path platforms), `domain` (registrable domain, used for strength and blocking),
    `rank_target` (what we send to `bulk_ranks`; core rows can override, e.g. Bing Places →
    `bing.com`, Apple Business Connect → `apple.com`).
  - Describe: `name`, `type`, `type_source` (auto, manual), `status`, `blocked_reason/by/at`,
    `is_core`, `core_countries text[]`, `core_industries text[]`, `geo_scope` (national, state,
    city), `country_code`, `region`, `city`, `industries text[]`, `submit_url`, `cost_type`
    (free, paid, unknown), `notes`.
  - Strength: `authority_raw` (0–1000), `authority` generated 0–100 (spike-confirmed formula),
    `spam_score`, `authority_source`, `authority_status` (ok, no_data), `authority_checked_at`.
  - `first_seen_at`, `last_seen_at`, `updated_by`, `updated_at`.
- **`backlink_footprints`**: `template` (unique; check constraint rejects `site: inurl: intitle:
intext: allin* filetype: link: related: info:`), `scope`, `active`, `sort`, `note`.
- **`serp_result_cache`** (shared across clients, service role only): key
  `(query_norm, location_code, language_code, device, depth)`, `items jsonb` (compact organic
  rows + local-pack domains), `fetched_at`, `cost_usd`. A cached depth ≥ requested counts as a hit.
- **`backlink_runs`**: `client_id` (cascade), `status`, `step`, `params jsonb` (city, state,
  services, location code/name, the queries shown), `counts jsonb`, `cost_usd`, `error`,
  `attempts`, `created_by`, `created_at`, `started_at`, `heartbeat_at`, `finished_at`.
  Partial unique index: one queued/running per client.
- **`backlink_run_queries`**: `run_id` (cascade), `client_id`, `footprint_id` (set null),
  `scope`, `query`, `query_norm`, `status`, `cache_id`, `items_count`, `cost_usd`, `error`.
  Unique `(run_id, query_norm)`, created up front so a resume skips finished queries.
- **`backlink_opportunities`** (client × place): `client_id` (cascade), `directory_id`
  (restrict: directories are blocked, never deleted), `status`, `filter_reason`, `is_core`,
  `found_url` (check `^https?://`), `found_title`/`found_snippet` (length-capped),
  `best_position`, `is_local`, `relevance` (0–1, the non-strength part), `first_run_id`/
  `last_run_id` (set null), `reject_reason`, `reject_note`, `decided_by` (set null),
  `decided_at`, `notes`. Unique `(client_id, directory_id)`.
- **`backlink_opportunity_hits`** (why it was chosen): `opportunity_id` (cascade), `client_id`,
  `query_id` (cascade), `footprint_id`, `position`, `url`. Unique `(opportunity_id, query_id)`, so
  re-applying a run adds nothing; "found by N searches" = count of distinct footprints.
- **`backlink_strength_checks`**: `client_id`, `status`, `domains`, `cost_usd`, `error`,
  `created_by`, `created_at`, `finished_at`; one running per client.
- `dfs_settings` + `backlinks_budget_usd` (default 15, a sub-cap so Backlinks can never starve
  rank checks), `backlink_runs_per_client_month` (default 4), `backlinks_access`
  (unknown, ok, denied) + `backlinks_access_checked_at`.
- Every foreign key indexed (advisor).
- **RLS:** `directories`, `backlink_footprints`: read by team members, writes through RPCs only.
  `serp_result_cache`: RLS on, no policies, revoked from anon/authenticated. Client tables:
  select through `private.can_see_client(client_id)`. Job writes: service role. No anon.
- **Seeds:** ~20 footprints (below); **core listings** for US (Google Business Profile, Bing
  Places, Apple Business Connect, Yelp, BBB, Facebook, Nextdoor, Yellow Pages, Foursquare,
  MapQuest, Manta, Hotfrog, Brownbook, EZlocal, Cylex, MerchantCircle, Alignable,
  ChamberofCommerce.com; aggregators Data Axle, Neustar Localeze; industry: Angi, HomeAdvisor,
  Thumbtack, Houzz, Porch, Bark), each with `submit_url` and `cost_type`, confirmed by hand;
  **blocklist** (`status = blocked`: youtube, wikipedia, amazon, job boards like indeed/
  glassdoor/ziprecruiter, reddit, quora, pinterest, homedepot, lowes, …, copied from Rankings'
  `NOT_COMPETITORS` idea, not imported).

**Migration `0033_backlinks_functions`** (all security definer, `search_path = ''`, grants explicit):

- `private.backlinks_month_spend()`: `dfs_calls` rows whose `ref` is a backlink run or strength
  check this month.
- `private.require_backlinks_worker(client)`: admin/manager/va **and** `can_see_client`.
- `request_backlink_discovery(client)` → run id: worker check; client not paused/churned; city
  set and location resolved; one run per client per 24 h; monthly limit; both budgets. A second
  click returns the running run (catches the unique violation).
- `dfs_claim_backlink_run()` (service role): copy of `dfs_claim_research_run` (SKIP LOCKED,
  stale after 10 min, failed after 3 attempts).
- `dfs_store_backlink_candidates(run, items jsonb)` (service role): insert directories
  (on conflict do nothing, then select), insert/merge opportunities (never change a row a person
  decided; `best_position = least(...)`), insert hits (on conflict do nothing). Safe to run twice.
- `dfs_finish_backlink_run(run, counts, cost, error)`: status, notify the requester
  (`backlinks_found`), history `backlink.discovery_finished`.
- `review_backlink_opportunities(ids[], decision, reason, note)`: decision approve, reject or
  restore; **every row** checked (`has_role('{admin,manager,va}') and can_see_client(o.client_id)`
  joined); one history row per call (`backlink.reviewed`, `{decision, count, sites}`).
- `set_directory(id, type, submit_url, cost_type, notes)` and `block_directory(id, reason)` /
  `unblock_directory(id)` (admin, manager). Block moves every undecided opportunity for it to
  `filtered` with `filter_reason = 'blocked'` (unblock restores them); decided rows stay.
- `request_strength_check(client, ids[] default null, force default false)` → check id +
  targets: worker check; `force` managers only; one running per client, 10-min throttle; both
  budgets; `backlinks_access <> 'denied'`; only targets never checked or older than 30 days
  (all with `force`); ≤ 1,000; returns nothing to do when all are fresh.
- `dfs_store_strength(check, items jsonb, cost, error)` (service role): updates directories by
  `rank_target` (missing → `no_data`), closes the check.
- `backlink_quota(client)` (team members who can see the client, no amounts): searches used /
  allowed, next search time, budget reached, access state.
- `backlink_tab_counts(client)`: counts per status (RLS-respecting).

**Then:** advisors (security + performance) clean, regenerate `database.types.ts`.

**App code:**

- `src/lib/dataforseo/serp-live.ts`: `googleOrganicLive(...)`, `googleMapsLive(...)`
  through `dfsCall` (api `serp_google`/`serp_maps`, `ref` = run id, `clientId`).
- `src/lib/dataforseo/backlinks.ts`: `bulkRanks(targets, scale)`, `bulkSpamScore(targets)`
  (api `backlinks`, chunks of 1,000, checks the task `status_code`, maps `40204` to "Backlinks
  API access isn't active on the DataForSEO account" and sets `backlinks_access = denied`).
- No edits to `client.ts`, `api.ts`, `domains.ts` or any Rankings file.

**Done when:** spike results written into `00-overview.md`; rolled-back SQL tests pass (VA
can't review a client they can't see, writer/viewer can't review, re-applying candidates changes
nothing, decided rows never change, limits/throttles/budgets refuse with clear messages, block/
unblock round-trips); advisors clean; types regenerated.

## Phase 2: Find places (the discovery job)

**Footprints (seeded, editable later).** Placeholders `{city}`, `{state}` (full name),
`{state_code}`, `{service}` (up to 3: profile services, else primary category, else industry),
`{industry}`. State always included so Peoria AZ and Peoria IL never mix. Examples:

- geo: `{city} {state_code} business directory`, `{city} {state} business directory`,
  `add your business {city} {state_code}`, `submit business listing {city} {state_code}`,
  `{city} {state_code} chamber of commerce`, `{city} {state_code} business association`,
  `{city} {state_code} local business listings`, `{city} {state_code} community news`
- service: `{service} {city} {state_code} directory`, `best {service} {city} {state_code}`,
  `top rated {service} {city} {state_code}`, `{service} contractors {city} {state_code}`
- industry: `{industry} association {state}`, `{industry} directory`,
  `{industry} blog write for us`, `{industry} guest post`
- ≤ 30 queries per run, normalized and deduped; missing placeholders → skipped and counted.

**`src/features/backlinks/` (pure, no `@/` imports, easy to test):**

- `site-key.ts`: `siteKeyOf(url)` → `{ siteKey, domain, host }` with a built-in
  suffix and platform list; strip `www.`/`m.`/`mobile.`; multi-tenant hosts keep the full host
  (chambermaster.com, growthzoneapp.com, wixsite.com, weebly.com, blogspot, wordpress.com,
  business.site, godaddysites.com); path platforms keep host + city path (patch.com/<state>/<city>,
  alignable.com/<city>-<state>); only `http(s)`; punycode key, Unicode shown with `domainToUnicode`.
- `classify.ts`: type from signals in host/title/URL/snippet (chamber; association/alliance/
  guild; directory/listings/yellow pages/find; best/top 10/top rated/reviews → review_site;
  blog/news/magazine/times/gazette/patch → news_blog; write for us/guest post → guest_post;
  social list; `.gov` → government; known library rows keep their type). Filter reasons:
  `own_site` (client's domain), `agency_client` (any agency client's website), `competitor`
  (domain in the SERP's local pack or the Maps call), `looks_like_business` (not in the library,
  service term in title, no directory words), `blocked`, `other_state` (mentions a different
  state), `not_local_article` (how-to article with no local signal), `pdf`.
- `scoring.ts`: `relevance` = type weight (chamber 1.0, industry_directory 0.95,
  business_directory 0.9, association 0.85, aggregator 0.85, maps 0.8, review_site 0.7,
  news_blog 0.6, guest_post 0.55, social 0.45, government 0.3, other 0.2) × 0.40 + local
  (city+state match) × 0.25 + found by more searches (log) × 0.20 + best position × 0.15.
  **Score shown** = 100 × (0.75 relevance + 0.25 strength), strength unknown = 0.4,
  spam ≥ 60 halves it. Computed at read time in `queries.ts` (strength changes after a check
  would make a stored score stale), documented on the page under "How scores work".

**`discovery.ts` → `processBacklinkRuns(db, max)` / `runDiscovery(db, run)`**, step by step
(pattern: `rankings/research.ts`):

1. Context: client, approved profile (services, category, service areas, phone/website),
   `ensureRankSettings` + `syncAndResolve` (reused, not edited) for `location_code`/language.
   No city or unresolved location → fail with the fix ("Add the client's city in Edit details" /
   "Pick the location in Rankings → Settings"). No services → geo footprints only, noted.
2. Insert `backlink_run_queries` (status queued).
3. Run queries, 5 at a time: cache hit → `cached`; else Live (desktop, depth 30), write cache,
   `done` with cost. One failed query doesn't fail the run (run fails only if > 50% fail).
   Budget re-checked before each batch. Heartbeat on a 60 s timer while alive (one slow call can
   take minutes; a stale heartbeat would let cron start a second worker and pay twice).
4. Optional Maps call ("{first service} {city} {state_code}", cached) for competitor domains.
5. Parse every done/cached query's items (from the cache rows) → site key → classify → relevance;
   ≤ 200 new places per run; store with `dfs_store_backlink_candidates`; add matching core
   listings (country + industry).
6. Finish: counts (searches, cached, new places, already known, filtered by reason, cost).

**Triggers:** the action calls the RPC then `after(() => processBacklinkRuns(db, 1))`.
**Cron** `/api/cron/backlinks` every 15 min (migration `0034_backlinks_cron`: Vault
`backlinks_cron_token`, `verify_backlinks_token`, pg_cron `backlinks-tick`, same pattern as
0027): resumes stalled runs, closes strength checks stuck > 10 min, deletes cache rows older than
120 days that no run from the last 7 days points to. It never starts new searches (your choice).

**Done when:** one real run for a test client makes ≤ 30 searches and its cost matches
`dfs_calls`; a second client in the same city makes 0 calls for the geo searches; stopping the
server mid-run and letting cron resume pays for nothing twice; the queue's top 20 looks sensible
by hand (chambers, local directories, best-of lists; no competitors, no other-state results).

## Phase 3: Check site strength

- Action `checkSiteStrength(clientId, ids?, force?)` (`requirePermission("backlinks.strength")`)
  → `request_strength_check` → `bulkRanks` (one_thousand) and `bulkSpamScore` in parallel with
  the admin client, `ref` = check id → `dfs_store_strength` → `refresh()`. Runs inline (2–5 s),
  toast "Checked 18 sites ($0.05)" or "All sites were checked in the last 30 days".
- Strength is per site (`rank_target`), shared by every client: checking Yelp once serves all.
- Bands (constants, calibrated against ~30 real local sites in this phase): Strong ≥ 60,
  Good 35–59, Fair 15–34, Weak < 15, No data. Spam ≥ 60 "Spam risk" (danger), 30–59 "Check"
  (warning), through `StatusTag` tones.
- `40204` → access saved as denied, the button is disabled with "Backlinks API access isn't
  active. An admin can turn it on in DataForSEO", admins notified once.

**Done when:** google.com/yelp.com/bbb.org come back close to 100/93/91 and match the
DataForSEO dashboard; a re-check within 30 days calls nothing; a forced re-check (manager) does;
double-click makes one call; denied access shows the message and disables the button.

## Phase 4: the Backlinks page

`src/app/(app)/clients/[clientSlug]/backlinks/page.tsx` (thin; template:
`rankings/page.tsx`, static frame, `AccessGuard` and each data section in `<Suspense>` with
size-matched skeletons; relative times only inside Suspense or client components).
Tabs in the URL `?tab=review|approved|rejected|hidden` (`features/backlinks/search-params.ts`,
plus `type`, `min` strength, `q`, `sort`).

- **Header:** "Found by Google searches from Peoria, AZ · last search Mon 9 Nov (23 searches,
  $0.14)"; **Find places** (primary) and **Check site strength**, disabled with the reason
  (limits, budget, access, no city) from `backlink_quota`; "How scores work".
- **Running:** "Searching Google: 12 of 25" via `OverviewRefresher every={5_000}` while a run is
  queued/running (reused from `src/features/overview/components/overview-refresher.tsx`).
- **StatStrip:** Waiting for review · Approved (vs `backlinks_target`) · Rejected · Strength
  checked (x of y).
- **Table** (TanStack v9, client-side sort, all rows; "Show more" past 50): select, rank `#1…`
  with a line after the client's target (20), Site (name, host, "Core listing" tag), Type, Why
  chosen ("Found by 3 searches: 'hvac peoria az directory' #2 …" / "Core listing"), Site
  strength (number + band, "Not checked"), Spam, Found page (external link
  `rel="noopener noreferrer nofollow"`, `target="_blank"`), Score, Found date. Numbers
  `tabular-nums`.
- **Bulk bar:** Approve, Reject… (reason + note dialog), Check site strength.
- **Row sheet:** strength (authority, spam, checked when), every search that found it with
  position and link (from `backlink_opportunity_hits`), snippet, site details (type, submit URL,
  cost; managers can edit or **Block for all clients**), decision and notes, Restore.
- **Hidden tab:** filtered places grouped by reason, each with Restore.
- **Empty states:** no search yet ("Find places runs about 25 Google searches from Peoria, AZ,
  about $0.15"); no city (link to Edit details); location unresolved (link to Rankings →
  Settings); nothing left to review.
- Design rules from `docs/design-system.md` (tokens only, `StatusTag`/`StatStrip`, violet only
  for primary actions/selection); light/dark; 375 px.

**Elsewhere:**

- `src/lib/navigation.ts`: Backlinks `comingSoon: false`.
- `src/lib/roles.ts`: `backlinks.discover`, `backlinks.strength`, `backlinks.review` (admin,
  manager, va), `backlinks.library` (admin, manager), with `PERMISSION_LABELS`; RPCs mirror them.
- `src/features/team/activity.ts`: `backlink.discovery_finished`, `backlink.reviewed`,
  `backlink.strength_checked`, `backlink.directory_blocked`/`unblocked`.
- `notifications-bell.tsx`: `backlinks_found` → "Found 46 places for Kingair HVAC" →
  `/clients/<slug>/backlinks?tab=review` (failed runs say so).
- Docs: `docs/architecture.md` (Backlinks section, cron), `CLAUDE.md` rule (write
  opportunities only through the store RPCs; strength only through the strength RPCs; no
  operators in footprints; never spend without the database budget check).
- VAs only see clients in their tasks (`can_see_client`): a manager gives the VA a Backlinks task
  that includes the client (existing behaviour, noted on the page's empty state for VAs).

**Done when:** lint, typecheck and build pass; manager, VA (with and without a task for the
client), writer and viewer each see the right things; dark mode and 375 px checked; live test.

## Phase 5: later upgrades (`05-later-upgrades.md`, not built now)

Approved place → VA task with steps (NAP from the business profile, vault login); `backlinks`
table (submitted, live, failed) → `work_items` `source = 'backlink'` and `counts_as` off on
backlink tasks; daily live-check of listing URLs (SSRF-safe fetch, NAP match); Directory library
page; competitor backlink gaps (`backlinks/domain_intersection`, `referring_domains`); service-area
cities; monthly auto plan of 20; optional automatic searches with a per-tick cap.

## Problems this prevents

| Risk                                     | Prevention                                                                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Paying twice / runaway spend             | Real costs in `dfs_calls`; shared budget + Backlinks sub-budget in the database; 1 search/client/24 h, monthly limit; shared SERP cache per city; 30-day strength freshness; one running run/check per client; operators banned (5× price) |
| Starving Rankings                        | `backlinks_budget_usd` sub-cap checked before every batch                                                                                                                                                                                  |
| Lost or doubled results                  | Query rows created up front, per-query resume, SKIP LOCKED claim, timer heartbeat, idempotent store RPC, unique hits                                                                                                                       |
| Human decisions overwritten              | Store RPC never touches decided rows; blocks use `filtered`, so unblock restores                                                                                                                                                           |
| Wrong places (competitors, other Peoria) | State in every query and in the local match; local-pack/Maps competitors, agency clients' sites, "looks like a business" filter, blocklist; everything filtered is visible in Hidden with its reason                                       |
| One chamber platform = one row           | Site key keeps tenant host / city path; strength by `rank_target`                                                                                                                                                                          |
| VA sees or edits another client          | Every RPC checks role and `can_see_client` per row; global tables carry no client data; cache is service-role only                                                                                                                         |
| Backlinks API needs a subscription       | Spike before building Phase 3; `40204` handled, saved and shown; columns allow a fallback source                                                                                                                                           |
| Untrusted SERP text/links                | `http(s)` only, length caps, React escaping, `noopener noreferrer nofollow`; no server-side fetching of found URLs in this build                                                                                                           |
| Cache Components errors                  | Static frame + Suspense sections; no `new Date()` outside Suspense; build checks it                                                                                                                                                        |

## Verification

- **Database** (rolled-back SQL through the Supabase MCP): permissions per role, limits and
  budgets, idempotent store, decided rows frozen, block/unblock, strength freshness and throttle,
  `backlink_quota` without amounts, advisors clean.
- **Pure functions:** a throwaway Node script (scratchpad) runs `siteKeyOf`, `classify` and
  `scoring` on the spike's real SERP rows plus edge cases (chambermaster tenant, patch.com city
  page, IDN, `.gov`, PDF, other-state Peoria).
- **API:** sandbox parse, then one real search and one real strength check; costs equal
  `dfs_calls`.
- **Live (Test Client):** Find places → queue fills within ~1–2 min → approve/reject/restore →
  Check site strength → numbers and bands → block a site → re-run (rejected stay rejected, nothing
  double-counted) → VA account → mobile and dark mode. Then `npm run lint`, `npm run typecheck`,
  `npm run build`.
