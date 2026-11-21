# AI Visibility · 07 · Actions, Backlinks hand-off, Overview

## 1. What an action is

An action is one concrete step that should raise the client's AI visibility. It comes with the evidence behind it, an impact level and a status:

- **Status:** New, then In progress, then Done. Declined can be restored.
- **Done** counts as an **AI visibility fix** in the month's Overview work, through `work_items`.

| Group (`aiv_actions.group`) | Owned or earned | Examples |
|---|---|---|
| `site`: fix how AI reads the site | Owned | robots.txt blocks GPTBot or ClaudeBot. AI answers read the client's pages but never cite them because the content is behind JavaScript (detected when the client's domain appears in `read` but never in `cited`). Pages the AI tried that returned errors (phase 2, with crawler logs) |
| `own_pages`: improve the client's own pages | Owned | Competitors' pages are cited for "best X in Y" questions where the client has no matching page; write a comparison or location page. An own page is read often but never cited; add specific facts (prices, areas served, numbers) |
| `earned`: get mentioned elsewhere | Earned | A gap domain (editorial list, directory, review platform or Reddit thread) where competitors appear and the client doesn't; get listed, pitch, or join the discussion |
| `claims`: fix wrong claims | Owned and earned | Phase 2 (fact-checking against facts you enter) |

## 2. Generation (pipeline stage 5)

### Inputs, gathered in SQL and TypeScript

1. **Gap rows:** the `aiv_gap` top 30 for the last 30 days, each with domain, type, gap answers, competitors, sample URLs and prompts.
2. **Own-domain stats:** for each own domain, retrieved % and cited %, the top questions where it is read but not cited, and the questions where competitors are cited and the client isn't.
3. **Robots check:** fetch `https://<own domain>/robots.txt` with the safe fetcher (5 s, 200 KB). Parse the user-agent groups for `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`, `Claude-SearchBot`, `PerplexityBot`, `Google-Extended` and `Applebot-Extended`, and record which are disallowed at `/`. This is a deterministic rule with no AI involved. Each blocked search bot becomes a `site` action (high impact for `OAI-SearchBot` and `PerplexityBot`, medium for training-only bots).
4. **Already open actions** (title and domain), so they aren't repeated.

### Haiku (`ai_visibility.actions`, `aiv_actions.v1`)

The client block and the knowledge pack (05 §11) go into the system prompt. Gap rows and URLs are fenced as untrusted data.

```ts
ActionsSchema = { actions: {
  group: 'own_pages' | 'earned',
  title: string,               // ≤140, imperative: "Get listed on clutch.co's Scottsdale web design list"
  detail: string,              // ≤1200: what to do, concretely, 2–5 short steps
  domain: string | null,       // must be one of the gap/own domains we sent
  url: string | null,          // must be one of the sample URLs we sent
  impact: 'high' | 'medium' | 'low',
  evidence_note: string        // ≤200: "Cited in 6 answers (ChatGPT, Gemini) where Acme and Bolt appear; you don't"
}[] }   // ≤10
```

### Checks after parsing

- `domain` and `url` must be ones we sent; otherwise they are set to null.
- Our own evidence object (prompts, competitors, models, answers) is attached from the gap row, never from model text.
- **Impact cross-check:**
  - `gap_score ≥ 20` → at least medium;
  - an editorial or directory domain with `gap_answers ≥ 5` → high;
  - the model can only lower an impact we computed.

`dfs_store_aiv_actions` inserts them and skips open duplicates.

### Team actions

`add_aiv_action` adds an action with `source = 'team'`, a group, a title and detail.

## 3. Send to Backlinks

**Where:**
- the gap table row ("Send to Backlinks");
- an `earned` action;
- a source sheet.

**`send_aiv_source_to_backlinks(client, domain, url, action_id)`:**

1. **Normalise the domain** (`site-key.ts` rules), then find the `directories` row by `site_key`. If none exists, create one as `add_manual_site` does (0046): type from `aiv_domains.type` mapped to a `directory_type`, so editorial becomes a blog or publication, a directory becomes a directory, and so on.
2. **Upsert the `backlink_opportunities` row** on `(client_id, directory_id)`:
   - **No row yet:** insert one with `status 'pending_review'`, `source 'ai_visibility'`, `found_url = url` and `ai_reason` = the evidence sentence (for example "AI answers cite this page in 6 answers (ChatGPT, Gemini, AI Overview) where Acme and Bolt are named and you aren't").
   - **A row already exists:** keep its status. Return `existed: true` and add the evidence to its note if there is room.
3. **Link the action:** set `aiv_actions.opportunity_id`. An earned action moves to `in_progress` if it was `new`.
4. **Log** `ai.sent_to_backlinks`.

### In Backlinks (small changes in `src/features/backlinks/`)

- **Standard Search Review** shows `source = 'ai_visibility'` places with a **"Cited by AI"** badge (icon `Radar`) and the evidence in the place sheet.
- **They don't count toward the 30 cap.** `tabOf` and the cap logic treat `ai_visibility` like `brief`/core rows. Check `constants.ts` `tabOf` and `REVIEW_CAP` usage.
- **Approving** moves it to the Manual Search work list (the existing behaviour for approved places).
- **Shockwave AI Search** can later use the client's top AI-cited gap domains as high-priority research hints (phase 2, noted only).

## 4. Work ledger and Overview

- **`update_aiv_action(id, {status:'done'})`** inserts one `work_items` row: kind `ai_fixes`, source `ai_fix`, `client_id`, `title` = the action title, `done_on` = Phoenix today, `ref` = the action id. It saves the id in `work_item_id`.
- **Undoing Done** deletes that `work_items` row. There is exactly one work item per action.
- **Before writing:** check the `work_items` contract in `docs/architecture.md` ("work_items is the only record of delivered work") and the columns used by Manual Search's Live entry (0046) to match the field names.
- **Overview AI tile:** `private.ai_place()` is redefined over `aiv_runs`/`aiv_chats`/`aiv_mentions` (03). It shows "mentioned in X of Y AI answers", the trend from the previous run, and the baseline from the first run after the client started.
- **Monthly target:** `clients.ai_fixes_target` (default 8) already exists. Done actions count toward it.

## 5. Notifications and activity

| When | Notification (`notification_kind`) | Who |
|---|---|---|
| A run finishes | `ai_visibility_ready`: "AI visibility check finished for <client>: 34% (+5)" | The person who started it, plus the client's managers |
| A run fails | `ai_visibility_failed`: the reason | Same, plus admins |

Activity wording is in 03.
