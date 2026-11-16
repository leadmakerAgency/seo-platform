# Architecture

## Layers

```
Browser ──> src/proxy.ts ──> app routes (thin) ──> features/<module> ──> Supabase (RLS)
            refresh session    src/app/(app)/…      queries / actions     Postgres + Auth
            redirect signed-out                      schemas / components
```

- **`src/proxy.ts`** refreshes the Supabase session cookie on every request and sends signed-out
  users to `/login`. It is an optimistic check only.
- **`src/lib/auth.ts`** is the data access layer for the user: `getCurrentMember()` (cached per
  request) and `requirePermission()` for Server Actions.
- **Row level security** in Postgres is the real authorization. Policies call helpers in the
  `private` schema (`private.is_team_member()`, `private.has_role()`), which the API can't call.
- **Server Components read, Server Actions write.** Reads live in `features/*/queries.ts`
  (`server-only`), writes in `features/*/actions.ts`, validated with zod schemas shared with the
  forms. After a write, actions call `refresh()` from `next/cache`.

## Routes

| Route                               | What                                                                                                  | Status      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------- |
| `/login`, `/setup`, `/no-access`    | Sign in, one-time first-admin setup, waiting for access                                               | Built       |
| `/auth/confirm`                     | Email confirmation callback (PKCE `code` or `token_hash`)                                             | Built       |
| `/dashboard`                        | Health tiles, Needs attention, client list                                                            | Built       |
| `/clients/new`                      | Add client: business, location (every country), services, contact, plan, onboarding link (admins, managers) | Built       |
| `/tasks`                            | Task list (tabs, tiles, filters), task panel (`?task=1051`), create/edit, comments                    | Built       |
| `/team`                             | Members, invite links, roles, access, permission matrix, activity log (admin only)                    | Built       |
| `/welcome`                          | Invited members set their name and password                                                           | Built       |
| `/tasks/requests`                   | Client requests across all clients: the chase list (admins, managers)                                 | Built       |
| `/clients/[clientSlug]/tasks`       | Tasks that include one client, tick per client                                                        | Built       |
| `/clients/[clientSlug]/requests`    | Things we need from the client, their private link, request panel (`?request=101`)                    | Built       |
| `/clients/[clientSlug]/onboarding`  | Onboarding link, live progress, review & apply details, logins vault (admins, managers; viewers read) | Built       |
| `/onboard/[slug-token]`             | The client onboarding wizard: public, no sign-in, autosaves (also `connect.<domain>/<slug-token>`)    | Built       |
| `/onboard/done`                     | Where Zernio returns the client after an onboarding sign-in (one-time key, not the token)             | Built       |
| `/clients/[clientSlug]/connections` | Client Google Business Profile and social accounts through Zernio (admins, managers)                  | Built       |
| `/integrations/zernio/callback`     | Where Zernio's hosted sign-in returns; checks the attempt, syncs, redirects                           | Built       |
| `/api/webhooks/zernio`              | Zernio webhooks (HMAC-signed, no session)                                                             | Built       |
| `/api/cron/zernio-sync`             | Hourly Zernio health sync, called by pg_cron with a Vault token (no session)                          | Built       |
| `/c/[token]`                        | The client portal: public, no sign-in, the token is the key (noindex, no-referrer)                    | Built       |
| `/clients/[clientSlug]`             | Overview: details, needs attention, where they show up, month work (`?month=2026-10`), tasks, history | Built       |
| `/clients/[clientSlug]/rankings`    | Rankings: tracked keywords (`?tab=keywords&show=top10`), Find better keywords (`?tab=research`), Settings | Built       |
| `/api/webhooks/dataforseo`          | DataForSEO postbacks for SERP tasks (Vault token in the URL, no session)                              | Built       |
| `/api/cron/rankings`                | Every 10 minutes from pg_cron (Vault token): start due checks, recover tasks, research, daily balance | Built       |
| `/clients/[clientSlug]/backlinks`   | Backlinks: places to get listed (`?tab=review|approved|rejected|hidden`), Find places, site strength   | Built       |
| `/api/cron/backlinks`               | Every 15 minutes from pg_cron (Vault token): resume stopped searches, clean up (never starts one)     | Built       |
| `/clients/[clientSlug]/[section]`   | AI visibility, content, reviews, report                                                               | Coming soon |
| `/api/clients/search?q=`            | Client search in the sidebar (Ctrl/Cmd+K focuses it)                                                  | Built       |
| `/api/notifications`                | Latest notifications for the header bell                                                              | Built       |

All page definitions (title, icon, roles, coming-soon flag, summary) are in `src/lib/navigation.ts`.

## Database (migrations in `supabase/migrations`)

- `team_members`: one row per auth user; `role` (admin, manager, va, writer, viewer) and
  `status`. The first sign-up becomes the active admin (trigger `handle_new_user`); later users
  start as invited viewers.
- `clients`: the SEO clients, with `health` (on_track, needs_look, action_needed; set
  automatically from open alerts), `stage`, `package` and the monthly targets (see "Client
  Overview and the work ledger").
- `alerts`: open problems that feed "Needs attention". Modules write here (a broken connection, a
  failed publish, a client behind on deliverables).
- `activity_log`: append-only record of actions (with `task_id` for task history).
- `tasks`: one task covers many clients. `number` is shown as T-1001. Status, priority, type,
  assignee, `due_on` (a date in America/Phoenix), `repeat`, `steps`.
- `task_clients`: the clients in a task, each ticked off separately (`done_at`, `done_by`).
  Triggers keep the task status in step: first tick → In progress, last tick → Done, untick a
  done task → In progress. A repeating task that becomes Done creates its next copy once.
- `task_comments` (with `mentions`) and `notifications` (assigned, mentioned, commented; written
  by triggers only).
- `task_list` view and `task_counts()` feed the Tasks page; both run with the caller's RLS.
- `client_requests`: things we need from a client (question, code, files, approval, action).
  `number` is shown as R-101. Status open → answered → done (or cancelled; "Ask again" goes back
  to open). Triggers: answered with `auto_complete` goes straight to done; the owner and the task
  assignee are notified when the client answers; a linked task is Waiting on client while it has
  open requests and goes back to In progress when the last one is answered or cancelled.
- `client_request_files` and the private storage bucket `client-uploads` (images and PDF, 10 MB,
  path `<request_id>/<uuid>-<name>`). The team reads them through 10-minute signed URLs.
- `client_portal_links`: one private link per client (`/c/<token>`, 32 random bytes). A new
  token turns the old link off.
- `portal_get`, `portal_respond`, `portal_attach_file`, `portal_remove_file`: the only things the
  portal can call (anon role). Each checks the token first and only touches that client's
  requests; they never return internal notes, team emails or tasks. The Supabase security
  advisor flags them as "callable by anon": that is intended.
- `create_client(p, slug, link_token)`: the Add client page saves the client, the team-approved
  `client_business_profiles` row, `client_onboarding`, the optional onboarding link and the
  `client.created` history line in one transaction (admins and managers; a taken slug gets
  `-2`, `-3`…). Until the client saves their own business details, `onboarding_get` returns
  the team profile (`business_from_profile`) and the wizard saves it as the client's copy on
  first open. Countries are every ISO 3166-1 code (`src/lib/countries.ts`); US, Canadian and
  Australian regions are stored as short codes (`src/lib/regions.ts`).
- `client_health_counts()` gives the dashboard tile counts; `setup_required()` (anon only) tells
  `/setup` whether an admin exists.

## Roles

| Permission                               | Admin | Account manager | VA                                              | Writer                      | Read only |
| ---------------------------------------- | ----- | --------------- | ----------------------------------------------- | --------------------------- | --------- |
| See clients                              | All   | All             | Only clients in their tasks                     | Only clients in their tasks | All       |
| Add and edit clients                     | Yes   | Yes             | –                                               | –                           | –         |
| Create, assign, edit and delete tasks    | Yes   | Yes             | –                                               | –                           | –         |
| Tick clients off, change status, comment | Yes   | Yes             | Their own tasks                                 | Their own tasks             | –         |
| Ask clients for things (client requests) | Yes   | Yes             | Clients in their tasks                          | Clients in their tasks      | – (sees)  |
| Mark done, ask again, cancel, edit       | Yes   | Yes             | Requests they own or created, or on their tasks | Same as VA                  | –         |
| Turn on or replace a client's link       | Yes   | Yes             | – (can copy it)                                 | – (can copy it)             | –         |
| Delete clients, manage the team          | Yes   | –               | –                                               | –                           | –         |

Which pages each role sees is set per page in `navigation.ts`.

## Rendering (Cache Components)

Pages render a static frame (title, section headings) immediately. Each data section is an
async Server Component inside `<Suspense>` with a skeleton that matches its final size. The app
shell (sidebar user menu, breadcrumbs) streams the same way.

## Team and invites

Inviting needs `SUPABASE_SECRET_KEY` on the server (`src/lib/supabase/admin.ts`). An invite
creates the auth user and returns a one-time link (`/auth/confirm?token_hash=…&type=invite`)
that the admin sends by hand; no email setup needed. The invitee lands on `/welcome`, sets a
password and becomes active. The database always keeps one active admin, and admins can't change
their own role or access.

## Connections (Zernio)

Zernio owns the OAuth apps for Google Business Profile, Facebook, Instagram, LinkedIn, YouTube,
X, TikTok, Pinterest and Threads. Each client gets one Zernio profile (`externalId` = our client
id). Zernio is the source of truth; our tables mirror it.

- `zernio_profiles`: one per client. References clients with `ON DELETE RESTRICT`: run
  `offboardClient` (disconnects every account, deletes the Zernio profile) before deleting a
  client, or Zernio keeps billing.
- `social_accounts`: the mirror (no tokens). A composite foreign key to `zernio_profiles` keeps
  an account on the right client; a trigger blocks moving it. Status `connected`,
  `needs_reconnect` or `removed`. Status changes raise or resolve one alert per account
  (`alerts.source_key`), notify the client's owner (or admins) with `connection_lost`, and write
  `connection.*` history.
- `social_connect_attempts`: every Connect click (`oauth`, 30 minutes) and client link (`invite`,
  7 days). The callback only accepts a pending, unexpired attempt started by the same user.
- `zernio_webhook_events`: deliveries keyed by Zernio's event id (dedupe), service role only.
- `src/features/connections/sync.ts`: the one function every path ends in (callback, webhook,
  hourly cron, Check now, stale page load). It reads Zernio and upserts; running it twice changes
  nothing. Browser query parameters are never trusted.
- Secrets: `ZERNIO_API_KEY`, `ZERNIO_WEBHOOK_SECRET` (server only, `src/lib/env.server.ts`).
  The webhook and cron routes skip the session check in the proxy and verify their own secret.

## Client onboarding

A new client gets one private link (`onboarding_links`, one active per client, 22-character
token, 30 days, revocable). The wizard (`/onboard/<slug>-<token>`; on `ONBOARDING_HOST` the proxy
serves only these routes) saves every answer immediately through token-checked `onboarding_*`
security-definer functions (anon), which validate input, throttle writes per link and recompute the
step statuses in `client_onboarding`.

- Answers: `onboarding_business_details` (as submitted), `onboarding_google_access`,
  `onboarding_website`, `onboarding_social_choices`. The approved profile is
  `client_business_profiles`, written only by **Apply to profile** (`apply_onboarding_profile`).
- Accounts: the wizard starts Zernio's hosted sign-in with the service client after the token
  check; the return URL carries a separate one-time key (hash on `social_connect_attempts`), never
  the token. Connections land in `social_accounts` like any other.
- Logins: `client_logins` stores only a Supabase Vault secret id. `reveal_client_login` checks the
  role (VAs and writers only for clients in their tasks) and logs `vault.viewed`; deleting a row
  deletes its secret.
- Submitting notifies the owner and raises a Needs attention alert; **Mark reviewed** locks the
  answers and can move the client to Active.

## Client portal

Clients never sign in. Each client has one private link, `/c/<token>`, listed on their Client
requests page. The page reads through `portal_get` with a session-less Supabase client
(`src/lib/supabase/public.ts`), so it needs no server secret. Uploads go straight from the
browser to `client-uploads` (a storage policy only allows open "files" requests with room left),
then `portal_attach_file` records them. `/c` is a public path in the proxy, and the route sends
`Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex` (`next.config.ts`).

## Client Overview and the work ledger

Plan: `docs/plans/overview.md`. Migrations `0018`–`0022`.

- **Monthly plan.** `clients` holds the targets (`backlinks_target`, `articles_target`,
  `gbp_posts_target`, `review_requests_target`, `ai_fixes_target`; `keywords_target` is for
  Rankings) and `package`. `client_month_plans` snapshots them per month the first time a month is
  read (`private.ensure_month_plan`). Editing a target changes only the current month; past months
  never change. A client who starts after the 1st gets that month scaled to the days left.
- **`work_items` is the only record of delivered work.** Every count on the Overview and the
  Dashboard is `sum(quantity)` per client, month and `kind`. The unique index on
  `(source, source_id, client_id)` means one piece of work counts once.
  - Tasks feed it by trigger: a task with `counts_as` set adds `units` per client when that client
    is ticked off, and removes it when un-ticked; changing `counts_as`/`units`/title moves the
    rows. VAs and writers can't change `counts_as` (guard trigger).
  - The team logs work by hand (`source = 'manual'`, this or last month, a negative quantity needs
    a note). Logged and removed entries go to `activity_log`.
  - **Contract for the coming pages:** when a backlink goes live, an article is published, a Google
    post is sent, a review request goes out or an AI fix is applied, insert one `work_items` row
    with `source` = `backlink` / `article` / `gbp_post` / `review_request` / `ai_fix` and
    `source_id` = that row's id (service role or a security-definer trigger), and delete it if the
    thing is undone. When a page starts writing its own rows, turn `counts_as` off on the matching
    task type so nothing counts twice.
- **Progress and status.** `client_month_progress(client, month)` returns target, done, expected by
  today and a status (`done`, `on_track`, `behind`; past months `delivered`, `short`). Behind =
  below schedule by more than max(1, 15% of the target), from day 5. `private.check_client_pace`
  raises or clears the `pace:<client_id>` alert for Active clients; `client.health` is always the
  most severe open alert (`private.refresh_client_health`, trigger on `alerts`), with
  `health_reason`. Never set `health` from the app. A daily pg_cron job (`overview-daily`, 07:10
  UTC) re-checks pace and health and creates the month's plans.
- **Where they show up.** `keywords`, `rank_checks` + `keyword_ranks` (engine `google`, `bing`,
  `google_maps`) and `ai_checks` + `ai_answers` are written by the Rankings and AI visibility jobs
  (service role). Composite foreign keys keep every rank/answer on its own client's check.
  `client_visibility(client)` returns, per place, the latest check, the previous one and the
  baseline (first check on or after `started_on`): Google top 10, Bing top 10, map pack top 3,
  and AI answers naming the business. Only `status = 'done'` checks count. When a check finishes,
  log `rank.check_finished` / `ai.check_finished` for the history.
- **History.** `client_activity(client, before, limit)` pages `activity_log` for one client.
  Wording for every action is in `src/features/team/activity.ts`.

## Rankings (DataForSEO)

Plan: `docs/plans/rankings/` (00-overview to 04-page-and-polish). Migrations `0024`–`0030`.

- **Settings per client** (`rank_settings`): created on the first visit to the page
  (`ensureRankSettings`, service role) from the client's city, services and categories. The
  search location is a DataForSEO location code from the cached `dfs_locations` list (downloaded
  once a month per country, free). Checks are blocked until a location is set. Device mobile,
  engines Google (top 100), Google Maps (top 20) and Bing (top 100), one weekday per client
  (spread by client id), 09:00 UTC.
- **Tracked keywords** (`keywords`): added only through `add_keywords`, `replace_keyword`,
  `track_candidate`, `archive_keyword` (security definer, admins and managers). Phrases are
  normalized by trigger; at most `clients.keywords_target` active ones. Archiving keeps history.
  New keywords queue a `partial` run so they get a first position within minutes.
- **Checks.** `rank_runs` (one per weekly/manual/new-keywords run) → `rank_checks` (one per
  engine) → `serp_tasks` (one per DataForSEO task id, the ledger) → `keyword_ranks`. Tasks are
  posted to the standard queue with a postback URL; `/api/webhooks/dataforseo` stores the result
  with `dfs_store_rank` (idempotent). The cron route recovers anything missed (`tasks_ready`,
  `task_get` after 2 hours, expired after 24) and `dfs_finalize_runs` writes the summary, the run
  status, the `rank.check_finished` history line and the `rankings:failed:` / `rankings:drop:`
  alerts. Only `full` checks count on the Overview, and "since the start" compares the same
  keywords on both sides (`private.rank_place`: `compared`, `current_compared`).
- **Research** (`keyword_research_runs` → `keyword_candidates`): Labs ranked keywords, ideas,
  suggestions, related and competitor keywords (country level), a relevance gate (topic and
  negative terms), then Google Ads search volume for the client's city (cached 35 days in the
  shared `keyword_metrics`), scored in `src/features/rankings/scoring.ts`. Runs in steps with a
  heartbeat; the cron resumes stale ones. Weak keywords and suggested swaps are computed on the
  page from the same scores; the team decides every swap.
- **Money.** Every DataForSEO call goes through `src/lib/dataforseo/client.ts` and writes a
  `dfs_calls` row with the real cost. `dfs_settings` holds the monthly budget, research runs per
  client per month and the low-balance warning; over budget, new checks and research are refused
  in the database. Check now is limited to once a day per client.

## Backlinks (DataForSEO)

Plan: `docs/plans/backlinks/` (00-overview to 05-later-upgrades). Migrations `0031`–`0034`.

- **The library** (`directories`): one row per place you can get listed on, shared by every
  client and holding no client data. `site_key` is the place (the domain; a platform tenant such as
  `peoria.chambermaster.com`; or domain + city path such as `patch.com/arizona/peoria`),
  `rank_target` is what strength is checked on. Seeded with US core listings (Google Business
  Profile, Bing Places, Apple, Yelp, BBB, …; industry ones by `core_industries`) and a blocklist.
  Admins and managers edit (`set_directory`) or block (`block_directory`) a site for everyone.
- **Find places** (`backlink_runs` → `backlink_run_queries` → `backlink_opportunities` +
  `backlink_opportunity_hits`): `request_backlink_discovery` (admins, managers and VAs who can see
  the client; once a day, `backlink_runs_per_client_month`, both budgets) queues a run; the action
  starts it with `after()`. `src/features/backlinks/discovery.ts` builds up to 30 searches from
  `backlink_footprints` (no search operators: they cost 5x), runs them on Google Live (desktop,
  depth 30) or reuses `serp_result_cache` (same search in the same city within 90 days), adds a
  Maps call for competitor domains, classifies every result (`classify.ts`, `site-key.ts`,
  `scoring.ts`, pure) and stores places with `dfs_store_backlink_candidates` (idempotent; never
  changes a place a person decided). Hidden places keep a `filter_reason`.
- **Review**: `review_backlink_opportunities` (approve, reject with a reason, restore), every row
  checked against the caller's clients; one history line per call.
- **Site strength**: `request_strength_check` returns the sites never checked or checked over 30
  days ago (managers can force), then `bulk_ranks` + `bulk_spam_score` (Backlinks API, Live) and
  `dfs_store_strength`. `directories.authority` is DataForSEO's 0–100 conversion of the 0–1000
  Domain Rank. A `40204` answer sets `dfs_settings.backlinks_access = 'denied'` and the button is
  disabled with the reason.
- **Money**: Backlinks spend is the `dfs_calls` rows whose `ref` is a run or a strength check;
  it is capped by `dfs_settings.backlinks_budget_usd` on top of the shared monthly budget.

## Next widgets for the Dashboard (when their modules exist)

- Columns in the client list: change in 30 days (Google top 10 is built).
- "This month" totals: backlinks built, articles published, articles waiting for approval, new
  reviews.
- "Publishing this week" across clients.
- Alerts written automatically by the Connections, Content and Backlinks modules.
