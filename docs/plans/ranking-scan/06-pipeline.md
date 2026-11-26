# Ranking scan · 06 · Pipeline

Code: `src/features/rankings/scan.ts`, `processRankScans(db, max)`.

## Starting a scan

| Trigger | How |
|---|---|
| Scan now | `requestRankScan` action → `request_rank_scan` → `after(() => processRankScans(admin, 1))` |
| Monthly | The rankings cron (every 10 minutes) calls `dfs_queue_monthly_scans(10)`, then `processRankScans(db, 1)` in `after()`. This runs even without DataForSEO configured: Search Console and Business Profile still work |
| Search Console connected | The database trigger queues it; the next cron tick runs it |

## Steps

Each step ends with a heartbeat: `step`, `sources`, `counts`, `heartbeat_at`.

0. **Context:** `ensureRankSettings`; the domain from the website; the country, language, topics, excluded terms and brand terms; the Search Console account (`gsc_account_id`, else the match); the Business Profile accounts; the client's country as alpha-3.
1. **DataForSEO.** Skipped (with a reason) when there's no website, DataForSEO isn't set up, there's no country location, or the budget is used up. Otherwise the overview, then ranked keywords, stored right away (`store_rank_scan_rows`).
2. **Search Console:** "not connected", or read and stored.
3. **Business Profile:** "not connected", or read and stored.
4. **Fill and judge:**
   - read every row of the scan back;
   - fill the gaps (cache, then the capped paid look-ups);
   - judge each row (`scan-verdicts.ts`);
   - store the verdict, reasons, score, position and metrics;
   - count new and lost against the previous scan.
5. **Finish** (`finish_rank_scan`):
   - `done` when every available source worked;
   - `partial` when at least one failed but another worked;
   - `failed` when nothing worked.

## Resuming

A step whose source is already `done` (or `no_data` / `not_connected` / `skipped`) in `sources` is not run again. A resumed scan never pays DataForSEO twice. After 3 attempts the claim fails the scan.

## Budget

- Every DataForSEO call goes through `dfsCall` with `ref = scan.id`, so it shows in `dfs_calls` and the monthly budget.
- Search Console and Business Profile are free per call (Zernio's add-on).

## Notifications and activity

- **Activity:** `rank.scan_finished` with `{total, keep, quick_win, new, lost, cost}`.
- **Notification:** `rank_scan_finished` goes to the requester (manual) or the client owner (monthly or connected): "The ranking scan for X is ready: N to keep, M quick wins", linking to Rankings → Ranking now.
- **Failure:** a scan that fails notifies the same person with the reason.

## Retention

`finish_rank_scan` keeps the client's last 6 scans; older ones are deleted with their rows.
