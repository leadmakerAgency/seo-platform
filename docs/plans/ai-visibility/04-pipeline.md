# AI Visibility · 04 · Run pipeline

Code lives in `src/features/ai-visibility/pipeline.ts`, which is server-only and has no React imports. It reuses the AI search pipeline's machinery (`src/features/backlinks/ai-search/pipeline.ts`): the claim, a heartbeat, checkpointed tasks, `runStage`-style workers with caps, `StopRun`, and `hookShutdown`. All of it runs on the new `aiv_*` tables.

## 1. Triggers

| Trigger | How | Limit |
|---|---|---|
| `schedule` | The cron tick calls `dfs_queue_aiv_runs(10)` | `next_run_at` (see below) |
| `manual` | **Run now** calls the `runAiVisibilityNow` action, which runs `planAiVisibility`, then `request_aiv_run(client, estimate)`, then `kick()` | `aiv_manual_runs_per_client_month` (4) |
| `new_prompts` | After a save that adds questions to a project that has had a run, the team can choose "Check the new questions now". The run is limited to those question ids and counts as manual | Same as manual |

**When the next scheduled run falls**, set by `private.aiv_next_run_at(frequency, weekday, from)`. Times are America/Phoenix; Phoenix has no daylight saving, so 06:00 Phoenix is always 13:00 UTC.

| Frequency | Next run |
|---|---|
| weekly | The next `run_weekday` at 06:00 |
| twice_weekly | The next Monday or Thursday at 06:00 |
| daily | Tomorrow at 06:00 |

## 2. Run lifecycle

```
queued ─claim─► running: stage 0 plan ─► 1 dispatch ─► 2 collect ⟲ (cron ticks) ─► 3 analyse ─► 4 classify ─► 5 insights ─► done
                     └─ StopRun / error ─► failed (notify)          └─ SIGTERM ─► released (resumed next tick)
```

### `processAiVisibility(db, max = 1)`

This is the entry point, called from `after()` in the cron route and in `kick()`.

1. **Claim:** `dfs_claim_aiv_run()`. If no run is open, return.
2. **Heartbeat:** every 30 s, update `heartbeat_at`.
3. **Load the context:** the run, its params snapshot, spend so far (from `dfs_calls` and `ai_calls` by `ref`), the project and the brands.
4. **Run the stages from `run.stage`.** Each stage is idempotent.
5. **Waiting on queue results:** while the collect stage is waiting, the worker stops after at most 4 minutes of polling and sets `released_at`. The next cron tick, 10 minutes later, claims the run again. No request ever waits 45 minutes.

### Stage 0: plan

- **Questions:** `params.prompt_ids` (a snapshot of the active questions, or the new ones only).
- **Tasks:** one for each question × each platform in `params.models` that supports the question's country (`aiv_locations`). The key is `prompt:model:country`.
- **Inserted** with `on conflict (run_id, key) do nothing`.
- **Unsupported pairs** go into `counts.unsupported`.
- **Set:** `counts.tasks`, then `stage = 1`.

### Stage 1: dispatch

- **Queue platforms** (chatgpt, gemini, ai_overview, ai_mode): take `queued` tasks in batches of 100 for each endpoint and call `task_post` with `tag = key`. Store `dfs_task_id`, `status = 'posted'` and `posted_at`.
- **Live platforms** (claude, perplexity): 4 workers. Each call returns the answer at once, which is normalised and stored with `dfs_store_aiv_chat`. That task becomes `collected` straight away.
- **Budget before each batch or call:**
  - **Run cap:** if `spent + next_cost > params.caps.max_usd`, mark the remaining tasks `skipped` and set `counts.capped = true`.
  - **Monthly budget:** if `aiv_budget_problem()` is not null, stop the dispatch. The run still finishes with what it has, and the message is stored in `counts.note`.
- **Errors:** `DfsError` kinds `funds` and `auth`, and access refusals, are a `StopRun` (see 02 §5).
- **Set** `stage = 2` once no `queued` tasks are left.

### Stage 2: collect

- **Poll:** for each queue endpoint with `posted` tasks, call `tasks_ready` and fetch the ready ones with `task_get`. Normalise, then store with `dfs_store_aiv_chat`.
- **A task error** stores a `failed` chat with the message, plus `aiv_tasks.status = 'failed'`.
- **No result after 2 h:** the task is `failed` ("No result from the platform"). If it is still under its attempts limit, it is re-posted once (`attempts < 2`).
- **Advance:** when nothing is `posted`, set `stage = 3`.

**Postback (optional, if phase 0 confirms it):** pass `postback_url` = `/api/webhooks/dataforseo?t=…&kind=aiv` (the existing route). The webhook stores the chat at once, and the poll becomes a fallback.

### Stage 3: analyse

- **Chats:** this run's `ok` chats where `analyzed_at` is null, with 4 workers.
- **Each chat:** a deterministic match, then one Haiku call with `claudeJsonWithUsage` (feature `ai_visibility.analyze`, `ref = run.id`, `stage = 'analyze'`), then a merge (see 05), then `dfs_store_aiv_analysis`.
- **A failed call** is retried once. If it fails again, the chat keeps its deterministic mentions only (positions from tracked brands, no sentiment) and `analysis_version = 'aiv_analyze.v1-fallback'`.
- **Budget:** the cap check also applies to analysis spend. If the cap is reached, analysis stops; unanalysed chats count in visibility but not in position or sentiment.
- **Set** `stage = 4`.

### Stage 4: classify sources

- **Domains:** distinct domains from this run's sources that are missing from `aiv_domains`.
- **Rules first** (05 §5). The rest go to Haiku in batches of 50 (`ai_visibility.domains`).
- **Store** with `dfs_store_aiv_domains`, then set `stage = 5`.

### Stage 5: insights

1. **Brand suggestions.** Untracked `name_key`s with ≥2 mentions in the last 30 days, that aren't dismissed and aren't the own brand.
2. **Question suggestions.** Only if the last ones were made more than 7 days ago, or the team clicked "Suggest more". One Haiku call (`ai_visibility.suggest`). Inputs: the project, topics, current questions, the top fan-out queries, and the intents and topics with fewer than 3 questions. It returns up to 20 suggestions.
3. **Gap and actions.** `aiv_gap(last 30 days, top 30)` plus the own-domain source stats and the robots.txt check (07 §2). One Haiku call (`ai_visibility.actions`) returns up to 10 new actions, skipping open duplicates.
4. **Prompt volume.** Questions with `volume_at` null or older than 30 days, in one AI keyword volume call (see 05 §8).

These are stored with the `dfs_store_aiv_*` functions. Then stage 6.

### Finish

- **The run row:** `cost_usd` = Σ `dfs_calls` and `ai_calls` by `ref`. `counts.visibility` = the own brand's visibility in this run. Then `status = 'done'`, `stage = 6` and `finished_at`.
- **Activity:** `activity_log 'ai.check_finished'` with `{visibility, answers, mentions, cost_usd}`. `actor_id = created_by`, or null for scheduled runs.
- **Notification:** `ai_visibility_ready` to managers of the client, plus the person who started it.
- **On error:** `status = 'failed'`, the `error` text and the `ai_visibility_failed` notification. Chats already stored are kept.

## 3. Cron route: `src/app/api/cron/ai-visibility/route.ts`

Copy `src/app/api/cron/backlinks/route.ts`:

1. If `hasSupabaseSecretKey()` or `hasDataForSeo()` is false, return 204.
2. Check the bearer token with `rpc('verify_aiv_token')`.
3. Call `rpc('dfs_queue_aiv_runs', {p_limit: 10})`.
4. Once a day (first tick after 03:00 Phoenix, tracked in `dfs_settings.aiv_last_cleanup_at`), call `rpc('aiv_cleanup')` and sync `aiv_locations` if it is older than 30 days.
5. Respond 200, then `after(() => processAiVisibility(admin, 1))`.

## 4. Estimate (`planAiVisibility` in `config.ts`, pure)

```ts
planAiVisibility({ prompts: n, models: AivModel[], countriesSupported, prices = UNIT_USD })
  → { answers, dfsUsd, aiUsd, estimateUsd, perMonth: { weekly, twice_weekly, daily }, minutes }
```

- `answers` = Σ over questions of supported models.
- `dfsUsd` = Σ unit prices.
- `aiUsd` = answers × 0.0006 + 0.01.
- `estimateUsd` = (dfsUsd + aiUsd) × 1.1.
- **Per month:** weekly × 4.33, twice a week × 8.66, daily × 30.4.

The Run now dialog and the Settings tab show the estimate. The RPC refuses when it is above `aiv_max_run_usd`.

## 5. Concurrency and timing (50 questions × 6 platforms = 300 answers)

| Step | Time |
|---|---|
| Dispatch | 4 queue POSTs (seconds) plus 100 live calls at 4 at a time × about 30 s = **about 12 min** |
| Collect | The standard queue returns within 45 min, picked up on the next ticks |
| Analysis | 300 Haiku calls at 4 at a time × about 4 s = **about 5 min** |
| Total | **Usually under 1.5 h** |

The live dispatch is chunked: it releases after 4 minutes and resumes on the next tick, like collect.

## 6. Safety rules

- **Answer text is untrusted.** Every place it goes into a prompt, it is fenced with `untrusted()` (copied from `ai-search/prompts.ts`), and the prompt says so. Haiku output only enters the database through zod schemas and the `dfs_store_*` functions. Unknown brand ids and URLs not found in the chat's sources are dropped.
- **Pages are never fetched server-side** for AI Visibility, except the client's own `robots.txt` (07 §2). That fetch uses the existing safe fetcher (`ai-search/fetcher.ts`: timeouts, size cap, no private IPs).
- **Secrets** come only through the `env.server.ts` getters.
- **Redeploys** never lose a run: claim, heartbeat and released state let the next tick resume. Before pushing, check that no runs are open (`aiv_runs` queued or running).
