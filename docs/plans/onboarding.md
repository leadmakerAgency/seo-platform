# Plan: Client onboarding link (connect.leadmaker.agency)

Status: **built.** Notes from building:

- The database work is split into `0015_onboarding` (tables, helpers) and `0016_onboarding_functions`
  (client and team functions, triggers, RLS, grants).
- Links use the app domain (`/onboard/<slug>-<token>`) until `ONBOARDING_HOST` /
  `ONBOARDING_BASE_URL` are set.
- "I don't use this" is the only social choice (no "later"); the social step is done when every
  platform is connected or marked.

## Context

New clients have to give LeadMaker four things:

- their business details
- access to Google Business Profile and their social accounts
- viewer access to Search Console and GA4
- access to their website, and logins for sites with no API

Today none of that has a home. The product plan (`docs/product-plan.md`, row 1 and Phase 1) and Mark's mockup ("Client connect link `connect.leadmaker.agency/king-air-7f3k`") both expect a client-facing onboarding wizard.

**What you decided:**

- **Separate page on a separate subdomain**, sent to the client. The client never signs in to the agency app.
- **Everything is saved to Supabase the moment the client enters it**: autosave per field group, and Zernio connections synced straight away.
- **All four steps** in the first version: Business details, Social + Google profile (Zernio), Google reporting access (Search Console + GA4), Website + logins vault.
- **Business details are reviewed by the team before they change the client's profile.**

**The flow:**

1. Create the client on the Dashboard.
2. Open the client and go to **Onboarding**.
3. **Create onboarding link**, then copy it, or copy a ready-to-send message.
4. The client opens `https://connect.leadmaker.agency/king-air-duct-cleaning-8fK2…`, works through the wizard and connects their accounts. Every answer is stored as they go.
5. The account manager watches progress live, reviews the details, clicks **Apply to profile**, and moves the client to Active.

**Reuse:** the Zernio integration that's already built (`src/lib/zernio/client.ts`, `src/features/connections/sync.ts`, the webhooks, the `social_accounts` mirror), the portal patterns (`src/app/(portal)/c/[token]`, token-checked security-definer RPCs, the anon client in `src/lib/supabase/public.ts`), and the alerts, notifications and activity triggers.

## How the subdomain works

**For now (your decision): links use the current app domain.** They look like `https://seo-platform-u3ra3.ondigitalocean.app/onboard/<client-slug>-<token>`. The wizard pages there are already public, isolated (no app menu, no team cookies used) and set to noindex.

- The base URL comes from `ONBOARDING_BASE_URL`. While it's unset, the app uses its own origin, so nothing needs configuring today.
- When the real subdomain is ready, set the two env vars below and redeploy. New links then use `connect.leadmaker.agency`, and old `/onboard/…` links keep working, because both forms point to the same route.

Everything below in this section is the **later** subdomain switch. It's built now and inactive until `ONBOARDING_HOST` is set.

- **Same Next.js app, second host.** In DigitalOcean: App → Settings → Domains → add `connect.leadmaker.agency`. At your DNS provider: a CNAME from `connect` to the app's `*.ondigitalocean.app` host. One deploy serves both domains.
- **New env vars:**
  - `ONBOARDING_HOST=connect.leadmaker.agency`
  - `ONBOARDING_BASE_URL=https://connect.leadmaker.agency`
- **`src/proxy.ts` / `src/lib/supabase/proxy.ts`, when the request host is `ONBOARDING_HOST`:**
  - Allow only `/` (a plain "This link isn't active" page), `/<link>`, `/done` (the Zernio return), `/_next/*` and favicons.
  - Rewrite `/<link>` to the internal route `/onboard/<link>`. Everything else returns 404.
  - No Supabase session work, and no team cookies are ever read on this host.
- **Before the DNS is ready:** `ONBOARDING_BASE_URL` is unset, so links fall back to `https://<app>/onboard/<link>`. `/onboard` becomes a public path, so the feature works on day one.
- **Response headers for both forms:** `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store`, plus `metadata.robots` noindex.
- **Link format:** `/<client-slug>-<token>`.
  - The token is 22 random base62 characters (about 131 bits), so it can't be guessed.
  - The slug is only cosmetic: lookup is by token, and a mismatched slug still works.

## Database (Supabase project `seo-platform`; migrations 0014–0015 through the MCP, then advisors and types)

### 0014_onboarding_kinds.sql

- Adds `onboarding_submitted` and `onboarding_opened` to `notification_kind`. Kept separate because a new enum value can't be used in the same transaction.

### 0015_onboarding.sql

**Enums**

- `onboarding_status`: `not_started`, `in_progress`, `submitted`, `reviewed`.
- `onboarding_step_status`: `todo`, `in_progress`, `done`, `skipped`.
- `website_platform`: `wordpress`, `webflow`, `shopify`, `wix`, `squarespace`, `godaddy`, `other`, `none`, `unknown`.
- `website_manager`: `self`, `developer`, `agency`, `unknown`.
- `link_status`: `active`, `revoked`, `expired`.

**Tables**

| Table                         | Purpose                                                                                                                | Key columns                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onboarding_links`            | The link sent to the client                                                                                            | `id`, `client_id` (cascade), `token` (unique, check `^[A-Za-z0-9]{22}$`), `status`, `expires_at` (default now + 30 days), `created_by`, `created_at`, `first_opened_at`, `last_opened_at`, `revoked_at`, plus `writes_window_start` and `writes_count` (abuse limit). **Partial unique index: one `active` link per client**                                                                                                                                           |
| `client_onboarding`           | One row per client: overall progress                                                                                   | `client_id` PK, `status`, one status column per step (`business_status`, `social_status`, `google_access_status`, `website_status`, `logins_status`), `started_at`, `submitted_at`, `reviewed_at`, `reviewed_by`, `updated_at`                                                                                                                                                                                                                                         |
| `onboarding_business_details` | Exactly what the client submitted, never applied automatically                                                         | `client_id` PK, `business_name`, `legal_name`, `phone`, `public_email`, `website`, `street`, `city`, `region`, `postal_code`, `country_code`, `service_area_business` (hide address), `service_areas` text[], `primary_category`, `other_categories` text[], `services` text[], `hours` jsonb, `year_founded`, `description`, `contact_name`, `contact_role`, `contact_email`, `contact_phone`, `preferred_contact`, `notes`, `updated_at`, `applied_at`, `applied_by` |
| `client_business_profiles`    | The team-approved business info the app uses (rankings city, citations, reports). Written only by **Apply to profile** | Same business fields, plus `updated_by` and `updated_at`                                                                                                                                                                                                                                                                                                                                                                                                               |
| `onboarding_google_access`    | The reporting-access step                                                                                              | `client_id` PK; for Search Console: `sc_status` (todo / added / no_access / not_using), `sc_property`; for GA4: `ga4_status`, `ga4_property`; `notes`, `updated_at`; `verified_at` (later, when the service account can read the property)                                                                                                                                                                                                                             |
| `onboarding_website`          | The website step                                                                                                       | `client_id` PK, `platform`, `url`, `managed_by`, `developer_name`, `developer_email`, `access_status` (todo / invited_us / login_in_vault / later), `notes`, `updated_at`                                                                                                                                                                                                                                                                                              |
| `onboarding_social_choices`   | "I don't use this" per platform, so the step can finish                                                                | `client_id`, `platform` (`social_platform`), `choice` (`not_using` / `later`), PK `(client_id, platform)`                                                                                                                                                                                                                                                                                                                                                              |
| `client_logins`               | The logins vault                                                                                                       | `id`, `client_id` (cascade), `site_name`, `site_url`, `username`, `secret_id` (a Supabase Vault secret id, **never the password**), `has_2fa`, `notes`, `source` (`onboarding` / `team`), `created_by` (null when the client added it), `created_at`, `last_viewed_at`, `last_viewed_by`                                                                                                                                                                               |

**Changes to existing tables**

- `social_connect_attempts`:
  - Add `source` (`team` / `onboarding`, default `team`) and `callback_key_hash` (sha256, used for onboarding returns).
  - Allow `created_by` to be null for onboarding.
  - Add a check that `source = 'onboarding'` requires a `callback_key_hash`.
- `alerts`: reuse `source_key` (`onboarding:<client_id>`) for "Onboarding submitted, review the details".

**Field limits** are checks in the database as well as zod in the app:

- Text fields have length caps.
- Arrays have at most 50 items of at most 120 characters each.
- `country_code` is two letters.
- `hours` must match `{mon..sun: [{open:"HH:MM", close:"HH:MM"}]}`, enforced by a `private.valid_hours(jsonb)` check.
- Emails and URLs have simple regex checks.

**Client-facing functions** (security definer, `search_path=''`, executable by `anon`, every one checks the token first)

- `private.onboarding_client(p_token)`:
  - Returns the client id only for an `active`, unexpired link.
  - Updates `last_opened_at`, and `first_opened_at` with a one-time "client opened the link" notification.
  - Throttles writes: more than 600 writes an hour on one link raises "Too many changes, try again later".
- `public.onboarding_get(p_token) returns jsonb`: everything the wizard shows for that one client.
  - Client name, the owner's first name as the contact, the current answers, step statuses, connected accounts (platform, name, status only), and logins as site / username / has-password with **never** the secret.
  - It returns no internal fields, other clients or team emails.
- **Writes:** `onboarding_save_business(p_token, p_data jsonb)`, `onboarding_save_google_access(...)`, `onboarding_save_website(...)` and `onboarding_set_social_choice(...)`.
  - Partial updates: only the keys sent are changed (autosave per field group).
  - Each validates its input and recomputes the step status.
- **Logins:**
  - `onboarding_add_login(p_token, site, url, username, password, has_2fa, notes)` calls `vault.create_secret(password)` and stores only the secret id. At most 40 logins per client; password at most 500 characters.
  - `onboarding_remove_login(p_token, p_login_id)` deletes the row and its Vault secret.
- **`onboarding_submit(p_token)`:**
  - Sets status `submitted` and stamps `submitted_at`.
  - Notifies the owner (`onboarding_submitted`), or every admin if the client has no owner.
  - Raises the review alert and logs `onboarding.submitted`.
  - The client can keep editing until the team marks the onboarding reviewed. A later edit flips the status back to `in_progress`, and they submit again.

**Team-side functions and RLS**

- **`onboarding_links`:** admins and managers can read and write for clients they can see. VAs, writers and viewers can't see links.
- **`client_onboarding` and the answer tables:**
  - Readable by admins, managers and viewers. Also by VAs and writers for clients in their tasks, but without `client_logins` secrets.
  - Written only by the client-facing functions, plus admins and managers through "Apply" and "Mark reviewed".
- **`client_logins` access:**
  - The row (site, username) is readable by anyone who can see the client.
  - `public.reveal_client_login(p_login_id) returns text`:
    - For admins, managers, and VAs or writers assigned a task that includes that client.
    - Reads `vault.decrypted_secrets`, stamps `last_viewed_at` and `last_viewed_by`, and logs `vault.viewed` (who, which site, never the password).
- **`public.apply_onboarding_profile(p_client_id, p_fields text[])`** (admins and managers):
  - Copies the chosen fields into `client_business_profiles`.
  - Also updates `clients` (name, website, city, region, country_code, industry).
  - Stamps `applied_at` and `applied_by` and logs `onboarding.applied`.
- **Triggers** log step changes (`onboarding.step_done`, `onboarding.opened`, `onboarding.link_created`, `onboarding.link_revoked`) to `activity_log` with the client id. Each row is written once per real change, never once per keystroke.
- **Grants:** private helpers revoked from public and anon. Only the token-checked `onboarding_*` functions go to anon, and the advisor flags those as intended, like the portal ones.

## Zernio connections from the onboarding page (no client login)

- **Server action `startOnboardingConnect(link, platform)`** (`src/features/onboarding/public-actions.ts`):
  1. Validates the link with `onboarding_client`.
  2. Uses the **service client** (`SUPABASE_SECRET_KEY`, already set on DigitalOcean) to make sure the client's Zernio profile exists (`getOrCreateProfile`).
  3. Inserts an attempt with `source='onboarding'` and a random 32-byte callback key, storing only its hash.
  4. Calls `getConnectUrl` with `redirect_url = {ONBOARDING_BASE_URL}/done?a=<attemptId>&k=<key>`.
  - **The onboarding token is never sent to Zernio.** That URL is about 95 characters, well under X's limit.
- **`/done` route** (connect host):
  1. Checks that the attempt is pending, unexpired (30 minutes) and from onboarding, and that the key hash matches.
  2. On `error`, marks the attempt failed with the code. Otherwise it runs `syncClient` with the service client.
  3. Redirects back to `/<slug>-<token>?step=social&result=…`. The token comes from the client's active link, looked up server-side.
- **The existing webhook** (`account.connected`) and the hourly cron also sync, so a client who closes the tab after consent still ends up connected in the database within seconds.
- **The social step** shows the client's connected accounts live, plus "I don't use this" per platform. It counts as done when Google Business Profile is connected (or marked "I don't have one") and every other platform is connected or marked.
- **Same tables as before:** connections made here land in the same `social_accounts` the Connections page already shows. Reconnect links on the Connections page keep working.

## Client-facing wizard: `src/app/onboard/[link]/page.tsx` (rewritten from the connect host)

- **Look:** a minimal layout (`src/app/onboard/layout.tsx`): white, large type, LeadMaker logo, no app chrome, mobile first.
- **Header:**
  - "Welcome, King Air Duct Cleaning".
  - "About 15 minutes. Everything saves as you go; you can stop and come back with the same link."
  - The account manager's first name as the contact.
- **Stepper:**
  1. **Business details.** Sections: Business (name, phone, email, website), Location (address, or "We go to customers" plus service areas as chips), What you do (primary category, more categories, services), Hours (a 7-day editor with "closed" and "open 24 hours"), About (year founded, description), Main contact.
  2. **Google profile & social media.** One card per platform with **Connect** (Zernio hosted sign-in, then back) or **I don't use this**. Google Business Profile comes first, explained in plain words.
  3. **Google reporting access.**
     - Our reporting email (`GOOGLE_REPORTING_EMAIL`) with a Copy button.
     - Numbered steps for Search Console and GA4, with direct links, then "I've added you", "I don't have this" or "I need help".
  4. **Website.**
     - The platform, then instructions that depend on it: WordPress, "add {AGENCY_ACCESS_EMAIL} as an Administrator"; Webflow, Shopify and Wix, "invite us as a collaborator". Then "I've done this", or "Store a login instead", which opens step 5 prefilled.
     - Who manages the site, plus the developer's contact.
  5. **Other logins.**
     - Rows of site, URL, username, password and 2FA note. The password is a masked field.
     - After saving, each row shows "Saved securely 🔒" and the password can't be read back. Rows can be removed.
     - Suggestions: Yelp, Bing Places, Apple Business Connect, Angi, BBB, Nextdoor.
  6. **Review & finish.** A checklist of each step's status, what's missing, and **Send to LeadMaker** (`onboarding_submit`), then a thank-you screen.
- **Autosave** (`useAutosave` hook):
  - Debounced at 800 ms on change and immediate on blur.
  - Calls the matching `onboarding_save_*` through a server action (anon client, like the portal).
  - Shows "Saving… / Saved ✓ / Couldn't save, retrying".
  - Retries with backoff and, if the network drops, keeps the unsaved values in the page with a warning.
- **Validation:** shared zod schemas (`src/features/onboarding/schemas.ts`) run on the client, in the server action, and again as database checks.
- **Inactive link:** a bad, revoked or expired link shows "This link isn't active. Ask your LeadMaker contact for a new one."

## Agency side: `/clients/[slug]/onboarding` (new client nav item, admins and managers; viewers read only)

- **Link card:**
  - Before a link exists: **Create onboarding link**.
  - Afterwards: the link, Copy link, Copy message (a ready email or WhatsApp text), Opened status ("Opened 2 hours ago" / "Not opened yet"), Expires on, Extend 30 days, and **New link**, which revokes the old one with an AlertDialog confirm.
- **Progress:** five step tiles with status and last change. The page refreshes every 20 seconds while open (`router.refresh`), so the team watches answers arrive live.
- **Business details review:**
  - The submitted value next to the current profile value, field by field, with differences highlighted.
  - Tick boxes per field, then **Apply to profile** (`apply_onboarding_profile`).
- **Connections:** what the client connected (from `social_accounts`), with a link to the Connections page.
- **Google access and Website:** the client's answers and statuses, plus a **Mark verified** button for Search Console and GA4. Automatic verification comes when the Google service account integration is built.
- **Logins vault:** each site with **Reveal**, which is logged and auto-hides after 30 seconds, and **Copy password**. Admins and managers can also add logins here (`source='team'`).
- **Finish:** **Mark onboarding reviewed**. It resolves the alert and offers "Move client to Active" (stage `onboarding` → `active`).
- **History:** `onboarding.*` and `vault.viewed` activity.
- **Elsewhere:**
  - Dashboard Needs attention gets "King Air finished onboarding. Review the details" through the alert.
  - Bell notifications for "opened the link" and "submitted onboarding".
  - The Connections page's "Send the client a link" stays for one-off reconnects.

## Code layout (same patterns as Client requests and Connections)

- **`src/features/onboarding/`:**
  - `constants.ts` (steps, labels, website platforms, suggested login sites)
  - `schemas.ts` (shared zod)
  - `queries.ts` (agency side, RLS)
  - `actions.ts` (create, revoke and extend the link; apply; mark reviewed; reveal; team-added logins)
  - `public.ts` (server only: `getOnboarding(link)` through the anon RPC)
  - `public-actions.ts` (autosave actions; `startOnboardingConnect`)
  - `components/` (agency: `onboarding-view`, `link-card`, `details-review`, `logins-vault`)
  - `components/wizard/*` (client: stepper, per-step forms, `useAutosave`, `hours-editor`, `chips-input`, `platform-connect-card`)
- **Routes:**
  - `src/app/onboard/[link]/page.tsx`
  - `src/app/onboard/done/route.ts`
  - `src/app/(app)/clients/[clientSlug]/onboarding/page.tsx`
- **`src/lib/env.server.ts`:** `getOnboardingBaseUrl()`, `getOnboardingHost()`, `getGoogleReportingEmail()`, `getAgencyAccessEmail()` (default `seo@leadmaker.agency`).
- **`src/lib/supabase/proxy.ts`:** connect-host handling, and `/onboard` as a public path.
- **`next.config.ts`:** security headers for `/onboard/*` and for the connect host.
- **`src/lib/navigation.ts`:** client section `onboarding` ("Onboarding", `ClipboardCheck` icon, admins, managers, viewers).
- **`src/lib/roles.ts`:** `onboarding.manage` (admins, managers) and `vault.reveal` (admins and managers; VAs and writers only on their own clients, enforced in the database).
- **Wording:** `describeActivity` and the notification bell for `onboarding.*` and `vault.viewed`.
- **Docs:** `docs/architecture.md`, `CLAUDE.md`, `docs/deploy.md` (subdomain and env vars), and this plan as `docs/plans/onboarding.md`.

## Problems we're preventing

| Risk                                          | Prevention                                                                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Someone guesses a link                        | A 131-bit random token. Slug lookup is irrelevant. One active link per client; links expire after 30 days and can be revoked or replaced                 |
| The token leaks to third parties              | `no-referrer`; the token is never in Zernio's redirect (separate hashed callback key); `noindex` and `no-store`                                          |
| Abuse or spam through the public functions    | Per-link write throttle; length and array caps in the database; at most 40 logins; zod on the server too                                                 |
| Passwords exposed                             | Stored only in Supabase Vault; the client can't read them back; reveal is limited by role and assignment, logged, and never returned by `onboarding_get` |
| Lost answers (tab closed, flaky phone signal) | Autosave per field group with retries; unsaved values kept on screen with a warning; every save is idempotent                                            |
| The client closes the tab mid-Zernio sign-in  | The webhook, the cron and the `/done` sync all reconcile; the attempt expires cleanly                                                                    |
| Bad data overwrites the profile               | Answers live in `onboarding_*`; only **Apply to profile** writes `client_business_profiles` and `clients`, per chosen field                              |
| The connect host serves app pages             | The proxy allowlist on that host returns 404 for everything except the wizard routes, and never touches team cookies                                     |
| The DNS isn't ready yet                       | Links fall back to `/onboard/<link>` on the app domain                                                                                                   |
| The reporting email isn't configured          | The step shows "We'll send you the email to add" and lets the client continue; the agency page flags it                                                  |
| Two links for the same client                 | Partial unique index; creating a new link revokes the old one in the same transaction                                                                    |
| A client is deleted                           | Cascades remove the links, answers and logins, and a trigger deletes their Vault secrets (no orphans)                                                    |

## Order of work

1. Migrations 0014 and 0015, advisors, types; rolled-back tests (below).
2. Env getters, proxy host handling, `next.config` headers.
3. Public functions wiring (`public.ts`, `public-actions.ts`, autosave), the Zernio onboarding connect and `/done`.
4. The wizard UI, all five steps plus review, mobile first.
5. The agency Onboarding page: link card, progress, review and apply, logins vault, history.
6. Navigation, roles, bell and activity wording, alerts; docs.
7. Lint, typecheck, build; deploy; live tests; push.

## Verification

- **Database** (rolled-back `DO` blocks with fake JWT claims and the anon role):
  - A bad, revoked or expired token gets nothing.
  - One token can't read or write another client.
  - `onboarding_get` never returns secrets or internal fields.
  - The write throttle triggers.
  - Logins store only a Vault id, and removing one deletes the secret.
  - Reveal works for admins and managers, and for a VA only on their own client; it is denied otherwise and logged.
  - Apply copies only the chosen fields.
  - Submit raises one alert and one notification.
  - The one-active-link index holds.
  - Advisors: only the intended anon functions are flagged.
- **Live:**
  1. Create a link for Test Client.
  2. Open it in a private window.
  3. Fill every step and check each autosave shows up in the database straight away (`execute_sql`).
  4. Connect a platform through Zernio (you do the sign-in) and see it on both the wizard and the Connections page.
  5. Add a login and reveal it on the agency side (logged).
  6. Submit, and see the bell and Needs attention.
  7. Apply to profile.
  8. Revoke the link and see "isn't active".
  9. Check at 375 px wide.
- **Now, on the app domain:** `/onboard/<link>` works signed out, with no app menu or team data, and is noindex.
- **Later, once the subdomain is set:** only the wizard routes answer on `connect.leadmaker.agency`; `/dashboard` there returns 404.
- `npm run lint`, `npm run typecheck`, `npm run build`, then push.

## What you'll need to do

- **Now:** nothing for the domain. Links use `https://seo-platform-u3ra3.ondigitalocean.app/onboard/…`.
- **Optional env vars now:**
  - `GOOGLE_REPORTING_EMAIL`: the Google service account email from Phase 0. Leave it empty if it doesn't exist yet; the step then says we'll send the email.
  - `AGENCY_ACCESS_EMAIL`: defaults to `seo@leadmaker.agency`.
- **Later, when the subdomain is ready:**
  - Add the CNAME `connect.leadmaker.agency` pointing to the app, and add the domain under the DigitalOcean app's Domains.
  - Set `ONBOARDING_HOST=connect.leadmaker.agency` and `ONBOARDING_BASE_URL=https://connect.leadmaker.agency`, then redeploy.
- **During the live test:** you do the Zernio or Google sign-in and confirm the onboarding test messages.
