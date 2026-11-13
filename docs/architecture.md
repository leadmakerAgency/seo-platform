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

| Route                                    | What                                                                                                  | Status      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------- |
| `/login`, `/setup`, `/no-access`         | Sign in, one-time first-admin setup, waiting for access                                               | Built       |
| `/auth/confirm`                          | Email confirmation callback (PKCE `code` or `token_hash`)                                             | Built       |
| `/dashboard`                             | Health tiles, Needs attention, client list, Add client                                                | Built       |
| `/tasks`                                 | Task list (tabs, tiles, filters), task panel (`?task=1051`), create/edit, comments                    | Built       |
| `/team`                                  | Members, invite links, roles, access, permission matrix, activity log (admin only)                    | Built       |
| `/welcome`                               | Invited members set their name and password                                                           | Built       |
| `/tasks/requests`                        | Client requests across all clients: the chase list (admins, managers)                                 | Built       |
| `/clients/[clientSlug]/tasks`            | Tasks that include one client, tick per client                                                        | Built       |
| `/clients/[clientSlug]/requests`         | Things we need from the client, their private link, request panel (`?request=101`)                    | Built       |
| `/clients/[clientSlug]/onboarding`       | Onboarding link, live progress, review & apply details, logins vault (admins, managers; viewers read) | Built       |
| `/onboard/[slug-token]`                  | The client onboarding wizard: public, no sign-in, autosaves (also `connect.<domain>/<slug-token>`)    | Built       |
| `/onboard/done`                          | Where Zernio returns the client after an onboarding sign-in (one-time key, not the token)             | Built       |
| `/clients/[clientSlug]/connections`      | Client Google Business Profile and social accounts through Zernio (admins, managers)                  | Built       |
| `/integrations/zernio/callback`          | Where Zernio's hosted sign-in returns; checks the attempt, syncs, redirects                           | Built       |
| `/api/webhooks/zernio`                   | Zernio webhooks (HMAC-signed, no session)                                                             | Built       |
| `/api/cron/zernio-sync`                  | Hourly Zernio health sync, called by pg_cron with a Vault token (no session)                          | Built       |
| `/c/[token]`                             | The client portal: public, no sign-in, the token is the key (noindex, no-referrer)                    | Built       |
| `/clients/[clientSlug]` and `/[section]` | Overview, rankings, AI visibility, backlinks, content, reviews, connections, report                   | Coming soon |
| `/api/clients/search?q=`                 | Client search in the sidebar (Ctrl/Cmd+K focuses it)                                                  | Built       |
| `/api/notifications`                     | Latest notifications for the header bell                                                              | Built       |

All page definitions (title, icon, roles, coming-soon flag, summary) are in `src/lib/navigation.ts`.

## Database (migrations in `supabase/migrations`)

- `team_members`: one row per auth user; `role` (admin, manager, va, writer, viewer) and
  `status`. The first sign-up becomes the active admin (trigger `handle_new_user`); later users
  start as invited viewers.
- `clients`: the SEO clients, with `health` (on_track, needs_look, action_needed), `stage` and
  the monthly plan (keywords, backlinks, articles).
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

## Next widgets for the Dashboard (when their modules exist)

- Columns in the client list: Google top 10 (x/20), change in 30 days, backlinks this month,
  articles this month.
- "This month" totals: backlinks built, articles published, articles waiting for approval, new
  reviews.
- "Publishing this week" across clients.
- Alerts written automatically by the Connections, Content and Backlinks modules.
