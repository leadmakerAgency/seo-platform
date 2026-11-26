# Ranking scan · 02 · Sources

Code: `src/lib/zernio/analytics.ts` (Zernio calls), `src/lib/dataforseo/api.ts` (Labs), `src/features/rankings/scan-sources.ts` (reading and merging, pure), `src/features/rankings/scan.ts` (the pipeline).

## DataForSEO (`dataforseo`)

- **Needs:**
  - the client's website (`clients.website`, normalised with `normalizeHost`);
  - DataForSEO configured;
  - the month's budget not used up;
  - a country location (`rank_settings.country_location_code`).
- **Calls:**
  1. `domain_rank_overview` (`target`, `location_code`, `language_code`). If `metrics.organic.count + metrics.local_pack.count = 0`, the source is **no data** and the scan stops paying here (about $0.012).
  2. `ranked_keywords`:
     - `target`, `location_code`, `language_code`;
     - `item_types ["organic", "local_pack", "featured_snippet"]`, `historical_serp_mode "live"`;
     - `order_by ["ranked_serp_element.serp_item.rank_group,asc", "keyword_data.keyword,asc"]`, `limit 1000`.
     - A second page (`offset 1000`) only when `total_count > 1000`, capped at 2,000.
- **Language:** `rank_settings.language_code`. A 40501 (invalid language) answer retries once without a language.
- **Read per keyword:** the best `rank_group` across item types (the type of that best one kept), URL, previous position (`rank_changes.previous_rank_absolute`), search volume, difficulty, intent, CPC, `etv`, `check_url`, `serp_info.last_updated_time`, and the other-language flag.
- **Cost:** about $0.012 + $0.00012 a keyword.

## Search Console (`search_console`)

- **Needs:**
  - a connected `googlesearchconsole` account on the client (`rank_settings.gsc_account_id`; if none is set, the one whose site matches the website, else the newest);
  - Zernio's Analytics add-on.
- **Call:** `search-analytics`:
  - `fromDate = today − 3 days − 90 days`, `toDate = today − 3 days`;
  - `dimensions ["query", "page"]`;
  - `dataState "final"`, `rowLimit 25000`;
  - a country filter (`country equals <alpha-3>`) when `gsc_country_only`.
  - Follow `pagination.nextStartRow` up to 50,000 rows.
- **Read per query:** summed clicks and impressions; the position is the impression-weighted average; CTR = clicks ÷ impressions; the page is the one with the most clicks (then the most impressions).
- **Kept:** queries with ≥ 3 impressions or ≥ 1 click; the top 5,000 by impressions.
- **Errors:**
  - 403: reconnect;
  - 402: the Analytics add-on is off;
  - 429: busy. The source is **failed** with the reason, and the other sources still count.

## Google Business Profile (`google_business`)

- **Needs:** connected `googlebusiness` accounts of the client (status connected).
- **Call:** `search-keywords` with the last 3 full months (`startMonth`, `endMonth` as YYYY-MM), following `pageToken` (cap 20 pages per account).
- **Read per keyword:** the sum of `impressions` across months and locations, as a monthly average (`gbp_reach`). When every month was below the threshold, `gbp_below_threshold = true` and reach is 0.

## Merging

- **Matching key:** `keyword_norm = lower(trim(collapse spaces))`, the same as `private.normalize_keyword`. Longer than 80 characters or 10 words: dropped.
- **Columns:** each source fills its own columns. `sources[]` lists every source that found the keyword.
- **`position`:** Search Console's average when it has ≥ 10 impressions, otherwise DataForSEO's, otherwise Search Console's.

## Filling the gaps

1. **Cache first:** city volume (`keyword_metrics` google_ads at `rank_settings.location_code`) and national metrics (labs at the country).
2. **City volume:** for up to 500 keywords still missing it (most impressions or reach first), `adsSearchVolume`. The results and the misses (as 0) go back into the cache.
3. **Intent:** for up to 500 keywords still missing it, Labs `search_intent`, cached as labs metrics (`main_intent`).

Both paid steps are skipped when the budget is used up.

## Freshness shown in the UI

- **DataForSEO:** the newest `last_updated_time`.
- **Search Console:** the dates read.
- **Business Profile:** the months read.

## Phase 0 findings

- [ ] Search Console connects through `GET /v1/connect/googlesearchconsole`, and the callback carries `accountId`.
- [ ] Whether `GET /v1/accounts` lists it, or whether `category=analytics` is needed.
- [ ] Whether client links (platform invites) support `googlesearchconsole`.
- [ ] The `search-analytics` and `search-keywords` answer shapes, and the Analytics add-on.
- [ ] Whether a Search Console site is a billed connected account.
- [ ] One DataForSEO scan of a US client (about $0.15), with the real costs in `dfs_calls`.
