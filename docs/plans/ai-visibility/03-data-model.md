# AI Visibility · 03 · Data model

Conventions follow the existing backlinks and AI search migrations:

- **Reads:** RLS on every table, selected through `private.can_see_client(client_id)`.
- **Writes:** only through security-definer RPCs. Team RPCs check `private.require_*` and the client. `dfs_*` RPCs are granted to `service_role` only.
- **Functions:** `set search_path = ''`, explicit `revoke … from public, anon`, then grants.
- **Times:** stored in UTC. "Run date" is the America/Phoenix date (`private.agency_today()` style).

Check `ls supabase/migrations` first. The numbers below assume `0051` is the latest.

## 0052_ai_visibility_kinds.sql (enum additions only, so 0053 can use them)

```sql
alter type public.dfs_api add value if not exists 'ai_optimization';
alter type public.notification_kind add value if not exists 'ai_visibility_ready';
alter type public.notification_kind add value if not exists 'ai_visibility_failed';
create type public.aiv_model as enum ('chatgpt', 'gemini', 'ai_overview', 'ai_mode', 'claude', 'perplexity');
create type public.aiv_intent as enum ('informational', 'commercial', 'transactional', 'navigational');
```

## 0053_ai_visibility.sql (tables)

### Settings (`dfs_settings`, single row)

| Column | Type / default | Purpose |
|---|---|---|
| `aiv_monthly_budget_usd` | numeric(10,2) 40 | All AI Visibility spend (DataForSEO and Claude) per month |
| `aiv_max_run_usd` | numeric(10,2) 5 | Cap for one run; the estimate must be under it |
| `aiv_manual_runs_per_client_month` | smallint 4 | "Run now" per client per month |
| `aiv_prompts_per_client` | smallint 50 | Active-question cap |
| `aiv_answer_retention_days` | smallint 180 | Answer text kept this long, then trimmed |
| `aiv_access` | text `'unknown'` check (`unknown`, `active`, `denied`) | Whether the AI Optimization API is enabled |
| `aiv_claude_model`, `aiv_perplexity_model` | text | Set after phase 0 |

### `aiv_projects` (one per client)

| Column | Type | Notes |
|---|---|---|
| `client_id` | uuid PK → `clients` on delete cascade | |
| `brand_name` | text not null, 1–80 | The client's own brand; also seeds the own `aiv_brands` row |
| `description` | text ≤600 | What the client does. Used in every Haiku prompt |
| `industry` | text ≤80 | |
| `personas` | text[] ≤8, each ≤80 | Who the buyers are |
| `brand_identity` | text[] ≤8 | Adjectives the client wants to be known for |
| `models` | aiv_model[] not null default all 6 | Enabled platforms; at least 1 |
| `countries` | text[] 1–3 ISO-2 | |
| `language` | text default `'en'` | |
| `frequency` | text default `'weekly'` check (`weekly`, `twice_weekly`, `daily`) | Only admins may set anything but weekly (RPC check) |
| `run_weekday` | smallint 0–6 default 1 (Monday) | For weekly |
| `next_run_at` | timestamptz | Set by save and by the queue |
| `paused` | boolean default false | |
| `version` | integer default 1 | Increased on each save |
| `updated_by`, `updated_at`, `created_at` | | |

### `aiv_brands`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `client_id` | uuid → clients | |
| `is_own` | boolean | Exactly one own brand per client (partial unique index) |
| `display_name` | text 1–80 | Unique on (client, lower(display_name)) |
| `tracked_names` | text[] 1–10, each 2–60 | Matched as whole words, case-insensitive |
| `pattern` | text ≤200 | Optional regex, validated in the RPC (it must compile; no backreferences; length cap) |
| `domains` | text[] ≤10 | Normalised hosts |
| `color_slot` | smallint 0–7 | The own brand is always 0. Competitors get the lowest free slot at creation, and it is never reassigned |
| `active` | boolean default true | At most 12 active competitors |
| `source` | text check (`team`, `suggested`, `competitors`) | `competitors` = seeded from `client_competitors` |
| `created_by`, `created_at` | | |

### `aiv_topics`

`id`, `client_id`, `name` (1–60, unique on client and lower(name)), `sort` smallint, `created_at`.

### `aiv_prompts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `client_id` | uuid | |
| `topic_id` | uuid → aiv_topics on delete set null | One topic per question |
| `text` | text 8–400 | Trimmed, single spaces |
| `country` | text ISO-2 | Must be one of the project's countries |
| `language` | text | |
| `tags` | text[] ≤10, each ≤40, lower-case | |
| `intent` | aiv_intent | Classified by Haiku on creation; editable |
| `branded` | boolean | True if the text contains a tracked name of the own brand (computed by the RPC) |
| `persona` | text ≤80 | |
| `volume` | smallint 1–5, null = unknown | |
| `volume_at` | timestamptz | |
| `status` | text check (`active`, `archived`) | |
| `source` | text check (`suggested`, `team`, `import`, `keywords`) | |
| `created_by`, `created_at`, `archived_at` | | |

- **Unique** on (client_id, lower(text), country).
- **Cap:** at most `aiv_prompts_per_client` active per client, enforced in `save_aiv_prompts` and `update_aiv_prompts` (reactivate).

### `aiv_suggestions`

`id`, `client_id`, `kind` check (`prompt`, `brand`, `topic`), `key` text (normalised text or brand name; unique on client, kind and key), `payload` jsonb, `reason` text ≤300, `mentions` int, `status` check (`new`, `accepted`, `dismissed`), `created_at`, `decided_by`, `decided_at`.

A dismissed key is never suggested again.

### `aiv_runs`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `client_id` | uuid | |
| `trigger` | text check (`schedule`, `manual`, `new_prompts`) | |
| `status` | `backlink_run_status` (`queued`, `running`, `done`, `failed`) | |
| `stage` | smallint 0–6 | 0 plan, 1 dispatch, 2 collect, 3 analyse, 4 classify, 5 insights, 6 done |
| `params` | jsonb | `{caps: {max_usd}, models, countries, prompt_ids, prices, project_version}` snapshot |
| `counts` | jsonb | tasks, posted, collected, failed, unsupported, analysed, capped, visibility |
| `estimate_usd`, `cost_usd` | numeric(10,4) | |
| `attempts` | smallint default 0 | |
| `heartbeat_at`, `released_at`, `started_at`, `finished_at` | timestamptz | |
| `error` | text | |
| `created_by` | uuid → team_members (null for schedule) | |
| `created_at` | | |

- **One open run per client:** a unique partial index on `client_id where status in ('queued', 'running')`.
- **Index** on `(client_id, created_at desc)`.

### `aiv_tasks` (checkpoint; a resumed run never pays twice)

`id`, `run_id` → aiv_runs on delete cascade, `client_id`, `key` text (`<prompt_id>:<model>:<country>`), `prompt_id`, `model`, `country`, `status` check (`queued`, `posted`, `collected`, `failed`, `skipped`), `dfs_task_id` text, `posted_at`, `collected_at`, `attempts` smallint, `error` text, `cost_usd` numeric(10,5).

- **Unique** on (run_id, key).
- **Index** on `(status, posted_at)` where status = 'posted'.

### `aiv_chats` (one AI answer)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `run_id`, `task_id` | uuid | `task_id` is unique, so storing is idempotent |
| `client_id`, `prompt_id` | uuid | |
| `model` | aiv_model | |
| `country` | text | |
| `country_fallback` | boolean | The platform ran without the country |
| `run_date` | date | Phoenix date of the run |
| `status` | text check (`ok`, `empty`, `failed`) | Only `ok` counts in metrics |
| `answer` | text ≤40000, null after retention | |
| `model_version` | text | |
| `fan_out` | text[] ≤20 | |
| `has_ads` | boolean | |
| `brand_hints` | text[] | |
| `analyzed_at` | timestamptz | Null until analysis |
| `analysis_version` | text | e.g. `aiv_analyze.v1` |
| `error` | text | |
| `fetched_at`, `created_at` | | |

Indexes: `(client_id, run_date)`, `(prompt_id, model, run_date desc)`, `(run_id)`, and `(analyzed_at) where analyzed_at is null and status = 'ok'`.

### `aiv_mentions`

`id` bigserial, `chat_id` → aiv_chats on delete cascade, `client_id`, `run_date`, `model`, `brand_id` (null = untracked), `name` text ≤80, `name_key` (lower, normalised), `position` smallint ≥1, `sentiment` smallint 0–100 (null for untracked), `quote` text ≤300.

- **Unique** on (chat_id, name_key).
- **Indexes:** `(client_id, brand_id, run_date)` and `(client_id, name_key) where brand_id is null`. The second feeds brand suggestions.

### `aiv_sources`

`id` bigserial, `chat_id` → aiv_chats on delete cascade, `client_id`, `run_date`, `model`, `url` text ≤2000, `domain` text, `title` text ≤300, `retrieved` boolean, `cited` boolean, `cite_rank` smallint.

- **Unique** on (chat_id, url).
- **Indexes:** `(client_id, domain, run_date)` and `(client_id, url)`.

### `aiv_ads`

`id`, `chat_id`, `client_id`, `run_date`, `advertiser`, `domain`, `title`, `url`.

### `aiv_domains` (global cache, shared by every client)

`domain` PK, `type` text check (`corporate`, `editorial`, `reference`, `ugc`, `directory`, `social`, `ecommerce`, `other`), `by` text check (`rule`, `ai`), `classified_at`.

Readable by authenticated users; written only by service role.

### `aiv_actions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `client_id` | uuid | |
| `group` | text check (`site`, `own_pages`, `earned`, `claims`) | |
| `title` | text ≤140 | |
| `detail` | text ≤1200 | What to do |
| `evidence` | jsonb | `{prompts: [...], competitors: [...], urls: [...], answers: n, models: [...]}` |
| `impact` | text check (`high`, `medium`, `low`) | |
| `domain`, `url` | text | |
| `status` | text check (`new`, `in_progress`, `done`, `declined`) | |
| `source` | text check (`ai`, `team`) | |
| `opportunity_id` | uuid → backlink_opportunities on delete set null | Set by Send to Backlinks |
| `work_item_id` | uuid → work_items on delete set null | Set when Done |
| `created_run_id` | uuid | |
| `created_by`, `created_at`, `updated_at`, `done_by`, `done_at` | | |

Unique partial index on (client_id, group, coalesce(domain, title)) where status in ('new', 'in_progress').

### Backlinks change

```sql
alter table public.backlink_opportunities drop constraint <source check>;
alter table public.backlink_opportunities add constraint backlink_opportunities_source_check
  check (source in ('search', 'core', 'brief', 'ai', 'manual', 'ai_visibility'));
```

Find the real constraint name first with `pg_constraint`.

### RLS

Every `aiv_*` table: `enable row level security`, and `select` for authenticated where `private.can_see_client(client_id)`. `aiv_domains` uses `true`. There are no insert, update or delete policies.

## 0054_ai_visibility_functions.sql

### Spend

- **`private.aiv_month_spend()`** = Σ `dfs_calls.cost_usd` where `ref` is in this month's `aiv_runs`, plus Σ `ai_calls.cost_usd` where `feature like 'ai_visibility.%'`, both since `private.agency_month_start()`.
- **Redefine `private.ai_month_spend()`** to exclude `feature like 'ai_visibility.%'`, as it already excludes `ai_search.%`.
- **`public.aiv_budget_problem()`** returns text, or null:
  - "This month's AI Visibility budget is used up. An admin can raise it."
  - The overall DataForSEO message from `private.backlinks_budget_problem` when that budget is used up.

### Team RPCs

| Function | Who | Does |
|---|---|---|
| `save_aiv_project(p_client_id uuid, p jsonb)` | manager+ | Validates and upserts; bumps `version`; recomputes `next_run_at`; upserts the own brand (`tracked_names` default `{brand_name}`). Frequency other than weekly requires admin. Logs `ai.project_saved` |
| `save_aiv_brand(p_client_id, p jsonb)` | manager+ | Insert or update by `id`; validates names, pattern and domains; assigns `color_slot`; enforces the 12-competitor cap. Logs `ai.brand_saved` |
| `remove_aiv_brand(p_id)` | manager+ | Sets `active = false` (history kept). The own brand can't be removed |
| `seed_aiv_from_setup(p_client_id)` | manager+ | Creates the project from the client profile, backlink brief and places, plus brands from `client_competitors`, if none exist. Idempotent |
| `save_aiv_topics(p_client_id, p jsonb)` | manager+ | Upsert list, sort order |
| `save_aiv_prompts(p_client_id, p_items jsonb)` | manager+ | Bulk add of ≤50. Each item has `text, country, topic, tags, intent?, persona?, source`. Normalises text, skips duplicates, refuses past the cap ("This client already tracks 50 questions. Archive some first."), computes `branded`. Returns `{added, skipped, ids}`. Logs `ai.prompts_added` |
| `update_aiv_prompts(p_ids uuid[], p jsonb)` | manager+ | Batch: `tags_add`, `tags_remove`, `topic_id`, `status` (archive or reactivate, with the cap check), `intent`, `text` (single id), or `delete: true` (also deletes the question's chats) |
| `review_aiv_suggestion(p_id, p_accept boolean)` | manager+ | Accepting a prompt suggestion adds the question; a brand suggestion adds a competitor; a topic suggestion adds the topic. Sets the status |
| `request_aiv_run(p_client_id, p_estimate numeric)` | manager+ | Refuses when the client is paused or churned, the project or questions are missing, a run is open, the monthly manual count is reached, the budget is used up, or the estimate is above the cap. Inserts a `manual` run with the params snapshot and returns its id. Logs `ai.run_started` |
| `update_aiv_action(p_id, p jsonb)` | va+ (`ai_visibility.work`) | Changes status. `done` inserts exactly one `work_items` row (kind `ai_fixes`, source `ai_fix`, client, title) and stores `work_item_id`. Moving from done to another status deletes that work item. Logs `ai.action_<status>` |
| `add_aiv_action(p_client_id, p jsonb)` | va+ | Adds a team action |
| `send_aiv_source_to_backlinks(p_client_id, p_domain text, p_url text, p_action_id uuid)` | va+ | Finds or creates the `directories` row (as `add_manual_site` does in 0046). Inserts or reuses a `backlink_opportunities` row with source `ai_visibility`, status `pending_review`, `found_url` = url, and `ai_reason` = the evidence sentence. Links the action. Idempotent. Returns `{opportunity_id, existed}` |

### Read functions

All are security invoker, so RLS applies. Common filter parameters: `p_client_id`, `p_from date`, `p_to date`, `p_models aiv_model[]`, `p_countries text[]`, `p_tags text[]`, `p_tags_all boolean` (AND vs OR), `p_topics uuid[]`, `p_prompt_ids uuid[]`.

| Function | Returns |
|---|---|
| `aiv_overview(filters)` | Per active brand: `answers, mentioned, visibility, sov, position, sentiment, win_rate`, and the same for the previous period of equal length. Also `answers_total`, `last_run_at` and `next_run_at` |
| `aiv_trend(filters, p_bucket text, p_metric text)` | Rows `(bucket_start, brand_id, value, answers)` |
| `aiv_matrix(filters, p_rows text, p_cols text, p_metric text)` | Rows `(row_key, row_label, col_key, col_label, visibility, sov, position, sentiment, win_rate, answers)`. Dimensions: `model`, `brand`, `topic`, `tag`, `country` |
| `aiv_prompt_table(filters)` | Per question: the own brand's visibility, position and sentiment, plus answers and last run |
| `aiv_sources_domains(filters, p_limit, p_offset)` | `domain, type, retrievals, retrieved_pct, cited_pct, citation_share, avg_cite_rank, is_own, is_competitor` |
| `aiv_sources_urls(filters, p_domain, p_limit, p_offset)` | Per URL, the same set |
| `aiv_gap(filters, p_limit)` | `domain, gap_answers, competitors text[], gap_score, sample_urls, prompts`. Also `in_backlinks` (an opportunity exists for this domain) and `action_id` |
| `aiv_chats_page(filters, p_brand uuid, p_q text, p_limit, p_offset)` | Chat list rows with mentions (name, position, own or tracked) |
| `aiv_chat(p_chat_id)` | One chat with answer, mentions, sources, ads and fan-outs |
| `aiv_quota(p_client_id)` | Project status, `setup_missing text[]`, counts (active questions and cap, brands), `budget_problem`, `open_run`, `last_run`, `manual_used` and limit, `access`, the prices snapshot for the estimate |
| `aiv_run_history(p_client_id, p_limit)` | Runs with DataForSEO and Claude cost parts, for Runs and costs |

### Service-role functions

| Function | Does |
|---|---|
| `dfs_queue_aiv_runs(p_limit int)` | For projects that are not paused, with `next_run_at <= now()`, at least 1 active question, no open run, an active client and no budget problem: insert a `schedule` run with the params snapshot and estimate, and move `next_run_at` on. Returns the ids |
| `dfs_claim_aiv_run()` | Fails runs with `attempts >= 3` and a stale heartbeat. Claims a `queued` run, or a `running` one that is released or stale (heartbeat older than 2 min), with `for update skip locked`. Sets `attempts + 1`, `heartbeat_at` and `started_at` |
| `dfs_release_aiv_run(p_run_id)` | Sets `released_at` (graceful shutdown) |
| `dfs_store_aiv_chat(p_task_id uuid, p jsonb)` | Inserts the chat, sources (read and cited merged by URL) and ads; marks the task `collected` with its cost. Idempotent on `task_id` |
| `dfs_store_aiv_analysis(p_chat_id, p jsonb)` | Replaces the chat's mentions, then sets `analyzed_at` and `analysis_version` |
| `dfs_store_aiv_domains(p jsonb)` | Upserts `aiv_domains` |
| `dfs_store_aiv_suggestions(p_client_id, p jsonb)` | Upserts new suggestions, skipping dismissed keys |
| `dfs_store_aiv_actions(p_client_id, p_run_id, p jsonb)` | Inserts new actions, skipping open duplicates |
| `aiv_cleanup()` | Sets `answer = null` past retention. Deletes `aiv_tasks` of finished runs older than 30 days, and runs older than 13 months (chats cascade). Fails runs stuck queued for more than 24 h |

### Overview

Redefine `private.ai_place(p_client_id, p_started)`. It keeps the same jsonb keys (`current`, `out_of`, `previous`, `baseline`, `baseline_checked_at`, `last_checked_at`), now computed over `aiv_runs` with `status = 'done'`:

- `out_of` is the run's `ok` chats;
- `current` is the chats where the own brand is mentioned.

`features/overview` needs no change.

### Activity wording (`src/features/team/activity.ts`)

| Event | Wording |
|---|---|
| `ai.project_saved` | Updated the AI visibility setup |
| `ai.brand_saved` | Added or updated a tracked brand |
| `ai.prompts_added` | Added N questions |
| `ai.run_started` | Started an AI visibility check |
| `ai.check_finished` (already reserved) | AI visibility check finished: X% visibility across N answers |
| `ai.action_done` | Marked an AI visibility fix done: … |
| `ai.sent_to_backlinks` | Sent <domain> to Backlinks |

## 0055_ai_visibility_cron.sql

Copy `0034`:

- Vault secret `aiv_cron_token`.
- `public.verify_aiv_token(p_token text) returns boolean`, a sha256 compare, service role only.
- `cron.unschedule('ai-visibility-tick')` if present, then `cron.schedule('ai-visibility-tick', '*/10 * * * *', net.http_post(app_base_url || '/api/cron/ai-visibility', Authorization: Bearer <token>, timeout 60000))`.

## Old tables

`ai_checks` and `ai_answers` (0019) are empty and never written. Confirm they are empty, stop reading them through the new `ai_place`, and drop them in a later cleanup migration. Don't drop them in this build.

## After applying

- Run `get_advisors` for security and performance, and fix what it finds.
- Regenerate `src/lib/supabase/database.types.ts` with `generate_typescript_types`.

## As built (2026-11-21)

- 0054 was applied in six parts (`0054_ai_visibility_functions_1_helpers` … `_6_worker_reads`); the
  repo file holds the same functions in one place. 0055 was applied in two parts: the token function
  first, the pg_cron schedule right before the first deploy.
- The pipeline writes tasks, run counts, prompt volumes and `aiv_domains` directly with the service
  role (RLS doesn't apply to it); multi-table writes go through `dfs_store_aiv_chat` /
  `dfs_store_aiv_analysis`. `aiv_gap`, `aiv_sources_domains` and `aiv_overview` are also granted
  to `service_role` for the insights stage.
- Extra: `aiv_locations (family, country_iso, location_code)` caches platform location codes;
  `dfs_settings.aiv_access_checked_at`, `aiv_last_cleanup_at`.
- `dfs_store_aiv_actions` also skips an action declined in the last 60 days for the same domain/title.
- Tracked mentions use `name_key = 'brand:<brand id>'` so a tracked brand is one row per answer.
