# Ranking scan · 00 · Research

Read on 2026-11-26 from docs.zernio.com, docs.dataforseo.com, dataforseo.com, developers.google.com and Google's help pages. **(verify)** marks what the phase 0 check confirms (recorded in `02-sources.md`).

## Zernio: Google Search Console

Zernio connects Search Console read-only as platform `googlesearchconsole` (scope `webmasters.readonly`). Sources: [overview](https://docs.zernio.com/platforms/google-search-console.mdx), [connect](https://docs.zernio.com/platforms/google-search-console/connect.mdx), [API](https://docs.zernio.com/analytics/query-google-search-console-search-analytics.mdx), [limits](https://docs.zernio.com/platforms/google-search-console/reference.mdx).

- **One connected account = one site.** Each client's profile connects its own site.
- **Connect:**
  - `GET /v1/connect/googlesearchconsole?profileId=…&redirect_url=…` returns `authUrl`. This is the same flow as our other platforms.
  - Only verified sites the Google account can read are offered: owner, full user or restricted user.
  - With several sites, Zernio shows a picker. Headless alternative: `step=select_site` plus `pendingDataToken`, then `GET /api/v1/connect/googlesearchconsole/sites` and `POST …/select-site`.
  - The redirect carries `connected=googlesearchconsole&accountId&username` (the site).
- **Listing:** `GET /v1/accounts?category=analytics` lists connected sites. Whether the default `/accounts` includes them is **(verify)**.
- **Search analytics:** `POST /v1/analytics/googlesearchconsole/search-analytics`.
  - **Body:**
    - `accountId` (required);
    - `fromDate`, `toDate` (YYYY-MM-DD, Pacific time; the default is the last 28 days ending yesterday);
    - `dimensions` (up to 8 of date, hour, query, page, country, device, searchAppearance, brandedClassification);
    - `type` (web by default);
    - `dimensionFilterGroups[{filters[{dimension, operator, expression}]}]`;
    - `aggregationType`, `rowLimit` 1–25,000 (default 1,000), `startRow`;
    - `dataState` (final by default, all, hourly_all).
  - **Answer:** `data[{keys[], clicks, impressions, ctr (0–1), position}]`, `pagination {hasMore, nextStartRow}`, `meta {accountId, siteUrl, fromDate, toDate, firstIncompleteDate}`.
  - **Errors:** 400, 403 (reconnect), 404, 429 `rate_limited`, 502. Cached 10 minutes.
- **Also available (not used now):** `GET /analytics/googlesearchconsole/sitemaps`, `POST …/url-inspection`.
- **Branding:** the consent screen shows Zernio's app (Search Console isn't on Zernio's "own app" list).
- **Analytics add-on:** analytics endpoints need it on legacy plans. Without it they return 402 `analytics_addon_required`.
- **Limits:**
  - 600 requests a minute per workspace (3–2,000 accounts);
  - 10 a second on analytics routes;
  - possibly 120 an hour per account for account-level analytics **(verify)**.
- **Billing:** whether a Search Console site counts as a billed connected account ($1–6 a month) is **(verify)**.

## Zernio: Google Business Profile search keywords

`GET /v1/analytics/googlebusiness/search-keywords?accountId&startMonth&endMonth&pageToken` ([ref](https://docs.zernio.com/analytics/get-google-business-search-keywords.mdx))

- **Answer:** `keywords[{keyword, impressions, impressionsThreshold}]`.
- **What the numbers are:** monthly unique users who saw the listing for that search. Below Google's threshold, `impressions` is 0 and `impressionsThreshold` is set (for example 15).
- **Paging and history:** 100 a page, 18 months of history; the default is the last 3 months.
- **Needs** the Analytics add-on. No Google approval of our own is needed (Zernio's app has it).

## Google's own Search Console rules

- **Lag:** data appears after 2–3 days; `firstIncompleteDate` marks where data is still partial.
- **History:** 16 months.
- **Row limits:** at most 50K rows a day per search type. Page with `startRow` in steps of 25,000.
- **Anonymised queries:** rare queries are left out of the rows (and out of the totals when you filter by query).
- **Property types:** `https://example.com/` (URL prefix) or `sc-domain:example.com` (domain).
- **Restricted users can read Performance data**, so read-only access is enough.
- **Quotas:** 1,200 queries a minute per site and per user, plus a load quota that counts query+page groupings as the most expensive.
- **Filters:** countries use ISO 3166-1 alpha-3 (lowercase works, e.g. `usa`, `mkd`). Operators: equals, notEquals, contains, notContains, includingRegex, excludingRegex.

## DataForSEO Labs

**`POST /v3/dataforseo_labs/google/ranked_keywords/live`** ([docs](https://docs.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live/))

- **Request:**
  - `target` (domain without https/www; a page URL with https);
  - `location_code` (country only), `language_code`;
  - `item_types` (organic, paid, featured_snippet, local_pack, ai_overview_reference);
  - `historical_serp_mode` (live / lost / all);
  - `limit` ≤ 1000, `offset` (no `offset_token`);
  - `filters` (≤ 8), `order_by` (≤ 3);
  - `include_clickstream_data` (doubles the price; not used).
- **Per item:**
  - `keyword_data`:
    - `keyword_info`: `search_volume`, `cpc`, `competition`, `monthly_searches`;
    - `keyword_properties`: `keyword_difficulty`, `core_keyword`, `is_another_language`;
    - `search_intent_info.main_intent`;
    - `serp_info.last_updated_time`.
  - `ranked_serp_element`:
    - `serp_item`: `type`, `rank_group`, `rank_absolute`, `url`, `etv`, `rank_changes.previous_rank_absolute`, `is_new`, `is_up`, `is_down`;
    - `check_url`, `last_updated_time`.
- **Result level:** `total_count`, plus `metrics.organic` with position buckets (pos_1, pos_2_3, pos_4_10, …) and `count`.

**Related endpoints:**
- **`domain_rank_overview`:** totals for a domain (count by position bucket, etv). About $0.012. Used as a cheap "is there anything?" check before paying for `ranked_keywords`.
- **`search_intent`:** up to 1,000 keywords per call, $0.012 + $0.00012 a keyword.

**Prices** ([pricing](https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api)):
- **Labs:** $0.012 a call + $0.00012 a returned item. A full page of 1,000 is about $0.132.
- **Google Ads search volume** (Keywords Data, Live): about $0.075 a request of up to 1,000 keywords **(verify from `dfs_calls`)**.

**Locations** ([docs](https://docs.dataforseo.com/v3/dataforseo_labs/locations_and_languages/)):
- Country-level only.
- North Macedonia: 2807, language `mk` only, a thin database (155K SERPs against the US's 185M).
- US: 2840 (`en`, `es`).

**Freshness:** Ranked Keywords storage refreshes weekly. SERPs refresh every 30 days for popular keywords and every 60–90 days for small markets.

**Limits:** 30 simultaneous Labs calls; 10,000 calls a minute overall.

## SERP API (for later city checks)

- **Google Organic,** billed per 10 results: standard queue $0.0006, priority $0.0012, live $0.002. Depth 100 costs ×10.
- **Google Maps,** billed per 100 listings: same prices.
- `location_code` (a city) or `location_coordinate` ("lat,lng,radius") reach places Labs can't.

## Conclusion

- **No single source covers every client:**
  - DataForSEO knows bigger sites in big markets.
  - Search Console knows every site that has any Google impressions, with real clicks, but only once connected.
  - Business Profile keywords cover Maps-first local businesses.
- **The scan reads all three, merges them by keyword and labels each row with its sources.**
