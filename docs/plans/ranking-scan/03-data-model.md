# Ranking scan · 03 · Data model

Migrations:
- `0061_rank_scan_kinds.sql`: enums.
- `0062_rank_scans.sql`: tables, RLS and settings columns.
- `0063_rank_scan_functions.sql`: functions and triggers.

## Enums

- `social_platform` + `googlesearchconsole`;
- `notification_kind` + `rank_scan_finished`;
- `rank_scan_status`: queued, running, done, partial, failed;
- `rank_scan_trigger`: manual, monthly, connected;
- `rank_scan_source`: dataforseo, search_console, google_business;
- `rank_verdict`: keep, quick_win, brand, watch, skip.

## Tables

**`rank_scans`**

| Column | Contents |
|---|---|
| `id`, `client_id`, `status`, `trigger`, `step` | The scan and where it is (step 0–5) |
| `params` | Domain, country, language, Search Console site, dates and months |
| `sources` | Per source: `{state: done \| no_data \| not_connected \| skipped \| failed, count, error, data_date}` |
| `counts` | Total, `keep`, `quick_win`, `brand`, `watch`, `skip`, `new`, `lost`, `by_source` |
| `cost_usd`, `attempts`, `error` | Spend and failure details |
| `created_by`, `created_at`, `started_at`, `finished_at`, `heartbeat_at` | Who and when |

A unique index allows one queued or running scan per client.

**`rank_scan_keywords`** (primary key `(scan_id, keyword_norm)`)

| Group | Columns |
|---|---|
| Row | `client_id`, `phrase`, `sources rank_scan_source[]`, `verdict`, `reasons text[]`, `is_brand`, `low_ctr`, `score`, `position` |
| DataForSEO | `dfs_position`, `dfs_type`, `dfs_url`, `dfs_previous_position`, `dfs_volume`, `dfs_etv`, `dfs_check_url`, `dfs_updated_at`, `other_language` |
| Search Console | `gsc_clicks`, `gsc_impressions`, `gsc_ctr`, `gsc_position`, `gsc_page` |
| Business Profile | `gbp_reach`, `gbp_below_threshold` |
| Metrics | `city_volume`, `national_volume`, `difficulty`, `intent`, `cpc`, `topic` |

**Changed tables:**
- **`rank_settings`** gets `scan_auto` (default on), `scan_next_at` (existing rows spread over the next 7 days), `last_scan_id`, `gsc_account_id`, `gsc_country_only` (default on) and `brand_terms`.
- **`dfs_settings`** gets `rank_scans_per_client_month` (default 4, manual scans only).
- **`content_post_targets`'s platform check** now refuses `googlesearchconsole` as well as `wordpress`.

**RLS:** select for team members who can see the client. No direct writes: the pipeline uses the service role.

## Functions

**Team functions** (admins and managers, `private.require_rankings_manager`):

| Function | What it does |
|---|---|
| `request_rank_scan(client)` | Refuses if a scan is open, if the month's manual scans are used up (`trigger = manual`, not failed), or if there's no source (no website, no Search Console, no Business Profile) |
| `save_rank_scan_settings(client, p)` | Saves `scan_auto`, `gsc_account_id` (must be this client's Search Console account), `gsc_country_only` and `brand_terms` (≤ 20, ≤ 60 characters) |

Tracking uses the existing `add_keywords(client, phrases, 'ranked')`, which respects the keyword limit.

**Service-role functions:**

| Function | What it does |
|---|---|
| `dfs_queue_monthly_scans(limit)` | Queues scans for clients that are onboarding or active, with auto scans on, whose next scan is due and who have a source. It moves `scan_next_at` on 30 days |
| `dfs_claim_rank_scan()` | Claims a queued scan, or a stale running one (10 minutes). After 3 attempts the scan fails |
| `store_rank_scan_rows(scan, rows jsonb)` | Upserts on `(scan_id, keyword_norm)`. Non-null values win and `sources` are unioned, so each source can be stored separately and re-run safely |
| `finish_rank_scan(scan, p)` | Sets the status, counts and sources, and the cost (from `dfs_calls` where `ref = scan`). Sets `last_scan_id` and `scan_next_at = now + 30 days`, logs `rank.scan_finished`, notifies (the requester for a manual scan, the client owner otherwise) and keeps only the client's last 6 scans |

**Read function** (security invoker): `rank_scan_page(client, scan, verdict, source, q, tracked, limit, offset)` returns the rows plus:
- the previous scan's position;
- whether the keyword is new;
- the tracked keyword's id;
- its latest city position from our Google checks.

**`rank_scan_lost(client, scan)`:** keywords judged Keep or Quick win last time that aren't in this scan.

## Helpers and triggers

- `private.is_social_platform(p)`: false for `wordpress` and `googlesearchconsole`. `private.onboarding_refresh` counts only social platforms.
- `private.platform_label` has a label for Search Console.
- **Trigger `social_accounts_gsc_connected`:** when a `googlesearchconsole` account becomes connected, it:
  - marks onboarding's Search Console answer added and verified, and fills the property with the site;
  - sets `rank_settings.gsc_account_id` if it's empty;
  - queues a `connected` scan if none is open.
