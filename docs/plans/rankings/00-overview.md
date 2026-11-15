# Plan: Rankings (DataForSEO)

## Context

Rankings (`/clients/[slug]/rankings`) is a "Coming soon" page today. It should answer two questions:

1. **Where does this client rank right now** for the keywords we track? Google (website), Google Maps (map pack) and Bing, checked weekly from the client's own city, on mobile, with history.
2. **Which keywords should we track instead?** Find better keywords (more local searches, buying intent, winnable difficulty, relevant to the client's services). Flag the weak ones we track now and suggest one-click swaps.

The Overview's "Where they show up" panel already reads the tables this page will fill (`keywords`, `rank_checks`, `keyword_ranks`, `ai_checks`, `ai_answers`, from migration 0019). Nothing calls DataForSEO yet, and no credentials are configured.

**Your decisions:**
- Check from the **client's city**.
- Check **Google, Maps and Bing** weekly, on **mobile**.
- **The team approves keyword swaps** (admins and account managers).

**Implementation docs.** On implementation, the plan is saved as `docs/plans/rankings/`:
- `00-overview.md`
- `01-foundation.md`
- `02-rank-tracking.md`
- `03-keyword-research.md`
- `04-page-and-polish.md`

## What the research found (DataForSEO v3)

| Need | API | Mode and price | Location | Notes |
|---|---|---|---|---|
| Weekly Google rank, top 100 | `serp/google/organic/task_post` → postback, or `task_get/advanced/{id}` | Standard queue $0.0006 per 10 results, so depth 100 = **$0.006** per keyword. About 5 min, max about 45 min | `location_code` (Google geo target, incl. cities) or `location_coordinate "lat,lng,radius"` | 100 tasks per POST. `device: mobile`. `group_organic_results: false`, so every result from the client's domain is visible. Items: `type`, `rank_group`, `rank_absolute`, `domain`, `url`; also `local_pack`, `featured_snippet`, `ai_overview` |
| Maps / map pack position | `serp/google/maps/task_post` | $0.0006 per 100 results, so depth 20 = **$0.0006** | `location_code` or `"lat,lng,zoom"` (zoom, not radius) | Match the business by `place_id`, then `cid`, then `domain` (domain can be null) |
| Bing rank | `serp/bing/organic/task_post` | Same as Google: **$0.006** at depth 100 | Bing's own locations list | Bing location codes are checked separately from Google's |
| What the site already ranks for | `dataforseo_labs/google/ranked_keywords/live` | **$0.012 + $0.00012 per item** (Live only) | **Country only** (Labs) | `items[].keyword_data.keyword_info.search_volume`, `keyword_properties.keyword_difficulty`, `search_intent_info.main_intent`, `ranked_serp_element.serp_item.rank_group/url`. Database refreshed weekly |
| New ideas | `keyword_ideas` (200 seeds), `keyword_suggestions` (1 seed), `related_keywords` (depth 0–4) | $0.012 + $0.00012 per item | Country only | Items are flat (`items[].keyword_info.*`) for ideas and suggestions, nested (`items[].keyword_data.*`) for related keywords |
| Competitor gaps | `competitors_domain/live`, then `ranked_keywords` for each competitor | Same Labs rate | Country only | `exclude_top_domains: true` |
| **City search volume** | `keywords_data/google_ads/search_volume` | **$0.09 per request Live** ($0.06 standard), up to 1,000 keywords per request | City `location_code` (Google Ads geo targets) | 12 requests per minute for Live. `competition` is an enum here plus `competition_index` 0–100 (Labs uses a 0–1 float). Google updates the data mid-month; there's no current-month value |
| Difficulty / intent | Already inside the Labs items (`keyword_properties.keyword_difficulty`, `search_intent_info.main_intent`) | — | — | `bulk_keyword_difficulty` and `search_intent` only for keywords that are missing them |
| Plumbing | `appendix/user_data` (balance, free), `serp/google/locations` and `dataforseo_labs/locations_and_languages` (free), `tasks_ready` (free, 20/min, last 3 days) | — | — | Errors to handle: 40200/40210 (no funds), 40202/40209 (rate/concurrency), 40103/50401/50303 (retry), 40403 (expired), 40505 (stale location), 40601/40602 (queued). Results kept for 30 days |

**Cost for 20 keywords:**
- Weekly checks: about $0.25 per client per week (Google $0.12 + Maps $0.012 + Bing $0.12), about **$1.10 a month**.
- Keyword research: about **$0.50 per run**.
- At 300 clients with monthly research: about $480 a month, within the product plan's estimate.
- Every call's real `cost` from the response is recorded, so spend is exact, not estimated.

**Two facts to confirm on the first real call**, scripted in step 1:
- The city location code: Google geo targets include cities, but the docs didn't show the list.
- Exact field names, which a sandbox call (`sandbox.dataforseo.com`) shows before any money is spent.

## Database (Supabase `seo-platform`; migrations 0024–0027 through MCP, then advisors, types and rolled-back tests)

### 0024_rankings_kinds
Enums:
- `serp_task_status`: posted, done, failed, expired.
- `rank_run_trigger`: schedule, manual, new_keywords.
- `research_status`: queued, running, done, failed.
- `candidate_status`: new, tracked, dismissed.
- `keyword_source`: manual, research, onboarding, ranked.
- `dfs_api`: serp_google, serp_maps, serp_bing, labs, google_ads, appendix.

Kept separate because enum values must exist before the tables that use them.

### 0025_rankings (tables)

**`rank_settings`** (one row per client; created on first visit or by the research run):
- **Location:** `location_code`, `location_name` (e.g. "Phoenix,Arizona,United States"), `location_country_code` (Labs/country), `language_code` (en).
- **Engines:** `bing_location_code`. `device` (mobile, fixed for now). `engines` (`{google,google_maps,bing}`). `depth` (100).
- **Maps match:** `maps_place_id`, `maps_cid`, `maps_name`.
- **Schedule:** `check_weekday` (0–6), `next_run_at`, `paused`.
- **Relevance terms:** `topic_terms text[]` (services and categories that make a keyword relevant), `negative_terms text[]` (jobs, salary, diy, free, course, …).
- `updated_by`, `updated_at`.
- **Auto-filled** from `clients.city/region/country_code`, `client_business_profiles.services/primary_category/other_categories/service_areas` and `clients.website`. If the city matches several locations, or none, the team picks it in Settings.

**`keywords`** (exists). Add:
- `source keyword_source`, `added_by`, `notes`.
- `archived_reason`, `replaced_by uuid`, `first_checked_at`.
- `topic` (the service term it matched).
- **Trigger:** active tracked keywords ≤ `clients.keywords_target` (clear error "This client tracks 20 keywords. Raise the limit in Edit details or replace one").
- Phrases are stored lower-cased and trimmed. Unique per client among active keywords (index exists).
- Archiving never deletes, so history stays.

**`keyword_metrics`** (shared cache, **not per client**; one keyword in one city is fetched once for every client there):
- Key: `(keyword_norm, location_code, language_code, source)`, where `source` is `google_ads_local` or `labs_national`.
- Values: `search_volume`, `monthly_searches jsonb`, `cpc`, `competition` (0–1, normalized), `competition_level`, `keyword_difficulty`, `main_intent`, `core_keyword`, `trend_yearly`, `fetched_at`.
- Refreshed when older than 35 days (Google updates monthly).
- RLS: readable by team members (no client data in it).

**`rank_runs`** (one weekly or manual run per client):
- `id`, `client_id`, `trigger`, `scope` (`full` = all tracked keywords, `partial` = new keywords only).
- `status` (running, done, partial, failed), `scheduled_for`, `started_at`, `finished_at`.
- `keywords_count`, `cost_usd`, `error`, `created_by`.

**`rank_checks`** (exists; one per run and engine). Add:
- `run_id`, `scope`.
- `summary jsonb` (`top3`, `top10`, `top20`, `top100`, `not_found`, `avg_position`, `in_local_pack`).
- `tasks_total`, `tasks_done`, `tasks_failed`.

**`keyword_ranks`** (exists). Add:
- `rank_absolute`, `local_pack_position` (from the Google SERP's `local_pack` block).
- `serp_features text[]` (featured_snippet, ai_overview, local_pack, people_also_ask…).
- `in_ai_overview bool`, `matched_domain`, `check_url`.
- For Maps rows: `maps_rating`, `maps_reviews`.

**`serp_tasks`** (the ledger of DataForSEO task ids, so results can't be lost or applied twice):
- `id` (the DataForSEO task UUID, primary key), `check_id`, `keyword_id`, `client_id`, `engine`.
- `status`, `posted_at`, `completed_at`, `attempts`, `cost_usd`, `error_code`, `error_message`.
- Unique `(check_id, keyword_id)`.

**`keyword_research_runs`:**
- `id`, `client_id`, `status`, `trigger` (manual, setup, monthly).
- `params jsonb` (domain, locations, seeds, topic and negative terms).
- `counts jsonb` (per source, kept, filtered), `cost_usd`, `error`.
- `created_by`, `started_at`, `finished_at`, `heartbeat_at`.
- Only one queued or running per client (partial unique index).

**`keyword_candidates`** (one row per client and keyword, refreshed by each run):
- **Keyword:** `client_id`, `keyword_norm` (unique per client), `phrase`, `topic`.
- **Where it came from:** `sources text[]` (ranked, ideas, suggestions, related, competitor), `competitor_domains text[]`.
- **Metrics:** `local_volume`, `national_volume`, `difficulty`, `cpc`, `competition`, `intent`, `trend_yearly`.
- **Current rank:** `ranked_position`, `ranked_url` (national, from Labs).
- **Score:** `score` (0–100), `score_parts jsonb`.
- **Decision:** `status`, `first_seen_run`, `last_seen_run`, `decided_by`, `decided_at`, `dismiss_reason`.

**`dfs_calls`** (one row per HTTP call):
- `id`, `client_id` (nullable), `api`, `endpoint`, `tasks`, `items`, `cost_usd`, `status_code`, `ms`, `ref` (run, check or research id), `created_at`.
- This is the spend ledger behind the budget guard and the admin status card.

**`dfs_settings`** (singleton):
- `monthly_budget_usd` (default 75), `research_runs_per_client_month` (default 4).
- `low_balance_usd` (default 10), `last_balance_usd`, `last_balance_at`.

**`dfs_locations`** (cache of the free locations lists, refreshed weekly):
- `code`, `name`, `type`, `parent_code`, `country_iso`, `source` (google, bing, google_ads, labs).

### 0026_rankings_functions

**RLS:**
- Everything readable through `private.can_see_client(client_id)`, except `dfs_calls` and `dfs_settings` (admins only) and `keyword_metrics` and `dfs_locations` (all team members).
- **Team writes:** admins and managers through RPCs: `add_keywords`, `archive_keyword`, `replace_keyword`, `track_candidate`, `dismiss_candidate`, `update_rank_settings`.
- **Job writes:** DataForSEO results come only from the service role (jobs). No anon access.

**Team RPCs** (security definer, role and client checked, logged to `activity_log`):
- `add_keywords(client, phrases[])`: dedupes against active keywords, enforces the target, logs `keyword.added`, and queues a `partial` rank run so new keywords get a first position straight away.
- `replace_keyword(client, old_id, candidate_or_phrase)`: archives the old keyword with reason "Replaced by …" and `replaced_by`, adds the new one, sets the candidate to tracked, logs `keyword.replaced`, and queues a partial run.
- `archive_keyword`: `keyword.removed`. `track_candidate` and `dismiss_candidate`: candidate status, plus a reason for dismissals.
- `request_rank_check(client)`: a manual full run, at most once per 24 hours per client, rejected while one is running.
- `request_keyword_research(client)`: enforces one running per client and the monthly limit.

**`client_visibility()` update** (the Overview's "Where they show up"):
- Only `scope = 'full'` checks count, so one new keyword's first check never shows as "1 / 1".
- "Up from N at the start" compares **like for like**: only keywords present in both the baseline and the latest check, with the number of keywords shown. Swapping keywords can't fake progress.

**Helpers:**
- `private.normalize_keyword(text)`: lower-case, trim, single spaces.
- `private.rank_summary(check_id)`: fills `rank_checks.summary`.

### 0027_rankings_cron
- Vault secrets `rankings_cron_token` and `dfs_postback_token`, generated by the migration. `app_base_url` is reused from the Zernio setup.
- `verify_rankings_token(kind, token)` (service role only).
- pg_cron `rankings-tick` every **10 minutes**: `net.http_post` to `/api/cron/rankings` with the bearer token, the same pattern as `zernio-sync`.

## Backend (app server; the service role only inside job routes and actions that already checked permissions)

**`src/lib/dataforseo/`:**
- **`client.ts`** (server-only):
  - Basic auth from `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD` (DigitalOcean encrypted env). `DATAFORSEO_API_BASE` is optional, for the sandbox.
  - A typed function per endpoint above, with a timeout and a concurrency cap of 20 (DataForSEO allows 30).
  - Google Ads Live calls are spaced 5 seconds apart (12 per minute).
  - Retries with backoff on 40103, 50303, 50401, 5xx and 40202/40209. No retry on 40200, 40210, 40203 or 4xx input errors.
  - Every call writes a `dfs_calls` row with the response's real `cost`.
- **`schemas.ts`:** zod for only the fields we use. Unknown fields are ignored, and missing optional fields become null, never a crash.
- **`budget.ts`:** before any paid call, compares this month's spend with `monthly_budget_usd`, and the client's research runs with the monthly limit. Over the limit means skip and record why (shown on the page). Never a surprise bill.
- **`domains.ts`:** normalizes a host (lower-case, strip `www.`). The client's domain matches the same domain or its subdomains.

**`src/features/rankings/`:**
- **`setup.ts` → `ensureRankSettings(client)`:**
  - Resolves the location from `dfs_locations`: first "City,Region,Country", then "City,Country", else unresolved. An unresolved location blocks checks with the message "Pick the client's location in Settings".
  - Bing location, topic terms (services, categories, industry), default negative terms, and a check weekday spread by client id (so 300 clients don't all run on the same day).
- **`tracker.ts`:**
  - `startRun(client, scope, trigger)`: creates `rank_runs`, one `rank_checks` per engine, and posts tasks in batches of 100 per engine. Each task carries:
    - `tag = check_id:keyword_id`
    - `postback_url = {app_base_url}/api/webhooks/dataforseo?t={dfs_postback_token}&id=$id`
    - `postback_data: advanced`
    - `priority 1`, `device mobile`, depth 100 (Maps 20), `group_organic_results: false`
  - It records each task id in `serp_tasks`.
  - `applyResult(task, result)`: parses the advanced result.
    - **Google:** the best `organic` item whose domain matches gives `rank_group`, `rank_absolute` and `url`. Also checks `local_pack` items (match by domain or `cid`), `serp_features` from `item_types`, and whether `ai_overview` references cite the domain.
    - **Maps:** match by `maps_place_id`, then `cid`, then domain. On the first match, save the place id and cid to settings.
    - **Bing:** the organic domain match.
    - Upserts `keyword_ranks` by `(check_id, keyword_id)`, marks the task done and bumps the counts. Idempotent: a second postback for the same task changes nothing.
  - `finalizeRun(run)`: computes `summary` per check, the run status (done; partial if more than 0 tasks failed; failed if more than 50% failed), cost and `first_checked_at`.
    - Logs `rank.check_finished` (meta: moved into or out of the top 10).
    - Raises or clears alerts:
      - `rankings:failed:<client>` (needs a look) when the run failed or was partial.
      - `rankings:drop:<client>` (needs a look) when 3 or more keywords left the top 10 since last week. It clears when they're back.
    - Sets `next_run_at`.
- **`research.ts` → `runResearch(runId)`**, step by step with a heartbeat. Each step is saved, so a crash resumes or fails cleanly:
  1. **Context:** domain, country and city codes, topic and negative terms, the tracked keywords.
  2. **Already ranking:** `ranked_keywords(domain, country, item_types [organic, local_pack], limit 1000, filters search_volume > 0)`, source `ranked`, with their national position and URL.
  3. **Seeds:** each service × {"", "{city}", "near me"}, plus the primary category; at most 20 seeds. `keyword_ideas(seeds, limit 700, volume ≥ 10, not another language)`, source `ideas`.
  4. **Suggestions and related:** `keyword_suggestions` for the top 3 service seeds (limit 200 each) and `related_keywords` (depth 2) for the top 2, source `suggestions`/`related`.
  5. **Competitors:**
     - `competitors_domain(domain, exclude_top_domains, limit 10)` gives the top 3 real competitors, excluding directories (Yelp, Angi, …).
     - `ranked_keywords` for each competitor, filtered to the topic terms, limit 300. Source `competitor` ("Competitors rank for this, you don't").
  6. **Clean up:**
     - Normalize and dedupe.
     - **Relevance gate:** must contain a topic term (or be a tracked or ranked keyword), contain no negative term, and not be another language.
     - Group close variants by `core_keyword`.
  7. **City volume:** Google Ads `search_volume` Live at the client's city code for the top 1,000 candidates plus all tracked keywords. Results go into `keyword_metrics`, and keywords cached within 35 days are reused.
  8. **Score and save:** upsert `keyword_candidates`, compute weak flags and suggested swaps, and log `keyword.research_finished`. The requester gets a notification when a run they started finishes.
- **Scoring** (`scoring.ts`, a pure function, documented on the page under "How scores work"):
  - **Formula:** score = 100 × (0.40 volume + 0.20 intent + 0.20 ease + 0.10 value + 0.10 quick win).
  - **Volume:** log scale on **city** volume, 1,000+ a month = full marks. If there's no city figure, national volume at half weight, flagged "national estimate".
  - **Intent:** transactional 1, commercial 0.9, informational 0.3, navigational 0.2.
  - **Ease:** 1 − difficulty/100 (unknown = 0.5).
  - **Value:** CPC / $20, capped at 1.
  - **Quick win:** already ranks 4–20 = 1, 21–50 = 0.5.
- **Weak tracked keyword**: any of these, each shown as a plain reason:
  - City volume under 10 a month.
  - Informational intent.
  - Not in the top 100 after 8 weekly checks while difficulty is over 40.
  - Same `core_keyword` as a stronger tracked keyword (duplicate).
  - Score under 35.
- **Suggested swap:** the best untracked candidate on the same topic that scores at least 15 points higher. For example: "duct cleaning cost (20/mo, informational) → air duct cleaning phoenix (390/mo, commercial)".

**Routes:**
- **`POST /api/webhooks/dataforseo`** (postback):
  - Checks the token, timing-safe. Reads the body as bytes and gunzips it if it's gzip.
  - Looks up the task id in `serp_tasks`; unknown ids are ignored with a 200.
  - Applies the result and answers **within 10 seconds**. Run finalizing happens in `after()`.
  - Always 200 for handled and duplicate tasks, so DataForSEO doesn't move them to the retry list. A 5xx only for a real storage failure, so the task falls back to `tasks_ready`.
- **`POST /api/cron/rankings`** (every 10 minutes, bearer token):
  1. Start due runs (`next_run_at ≤ now`, not paused, location resolved), at most 25 clients per tick.
  2. Pick up queued manual runs and research runs, resuming research whose heartbeat is older than 10 minutes.
  3. Recover tasks: `tasks_ready` for all three engines (fetch and apply), then `task_get` for tasks posted more than 2 hours ago with no result.
  4. Expire tasks older than 24 hours as failed.
  5. Finalize runs that have no open tasks.
  6. Once a day: refresh `dfs_locations` and `user_data`. A low balance notifies admins; spend over 90% of budget is shown on the status card.
- Both are machine paths (`MACHINE_PATHS` already covers `/api/webhooks` and `/api/cron`).

**Manual actions** (`actions.ts`, `requirePermission("rankings.manage")`): add, replace and archive keywords, track or dismiss candidates, run research (queued, then started with `after()`), check now, update settings.

## Rankings page (`/clients/[slug]/rankings`, `comingSoon: false`; tabs in the URL `?tab=`; follows `docs/design-system.md`)

**Header:**
- "Checked weekly on mobile from Phoenix, AZ · last check Mon 9 Nov · next Mon 16 Nov".
- **Add keywords** and **Check now** (managers).
- A **Weak keywords: 3** link to the suggestions.

**1. Keywords** (default tab):
- **Stat strip:** Top 3 · Top 10 · Top 20 · Not in top 100 · In map pack, each with the change since last week.
- **Table** (sortable):
  - **Keyword** (with intent tag, weak flag and topic).
  - **Google** (position, ↑↓ since last week, start position).
  - **Maps** and **Bing**.
  - **Searches/mo** (city), **Difficulty**.
  - **Ranking page**, **Updated**.
  - "Not in top 100" shows as "—" with a tooltip, never 0.
- **Row sheet:** a 12-week position chart for Google, Maps and Bing (dataviz rules: one line per engine, inverted axis, gaps for missing weeks), SERP features (map pack, featured snippet, AI overview cited), the monthly search trend, and the ranking URL history. Actions: **Replace**, **Stop tracking**.
- **Empty state:** "No keywords yet. Run keyword research to pick the first 20" (runs research, then preselects the top 20, which the team confirms).

**2. Find better keywords:**
- **Research status:** last run, cost, sources, and "Run research (about $0.50 · 2 of 4 runs left this month)". Shows progress while running.
- **Suggested swaps:** each weak keyword, its reasons, and the best replacement with both sets of numbers, plus **Replace** / **Keep**.
- **Candidates table:**
  - **Columns:** score, city and national searches, difficulty, intent, CPC, current position, and source tags (Already ranking / Ideas / Competitors).
  - **Filters:** minimum searches, intent, topic, hide dismissed.
  - **Actions:** **Track** (blocked at the target, with "Replace…" offered instead) and **Dismiss** (with a reason).

**3. Settings** (admins and managers):
- **Search settings:** location search (from `dfs_locations`), language, engines, check weekday, pause.
- **Maps match:** "This is the business" picker from the last Maps results when there's no automatic match.
- **Relevance terms:** topic terms and negative terms, as chips.
- **DataForSEO card** (admins): balance, this month's spend against budget, failed tasks, budget and research limit.

**Everywhere else:**
- The Overview reads the same tables (like-for-like baseline).
- The Dashboard gets "Google top 10 (x/20)" in the client list.
- History wording for: `keyword.added`, `keyword.removed`, `keyword.replaced`, `keyword.research_finished`, `rank.check_finished`.
- Permissions: `rankings.manage` (admins, managers) in `src/lib/roles.ts`. Everyone who can see the client can view the page.

## Problems this prevents

| Risk | Prevention |
|---|---|
| Lost or double-applied results | `serp_tasks` ledger. Postbacks are idempotent upserts. `tasks_ready` and `task_get` recovery. 24-hour expiry. Run status from counts |
| Fake trends after keyword swaps | Like-for-like baseline; only full checks count on the Overview; archived keywords keep their history |
| Wrong business matched on Maps | Matched by place id or cid, saved on first match; picker when unsure |
| Ranking from the wrong place | City code resolved from the client record; checks blocked until a location is confirmed |
| Surprise bills | Real costs in `dfs_calls`, a monthly budget, a per-client research limit, check-now at most once a day, a low-balance notice, standard queue (cheapest) |
| Paying twice for the same data | Shared `keyword_metrics` cache (35 days) |
| API limits and outages | Concurrency 20, Google Ads 12 per minute spacing, retry and backoff per error code, partial runs instead of all-or-nothing, alerts on failures |
| Irrelevant "better" keywords | Relevance gate on service terms, negative terms, intent weighting; the team approves every swap |
| Spoofed postbacks | Vault token, timing-safe compare; only known task ids are accepted |
| Labs is country-level only | Labs is used for discovery only; decisions use **city** volume from Google Ads, with national volume clearly labelled |
| Long research jobs dying | Step-by-step runs with a heartbeat, resumed by cron; one run per client at a time |

## Order of work (phases = the docs in `docs/plans/rankings/`)

1. **Foundation:**
   - DataForSEO credentials on DigitalOcean (you add `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`).
   - Client library, `dfs_calls`, budget, `dfs_locations` sync.
   - A **sandbox call** to confirm the field names, then one real call to confirm Phoenix's location code.
   - Migrations 0024–0026 and tests.
2. **Rank tracking:** settings, add keywords, runs (posting, postback, cron recovery, finalize), alerts, Overview `client_visibility` update, migration 0027 cron, the Keywords tab.
3. **Keyword research:** research pipeline, `keyword_metrics`, scoring, weak flags and swaps, the "Find better keywords" tab.
4. **Page and polish:** Settings tab, history charts, Dashboard column, History wording, docs. Then lint, typecheck and build, push, and live test.

## Verification

**Database** (rolled-back tests):
- The keyword target is enforced, and archived keywords are kept.
- `replace_keyword` archives, adds and logs.
- Applying the same postback twice changes nothing.
- Run finalizing gets the counts, partial and failed states right.
- `client_visibility` is like-for-like and ignores partial checks.
- VAs can read but not manage; admin-only tables are closed to other roles; advisors are clean.

**API:**
- Sandbox responses parse into our tables.
- One real check for Test Client's keywords from Phoenix, compared by hand with the `check_url` links.
- Costs match `dfs_calls`.

**Live:**
- Add 20 keywords, then watch the partial run fill in within minutes, by postback.
- Run research and see candidates and swaps.
- Replace a keyword; check the history and the next check.
- Overview numbers; budget block when over the limit; mobile and dark mode.

Then lint, typecheck and build, push, and check on the live site.
