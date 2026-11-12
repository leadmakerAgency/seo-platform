# Plan: Connections page with Zernio (social accounts and Google Business Profile)

Status: **built.** Differences from this plan, decided while building:

- Zernio ids are checked as `^[A-Za-z0-9_-]{1,64}$` instead of 24 hex characters, so a format
  change at Zernio can't break the sync.
- Migration `0013` adds a direct foreign key from `social_accounts.client_id` to `clients` (next to
  the composite one), so queries can embed the client.
- Things a person does (Connect, the callback, Check now) sync with their own session, so history
  names them; only webhooks and the cron use the service role.
- `0012` also restarts task numbers at T-1001 while there are no tasks (test runs used some).

## Context

The product plan (`docs/product-plan.md`) uses **Zernio** for every client social connection: Google Business Profile (posts, reviews, insights), Facebook, Instagram, LinkedIn, YouTube, X, TikTok, Pinterest and Threads. Zernio owns the approved OAuth apps, so LeadMaker needs no Google or Meta app reviews.

This phase builds the foundation for everything else that depends on Zernio:

- Connect a client's accounts.
- Keep their status honest (detect broken tokens).
- Tell the team when something needs reconnecting.

Content publishing, review replies and GBP insights come later and only read the `social_accounts` table built here.

`/clients/[slug]/connections` is currently a "Coming soon" page (`src/lib/navigation.ts`, section `connections`, roles admin and manager). The database part is the core of this plan.

### What the Zernio research established

Sources: docs.zernio.com (`/multi-tenant`, `/guides/connecting-accounts`, `/connect/get-connect-url`, `/webhooks`, `/webhooks/accounts/*`, `/platforms/google-business*`, `/accounts/*health`, `/guides/rate-limits`, `/guides/error-handling`) and the OpenAPI spec at `zernio.com/openapi.json`.

**Basics**

- **API:** REST at `https://zernio.com/api/v1`, `Authorization: Bearer <key>`, versioned in the path.
- **Error envelope:** `{error, type, code, param, details, platform, platformError}`.
  - Branch on `type` and `code`, never on the `error` text.
  - Rate-limit headers: `X-RateLimit-Limit`, `-Remaining`, `-Reset`; a 429 also sends `Retry-After`.
- **Rate limit:** 60 requests a minute while 0–2 accounts are connected, 600 from 3 accounts up. The limit is shared by the whole team, so the health sync uses team-wide calls, not one call per client.
- **Pricing:** the first 2 connected accounts are free. After that it's $6 per account per month for accounts 1–10, $3 for 11–100 and $1 above 100.
  - Connecting the 3rd account needs a card on the Zernio team, otherwise it returns `402 PAYMENT_REQUIRED` with a `dashboard_url`.
  - Example: 30 clients with GBP, Facebook and Instagram is 90 accounts, about $300 a month.

**Profiles (one per client)**

- **Model:** one profile per customer. Set the profile's `externalId` to our client id, and every webhook carries it back in `profiles[0].externalId`.
- **Creating:** `POST /v1/profiles {name, externalId}`. A duplicate returns `409 profile_external_id_conflict` with `details.existingProfileId`, so retries are safe.
- **Finding:** `GET /v1/profiles?externalId=` recovers a profile id we've lost.
- **Deleting:** a profile can only be deleted once it has no connected accounts.

**Connecting accounts**

- **Start:** `GET /v1/connect/{platform}?profileId&redirect_url&welcome=true&brandName&logoUrl&reconnectAccountId` returns an `authUrl`, valid for 30 minutes.
  - The Google Business platform id is `googlebusiness`.
  - With Zernio's hosted mode (not headless), Zernio draws the GBP location picker and the Facebook Page and LinkedIn organization pickers itself.
- **Success redirect:** `connected`, `profileId`, `accountId`, `username`, `request_id`, `stage`.
- **Failure redirect:** `error` (`oauth_denied`, `missing_google_permissions`, `no_google_locations`, `no_facebook_pages`, `code_already_redeemed`, `payment_required`…), `error_message`, `is_user_fixable`. Unknown values must be treated as a generic failure.
- **Zernio's continue page:** a `redirect_url` on our domain first passes through `zernio.com/connect/continue`, where the user clicks once more.
- **Reconnecting:** pass `reconnectAccountId` to refresh the same account and keep its id and history.

**Connect links for clients**

- `POST /v1/platform-invites {profileId, platform, accountId?, expiresInDays 1–30}` returns a single-use `inviteUrl`.
- The client connects their own account with it, with no Zernio login. This is the normal case, because clients usually own their Google and Facebook logins.

**Accounts**

- **Listing:** `GET /v1/accounts?profileId=`, cursor-paged with up to 500 a page.
- **Fields:** `_id`, `platform`, `profileId` (a string or an object), `username`, `displayName`, `platformUserId`, `profilePicture`, `profileUrl`, `isActive`, `needsReconnection`, `enabled` (false means a hidden side account), `metadata`.
- **One profile, several accounts:** a profile can hold several accounts of the same platform, for example several GBP locations. Identify an account only by its `accountId`.

**Health**

- `GET /v1/accounts/health?profileId=` returns per account: `status` (healthy, warning, error), `canPost`, `canFetchAnalytics`, `tokenValid`, `tokenExpiresAt`, `needsReconnect`, `issues[]`, `disconnectReason`, `unhealthySince`.
- Without `profileId` it covers the whole team in one call.

**Disconnecting**

- `DELETE /v1/accounts/{id}` disconnects and returns `gracePeriodEndsAt` (1 hour).
- Reconnecting the same account within that hour keeps its id. After that the account is deleted, and a later connect gets a **new** id.

**Webhooks**

- **Setup:** register with `POST /v1/webhooks/settings {name, url, secret, events, profileIds?}`; we supply the secret.
- **Signature:** `X-Zernio-Signature` is the lowercase hex HMAC-SHA256 of the raw body.
- **Delivery:** we must answer 2xx within 5 seconds. Any other 4xx dead-letters the event; 5xx and timeouts are retried 7 times over about 51 hours.
- **Duplicates:** delivery is at least once, so dedupe on `id` (also sent as `X-Zernio-Event-Id`).
- **Events we need:**
  - `account.connected` (fires again on a reconnect with the same id).
  - `account.disconnected` (`disconnectionType` intentional or unintentional, `reason`).
  - `account.permissions_changed`.
  - Later: `review.new`, `post.*`, `analytics.synced`.

**GBP specifics**

- One account is one location.
- An agency Google login that manages many locations can move a location onto another client's profile without OAuth: `POST /v1/accounts/{id}/gmb-locations/assign`. That's Phase 2.

**Platforms we'll offer:** googlebusiness, facebook, instagram, linkedin, youtube, twitter (shown as "X"), tiktok, pinterest, threads. Reddit is currently disabled on Zernio's side, and the rest aren't relevant.

## Decisions

- **Two ways to connect, both built now:**
  1. **Connect here:** a team member signs in through Zernio's hosted flow. It works when they have the client's login or manager access.
  2. **Send the client a link:** a Zernio connect link for the client.
- **Hosted mode, not headless.** Zernio draws the GBP location and Facebook Page pickers. That's less code, fewer edge cases, and Zernio keeps them up to date.
- **Zernio is the source of truth; our database is a mirror.**
  - Every write path ends in one idempotent sync function that reads Zernio and upserts our rows.
  - The callback, webhooks, the hourly cron, the page "Check now" button and a check on page load all call it.
  - Nothing trusts browser query parameters.
- **Status effects run in database triggers** (alerts, notifications, history), the same as Tasks and Client requests, so they can't drift.
- **Who can do what:**
  - Admins and managers connect, reconnect, disconnect and create links. This matches the existing nav roles.
  - Every team member who can see the client can read the accounts, which later features need.
  - Only admins manage the Zernio integration (webhook registration, hourly checks).
- **Secrets stay on the server:**
  - `ZERNIO_API_KEY` and `ZERNIO_WEBHOOK_SECRET` live in `.env.local` and in DigitalOcean as Encrypted, Run Time variables.
  - Webhooks and the cron route also need `SUPABASE_SECRET_KEY` (service role). This is already on your to-do list.

## Database (migrations 0010–0012, applied with Supabase MCP `apply_migration` on project `seo-platform`)

### 0010_connection_notification_kind.sql

- `alter type public.notification_kind add value if not exists 'connection_lost';` This goes on its own because an enum value can't be used in the transaction that adds it.

### 0011_connections.sql

**Enums**

- `social_platform`: googlebusiness, facebook, instagram, linkedin, youtube, twitter, tiktok, pinterest, threads.
- `social_account_status`: `connected`, `needs_reconnect`, `removed`.
- `connect_attempt_status`: `pending`, `connected`, `failed`, `expired`, `cancelled`.
- `connect_method`: `oauth`, `invite`.

**`zernio_profiles`** (one per client)

| Column                   | Notes                                                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client_id` uuid         | Primary key. References clients with **on delete restrict**: a client can't be deleted while it still has a Zernio profile, so offboarding (which stops Zernio billing) has to run first |
| `zernio_profile_id` text | Unique, not null, check `~ '^[0-9a-f]{24}$'`                                                                                                                                             |
| `created_by`             | References team_members, set null on delete                                                                                                                                              |
| `created_at`             |                                                                                                                                                                                          |

- Also `unique (client_id, zernio_profile_id)`, for the composite foreign key below.

**`social_accounts`** (a mirror of Zernio's accounts; never stores tokens; Zernio doesn't return them anyway)

| Column                                                                      | Notes                                                                                                                                                          |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id` uuid                                                                   | Primary key                                                                                                                                                    |
| `client_id`, `zernio_profile_id`                                            | Composite foreign key to `zernio_profiles (client_id, zernio_profile_id)`, **on delete cascade**. This guarantees an account can never sit on the wrong client |
| `zernio_account_id` text                                                    | Unique, not null, check that it's 24 hex characters                                                                                                            |
| `platform`                                                                  | `social_platform`, not null                                                                                                                                    |
| `platform_user_id`, `username`, `display_name`, `avatar_url`, `profile_url` | text; URLs checked to start with `https://`                                                                                                                    |
| `location_id`, `location_name`                                              | GBP only (from `metadata`); null on other platforms                                                                                                            |
| `status`                                                                    | `social_account_status`, default `connected`                                                                                                                   |
| `can_post`, `can_fetch_analytics`                                           | boolean, nullable (unknown until the first health check)                                                                                                       |
| `token_expires_at`, `unhealthy_since`                                       | timestamptz                                                                                                                                                    |
| `issues`                                                                    | text[], default `'{}'`                                                                                                                                         |
| `disconnect_reason`                                                         | text, at most 500 characters                                                                                                                                   |
| `connected_by`, `connected_at`                                              | `connected_by` references team_members, set null on delete                                                                                                     |
| `removed_at`, `removal_grace_ends_at`                                       | When it was disconnected, and when the 1-hour undo window ends                                                                                                 |
| `last_checked_at`                                                           | Last time sync confirmed this row against Zernio                                                                                                               |
| `created_at`, `updated_at`                                                  |                                                                                                                                                                |

- **Indexes:** `(client_id, status)`, `(platform, platform_user_id)` (to warn when the same account is connected to two clients), `(status) where status = 'needs_reconnect'`, and indexes on the `connected_by` and composite foreign keys.

**`social_connect_attempts`** (each "Connect" click or client link; links a callback to the person who started it, and records history)

| Column                                             | Notes                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `id` uuid                                          | Primary key; sent in `redirect_url` as `?attempt=`               |
| `client_id`                                        | Cascade on delete                                                |
| `platform`, `method`                               |                                                                  |
| `reconnect_account_id`                             | References social_accounts, set null on delete                   |
| `status`                                           | Default `pending`                                                |
| `invite_url`                                       | Client links only. Readable by admins and managers only          |
| `created_by`, `created_at`, `expires_at`           | OAuth: 30 minutes. Link: 7 days. Check `expires_at > created_at` |
| `completed_at`, `result_account_id`                | `result_account_id` references social_accounts                   |
| `error_code`, `error_message`, `zernio_request_id` | Limited lengths                                                  |

- **Indexes:** `(client_id, status)`, plus `created_by`, `reconnect_account_id` and `result_account_id`.

**`zernio_webhook_events`** (dedupe and audit; service role only)

- **Columns:** `id` text (the Zernio event id, primary key, so duplicates conflict), `event`, `zernio_profile_id`, `zernio_account_id`, `client_id` (set null on delete), `payload` jsonb, `received_at`, `processed_at`, `attempts` int, `last_error`.
- **RLS:** enabled with **no policies**, so neither the anon nor the authenticated role can read or write it.
- **Index:** `(processed_at) where processed_at is null`.

**Changes to existing tables**

- **`alerts`:** add `source_key text`, plus a partial unique index on `source_key` where it's not null and `resolved_at` is null. One open alert per account; it's resolved when the account comes back.
- **`notifications`:** add `social_account_id uuid` (cascade on delete), with an index.

**Helpers** (in the `private` schema, security definer, `search_path=''`)

- `private.raise_alert(client, key, severity, title, detail, label, href)`: inserts with `on conflict` on the open `source_key`.
- `private.resolve_alert(key)`.
- `private.connection_href(client_id)`: returns `/clients/<slug>/connections`.

**Triggers on `social_accounts`**

- **Before insert or update:**
  - Sets `updated_at`.
  - Blocks changes to `client_id`, `zernio_profile_id`, `zernio_account_id` and `platform`. Reassigning an account to another client isn't allowed.
  - A status change to `removed` sets `removed_at`. A change back to `connected` clears `removed_at`, `removal_grace_ends_at`, `disconnect_reason` and `unhealthy_since`.
- **After insert or update** (only when the status actually changes):
  - **Insert:** logs `connection.connected` to the activity log, with client, platform and name.
  - **connected → needs_reconnect:**
    - Logs `connection.needs_reconnect`.
    - Raises an alert: action needed, `source_key = 'connection:'||id`, "Google Business Profile needs reconnecting", the reason as detail, action "Reconnect".
    - Notifies the client's "Looked after by" person with `connection_lost`. If the client has no owner, every active admin is notified.
  - **needs_reconnect or removed → connected:** logs `connection.restored` and resolves the alert.
  - **→ removed:** logs `connection.removed` and resolves the alert.
  - The actor is `auth.uid()`, which is null for webhooks and cron, so history shows "System".

**Trigger on `social_connect_attempts`:** a status change to `failed` logs `connection.failed` with the error code (never a token).

**RLS** (these mirror `src/lib/roles.ts`)

| Table                     | Read                                                                                              | Write                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `zernio_profiles`         | Admins and managers who can see the client                                                        | Insert by admins and managers; no update or delete (service role only)             |
| `social_accounts`         | Any team member who can see the client (`private.can_see_client`), for future content and reviews | Insert and update by admins and managers; no delete (rows only become `removed`)   |
| `social_connect_attempts` | Admins and managers who can see the client (link URLs are sensitive)                              | Insert and update by admins and managers, with `created_by = auth.uid()` on insert |
| `zernio_webhook_events`   | None                                                                                              | None (service role only)                                                           |

**Grants:** revoke execute on the new private functions from public and anon. RLS uses `private.has_role` and `private.can_see_client` as it does today.

### 0012_connections_cron.sql (hourly health check; nothing to set up by hand)

- **Extensions:** `create extension if not exists pg_cron`, and `pg_net` in the `extensions` schema. Both are available but not installed yet; Vault is already installed.
- **`public.configure_zernio_cron(p_base_url text)`:**
  - Security definer, executable by **service_role only**.
  - Stores `app_base_url` in Vault, and a random 32-byte `zernio_cron_token` generated in SQL (never shown).
  - (Re)schedules the cron job `zernio-sync` at `7 * * * *`. The job does `net.http_post(base_url || '/api/cron/zernio-sync', Authorization: Bearer <token>)`.
- **`public.verify_zernio_cron_token(p_token text) returns boolean`:** service_role only; a constant-time compare against the Vault secret.
- **Turning it on:** the admin clicks **Turn on hourly checks** on the Zernio card in production, which calls `configure_zernio_cron(origin)` through the service client. Localhost is refused.

After each migration: run `get_advisors` (security and performance) and fix any findings, then run `generate_typescript_types` and write it to `src/lib/supabase/database.types.ts`.

## Server code

**`src/lib/env.server.ts`** (`import "server-only"`)

- `getZernioApiKey()`, `getZernioWebhookSecret()`, `hasZernioApiKey()`.
- Optional `ZERNIO_API_BASE`, defaulting to `https://zernio.com/api/v1`.
- All read lazily, like `src/lib/env.ts`.

**`src/lib/zernio/client.ts`** (server only): a typed fetch wrapper.

- **Timeouts:** 10 seconds with `AbortSignal.timeout`.
- **Responses:** JSON is parsed with **zod loose schemas** (`src/lib/zernio/schemas.ts`), so new Zernio fields never break us and missing ones fail loudly.
- **`ZernioError`:** carries `{status, type, code, message, requestId, retryAfter, dashboardUrl}`.
- **Retries:** only GET requests, at most 2, on 429, 502, 503 and 504, honouring `Retry-After` (capped at 5 seconds inside a request). POST and DELETE are never retried automatically.
- **Methods:**
  - `getOrCreateProfile(clientId, name)`: list by `externalId`, then create; a 409 falls back to `existingProfileId`.
  - `getConnectUrl({platform, profileId, redirectUrl, reconnectAccountId})`: always `welcome=true` with `brandName=LeadMaker`.
  - `createInvite({profileId, platform, accountId, expiresInDays: 7})`.
  - `listAccounts(profileId?)`: cursor loop.
  - `accountsHealth(profileId?)`.
  - `deleteAccount(id)`: a 404 counts as already gone.
  - `listWebhooks()`, `createWebhook()`, `updateWebhook()`, `testWebhook()`.
  - `deleteProfile(id)`: for offboarding.

**`src/lib/zernio/webhook.ts`:** `verifySignature(rawBody, header, secret)`. HMAC-SHA256 hex with `crypto.timingSafeEqual`; it rejects a missing header or a length mismatch.

**`src/features/connections/`**

- **`constants.ts`:** for each platform, the label, the order (GBP first), the brand colour, a short help line ("Needs a verified location" or "Instagram must be a Business or Creator account"), and whether the client usually owns the login.
- **`sync.ts`** (server only), the single source of truth:
  - **`syncClient(clientId, db)`:**
    - Fetches the profile's accounts and health: two Zernio calls.
    - Skips unsupported platforms and `enabled === false`.
    - Upserts rows by `zernio_account_id`.
    - Status: `needs_reconnect` when `needsReconnection`, `needsReconnect`, `!isActive` or `tokenValid === false`; otherwise `connected`.
    - Rows missing from Zernio become `removed`.
    - Pending attempts get matched: a new account on that platform after the attempt started becomes `connected`, linked to the account. An expired one becomes `expired`.
    - Stamps `last_checked_at`.
  - **`syncAll(db)`:** health for the whole team plus all accounts (about 3 calls whatever the client count), grouped by `profileId` through `zernio_profiles`, then the same upsert. Profiles we don't know (Zernio's Default profile, or another environment) are ignored.
  - **`db`:** the service client when `SUPABASE_SECRET_KEY` is set, otherwise the signed-in user's client. RLS lets admins and managers write, so the connect flow also works locally without the secret.
- **`queries.ts`:** client accounts (not removed, plus removed within the last 24 hours for undo), pending link attempts, connection history from the activity log, the integration status (admin), and the same-account-on-two-clients check.
- **`actions.ts`** (`requirePermission("connections.manage")` first in each):
  - **`startConnect(clientId, platform, reconnectAccountId?)`:**
    1. Ensures the profile (database row plus Zernio).
    2. Inserts an attempt.
    3. Gets the connect URL with `redirect_url = {origin}/integrations/zernio/callback?attempt={id}`.
    4. Returns the `authUrl`. On a 402 it returns a friendly "Zernio needs a card for more than 2 accounts" with the dashboard link for admins.
  - **`createClientLink(clientId, platform, reconnectAccountId?)`:** ensures the profile, calls `createInvite`, stores the attempt (method `invite`, `invite_url`, `expires_at`), and returns the link and a ready-to-send message.
  - **`cancelClientLink(attemptId)`:** marks it cancelled. Zernio has no revoke endpoint, so the copy says the link expires on its own.
  - **`disconnectAccount(accountId)`:** confirmed in the UI, then `deleteAccount`, then status `removed` with `removal_grace_ends_at`.
  - **`checkNow(clientId)`:** `syncClient`, rate-limited by `last_checked_at` (no more than once a minute).
  - **Admin (`integrations.manage`):**
    - `registerWebhook()`: url `{origin}/api/webhooks/zernio`; events `account.connected`, `account.disconnected`, `account.permissions_changed`. Updated in place if one exists for that URL; refused on localhost.
    - `sendTestWebhook()`.
    - `turnOnHourlyChecks()`: through the service client, calls `configure_zernio_cron(origin)`.
  - **`offboardClient(clientId)`** (used by the future "Delete client" action): disconnects every account, deletes the Zernio profile, deletes the `zernio_profiles` row. Needed because of the restrict foreign key.

**Routes**

- **`src/app/integrations/zernio/callback/route.ts`** (GET, signed-in session required by the proxy):
  1. Loads the attempt through RLS. It must be `pending`, unexpired and created by this user; anything else goes to the client page with "This connect link already finished or expired".
  2. If `error` is present, the attempt becomes `failed` with `error_code` and `error_message`.
  3. Otherwise it runs `syncClient` and confirms the returned `accountId` is in this client's profile.
  4. Redirects **only** to `/clients/<slug>/connections?result=…&platform=…`, an internal path built from the database. That blocks open redirects.
- **`src/app/api/webhooks/zernio/route.ts`** (POST, public):
  1. Reads the raw body with `request.text()` and verifies the signature; a failure returns 401.
  2. Parses the envelope and ignores `test: true`.
  3. Inserts into `zernio_webhook_events` with `on conflict do nothing`. A duplicate returns 200 straight away.
  4. Answers 200, then processes in **`after()`** (Next 16, `next/server`): resolves the client from `profiles[0].externalId` checked against `zernio_profiles`, runs `syncClient`, and sets `processed_at` or `last_error` with `attempts + 1`.
  5. If `SUPABASE_SECRET_KEY` or the webhook secret is missing, it returns 503, so Zernio retries instead of dropping the event.
- **`src/app/api/cron/zernio-sync/route.ts`** (POST, public):
  1. Checks the Bearer token through `verify_zernio_cron_token` (service client); otherwise 401.
  2. Runs `syncAll`, retries unprocessed webhook events (`attempts < 5`), marks expired attempts, and deletes webhook events older than 30 days.
  3. Returns counts.
- **Proxy** (`src/lib/supabase/proxy.ts`): `/api/webhooks` and `/api/cron` skip the session check. They verify their own secrets, and Zernio can't sign in. Every other `/api` route keeps the 401 JSON.

**Wiring**

- **`src/lib/roles.ts`:** `connections.manage` (admin, manager) and `integrations.manage` (admin), with labels for the Team permission table.
- **`src/lib/navigation.ts`:** `connections` gets `comingSoon: false`; the roles stay admin and manager.
- **`src/features/team/activity.ts` `describeActivity`:** `connection.connected`, `.needs_reconnect`, `.restored`, `.removed`, `.failed`.
- **Notifications:** `getNotifications` selects `social_account:social_accounts(platform, display_name, client:clients(slug, name))`. The bell reads "King Air's Google Business Profile needs reconnecting" and links to the client's Connections page.
- **Dashboard:** nothing to add. Disconnected accounts arrive as open alerts in the existing Needs attention list.

## UI: `/clients/[slug]/connections` (shadcn, white, the same patterns as Client requests)

- **Header:** the client name as eyebrow; "Connections"; "The accounts LeadMaker posts to and reads from for {client}. Clients sign in themselves, so we never store their passwords."
- **Setup notice** when `ZERNIO_API_KEY` is missing. Admins see the exact env var steps; others see "Ask an admin to connect Zernio."
- **Accounts grid**, one card per platform, GBP first and wider:
  - **Not connected:**
    - The platform icon (inline SVG brand icons in `src/components/brand/platform-icons.tsx`; no new dependency) and its help line.
    - **Connect** (sign in here).
    - **Send the client a link** (opens a dialog with the link, Copy link, Copy message, and "Expires {date}").
  - **Connected:** for each account:
    - Avatar, name, @username or the GBP location name.
    - A status badge: Connected, Needs reconnecting (amber with the reason), or Removed (with "Reconnect within the hour to keep its scheduled posts").
    - "Connected 3 days ago by Ana", plus a "Can't post" warning when `can_post` is false.
    - A menu: Reconnect, Send reconnect link, Open profile, Disconnect (AlertDialog).
    - **Connect another** (for example a second GBP location).
  - **Duplicate warning:** "Also connected to {other client}" when the same `platform_user_id` exists on another client.
- **Waiting on the client:** pending links with platform, sent by, expiry, Copy and Cancel. Expired ones are greyed out with a "New link" button.
- **History** (collapsible): connection activity for this client.
- **Zernio card** (admins only, at the bottom):
  - API key: OK, missing or rejected (401).
  - Webhook: registered, active and failure count; **Register webhook** and **Send test**.
  - Hourly checks: on or off; **Turn on**.
  - The last full check, the number of connected accounts against the 2 free ones, and a link to Zernio billing.
- **Returning from Zernio:** a small client component reads `?result` and shows a toast ("Google Business Profile connected", "You cancelled at Google. Nothing changed", or "Pick at least one location…" from `error_message`), then clears the URL with `router.replace`.
- **Data freshness:** loading the page runs `syncClient` in `after()` when `last_checked_at` is older than 15 minutes. There's also a **Check now** button.
- **Suspense** around every data section, per the Cache Components rule.

## Problems we're preventing

| Risk                                                                 | How it's handled                                                                                                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| The user closes the tab after consent, so the callback never arrives | The webhook `account.connected`, the page-load sync and the cron all reconcile                                                            |
| A forged callback (`?accountId=` faked)                              | The attempt must belong to the user and be pending; accounts come only from Zernio's own API for this client's profile                    |
| Duplicate or replayed webhooks                                       | The event id is the primary key, the upsert is idempotent, and the HMAC is verified with a timing-safe compare                            |
| Webhook processing takes over 5 seconds                              | We store, answer 200, and process in `after()`; the cron retries failures                                                                 |
| An account sits on the wrong client                                  | Composite foreign key, plus a trigger blocking client and account id changes, plus `externalId` routing                                   |
| Two managers create a Zernio profile at the same time                | Zernio's 409 returns `existingProfileId`; the database insert uses `on conflict do nothing` and re-selects                                |
| The profile id is lost from our database                             | `GET /v1/profiles?externalId=` recovers it                                                                                                |
| An account id changes after a removal grace                          | A new row; the old one stays `removed` for history                                                                                        |
| The client is deleted while Zernio keeps billing                     | The `restrict` foreign key forces `offboardClient` first                                                                                  |
| Zernio is down, rate-limited or the key is wrong                     | Typed errors and friendly messages; GET retries respect `Retry-After`; the Zernio card shows the key status                               |
| A 3rd account without a card (402)                                   | A clear message with the dashboard link; the attempt is marked failed                                                                     |
| A webhook can't be delivered on localhost                            | Registration is refused for local origins; development relies on the callback, page load and Check now                                    |
| Secrets leaking                                                      | Server-only modules; nothing in `NEXT_PUBLIC_*` or `.env.production`; link URLs readable by admins and managers only; tokens never stored |
| Alert spam                                                           | One open alert per account (`source_key`); notifications only when the status actually changes                                            |

## Order of work

1. Migrations 0010 and 0011, advisors, types. Rolled-back RLS and trigger tests (below).
2. `env.server`, the Zernio client, schemas, webhook verify, `sync.ts`.
3. Actions, the callback route, the proxy exceptions, roles and navigation.
4. The Connections page UI, platform icons, link dialog and Zernio card.
5. The webhook route; migration 0012, the cron route and "Turn on hourly checks".
6. Notifications, activity wording, docs (`docs/architecture.md`, `CLAUDE.md`, `docs/deploy.md`, `.env.example`), and this plan saved as `docs/plans/connections-zernio.md`.
7. Lint, typecheck, build, then live tests with your Zernio key.

## Verification

- **Database** (rolled-back `DO` blocks with fake JWT claims, as before):
  - A VA can read a client's accounts but not attempts or link URLs.
  - A VA can't insert or update accounts. A manager can.
  - Nobody can touch `zernio_webhook_events`.
  - The composite foreign key rejects a mismatched profile.
  - Changing `client_id` is blocked.
  - A status change raises one alert, notifies the owner (or the admins) and logs history. Restoring resolves the alert.
  - Deleting a client with a profile is blocked.
  - Advisors: no new security warnings.
- **Zernio live** (your key in `.env.local`, signed in yourself in the browser):
  1. Connect your test GBP from a test client and see the row and toast.
  2. Cancel at Google and see the failure message.
  3. Send a client link, open it in a private window, connect, then Check now: the pending link flips to connected.
  4. Disconnect, then reconnect within the hour: the same row returns to connected.
  5. Simulate a broken account by setting `needs_reconnect` with SQL and see the alert and bell.
  6. Send a forged webhook with curl and a bad signature: 401. With a valid signature sent twice: one event row.
  7. Call the cron route with a bad token: 401.
- **On DigitalOcean** (after you add `ZERNIO_API_KEY`, `ZERNIO_WEBHOOK_SECRET` and `SUPABASE_SECRET_KEY`): Register webhook, then Send test, then Turn on hourly checks; confirm the cron job and an `account.connected` event arriving.
- `npm run lint`, `npm run typecheck`, `npm run build`. Commit only when you ask.

## What you'll need to provide

- **The Zernio API key** in `.env.local` as `ZERNIO_API_KEY` (full access).
- **A webhook secret** you generate (`openssl rand -hex 32`) as `ZERNIO_WEBHOOK_SECRET`. The same values go into DigitalOcean as Encrypted, Run Time variables.
- **`SUPABASE_SECRET_KEY`** locally and on DigitalOcean (webhooks and cron).
- **A test GBP and/or Facebook Page you control.** Add a card in Zernio before connecting a 3rd account.

## Later phases (designed for, not built now)

- **Agency GBP shortcut:** list the locations of an agency-managed Google login and assign one to a client's profile with no client OAuth (`gmb-locations/assign`).
- **Client requests integration:** a "Connect your Google profile" Action request carrying the connect link in the client portal.
- **Built on `social_accounts`:**
  - Publishing (Content), through `POST /v1/posts` with `Idempotency-Key`.
  - Reviews (`review.new` webhook and replies).
  - GBP performance and search keywords for the monthly report.
