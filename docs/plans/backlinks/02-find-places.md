# Backlinks phase 2: Find places

Part of the Backlinks plan (`00-overview.md`). Google searches for footprints → parsed,
classified places in the client's Pending review queue.

## Flow

1. **Request** (`findPlaces` action → `request_backlink_discovery`): role (admin, manager, or a
   VA who can see the client), client not paused/churned, city set, one search per client per
   24 h, `backlink_runs_per_client_month`, both budgets. A double click returns the open run.
2. **Start**: `after(() => processBacklinkRuns(db, 1))`. The cron (`/api/cron/backlinks`, every
   15 min) only resumes runs whose heartbeat is older than 10 min (3 attempts) and cleans up.
   Searches never start on their own.
3. **Context**: client + approved business profile; location and language from
   `ensureRankSettings` / `syncAndResolve` (Rankings, reused). No city or unresolved location →
   the run fails with the fix. No services → geo footprints only.
4. **Queries**: footprints with `{city} {state} {state_code} {service} {industry}`; up to 3
   services; ≤ 30 queries; a template with an empty placeholder is skipped; all rows inserted up
   front (`backlink_run_queries`), so a resume skips finished ones.
5. **Search**: 5 at a time. Cache hit (same query, location, language, device, depth ≥ 30,
   ≤ 90 days) → `cached`, free; else Live (desktop, depth 30, about $0.006) → cache row →
   `done`. Budget re-checked before each batch. Heartbeat every 60 s on a timer.
6. **Competitors**: one Maps Live call "{first service} {city} {state_code}" (cached) plus the
   local-pack domains of every search = business domains to filter out.
7. **Parse** (`site-key.ts`, `classify.ts`, `scoring.ts`, pure): site key, type, local match,
   filter reason, relevance; ≤ 200 new places a run; `dfs_store_backlink_candidates` merges;
   core listings for the client's country (and industry) are added.
8. **Finish**: counts and cost on the run, `backlinks_found` notification to the requester,
   history `backlink.discovery_finished`. More than half the searches failed → run failed.

## Filter reasons (shown in the Hidden tab; each can be restored)

| Reason                | Meaning                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `own_site`            | The client's own website                                           |
| `agency_client`       | Another agency client's website                                    |
| `competitor`          | A business in the local pack or Maps results                       |
| `looks_like_business` | Not in the library, service words in the title, no directory words |
| `blocked`             | The site is blocked for all clients                                |
| `other_state`         | Mentions a different state (Peoria IL for a Peoria AZ client)      |
| `not_local_article`   | An article with no local or directory signal                       |
| `pdf`                 | A document, not a site you can list on                             |

## Done when

One real run makes ≤ 30 searches and its cost matches `dfs_calls`; a second client in the same
city pays nothing for the geo searches; stopping mid-run and resuming pays nothing twice; the
top 20 looks right by hand.
