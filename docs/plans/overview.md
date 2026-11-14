# Plan: Client Overview page

## Context

`/clients/[slug]` (Overview) is a "Not built yet" placeholder. It should be the one page that answers "how is this client doing?":

- who they are
- where they show up: website, map pack, AI answers
- what we promised this month and how far along it is
- what's open
- what happened recently

Mark's mockup (your 3 screenshots) shows the target. The product plan lists it as "Client details, '3 places you show up', monthly deliverables progress and activity".

**What the database has today:**

- Client record, business profile, onboarding, connected accounts, tasks (one task covering many clients, with a tick-off per client), client requests, alerts, activity log.
- Monthly targets exist only for keywords, backlinks and articles (`clients.*_target`).

**What it doesn't have yet:**

- No rankings, AI answers, backlinks, articles, posts or reviews data.
- `clients.health` is never set, so every client shows "On track".

**Your decisions:**

1. **Shared tables now, data later.** Create the ranking and AI-answer tables that the Rankings and AI visibility pages will fill. The Overview reads them from day one and shows honest empty states until the first check.
2. **Work counts itself, plus manual entries.**
   - Finished work counts automatically: today that's ticking a client off a task that "counts toward" a deliverable; later, backlink live, article published, post sent.
   - The team can log work done outside the app, or correct a count, and every entry is in History.
3. **Status is automatic.** It comes from the client's open problems, and falling behind this month's plan counts as a problem.

## Page layout (follows `docs/design-system.md`: plain title row, hairlines, segmented stat panels, no card grids)

Top to bottom. Each section loads on its own behind Suspense with its own skeleton, so the page starts showing while the rest loads.

1. **Header:** title "Overview" and a one-line description.
   - Right side: **Edit details** (admins and managers) and **Monthly report** (links to the report page; it shows "Soon" until that page exists).
2. **Needs attention** (only when there's something open):
   - This client's open alerts, most severe first, each with its action button (for example "Reconnect LinkedIn" or "Review onboarding").
   - If the client is still in Onboarding: a progress row ("Onboarding 3 of 5 steps · sent 2 days ago") linking to Onboarding.
3. **Client details:** a definition grid with these fields:

   | Field                 | Source                                                                       |
   | --------------------- | ---------------------------------------------------------------------------- |
   | Business              | name                                                                         |
   | Location              | location                                                                     |
   | Website               | external link                                                                |
   | Industry              | primary category                                                             |
   | Package               | SEO / GEO / SEO + GEO / Custom                                               |
   | Every month           | summary, e.g. "20 backlinks, 8 articles, 8 Google posts, 30 review requests" |
   | Client since          | date and duration ("14 Oct 2026 · 1 month")                                  |
   | Status                | health tag plus its reason ("Behind on backlinks")                           |
   | Stage                 | Onboarding / Active / Paused                                                 |
   | Account manager       | owner                                                                        |
   | Main contact          | name, email, phone from the approved business profile                        |
   | Connections           | "6 connected · 1 needs reconnecting", linking to Connections                 |
   | Waiting on the client | open client requests count, linking to Client requests                       |

4. **Where they show up:** one 3-segment panel.

   | Place                     | Number                                            | Link                 |
   | ------------------------- | ------------------------------------------------- | -------------------- |
   | Website on search engines | Google top-10 count / tracked keywords            | See website rankings |
   | Google Business Profile   | keywords in the map pack top 3 / tracked keywords | See map rankings     |
   | AI answers                | answers naming the business / answers checked     | See AI visibility    |
   - Each segment also shows: "Up from N at the start" (compared with the first check after the client started; green up, red down, grey same), "Last checked 3 days ago", and one plain sentence explaining the place.
   - Empty state per segment: "No checks yet. Add keywords on Rankings and the weekly check fills this in." No fake numbers.

5. **This month's work:** heading "November work", "21 days left", and ‹ › to step back through earlier months.
   - One row per deliverable with a target above 0: label, progress bar, "14 / 20", status tag.
   - A small tick on the bar shows where the client should be by today, so "behind" is visible at a glance.
   - Status tags: **Done** (target met), **On track**, **Needs a look** (behind schedule).
   - For a past month, the tags change to **Delivered** or **Short by 2**.
   - Clicking a row opens the items behind the number: title, date, link, where it came from (task T-1023, logged by Ana, or later "Backlinks").
   - **Log work** (admins, managers, VAs, writers): deliverable, quantity (a negative number corrects a count and needs a note), date within the month, title, optional link. People can remove their own manual entries; admins and managers can remove any.
   - Paused clients show "Paused: no work planned this month".
6. **Open tasks for this client** (up to 5, overdue first), each showing:
   - Title, assignee, due date ("Overdue" in red, "Today"), "Shared with N other clients" and a status tag.
   - **See all tasks** goes to Client tasks. A row opens that task's sheet.
7. **Recent activity:** the newest 15 activity-log entries for this client, grouped by day (Today, Yesterday, Fri 6 Nov), with **Show more**.

**Freshness:** every action refreshes the page. While the tab is visible, the page also refreshes quietly every 60 seconds, so ticks made by VAs on other pages show up.

**Mobile:** sections stack; the stat panel becomes 1 column; work rows wrap the numbers under the bar.

## Database (Supabase project `seo-platform`, applied through the MCP, then advisors and type generation)

### 0018_overview_kinds.sql (enums)

- `package_kind`: `seo`, `geo`, `seo_geo`, `custom`.
- `deliverable_kind`: `backlinks`, `articles`, `gbp_posts`, `review_requests`, `ai_fixes`.
- `work_source`: `task`, `manual`, `backlink`, `article`, `gbp_post`, `review_request`, `ai_fix`. The last five are for the future pages.
- `rank_engine`: `google`, `bing`, `google_maps`.
- `ai_tool`: `chatgpt`, `perplexity`, `gemini`, `ai_overviews`, `claude`. Copilot has no API (see the product plan).

### 0019_overview.sql

**Client fields:** `clients` gets these columns:

- `package` (default `seo`).
- New monthly targets `gbp_posts_target`, `review_requests_target` and `ai_fixes_target`, each 0–500. The existing `keywords_target`, `backlinks_target` and `articles_target` stay.
- `health_reason` text and `health_changed_at`.
- Existing clients get these targets: Google posts 8, review requests 30, AI fixes 8 (the mockup's numbers). Editable.

**`client_month_plans`** `(client_id, month, kind, target)`, primary key `(client_id, month, kind)`. It stores what we promised that month:

- `private.ensure_month_plan(client, month)` creates the rows from the client's targets the first time a month is read or written.
- Changing a target updates **this** month's plan (trigger) and never past months, so history stays true.
- A client that starts mid-month gets that first month's targets scaled down to the days left, rounded up, with a note "started mid-month".

**`work_items`** is the single record of delivered work. Every deliverable count comes from here.

- Columns:
  - `id`, `client_id`, `kind`, `quantity` (−50 to 50, not 0)
  - `delivered_on` (date), `month` (generated: first day of `delivered_on`)
  - `title`, `url`, `note`
  - `source`, `source_id`, `task_id` (cascade delete)
  - `created_by`, `created_at`
- A unique index on `(source, source_id, client_id)`, so the same piece of work can never count twice.
- A check that a negative quantity has a note.
- **Tasks feed it automatically:**
  - `tasks` gets `counts_as deliverable_kind` (nullable) and `units` (1–50, default 1).
  - Existing tasks are backfilled from their type: Backlinks counts as backlinks, Content as articles.
  - Triggers keep it in sync:

  | Event                                                          | Effect on `work_items`                 |
  | -------------------------------------------------------------- | -------------------------------------- |
  | Client ticked off a counting task (`task_clients.done_at` set) | Inserts the work item, delivered today |
  | Client un-ticked                                               | Deletes it                             |
  | Task's `counts_as` or `units` changes                          | Updates that task's items              |
  | `counts_as` cleared                                            | Deletes them                           |

- **Later pages** (Backlinks, Content, Reviews, AI visibility) insert with their own `source` and `source_id`. That contract is written in `docs/architecture.md`.

**Visibility tables** (filled later by the Rankings and AI visibility jobs; their contract is fixed now):

- `keywords` `(id, client_id, phrase, tracked bool, created_at, archived_at)`, unique per client on the lower-cased phrase.
- `rank_checks` `(id, client_id, engine, checked_at, status, source, cost_usd)`.
- `keyword_ranks` `(check_id, keyword_id, client_id, engine, position null = not found, url)`.
- `ai_checks` `(id, client_id, checked_at, runs)` and `ai_answers` `(check_id, keyword_id, tool, run_no, mentioned, position, cited_url)`.

**Functions:** all security invoker, so row-level security applies; month and "today" are in the agency's time zone through `private.agency_today()`.

- `public.client_month_progress(p_client_id, p_month default this month)` returns, per deliverable, `target`, `done` (sum of quantity), `expected_by_today`, `status`, `days_left`.
  - The schedule rule: expected = target × days elapsed ÷ days in the month.
  - It's "Needs a look" when `done < expected − max(1, 15% of target)` and `done < target`.
  - An internal version takes `p_today` so the tests can fix the date.
- `public.client_visibility(p_client_id)` returns the three places, each with:
  - `current`, `out_of`, `baseline` (first check on or after `started_on`), `previous`, `last_checked_at`.
  - Map pack means position 1–3 on `google_maps`. AI is mentioned answers out of all answers in the latest check.
- `public.client_activity(p_client_id, p_before, p_limit)` returns a page of history with the actor's name.

**Automatic status:**

- `private.check_client_pace(client)` raises or resolves a **needs-a-look alert** `pace:<client_id>` ("Behind on backlinks: 6 of 20, should be about 12 by now", with action "Open Overview").
  - It runs only for Active clients, from day 5 of the month on, so a new month doesn't flag everyone.
  - It runs on every `work_items` change and on target or stage changes.
- `private.refresh_client_health(client)`:
  - The status is the most severe open alert: none means On track, a needs-a-look alert means Needs a look, an action-needed alert means Action needed.
  - It sets `health_reason` to that alert's title.
  - When the status changes, it logs `client.health_changed` (from, to, reason).
  - It's triggered by changes to `alerts` (insert, or resolved).
- Because pace is an alert, the Dashboard's Needs attention list and its tiles update with no extra work. Existing connection-lost and onboarding alerts now affect health too.
- One-time backfill: refresh health for every client.

**Row-level security:**

- `work_items`: read when `private.can_see_client`.
  - Adding manual items: admins, managers, VAs and writers who can see the client, with `source = 'manual'` and `created_by` set to themselves.
  - Deleting: your own manual items; admins and managers can delete any.
  - Task-sourced rows are written only by the security-definer triggers.
- `client_month_plans`: readable; written only through functions.
- Visibility tables: readable when `can_see_client`. Writes go through the service role only (the future jobs). No anon access anywhere.
- Activity logging:
  - **Logged now:** manual add and remove (`work.logged`, `work.removed`), detail edits (`client.updated`, with the changed fields), target changes (`client.targets_changed`).
  - **Reserved for later features:** `rank.check_finished`, `ai.check_finished`, `backlink.live`, `article.published`, `review.received`, `report.sent`. Their wording is added to `describeActivity` now.

### 0020_overview_cron.sql

- A daily pg_cron job at 07:10 UTC (00:10 Phoenix) runs `private.overview_daily()`:
  - creates the new month's plans on the 1st
  - re-checks pace for all Active clients, since pace changes as days pass with no new work
  - refreshes health
- It runs in SQL only, so it needs no app call.

## App code (same patterns as Onboarding, Connections and Requests)

- **`src/features/overview/`:**
  - `constants.ts`: deliverable labels and order, package labels, place explanations, status tags.
  - `queries.ts`: these run in parallel, all through RLS:
    - `getOverviewDetails` (client and owner, business profile contact, onboarding progress, connections summary, open request count)
    - `getClientAlerts`
    - `getVisibility` (RPC)
    - `getMonthWork(clientId, month)` (RPC and that month's work items)
    - open tasks, reusing `getTasksForClient` from `src/features/tasks/queries.ts` (open only, top 5)
    - `getClientActivity` (RPC)
  - `schemas.ts`: zod for log work and for edit details (extends `src/features/clients/schemas.ts`).
  - `actions.ts`: `logWork`, `removeWork`, `updateClientDetails`, `loadMoreActivity`. Each checks permission through `requirePermission` and calls `refresh()`.
  - `components/`:
    - `details-grid`
    - `attention-list`
    - `visibility-panel` (3 segments with the change indicator)
    - `month-work` (rows, schedule tick, month stepper, items drawer)
    - `log-work-dialog`
    - `open-tasks`
    - `activity-feed`
    - `edit-client-dialog` (details, package, owner, stage, start date, all six targets)
    - `overview-refresher` (refreshes every 60 seconds while visible)
- **`src/app/(app)/clients/[clientSlug]/page.tsx`:** replaces the placeholder. `?month=2026-10` selects a month; it's validated, and future months are refused.
- **Tasks:**
  - In the task form, "Counts toward: [None / Backlinks / Articles / Google posts / Review requests / AI fixes] × units". The default comes from the task type, and it's shown in the task sheet.
  - Files: `task-form-dialog.tsx`, `src/features/tasks/schemas.ts`, `actions.ts`, `queries.ts`.
- **`src/lib/dates.ts`:** `agencyMonth()`, `monthBounds()`, `daysLeftInMonth()`, all from `agencyToday()`, so render code never calls `Date.now()`.
- **`src/features/team/activity.ts`:** wording for the new actions.
- **Dashboard client table** (`src/features/dashboard`): add "Backlinks 14/20 · Articles 3/8" from one batch call `month_progress_summary(client_ids[])`, as the product plan's client table shows.
- **Roles:** `work.log` for admins, managers, VAs and writers. `clients.update` is already in place for Edit details.
- **Docs:**
  - `docs/plans/overview.md` (this plan)
  - `docs/architecture.md`: the `work_items` and visibility contract for later pages
  - `CLAUDE.md`

## Problems this prevents

| Risk                                                               | Prevention                                                                                                                                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Counting the same work twice (task plus the future Backlinks page) | One ledger with a unique `(source, source_id, client)`. When Backlinks ships, backlink tasks switch `counts_as` off or the backlink row replaces the task row. That's written in the contract     |
| Changing a target rewrites last month                              | Month plans are snapshots; only the current month follows target edits                                                                                                                            |
| Un-ticking or deleting a task leaves stale counts                  | Triggers delete the item; cascade on task delete                                                                                                                                                  |
| Everyone flagged "behind" on the 1st                               | The pace check starts on day 5 and uses a 15% grace                                                                                                                                               |
| Time-zone drift ("21 days left" wrong at night)                    | All month and day maths use `agency_today()` / `agencyToday()` (Phoenix)                                                                                                                          |
| Fake-looking numbers before Rankings exists                        | Per-segment empty states; nothing is invented                                                                                                                                                     |
| VAs seeing clients they shouldn't                                  | Every table and RPC goes through `can_see_client` with RLS                                                                                                                                        |
| Bad manual edits                                                   | Zod and DB checks; negative quantities need a note; everything is logged with who and when                                                                                                        |
| Slow page                                                          | One query per section, run in parallel, plus indexes on `work_items (client_id, month)`, `keyword_ranks (client_id, engine)`, `activity_log (client_id, created_at desc)`, and streaming sections |

## Order of work

1. Migrations 0018 to 0020, then advisors, types, and rolled-back database tests.
2. Date helpers, overview queries and RPC wiring.
3. Page sections: details, attention, visibility, month work, tasks, activity.
4. Log work, Edit details and the task "Counts toward" field.
5. Dashboard client-table progress, activity wording, docs.
6. Lint, typecheck and build, then push, deploy and test live.

## Verification

**Database** (rolled-back `DO` blocks with fake JWT claims):

- Ticking a counting task creates one work item and un-ticking removes it. Changing `counts_as` or `units` moves the items.
- A duplicate source is rejected, and so is a negative quantity without a note.
- Month progress maths with a fixed `p_today`:
  - On day 9 of 30 with 14 of 20, the status is On track.
  - With 4 of 20 it's Needs a look, and the pace alert is raised.
  - Logging 8 more resolves the alert, and health goes back to On track.
- An open connection-lost alert sets Action needed, with the reason shown.
- Changing a target updates only the current month's plan.
- The mid-month start is scaled down.
- `client_visibility` with seeded checks returns the right current, baseline, previous and out-of numbers.
- A VA can't see or log work for a client that isn't in their tasks.
- Advisors show nothing new.

**Live** (Test Client):

1. Set the targets in Edit details.
2. Tick Test Client on a Backlinks task, and see Backlinks go to 1/20 straight away, with the item in its list.
3. Log 2 articles and remove one.
4. Step to last month.
5. Seed one sample rank check through SQL and see the panel fill in with "Up from …", then delete the sample.
6. Check the empty states with no checks.
7. Raise a connection alert, and see Needs attention, the Status tag and the Dashboard tile change.
8. Check light and dark mode, and 375 px wide.

Then `npm run lint`, `npm run typecheck` and `npm run build`, push, and check on the live site.
