# Rankings phase 2: weekly rank tracking

Part of the Rankings plan (`00-overview.md`). Google (top 100), Google Maps (top 20) and Bing
(top 100), mobile, from the client's city, every week, plus a first check whenever keywords are added.

## Flow

1. **Start** (`startRun`): cron finds clients with `next_run_at ≤ now` (not paused, location
   resolved, at least one tracked keyword); at most 25 per tick. A manual "Check now" (once per
   24 h) or new keywords (`partial` run) start one too.
2. **Post**: one `rank_checks` row per engine; tasks posted in batches of 100 with
   `tag = check_id:keyword_id`, `postback_url = {app_base_url}/api/webhooks/dataforseo?t=<token>&id=$id`,
   `postback_data: advanced`, `priority: 1`, `device: mobile`, `depth` 100 (Maps 20),
   `group_organic_results: false`. Each task id goes to `serp_tasks` (status `posted`).
3. **Receive** (postback route): token check, gunzip, look up the task, `applyResult`, answer
   within 10 s; finalize in `after()`.
4. **Recover** (cron, every 10 min): `tasks_ready` per engine; `task_get` for tasks posted > 2 h
   ago without a result; tasks > 24 h old become `expired`.
5. **Finalize** (`finalizeRun`): when a run has no open tasks: summary per check, run status
   (done / partial / failed), cost, `keywords.first_checked_at`, `rank.check_finished` in History,
   alerts, `next_run_at = next check weekday`.

## Matching rules

- **Google organic**: lowest `rank_group` among `type = organic` items whose `domain` is the
  client's domain or a subdomain (`www.` stripped, lower-case). Keep `rank_absolute`, `url`.
- **Local pack** (inside the Google SERP): position of the `local_pack` item matching the client's
  domain or saved `cid` → `local_pack_position`.
- **SERP features**: `item_types` of the result → `serp_features`; `in_ai_overview` when an
  `ai_overview` reference links to the client's domain.
- **Maps**: `maps_search` item matching `rank_settings.maps_place_id`, then `maps_cid`, then
  domain. First domain match saves `place_id`/`cid`/name. Store rating and review count.
- **Bing**: same as Google organic.
- Not found = a `keyword_ranks` row with `position = null` (so "not in top 100" is a fact, not a gap).

## Alerts (feed health automatically)

- `rankings:failed:<client>` (needs a look): run failed, or more than 20% of tasks failed. Cleared
  by the next good run.
- `rankings:drop:<client>` (needs a look): 3 or more keywords left the Google top 10 since the
  previous full run. Cleared when fewer than 3 are still out.

## Overview

`client_visibility()` counts only `scope = 'full'` checks and compares like for like: the
baseline count uses only keywords also present in the latest check, and returns how many
keywords the comparison is based on.

## Done when

A partial run for new keywords fills in by postback within minutes; a duplicate postback changes
nothing; killing the postback route still completes the run through `tasks_ready`/`task_get`;
the Overview panel shows real numbers; alerts appear and clear.
