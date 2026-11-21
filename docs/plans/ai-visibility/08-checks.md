# AI Visibility · 08 · Checks

Every phase must pass `npm run lint`, `npm run typecheck` and `npm run build` before moving on.

**Paid calls** (DataForSEO or Claude) happen only after you say yes, and the cost is stated first.

## Phase 0 spike (about $0.05)

- [ ] `llm_responses/models` for Claude and Perplexity are listed, and the web-search-capable model names are recorded.
- [ ] One answer each from chatgpt, gemini, ai_overview, ai_mode, claude and perplexity is saved as raw JSON outside the repo.
- [ ] Field paths are confirmed and the **(verify)** marks are removed from 02:
  - answer text, read and cited sources, fan-outs, ads, brand entities;
  - `tag` echo, `postback_url`;
  - error codes.
- [ ] Real per-answer costs come from `dfs_calls`, and `UNIT_USD` is updated.

## Database (rolled-back SQL, run through MCP `execute_sql` inside `begin … rollback`)

- [ ] RLS: a member who can't see the client gets 0 rows from every `aiv_*` table, and authenticated users can't insert or update directly.
- [ ] `save_aiv_project`:
  - a manager succeeds;
  - a VA is refused;
  - a manager setting `daily` is refused, while an admin succeeds;
  - `version` increases;
  - the own brand row is created.
- [ ] `save_aiv_prompts`:
  - 50 are accepted;
  - the 51st is refused with the cap message;
  - a duplicate (same text and country) is skipped;
  - text of 401 characters is refused;
  - `branded` is computed.
- [ ] `update_aiv_prompts`:
  - reactivating past the cap is refused;
  - delete removes the question's chats.
- [ ] `save_aiv_brand`:
  - an invalid regex is refused;
  - the 13th active competitor is refused;
  - `color_slot` is stable after removing and re-adding.
- [ ] `request_aiv_run` refuses:
  - a paused client;
  - an open run;
  - the 5th manual run in a month;
  - an exceeded budget;
  - an estimate above the cap.
- [ ] `dfs_queue_aiv_runs` only queues due, unpaused projects with questions, and moves `next_run_at` on correctly for weekly, twice a week and daily.
- [ ] `dfs_claim_aiv_run`: two parallel claims never take the same run; a stale run is reclaimed; a run with 3 attempts fails.
- [ ] `dfs_store_aiv_chat` called twice with the same `task_id` gives one chat, with sources merged.
- [ ] `update_aiv_action → done` creates exactly 1 `work_items` row; undo removes it.
- [ ] `send_aiv_source_to_backlinks` twice gives 1 opportunity, and the second call returns `existed: true`.
- [ ] `private.ai_month_spend()` excludes `ai_visibility.%`; `private.aiv_month_spend()` includes it.
- [ ] `private.ai_place()` returns the expected `current` and `out_of` for a fixture run.
- [ ] `get_advisors` (security and performance) shows no new findings for the `aiv_*` objects.

## Pure logic (scratch script `scripts/aiv-check.ts`, run with `npx tsx`)

- [ ] Brand match:
  - "Acme" matches "Acme's" and "ACME", but not "Acmeville";
  - aliases match;
  - a domain in the text matches;
  - names of 2–3 letters are case-sensitive;
  - an invalid pattern is skipped.
- [ ] Merge: positions follow first appearance; tracked and untracked names are de-duplicated by `name_key`; a Haiku name not in the text is dropped.
- [ ] Metrics on a 6-answer fixture: visibility, SoV, position, sentiment and win rate match hand-computed values, and failed or empty chats are excluded.
- [ ] Gap score: the own domain and competitor domains are excluded; the score equals answers × competitors.
- [ ] Source types: the rules classify reddit as ugc, wikipedia as reference, clutch.co as directory and the own domain as own.
- [ ] Normalisers: fixture JSON for each platform (from phase 0) gives the expected `NormalizedAnswer`, and UTM parameters are stripped.
- [ ] `planAiVisibility`: 50 × 6 gives about $1.6 a run, with correct monthly values.
- [ ] CSV: quoting, commas, newlines and BOM.
- [ ] robots.txt parser: groups, wildcards, `Disallow: /`, and `Allow` overrides.

## Pipeline (one live run on a test client, about $1.6, with your yes)

- [ ] The setup wizard on the test client: seed, suggest questions (Haiku, about $0.005), accept 50, save, then the first run starts.
- [ ] The run moves through stages 0 to 6, with chats from all 6 platforms (or `unsupported` counted).
- [ ] The cost in `aiv_runs.cost_usd` is within ±30% of the estimate, and `dfs_calls` and `ai_calls` rows carry `ref = run.id`.
- [ ] **Forced stop mid-collect** (kill the dev server): the next tick resumes, and no task is posted twice (same `dfs_task_id`, one chat per task).
- [ ] The cap: with `aiv_max_run_usd` set to $0.05, the run stops dispatching, finishes, and shows `capped`.
- [ ] A denied or low-funds account (the sandbox base, or a simulated `DfsError funds`) fails the run with the clear message and notification.
- [ ] Activity `ai.check_finished` and the `ai_visibility_ready` notification appear.
- [ ] The Overview AI tile shows "mentioned in X of Y".

## Interface (you sign in; built-in browser)

- [ ] **Gate:** a client without setup shows the gate with its missing steps, and the wizard works on phone width.
- [ ] **Overview:**
  - KPIs and change arrows are correct (Position is inverted);
  - the trend chart's hover, legend, "Show as table" and colours stay fixed when the filters change;
  - empty states read well.
- [ ] **Filters** survive reloads (URL), and AND/OR tags change the results.
- [ ] **Prompts:** add, paste, suggest, batch tag, archive, delete (confirm), and the cap note.
- [ ] **Chats:** the chat sheet renders an answer containing `<script>`, `<img onerror>` and markdown links as **text and safe links only**. Brands are highlighted, and the sources lists are correct.
- [ ] **Brands:** add with aliases; the test box; Track and Reject a suggestion; insights; the matrix with any two dimensions.
- [ ] **Sources:**
  - the domain and URL tables and the type filter work;
  - in the gap table, Send to Backlinks becomes "In Backlinks";
  - the place shows in Standard Search Review with the "Cited by AI" badge, outside the 30 cap.
- [ ] **Actions:**
  - accept, done (toast, Overview work count +1), undo, decline, restore;
  - add your own.
- [ ] **Settings:**
  - a manager can't pick daily;
  - an admin can, and sees the budget controls;
  - Runs and costs lists the run with its DataForSEO and Claude parts.
- [ ] **Export:** each CSV opens correctly in Excel.
- [ ] **Display:** dark mode, phone width (375px) for every tab, no horizontal scroll, keyboard navigation, and visible focus rings.
- [ ] **Charts:** `validate_palette.js` passes for the 8 brand slots and the heat scale, in light and dark.

## Before pushing

- [ ] No open runs: `aiv_runs`, `ai_search_runs`, `backlink_runs` and `backlink_strength_checks` are all queued or running = 0.
- [ ] `git add` only the AI Visibility paths, plus the shared files we changed: `roles.ts`, `navigation.ts`, `activity.ts`, `database.types.ts`, `globals.css`, the backlinks badge files, `CLAUDE.md` and `docs/architecture.md`. Diff each shared file first.
- [ ] The commit message ends with the Co-Authored-By line.

## Done before the first push (2026-11-21)

- Rolled-back SQL as an admin user: seed, project (daily as admin), brand, prompts (dedupe, too short,
  branded), quota, run request, store chat twice (one chat), analysis, overview metrics (visibility
  100/50, SoV 66.7/33.3, position 1.5, win rate 50/50), trend, matrix with tag filter, chats page,
  gap (clutch.co), `ai_place` (1 of 2), action → done (one `work_items` row), Send to Backlinks twice
  (one opportunity, `existed: true`).
- `scripts`-style check (scratch, `npx tsx`): 11 groups pass (brand match, merge, name keys, source
  rules, robots.txt, URL cleaning, three normalisers, estimate).
- Typecheck, lint and `next build` pass.
- Not done: phase 0 / live check, browser check (needs sign-in).
