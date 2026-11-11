# Plan: Client requests (things we need from the client)

Status: **built (Phase 1).** Differences from this plan, decided while building:

- The portal doesn't use the service client or `SUPABASE_SECRET_KEY`. The token is checked inside
  security-definer database functions (`portal_get`, `portal_respond`, `portal_attach_file`,
  `portal_remove_file`) called with the anon key, so the portal works without the secret.
- Uploads go straight from the browser to storage under a storage policy (open "files" request
  with room left), not through signed upload URLs. The path is `<request_id>/<uuid>-<name>`.
- Migrations are `0007` (notification kind), `0008_client_requests` and `0009` (number reset).
- Not built yet: per-token rate limits (section 10).

Originally: **proposal, not built yet.** Read with `docs/product-plan.md` (what we're building) and
`docs/architecture.md` (how the code is organised).

---

## 1. Summary

A lot of SEO work stalls because we need something from the client: a phone verification code, a
yes on a $250 chamber listing, before-and-after photos, approval of an article, or "please add us to
Search Console". Today that goes over WhatsApp or email, gets lost, and the task sits at "Waiting on
client" with nobody chasing it.

**Client requests** makes those asks a first-class thing:

- The team creates a **request** for a client: a question, a code, files, an approval or an action
  to take. Each has instructions and a due date.
- The client gets **one private link** (their client portal) with a simple to-do list. They answer,
  upload, approve or tick "done" there. No account or password needed.
- When the client responds, the person who asked is **notified**. If the request is linked to a
  task, that task **leaves "Waiting on client" automatically** and goes back to the assignee.
- Managers see **everything waiting on clients** across all clients, and overdue requests show up
  in the Dashboard's **Needs attention**.

**Naming, so the two pages don't get mixed up:**

| Page                                             | Who does the work         | Exists?   |
| ------------------------------------------------ | ------------------------- | --------- |
| **Client tasks** (`/clients/[slug]/tasks`)       | Our team, for this client | Built     |
| **Client requests** (`/clients/[slug]/requests`) | The client, for us        | This plan |

---

## 2. Who uses it

| Person                                     | What they do                                                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Account manager / admin                    | Create requests (often from a template), send the portal link, review answers, mark done or ask again                              |
| VA / writer                                | Create requests for clients in their own tasks ("Ask the client for the HomeAdvisor code"), see the answer, carry on with the task |
| Read only                                  | See requests and answers                                                                                                           |
| The client (business owner or their staff) | Open their portal link, see what's needed, respond                                                                                 |

Clients **never sign in to the agency app**. The portal is a separate, very small page that only
shows that client's own requests.

---

## 3. Request types

Each type has its own form for us and its own answer box for the client.

| Type         | Client sees                                                                               | Example                                                                     | Answer stored as                                         |
| ------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Question** | A text box (short or long)                                                                | "What are your weekend opening hours?"                                      | `response_text`                                          |
| **Code**     | One short input, large and clear                                                          | "Enter the 6-digit code HomeAdvisor texted you"                             | `response_text` (shown masked to the team until clicked) |
| **Files**    | Drag-and-drop or camera upload with previews                                              | "Send 6 before-and-after photos of recent jobs"                             | Files in private storage                                 |
| **Approval** | What to approve (text, link, amount), then **Approve** or **Ask for changes** with a note | "Approve the Peoria Chamber listing: $250 a year" or "Approve this article" | `decision` + `response_text`                             |
| **Action**   | Numbered steps and a help link, then **I've done this**                                   | "Add seo@leadmaker.agency as a user in Search Console"                      | `responded_at` (+ optional note)                         |

Every request also has:

- A **title** and **instructions** written for the client (plain language).
- An optional **due date**.
- An optional **link to a task** (the work that's blocked).
- An optional **internal note** that the client never sees.
- A **follow-up owner** (defaults to whoever created it).

### Templates (one click)

These cover most real cases and fill in the title, type, instructions and steps:

1. Phone verification code (Code)
2. Google Business Profile: reconnect or grant access (Action, with steps)
3. Search Console and Analytics: add our reporting account as a viewer (Action, with steps)
4. Install the LeadMaker WordPress plugin and click Connect (Action, with steps)
5. Before-and-after job photos (Files, images, 3–10)
6. Logo and brand files (Files, images or PDF)
7. Approve an article (Approval, with a link to the draft)
8. Approve a paid listing or membership (Approval, with amount)
9. Business details check: hours, services, service areas (Question, long)
10. Directory login or account email (Question, short)

Templates live in code at first (`src/features/requests/templates.ts`). Making them editable in
Settings is Phase 2.

---

## 4. Lifecycle

```
            client responds                 team accepts
  ┌──────┐ ───────────────▶ ┌──────────┐ ───────────────▶ ┌──────┐
  │ Open │                  │ Answered │                  │ Done │
  └──────┘ ◀─────────────── └──────────┘                  └──────┘
     │        team asks again (with a note)
     │
     └──▶ Cancelled (no longer needed; hidden from the client)
```

- **Open:** waiting for the client. It shows **Overdue** after its due date (shown, not stored).
- **Answered:** the client responded and the team needs to review it. This is the "needs you"
  state for the team.
- **Done:** accepted. Hidden from the client's main list and shown under "Finished".
- **Ask again:** moves Answered back to Open, with a note the client sees ("The code expired,
  please send the new one"). It counts the rounds (`reopen_count`).
- **Cancelled:** disappears from the portal and stays in our history.

Shortcut: for **Code**, **Question** and **Action** types, the team can choose on the request
"**Done when the client answers**" (on by default for codes). The request then goes straight to
Done with no review step.

---

## 5. How it connects to Tasks

This is what makes it more than a to-do list.

- **"Ask the client" button in the task panel.** For a client in that task, it opens the new
  request dialog with the client and the task already filled in.
- **Automatic "Waiting on client":** when an Open request is linked to a task that is _To do_ or
  _In progress_, the task moves to **Waiting on client**.
- **Automatic return:** when the last Open request on that task is answered (or cancelled), the
  task moves back to **In progress**. The assignee gets a notification: "King Air answered 'HomeAdvisor
  code' on T-1043".
- **The task panel shows its requests:** a "Waiting on the client" block with each request's
  status and, once answered, the answer itself (code, files, decision), so the VA never leaves the
  panel.
- Deleting a task keeps its requests (the link is cleared).

All of this runs in database triggers, like task status does today, so it can't drift.

---

## 6. Screens

### 6.1 Client requests page: `/clients/[slug]/requests` (new item in the Client nav)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ King Air Duct Cleaning                                                     │
│ Client requests                                     [ + New request ]      │
│ Things we need from King Air. They respond through their client link.      │
├──────────────────────────────────────────────────────────────────────────┤
│ Client link                                                                │
│ connect.leadmaker.agency/c/7f3k…   [Copy link] [Copy message] [⋯ New link] │
│ Last opened by the client: 2 days ago                                      │
├──────────────────────────────────────────────────────────────────────────┤
│ [ Waiting on client 4 ] [ Answered, needs you 2 ] [ Overdue 1 ] [ Done 9 ] │
├──────────────────────────────────────────────────────────────────────────┤
│ Status   Request                         Type      Due        Linked task  │
│ ● Answ.  HomeAdvisor verification code   Code      Today      T-1043       │
│ ● Open   Approve Peoria Chamber $250     Approval  Overdue    T-1041       │
│ ● Open   Before-and-after photos         Files     Fri 13 Nov —            │
│ …                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

- **The client link card:**
  - **Copy link**, plus **Copy message**: a ready-to-paste note ("Hi Dan, here's your LeadMaker
    link with 3 things we need: …").
  - **New link**, which turns the old link off.
  - When the client last opened the portal.
- **Tiles** filter the list (same pattern as the Dashboard and Tasks pages). Filters live in the
  URL.
- Clicking a row opens the **request panel** (a Sheet, link `?request=123`):
  - Instructions, as the client sees them, with an internal note box underneath.
  - **The client's response:** the text or code (codes masked until "Show"), image thumbnails
    (click for full size, download), approval decision and note.
  - **Actions:** Mark done · Ask again (with a note) · Cancel · Copy reminder message · Edit (while
    Open).
  - The linked task, with a link to open it.
  - History: created, sent, opened by the client, answered, asked again, done.

### 6.2 New request dialog

- Client (fixed on the client page; picker on the agency-wide page).
- **Template** chips at the top, or "Start from scratch".
- Type (segmented: Question · Code · Files · Approval · Action).
- Title and instructions (for the client).
- Type-specific fields:
  - **Question:** short or long answer.
  - **Files:** what's allowed (images, PDF, any) and how many (minimum and maximum).
  - **Approval:** what to approve, an optional link, an optional amount and currency.
  - **Action:** steps (the same steps editor as tasks) and a help link.
- Due date (same picker as tasks).
- Link to a task: a select of this client's open tasks.
- Follow-up owner.
- "Done when the client answers".
- Internal note.

### 6.3 Agency-wide view: "Waiting on clients"

A new tab on the Tasks page (**Client requests**) for admins and managers. It lists every Open or
Answered request across all clients, with filters for client, type, owner and overdue, and the same
row panel. Account managers use it as their morning chase list.

The Dashboard's **Needs attention** adds:

- "3 requests are overdue for King Air (oldest 5 days)".
- "2 client answers waiting for review".

### 6.4 The client portal: `/c/[token]` (public, mobile-first)

```
┌──────────────────────────────────────┐
│ LM  LeadMaker                        │
│                                      │
│ King Air Duct Cleaning               │
│ 3 things we need from you            │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ Code · due today                 │ │
│ │ HomeAdvisor verification code    │ │
│ │ HomeAdvisor texted a 6-digit…    │ │
│ │ [ _ _ _ _ _ _ ]        [ Send ]  │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ Approval · $250 a year           │ │
│ │ Peoria Chamber of Commerce       │ │
│ │ [ Approve ]  [ Ask for changes ] │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ Photos · 0 of 6                  │ │
│ │ [ + Add photos ]                 │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ▸ Finished (9)                       │
│ Questions? Reply to Ana R. (account  │
│ manager) on WhatsApp or email.       │
└──────────────────────────────────────┘
```

- **Look:** white, calm and large-text, with LeadMaker branding but no app chrome. It's built for a
  busy owner on a phone.
- **Order:** Overdue first, then by due date. "Ask again" notes show above the request in amber.
- **Feedback:** each card confirms inline ("Thanks, we've got it") and moves to Finished, or to
  "Sent, we'll check it" while Answered.
- **Shows:** the business name, open requests, finished requests (collapsed) and the account
  manager's first name.
- **Never shows:** internal notes, other clients, team members' emails, or tasks.
- **Uploads:**
  - Images and PDF, up to 10 MB each.
  - Previews, remove before sending, and the camera on mobile.
  - Files go straight to private storage through short-lived signed upload URLs.
- **Who answered:** the client can optionally type their name ("Answered by Dan"), stored with the
  response.
- **Bad links:** an invalid or turned-off link shows a plain "This link isn't active. Ask your
  LeadMaker contact for a new one", with no detail about why.

The product plan's onboarding wizard (`connect.leadmaker.agency/<client>`) will later use this same
portal. Onboarding steps become requests of the Action type. Building the portal now is the first
half of onboarding.

---

## 7. Permissions

|                                  | Admin       | Account manager | VA / Writer                                | Read only   | Client (portal)              |
| -------------------------------- | ----------- | --------------- | ------------------------------------------ | ----------- | ---------------------------- |
| See a client's requests          | All clients | All clients     | Clients in their tasks                     | All clients | Only their own, via the link |
| Create requests                  | Yes         | Yes             | For clients in their tasks                 | –           | –                            |
| Edit / cancel                    | Yes         | Yes             | Their own requests                         | –           | –                            |
| Mark done, ask again             | Yes         | Yes             | Requests they own or linked to their tasks | –           | –                            |
| See or copy the portal link      | Yes         | Yes             | Yes (to send it)                           | –           | –                            |
| New link (turns off the old one) | Yes         | Yes             | –                                          | –           | –                            |
| Respond                          | –           | –               | –                                          | –           | Yes                          |

---

## 8. Data model (migration `0007_client_requests`)

### Enums

- `request_kind`: question, code, files, approval, action
- `request_status`: open, answered, done, cancelled
- `request_decision`: approved, changes_requested
- `notification_kind`: add `request_answered`

### Tables

**`client_portal_links`** (one active link per client)

| Column                     | Notes                                                         |
| -------------------------- | ------------------------------------------------------------- |
| `client_id`                | Primary key, foreign key to clients, cascades on delete       |
| `token`                    | 32 random bytes, base64url, unique. The URL is `/c/<token>`   |
| `created_by`, `created_at` |                                                               |
| `last_opened_at`           | Updated when the portal loads (at most once every 10 minutes) |

A new link replaces the token, and the old one stops working straight away.

**`client_requests`**

| Column                                                                        | Notes                                                                                                                                                    |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id` uuid, `number` (identity from 101, shown as **R-101**)                   |                                                                                                                                                          |
| `client_id`                                                                   | Foreign key to clients, cascades on delete                                                                                                               |
| `task_id`                                                                     | Foreign key to tasks, set null on delete                                                                                                                 |
| `kind`, `status` (default open)                                               |                                                                                                                                                          |
| `title` (3–160), `instructions` (≤ 4000), `internal_note` (≤ 2000, team only) |                                                                                                                                                          |
| `options jsonb`                                                               | Type-specific: `answer: short\|long`, `accept: images\|pdf\|any`, `min_files`, `max_files`, `amount`, `currency`, `steps text[]`, `help_url`, `link_url` |
| `auto_complete boolean`                                                       | "Done when the client answers"                                                                                                                           |
| `due_on date`                                                                 | America/Phoenix, like tasks                                                                                                                              |
| `owner_id`, `created_by`                                                      | Foreign keys to team_members                                                                                                                             |
| `response_text`, `decision`, `responded_at`, `responder_name`                 | Filled from the portal                                                                                                                                   |
| `ask_again_note`, `reopen_count`                                              |                                                                                                                                                          |
| `completed_at`, `completed_by`, `created_at`, `updated_at`                    |                                                                                                                                                          |

**`client_request_files`**

| Column                                                               | Notes |
| -------------------------------------------------------------------- | ----- |
| `id`, `request_id` (cascades on delete)                              |       |
| `storage_path`, `file_name`, `mime_type`, `size_bytes`, `created_at` |       |

**Storage:** a private bucket `client-uploads`, path `{client_id}/{request_id}/{uuid}-{safe-name}`.
The team downloads through signed URLs that last 10 minutes.

**`notifications`:** gains a `request_id` column. **`activity_log`:** gains a `request_id` column
(the request's history).

### Rules in the database (triggers)

1. A request becoming **Open** with a task: if the task is To do or In progress, it moves to
   **Waiting on client**.
2. A request leaving Open (answered or cancelled): if the task has no other Open requests and is
   Waiting on client, it moves back to **In progress**. The task's assignee is notified.
3. Answered with `auto_complete` turns straight into **Done**.
4. Answered notifies the owner (and the task assignee, if different).
5. Every change writes `activity_log` with the request's id.
6. A guard: only `response_*`, `decision`, `responded_at` and status open → answered can change
   through the portal path. Everything else is team-only.

### RLS

- `client_requests` and `client_request_files`: read when `private.can_see_client(client_id)`.
  Create when the caller can see the client and isn't read-only. Update or delete for admins and
  managers, or the owner/creator.
- `client_portal_links`: read for anyone who can see the client and isn't read-only. Create and
  replace for admins and managers.
- **The portal never uses the user's session.** Its server code checks the token, then uses the
  service client (`src/lib/supabase/admin.ts`) for exactly that client's requests. This needs
  `SUPABASE_SECRET_KEY`, the same key as Team invites.

---

## 9. Code layout (follows the existing pattern)

```
src/features/requests/
  constants.ts      labels, colours, icons per kind and status
  templates.ts      the 10 templates
  schemas.ts        zod: request form (per kind), portal responses, file limits
  queries.ts        per-client list, agency-wide list, detail, counts (server-only)
  actions.ts        create, edit, cancel, mark done, ask again, new portal link
  portal.ts         token check + portal reads/writes via the service client (server-only)
  components/
    requests-view.tsx       tiles + list + filters
    request-sheet.tsx       request panel
    request-form-dialog.tsx new/edit, templates, per-kind fields
    portal-link-card.tsx    link, copy message, new link
    portal/*                the client-facing cards (question, code, files, approval, action)
src/app/(app)/clients/[clientSlug]/requests/page.tsx
src/app/(portal)/c/[token]/page.tsx     own minimal layout, no sidebar, noindex
```

Other changes:

- **Navigation:** a new client section `requests` ("Client requests", icon `Inbox`). Roles: admin,
  manager, va, writer, viewer.
- **Proxy:** `/c` becomes a public path. The portal never needs a session.
- **Tasks:**
  - An "Ask the client" button and a "Waiting on the client" block in the task panel.
  - A Client requests tab on `/tasks` for managers.
- **Dashboard:** overdue and answered requests in Needs attention.
- **Notifications bell:** the `request_answered` wording.

---

## 10. Security and limits

- **Tokens:**
  - 256 bits of randomness, only in the URL path, never logged in `activity_log`.
  - The portal page sends `Referrer-Policy: no-referrer` and `noindex`.
- **Rate limits:** portal writes are capped per token (for example 30 responses and 50 uploads
  an hour). Upload size and type are checked on the server before a signed upload URL is issued.
- **What a token unlocks:** only that client's requests. It never reveals other clients, internal
  notes, team emails or tasks.
- **Turning a link off:** "New link" turns the old one off immediately. Deleting the client deletes
  the link and all requests.
- **Codes:** masked in the team UI until clicked, and never sent to notifications.
- **No scanning:** uploaded files aren't virus-scanned. They're only shown to signed-in team members
  through signed URLs, never made public.

---

## 11. Phases

**Phase 1 (this build)**

- The database (section 8) with RLS, triggers and the storage bucket.
- The per-client Client requests page, request panel, and new and edit dialog with templates.
- The client portal with all 5 types, including file uploads.
- The task integration (Ask the client, automatic Waiting on client and back, the panel block).
- Notifications, the Tasks tab for managers, and Dashboard Needs attention.

**Phase 2 (needs an email/SMS service: Resend or Postmark, plus Twilio)**

- Send the link by email or SMS from the app, and automatic reminders (2 days before due, on the
  due date, every 3 days overdue).
- A client contacts list (who gets requests).
- Templates editable in Settings, request numbering per client, and bulk requests (the same ask to
  many clients).
- The onboarding wizard on top of the portal.

---

## 12. Edge cases

| Situation                                            | Behaviour                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| The client answers a request that was just cancelled | The portal refuses ("This request is no longer needed") and nothing changes                 |
| Two people answer the same request at once           | The first answer wins; the second sees "Already answered, thanks"                           |
| Several requests linked to one task                  | The task stays Waiting on client until the last one is answered or cancelled                |
| The task is already Done when a request is created   | The task status isn't touched                                                               |
| The client uploads the wrong files                   | The team uses Ask again with a note; old files stay in history until the request is Done    |
| The link was turned off while the client had it open | Their next action shows "This link isn't active"                                            |
| The client is deleted                                | Requests, files and link are deleted (storage files removed by the delete action)           |
| A VA loses access to a client (task reassigned)      | They no longer see that client's requests (RLS)                                             |
| `SUPABASE_SECRET_KEY` is missing                     | The portal shows "Not available right now" and the client page explains the missing setting |

---

## 13. How we'll check it

- **RLS tests** in a rolled-back transaction, like Tasks:
  - VA visibility.
  - Creating requests for clients outside your tasks is refused.
  - The task status moves to Waiting on client and back, including with several requests.
  - Auto-complete.
  - Notifications.
- **Portal tests:**
  - A wrong or turned-off token shows nothing.
  - Each request type submits correctly.
  - Upload limits work: type, size and count.
  - It works on a 375 px wide phone screen.
- **End to end:**
  - Create a template request linked to a task, open the link in a private window, and answer it.
  - The task goes back to In progress, and the assignee gets the bell notification.
  - Mark done, then Ask again.
- `npm run lint`, `npm run typecheck`, `npm run build`, then deploy. This needs `SUPABASE_SECRET_KEY`
  in DigitalOcean.

---

## 14. Decisions to confirm before building

1. **Portal address:**
   - For now, the same domain: `https://<app>/c/<token>`.
   - Later, `connect.leadmaker.agency/c/<token>`, once that subdomain points to the app (just a DNS
     record plus adding the domain in DigitalOcean).
2. **VAs creating requests:** the plan lets VAs ask clients directly, for clients in their tasks. The
   alternative is that only managers can.
3. **Who's shown on the portal as the contact:** the client's "Looked after by" person.
4. **Request numbers:** R-101, R-102… shared across all clients, like task numbers.
