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

| Route                                    | What                                                                                | Status      |
| ---------------------------------------- | ----------------------------------------------------------------------------------- | ----------- |
| `/login`, `/setup`, `/no-access`         | Sign in, one-time first-admin setup, waiting for access                             | Built       |
| `/auth/confirm`                          | Email confirmation callback (PKCE `code` or `token_hash`)                           | Built       |
| `/dashboard`                             | Health tiles, Needs attention, client list, Add client                              | Built       |
| `/tasks`                                 | Task list (tabs, tiles, filters), task panel (`?task=1051`), create/edit, comments  | Built       |
| `/team`                                  | Members, invite links, roles, access, permission matrix, activity log (admin only)  | Built       |
| `/welcome`                               | Invited members set their name and password                                         | Built       |
| `/clients/[clientSlug]/tasks`            | Tasks that include one client, tick per client                                      | Built       |
| `/clients/[clientSlug]` and `/[section]` | Overview, rankings, AI visibility, backlinks, content, reviews, connections, report | Coming soon |
| `/api/clients/search?q=`                 | Client search for the Ctrl/Cmd+K switcher                                           | Built       |
| `/api/notifications`                     | Latest notifications for the header bell                                            | Built       |

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
- `client_health_counts()` gives the dashboard tile counts; `setup_required()` (anon only) tells
  `/setup` whether an admin exists.

## Roles

| Permission                               | Admin | Account manager | VA                          | Writer                      | Read only |
| ---------------------------------------- | ----- | --------------- | --------------------------- | --------------------------- | --------- |
| See clients                              | All   | All             | Only clients in their tasks | Only clients in their tasks | All       |
| Add and edit clients                     | Yes   | Yes             | –                           | –                           | –         |
| Create, assign, edit and delete tasks    | Yes   | Yes             | –                           | –                           | –         |
| Tick clients off, change status, comment | Yes   | Yes             | Their own tasks             | Their own tasks             | –         |
| Delete clients, manage the team          | Yes   | –               | –                           | –                           | –         |

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

## Next widgets for the Dashboard (when their modules exist)

- Columns in the client list: Google top 10 (x/20), change in 30 days, backlinks this month,
  articles this month.
- "This month" totals: backlinks built, articles published, articles waiting for approval, new
  reviews.
- "Publishing this week" across clients.
- Alerts written automatically by the Connections, Content and Backlinks modules.
