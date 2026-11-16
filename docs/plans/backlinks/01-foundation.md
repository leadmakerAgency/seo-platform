# Backlinks phase 1: foundation

Part of the Backlinks plan (`00-overview.md`). Schema, seeds, the DataForSEO wrappers and the
first real calls everything later stands on.

## Checklist

- [ ] **Spike** (needs `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`): one Live SERP
      ("peoria az chamber of commerce" from Peoria's city code) and one `bulk_ranks` +
      `bulk_spam_score` for `google.com, yelp.com, bbb.org` with `one_thousand` and `one_hundred`.
      Write field names, real cost, the 0–100 formula and whether `40204` comes back into
      `00-overview.md` ("Spike results"). Access denied or a paid minimum: stop and ask.
- [x] **No new dependency**: `tldts` could not be installed here, so `site-key.ts` carries a
      small US-first list of two-part suffixes and hosting platforms instead. Add to it when a
      new platform shows up as one row for many places.
- [ ] **0031_backlinks_kinds**: `dfs_api` + `backlinks`; `notification_kind` + `backlinks_found`.
- [ ] **0032_backlinks**: enums; `directories`, `backlink_footprints`, `serp_result_cache`,
      `backlink_runs`, `backlink_run_queries`, `backlink_opportunities`,
      `backlink_opportunity_hits`, `backlink_strength_checks`; `dfs_settings` columns
      (`backlinks_budget_usd` 15, `backlink_runs_per_client_month` 4, `backlinks_access`,
      `backlinks_access_checked_at`); every foreign key indexed; RLS; seeds (footprints, US core
      listings, blocklist).
- [ ] **0033_backlinks_functions**: `private.backlinks_month_spend`,
      `private.require_backlinks_worker`, `request_backlink_discovery`, `dfs_claim_backlink_run`,
      `dfs_store_backlink_candidates`, `dfs_finish_backlink_run`, `review_backlink_opportunities`,
      `set_directory`, `block_directory`, `unblock_directory`, `request_strength_check`,
      `dfs_store_strength`, `backlink_quota`, `backlink_tab_counts`.
- [ ] Advisors (security + performance) clean; regenerate `database.types.ts`.
- [ ] `src/lib/dataforseo/serp-live.ts` (`googleOrganicLive`, `googleMapsLive`) and
      `src/lib/dataforseo/backlinks.ts` (`bulkRanks`, `bulkSpamScore`, 40204 → access denied).
      No edits to Rankings files or `client.ts` / `api.ts` / `domains.ts`.

## Rules the schema enforces

| Rule                                         | Where                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| No search operators in footprints (5× price) | check constraint on `backlink_footprints.template`                       |
| One queued/running search per client         | partial unique index on `backlink_runs`                                  |
| One running strength check per client        | partial unique index on `backlink_strength_checks`                       |
| A place once per client                      | unique `(client_id, directory_id)`                                       |
| A search counts once per place               | unique `(opportunity_id, query_id)` on hits                              |
| Found links are web links                    | check `found_url ~ '^https?://'`                                         |
| People's decisions are final for the job     | the store RPC skips approved and rejected rows                           |
| Spend capped in the database                 | the `request_*` RPCs check `dfs_month_spend` and `backlinks_month_spend` |

## Done when

Rolled-back SQL tests pass (VA can't review a client they can't see, writer/viewer can't
review, re-applying candidates changes nothing, decided rows never change, limits and budgets
refuse with clear messages, block/unblock round-trips); advisors clean; types regenerated.
