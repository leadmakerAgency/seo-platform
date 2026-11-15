# Rankings phase 1: foundation

Part of the Rankings plan (`00-overview.md`). Everything later phases stand on: credentials, the
DataForSEO client, the spend ledger and budget, locations, per-client settings and the schema.

## Checklist

- [ ] **Credentials**: `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` (DigitalOcean encrypted run-time
      variables and `.env.local`); optional `DATAFORSEO_API_BASE` (`https://sandbox.dataforseo.com`
      for free sample data). Getters in `src/lib/env.server.ts`; never `NEXT_PUBLIC_*`.
- [ ] **Migration 0024** `rankings_kinds`: enums `serp_task_status`, `rank_run_trigger`,
      `research_status`, `candidate_status`, `keyword_source`, `dfs_api`.
- [ ] **Migration 0025** `rankings`: `rank_settings`, `keyword_metrics` (shared cache),
      `rank_runs`, `serp_tasks`, `keyword_research_runs`, `keyword_candidates`, `dfs_calls`,
      `dfs_settings` (singleton), `dfs_locations`; new columns on `keywords`, `rank_checks`,
      `keyword_ranks`; RLS (client tables via `private.can_see_client`, `dfs_calls`/`dfs_settings`
      admins only, caches readable by the team, job writes service role only, no anon).
- [ ] **Migration 0026** `rankings_functions`: team RPCs (`add_keywords`, `archive_keyword`,
      `replace_keyword`, `track_candidate`, `dismiss_candidate`, `update_rank_settings`,
      `request_rank_check`, `request_keyword_research`), keyword target trigger,
      `private.normalize_keyword`, `private.rank_summary`, `client_visibility()` like-for-like.
- [ ] Advisors (security + performance) clean; regenerate `database.types.ts`.
- [ ] **`src/lib/dataforseo/`**: `client.ts` (Basic auth, timeout, concurrency 20, Google Ads
      spacing, retry table below, `dfs_calls` row per call with the real `cost`), `schemas.ts`
      (zod, only fields we use), `budget.ts`, `domains.ts`.
- [ ] **Locations**: `syncLocations()` fills `dfs_locations` from the free Google SERP, Bing and
      Google Ads lists; resolves "City,Region,Country".
- [ ] **First calls**: sandbox call for each endpoint (check parsing), then one real
      `serp/google/locations/us` call to confirm the client's city code (e.g. Phoenix).

## Retry table (client.ts)

| status_code | Meaning | Action |
|---|---|---|
| 20000, 20100 | ok / task created | — |
| 40103, 50401, 50303, 5xx HTTP | failed / timeout / update in progress | retry ×3, backoff 2s → 8s → 30s |
| 40202, 40209 | rate / concurrency | wait 10 s, retry ×3 |
| 40601, 40602 | queued | not an error for task_get; try later |
| 40200, 40210, 40203 | no funds / daily limit | stop, record, notify admins |
| 40403 | results expired | mark task expired |
| 40505 | stale location | re-sync locations, mark failed |
| other 4xx | bad input | no retry, record error |

## Done when

Sandbox calls parse without errors, a real locations call resolves Test Client's city, every call
appears in `dfs_calls` with its cost, and the budget guard blocks a call when the month is over
budget.
