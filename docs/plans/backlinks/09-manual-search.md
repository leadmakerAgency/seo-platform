# 09 · Manual Search: master plan

**Status:** built (2026-11-20), migrations `0045`–`0048`, code in `src/features/backlinks/manual/`.

**Your answers (2026-11-20), which change the plan below:**
- Q1 yes: the work list covers every approved place, from every tab.
- Q2 yes: Live listings count in `work_items`; new backlink tasks default to `counts_as` none
  (existing ticked tasks keep what they already counted).
- Q3 **VAs manage spend**: there is no `needs_approval` status, no spend-approval functions and no
  managers-only rows. Paid sites show their cost; the VA records what was paid on the listing.
- Q4: countries come from the strategy brief's places (Standard Search), else the client's
  country. The seed covers US, AU, UK, CA and worldwide sites.
- Q5 yes: paid guest-post marketplaces are in the catalog (with the warning), pickable by VAs.
- Also built: `add_backlink_login` (VAs save the directory account to the vault for a listing),
  problem reports on catalog rows, and the catalog page lives at `/backlink-catalog`.
- Not built yet (later): the whole-catalog strength check (use Check site strength on the work
  list instead), automatic live checks with the safe fetcher, Claude-written descriptions.
**Where it lives:** Backlinks page, third tab (`?mode=manual`). The tab and its placeholder already
exist (commit `df80154`). The agency-wide catalog page is new (`/backlinks/catalog`).
**Who uses it:** VAs every day, with managers keeping the catalog and approving spend.
**Site list:** `10-manual-catalog.md`, about 200 researched sites and plays with cost, link type,
priority and who each one suits. It's the seed.

---

## 0. In one page

Standard Search and Shockwave AI Search **find** places. Manual Search is where the team **works**
them, starting from a fixed list of sites the agency trusts.

1. **Catalog.** The agency keeps one list of good backlink sites: Google Business Profile, Yelp,
   Clutch, G2, Qwoted, True Local and so on. Each site has its cost (free, freemium, paid, lead
   fees…), typical link type, priority, the countries and kinds of clients it suits, what you need
   to sign up, and a short how-to. Managers edit it; everyone reads it.
2. **Pick.** On a client's Manual tab the VA opens **Add from catalog**. The catalog is already
   sorted for this client: **Suggested** (matches the country, reach, buyer, offering and
   industry in the brief), then everything else. The VA ticks the sites the client needs and adds
   them. Each pick becomes an approved place in the shared list (`backlink_opportunities`,
   `source = 'manual'`) and a work item on the tab.
3. **Work.** Each picked site moves through **To do → Doing → Submitted → Live**, or **Blocked**
   (with a reason) or **Skipped**. While working one, the VA has the client's **listing kit** in a
   side sheet with copy buttons (name, address, phone, website, categories, descriptions, hours),
   the site's how-to, the vault login for that site, and a place for notes and a follow-up date.
4. **Live.** When a listing goes live the VA pastes the listing URL and the link type. That counts
   once toward the client's monthly backlink target (`work_items`, `source = 'backlink'`), and the
   Overview shows it.
5. **Paid sites need a yes.** Picking a paid, membership or lead-fee site puts it in
   **Needs approval** until a manager approves the spend (amount and note). Paid guest-post
   marketplaces can only be picked by managers.
6. **Off-catalog finds.** A VA who finds a good site by hand adds it by URL. It joins the client's
   work list and can be suggested for the catalog with one tick; a manager reviews the suggestion.
7. **Finding help.** The tab has search helper links built from the brief (Google with operators
   in the VA's own browser, which costs nothing, plus Ahrefs' free checker on competitors) and the
   VA toolkit from the catalog doc.

**Cost to run:** nothing per use. No API calls except the existing **Check site strength**
(DataForSEO, about $0.03–0.05 per click, shared 30-day cache), which already works on any place.

### Decisions this plan makes

| # | Decision | Why |
| --- | --- | --- |
| D1 | The catalog is a **new table `backlink_catalog`**, one row per catalog entry, with a required link to `directories`. | `directories` holds thousands of auto-found sites. The catalog's editorial fields (cost model, how-to, needs, priority) only make sense for the ~200 we chose. The link keeps one row per site, so site strength, blocking and dedupe stay shared with Standard and AI. |
| D2 | A pick **is an approval**: it writes `backlink_opportunities` with `status = 'approved'`, `source = 'manual'`, `decided_by` = the VA. | The Approved list and the monthly target stay one shared list across all three tabs (same rule as AI plan D5). The unique `(client_id, directory_id)` stops duplicates. |
| D3 | Submission tracking is a **new table `backlink_submissions`** (one per approved opportunity), with an event history. | This is the "Submissions" later upgrade from `05-later-upgrades.md`. It's the only place a listing's status, URL, cost and login live. |
| D4 | The Manual tab's work list shows **every approved place**, filtered by where it came from (Catalog · Standard · AI · By hand). Catalog picks are the default view. | Places approved in Standard or AI still need someone to submit them. One work list means one way to count live links and nothing counted twice. **Needs your OK (Q1).** |
| D5 | **Live** inserts one `work_items` row (`source = 'backlink'`, `source_id` = submission id) by trigger, and deletes it when the status leaves Live. Once this ships, `counts_as` is turned off on backlink tasks. | This is the contract in `docs/architecture.md`. Without turning `counts_as` off, a ticked backlink task and a live submission would both count. **Needs your OK (Q2).** |
| D6 | **Spend approval in the database.** Picking a catalog row whose cost is paid, membership or lead fees sets the submission to `needs_approval`. Only admins and managers can approve, with an amount. Marketplace rows (category R) can only be picked by managers. | VAs shouldn't commit client money, and buying links is a policy risk the agency owns. |
| D7 | **Live check v1 is manual:** the VA pastes the listing URL and picks the link type. v2 reuses the AI session's safe fetcher (`08`, Step 6) to confirm the page loads, contains the client's domain and shows the `rel`. | No server-side fetching in v1 keeps the CLAUDE.md rule ("never fetch the URLs searches return on the server"). The fetcher will exist soon anyway. |
| D8 | **Logins only through the vault.** A submission stores `login_id` → `client_logins`. "Save login" opens the existing vault form. | Passwords live only in Supabase Vault (`client_logins.secret_id`). Never in notes. |
| D9 | **Search helpers** are plain links that open Google in the VA's browser and may use operators (`intitle:`, `inurl:`). They live in their own constant, separate from `backlink_footprints`. | Operators cost 5× in DataForSEO, but they're free in the VA's own browser. A separate file keeps the "no operators in footprints" rule easy to check. |
| D10 | **Matching is pure TypeScript** (`manual/match.ts`), run at read time against the brief and business profile. Nothing is stored. | Same reason scores are computed at read time: when the brief changes, suggestions follow it. |

---

## 1. How it works (end to end)

```
Managers ── /backlinks/catalog ── upsert_catalog_site / retire_catalog_site ──► backlink_catalog ─┐
                                                                                                 │ directory_id
Client → Backlinks → Manual tab                                                                  ▼
  Add from catalog (sheet) ── match.ts (brief + profile) → Suggested / Other ──► directories (shared)
     └─ tick N → pick_catalog_sites(client, ids[]) ──► backlink_opportunities (approved, source manual)
                                                     └► backlink_submissions (todo | needs_approval)
  Add a site by hand ── add_manual_site(client, url, …) ──► same two rows (+ optional catalog suggestion)
  Work list ── row sheet: listing kit · how-to · login · status · notes · follow-up
     └─ update_submission(id, patch) ──► backlink_submissions + backlink_submission_events
          status → live ──trigger──► work_items (source backlink) ──► Overview / Dashboard
          status leaves live ──trigger──► delete work_items row
  approve_submission_spend(id, amount, note)            (admin, manager)
  pg_cron daily ── backlink_follow_ups() ──► notifications (follow-up due, waiting too long)
```

---

## 2. Database (Supabase project `seo-platform`)

Migration numbers: the last one in the repo is `0041`. **The AI session is also adding
migrations.** Check `supabase/migrations/` and `list_migrations` right before writing, and take the
next free number. Below they're called `M1`–`M4`.

### M1 `backlinks_manual_kinds` (only `add value`, so the next migration can use them)

- `notification_kind` + `backlink_follow_up`, `backlink_spend_request`.
- New enums:
  - `catalog_category`: maps_core, citation, local_country, home_services, professional, b2b_reviews,
    software, company_profile, social_profile, publishing, journalist_requests, press_release, podcast,
    local_play, community, ecommerce, marketplace_paid.
  - `catalog_kind`: site, play.
  - `catalog_pricing`: free, freemium, trial, paid, lead_fees, membership, selection, retired.
  - `link_kind`: follow, nofollow, mixed, varies, none, unknown.
  - `submission_status`: needs_approval, todo, doing, submitted, live, blocked, skipped.
  - `submission_block`: verification (postcard / phone / video), needs_client_info, needs_payment,
    site_rejected, site_broken, duplicate_found, other.

### M2 `backlinks_manual` (tables, RLS, functions)

**`backlink_catalog`** (global, no client data)

- `id` uuid pk · `directory_id` uuid **not null unique** → `directories` (restrict)
- `kind` catalog_kind · `category` catalog_category · `name` · `home_url` · `submit_url` (check `^https?://`)
- `countries text[]` (empty = any; ISO codes from `src/lib/countries.ts`) · `reach text[]` ·
  `buyer text[]` · `offering text[]` (empty = any; same values as the brief) ·
  `industries text[]` (keywords matched against category/services, like `core_industries`)
- `pricing` catalog_pricing · `price_note` text (≤ 120, e.g. "Pro ≈ $149/mo") · `typical_link` link_kind
- `priority` smallint 1–3 (3 = must-have) · `benefits text[]` (ranking, citation, referral,
  ai_visibility, entity, reviews)
- `needs text[]` (address, phone_verification, postcard, video_verification, website, logo,
  photos, reviews, licence, payment, personal_profile) · `effort_minutes` · `approval_days`
- `how_to` text (≤ 2,000, short steps, plain text with line breaks) · `warnings` text (≤ 500)
- `managers_only` boolean (true for `marketplace_paid` and Wikidata) · `active` boolean ·
  `verified_at`, `verified_by` · `sort` int
- `suggested_by`, `suggested_from_client` (set null), `suggestion_status` (null, pending, accepted,
  declined): VA suggestions live in the same table with `active = false` until a manager accepts.
- `created_at/by`, `updated_at/by`
- Index on `(active, category)`; every foreign key indexed.

**`backlink_submissions`** (client × approved place)

- `id` · `client_id` (cascade) · `opportunity_id` **unique** → `backlink_opportunities` (cascade) ·
  `catalog_id` (set null) · `directory_id` (restrict)
- `status` submission_status · `block_reason` submission_block · `block_note`
- `assigned_to` → `team_members` (set null) · `follow_up_on` date (agency `YYYY-MM-DD`)
- `listing_url` (check `^https?://`, ≤ 2,000) · `link_kind` link_kind · `live_on` date ·
  `submitted_on` date
- `login_id` → `client_logins` (set null) · `cost_usd` numeric(10,2) · `cost_note`
- `spend_requested_usd`, `spend_approved_usd`, `spend_approved_by`, `spend_approved_at`
- `notes` (≤ 4,000) · `created_at/by`, `updated_at/by`
- Check: `status = 'live'` requires `listing_url` and `live_on`; `status = 'blocked'` requires
  `block_reason`.
- Partial index `(client_id, status)` and `(assigned_to, follow_up_on) where status in ('doing','submitted','blocked')`.

**`backlink_submission_events`** (history; the row sheet's timeline)

- `id` · `submission_id` (cascade) · `client_id` · `actor` · `at` · `from_status` · `to_status` ·
  `change jsonb` (fields changed, never secrets) · `note`.

**`backlink_opportunities` change:** the `source` check gains `'manual'`. **Coordinate with the AI
session:** it will likely add `'ai'` to the same check. Whoever lands second writes the full
list (`search, core, brief, ai, manual`). Every existing function filters on `source = 'search'`
for the cap of 30, so manual rows never touch Review.

**RLS**

- `backlink_catalog`: select for team members (`private.is_team_member()`); rows with
  `managers_only` are also visible, but picking them is refused for VAs in the RPC. No direct
  writes; RPCs only.
- `backlink_submissions`, `backlink_submission_events`: select through
  `private.can_see_client(client_id)`. Writes only through RPCs. No anon.

**Functions** (security definer, `search_path = ''`, explicit grants; mirror `src/lib/roles.ts`)

- `private.require_manual_worker(client)`: admin, manager or va **and** `can_see_client`.
- `pick_catalog_sites(p_client, p_catalog_ids uuid[])` → `{added, already, needs_approval, refused}`:
  - Worker check; client not paused/churned; ≤ 50 ids per call; active catalog rows only;
    `managers_only` rows refused for VAs.
  - Per row: upsert the opportunity on `(client_id, directory_id)`:
    - New: insert approved, `source = 'manual'`, `decided_by`/`decided_at`.
    - Pending or reserve (found by Standard/AI): set approved, **keep its source** and hits, set
      decided.
    - Already approved: no change ("already").
    - Rejected or filtered: **don't** flip silently; return it in `refused` with the reason, so
      the picker shows "Rejected on 3 Nov: Paid only. Restore?"
  - Then insert the submission (`on conflict (opportunity_id) do nothing`): status
    `needs_approval` when pricing is paid, membership or lead_fees, else `todo`; `assigned_to` =
    caller when the caller is a VA.
  - One history row per call (`backlink.manual_picked`, `{count, sites}`); a
    `backlink_spend_request` notification to managers when any row needs approval.
- `add_manual_site(p_client, p_url, p_name, p_type, p_note, p_suggest boolean)`:
  - Normalise in the app with `siteKeyOf()`; the RPC re-checks `^https?://`, length caps, and that
    the domain isn't the client's own or another agency client's.
  - Insert or select the `directories` row (`type_source = 'manual'`). A **blocked** site needs a
    manager: VAs get "This site is blocked for all clients (reason)".
  - Then the same opportunity + submission as above (`source = 'manual'`, no catalog id).
  - `p_suggest`: insert a catalog row with `active = false`, `suggestion_status = 'pending'`.
- `update_submission(p_id, p_patch jsonb)`: worker check per row; allowed keys only (status,
  block_reason/note, assigned_to, follow_up_on, listing_url, link_kind, live_on, submitted_on,
  login_id (must belong to the same client), cost_usd, cost_note, notes).
  - Transitions: VAs can't leave `needs_approval`. `live` needs a URL. Leaving `live` asks for a
    note in the app.
  - `submitted_on` defaults to today on Submitted and `live_on` defaults to today on Live
    (`private.agency_today()`).
  - One event row per change.
- `approve_submission_spend(p_id, p_amount, p_note)` / `decline_submission_spend(p_id, p_note)`:
  admin, manager. Approve sets `todo`; decline sets `skipped` with the note. Notifies the
  assignee.
- `bulk_update_submissions(p_ids uuid[], p_status, p_assigned_to)`: worker check per row; same
  rules; ≤ 100.
- `upsert_catalog_site(p jsonb)`, `retire_catalog_site(p_id, p_note)`,
  `review_catalog_suggestion(p_id, accept boolean, p jsonb)`: admin, manager. Retiring never
  deletes: catalog rows that submissions point to stay.
- `manual_tab_counts(p_client)`: counts per status, live this agency month, follow-ups due;
  RLS-respecting.
- **Trigger** `backlink_submissions_work_item` (security definer): on entering `live`, insert
  `work_items (client_id, kind 'backlinks', quantity 1, delivered_on = live_on, title = site name,
  url = listing_url (≤ 500, else null), source 'backlink', source_id = submission id, created_by)`.
  On leaving `live`, delete it; on a `live_on`/URL change, update it (`month` is generated from
  `delivered_on`). The enums already have these values (`0018`: `deliverable_kind 'backlinks'`,
  `work_source 'backlink'`).
- **Trigger** on `backlink_opportunities`: when an approved opportunity is moved back (restore or
  reject), its submission goes to `skipped` with an event, so a live link never outlives its
  approval silently. A live one is refused with "Take it off Live first".

### M3 `backlinks_catalog_seed`

- Seed rows from `10-manual-catalog.md`, all with `verified_at = null`.
  - Upsert the `directories` rows first (`on conflict (site_key)`): keep manual types, fill
    `submit_url` and `cost_type` only when empty, exactly like `0038`.
  - Plays (category O, "find a dealer", testimonials…) get a placeholder directory per play,
    e.g. site_key `play:local-chamber`. When the VA works one, the submission's `listing_url`
    holds the real site. Check that these keys never collide with `siteKeyOf` output: real keys
    never contain `:`.
- **Before seeding (Phase 0):** a VA or you checks the ★★★ rows by hand (≈ 45): the submit URL
  still works, the cost is right, and the link type. The rest stay "unverified".

### M4 `backlinks_manual_cron`

- pg_cron `backlinks-follow-ups` daily at 07:00 America/Phoenix, pure SQL, no HTTP.
  `private.backlink_follow_ups()` sends one `backlink_follow_up` notification per assignee with
  the count due today or overdue. It also flags anything `submitted` for 21+ days with no
  follow-up date.
- Then: `get_advisors` (security + performance) clean, regenerate `database.types.ts`.

---

## 3. Matching: "Suggested for this client" (`src/features/backlinks/manual/match.ts`, pure)

Inputs: catalog rows, the brief (`reach`, `buyer`, `offering`, topics), the business profile
(`country_code`, `primary_category`, `other_categories`, `services`, `service_area_business`,
`street`), and the client's existing submissions.

- **Hard filters:** inactive and retired rows out; `countries` must include the client's country
  (or be empty); `reach`, `buyer` and `offering` must overlap (or be empty); an industry-tagged row
  needs a keyword hit in category, services or topics; `managers_only` rows are hidden for VAs.
- **Score** (for order only): priority (3/2/1) × 40 + industry hit 20 + country-specific row 15 (a
  local AU directory beats a global one for an AU client) + benefits that fit the reach (local:
  citation/reviews; national: ranking/ai_visibility) 15 + already strong (authority ≥ 60) 10.
- **Reason chips** on each row: "Australia", "Local", "Conveyancing", "Must-have".
- **Warnings** from `needs` against the profile: "Needs a street address" when the profile has none
  or it's a service-area business; "Postcard verification (5–14 days)"; "Needs reviews first".
- Sections: **Already picked** (greyed, with status) · **Suggested** · **Other catalog sites**
  (everything else that passes the hard filters, plus a "Show sites for other countries" toggle).

Unit-test it in a throwaway Node script (scratchpad) against three made-up clients: an AU local
conveyancer, a US national B2B SaaS, and a UK local trade. Then check by hand that the top 20
for each looks right.

---

## 4. The Manual tab (UI)

Route: the same `backlinks/page.tsx`. The `mode === "manual"` branch renders `<ManualSearch>`
instead of `ModePlaceholder`. Set `soon: false` for `manual` in `MODE_META` (caption: "Pick
trusted sites and track every listing"). **Coordinate:** the AI session edits the same branch for
`mode === "ai"`. Keep each mode's content in its own component so the page file only switches.

URL params (`features/backlinks/manual/search-params.ts`): `mode=manual`, `stage`
(todo|doing|submitted|live|problems|all), `from` (catalog|standard|ai|hand|all; default
catalog+hand), `who` (me|anyone), `q`, `sheet` (submission id), `pick=1` (picker open).

Frame (static) and sections (each in `<Suspense>` with size-matched skeletons; dates only inside
Suspense or client components):

1. **PageHeader:** eyebrow client, "Backlinks", description; actions: **Add from catalog**
   (primary), **Add a site by hand** (outline), **Check site strength** (existing button, on the
   work list's ids).
2. `<ModeTabs mode="manual" />`
3. **StatStrip** (`manual_tab_counts`): To do · Doing · Submitted · **Live this month** (vs
   `clients.backlinks_target`, "8 of 20") · Problems (blocked + needs approval, warning tone) ·
   Follow-ups due. Each one is a link that sets `stage`.
4. **Listing kit** (collapsible card, open the first time): the business profile as copy-able
   fields with character counts: name, street, city, region, postcode, phone, website, public
   email, primary and other categories, services, service areas, hours, year founded, short
   description (first 160 chars, then 250, then full).
   - Red notes for missing fields ("No phone in the profile. Most directories need one") with a
     link to Edit details.
   - One line: "Use exactly these details everywhere. Different names or phone numbers hurt
     local rankings."
5. **Work list** (TanStack v9, client-side sort):
   - Columns: select · Site (name, host, category tag, "From Standard"/"From AI"/"By hand"
     tag) · Status (`StatusTag`) · Cost (pricing + price note) · Link (typical → actual once
     live) · Strength (existing band) · Assigned · Follow-up (date, overdue in warning) · Live
     URL (external link `rel="noopener noreferrer nofollow"`).
   - Bulk bar: Set status, Assign to, Follow up on, Check site strength.
   - Phones (375 px): cards instead of the table.
6. **Search helpers** (collapsible): links built from the brief's topics and the client's places
   (open in a new tab), grouped: Guest posts (`"<topic>" "write for us"`), Resource pages
   (`intitle:resources "<topic>"`), Local lists (`best <service> <city>`), Directories
   (`"<city>" "add your business"`), Competitors (Ahrefs free checker per competitor domain from
   the brief, when there is one). Plus the VA toolkit links.
   - Note: "These open Google in your browser; they don't use DataForSEO."

**Add from catalog** (Sheet, right side; full screen on phones):

- Search box, filter chips: Category · Cost (Free / Freemium / Paid / Lead fees / Membership) ·
  Link (Follow / Any) · Priority · "Suggested only" (on by default).
- Rows: checkbox, name + host, reason chips, cost, typical link, strength band, needs warnings, a
  "How it works" disclosure (how_to, warnings).
- Footer: "Add 12 sites: 9 to do, 3 need a manager's approval ($)" → `pick_catalog_sites` →
  toast and the list refreshes.
- Refused rows show inline: "Rejected in Standard on 3 Nov (Paid only). Restore and add"
  (restore uses `review_backlink_opportunities` with `restore`, then picks again).

**Add a site by hand** (Dialog): URL (required), name, type (`TYPE_LABELS`), cost (Free/Paid/Not
sure), note, "Suggest this site for the catalog" (checkbox). Shows `siteKeyOf` output live
("Will be saved as: chambermaster.com/…").

**Row sheet** (`?sheet=`):

- Header: site name, host link, category, cost, strength, spam.
- **Status stepper** (To do → Doing → Submitted → Live) plus Blocked… (reason + note) and Skip.
- Fields: assigned to, follow-up date, submitted on, live on, listing URL, actual link type, cost
  paid, notes.
- **Login:** pick an existing client login or "Save a new login" (vault form, prefilled with the
  site name and URL); shows username and 2FA, never the password (reveal goes through the
  existing vault reveal with `vault.reveal`).
- **How to:** catalog `how_to`, `needs`, `warnings`, `approval_days`, `verified_at` ("Checked by
  Ana on 12 Nov" / "Not checked yet: tell a manager what you find"), plus a "Report a problem
  with this catalog entry" button (adds a note to a catalog suggestion queue).
- **Listing kit** (compact, same copy buttons).
- **Spend** (paid rows): requested amount; managers see Approve / Decline.
- **Timeline** from `backlink_submission_events`.

**Empty states** (every list needs one):

- No picks yet: "Start with the must-haves for <client>. 14 catalog sites match their brief."
  [Add from catalog]
- No brief: still works, with suggestions from country and profile only. Note "Write the
  strategy brief for better suggestions".
- VA without a task for the client: the existing can_see_client message.
- Stage with nothing in it ("Nothing submitted yet").

Design rules (`docs/design-system.md`): tokens only, `StatusTag`/`StatusDot` tones (todo neutral,
doing info, submitted brand, live success, blocked danger, needs_approval warning, skipped
muted), `StatStrip`, violet only for primary actions and selection, `tabular-nums`, light/dark,
375 px.

---

## 5. Catalog page (agency level): `/backlinks/catalog`

- `src/app/(app)/backlinks/catalog/page.tsx` (thin) + `src/lib/navigation.ts` entry (admin,
  manager, va read; edit admin/manager).
- Table of all catalog rows: filters (category, country, cost, link, priority, active,
  unverified), search, "used by N clients", "live for N clients", authority.
- Edit sheet: every catalog field; **Mark as checked today** (sets `verified_at/by`);
  **Retire**.
- **Suggestions** tab: VA suggestions and problem reports → Accept (opens the edit form) or
  Decline (note).
- **Check strength for the whole catalog** (managers): one strength check over every catalog
  `rank_target` that's older than 30 days. Needs a catalog-level version of
  `request_strength_check` with no client, budget checked the same way: about $0.03 for ~200
  sites.
- Export CSV (for sharing the list with new VAs).

---

## 6. Permissions (`src/lib/roles.ts` + RPCs)

| Permission | Roles | What |
| --- | --- | --- |
| `backlinks.manual` | admin, manager, va | Pick from the catalog, add by hand, update submissions (VAs: clients in their tasks) |
| `backlinks.spend` | admin, manager | Approve or decline spend; pick `managers_only` rows |
| `backlinks.catalog` | admin, manager | Edit, retire and verify catalog rows; review suggestions; catalog strength check |
| (read) | admin, manager, va, viewer | See the Manual tab and the catalog (writers don't see Backlinks, as today) |

Add `PERMISSION_LABELS` for each. The RPCs mirror these exactly.

---

## 7. Activity, notifications, Overview

- `src/features/team/activity.ts`: `backlink.manual_picked`, `backlink.manual_added`,
  `backlink.submission_status` (`{site, from, to}`), `backlink.went_live`,
  `backlink.spend_approved` / `declined`, `catalog.site_saved` / `retired` /
  `suggestion_reviewed`.
- `notifications-bell.tsx`:
  - `backlink_follow_up` → "5 backlink follow-ups due for you" →
    `/clients/<slug>/backlinks?mode=manual&stage=submitted&who=me` (or the VA's first client).
  - `backlink_spend_request` → "Ana asked to spend on 3 sites for Smaver" →
    `?mode=manual&stage=problems`.
- Overview: live submissions show up through `work_items` (`kind = 'backlinks'`) with no Overview
  code change.
- Tasks: after D5 ships, turn `counts_as` off on backlink task types (one migration/update; the
  guard trigger already stops VAs from changing it). Optional later: "Create a task for these 12
  sites" from the bulk bar.

---

## 8. Files

```
supabase/migrations/M1_backlinks_manual_kinds.sql
supabase/migrations/M2_backlinks_manual.sql
supabase/migrations/M3_backlinks_catalog_seed.sql
supabase/migrations/M4_backlinks_manual_cron.sql
src/features/backlinks/manual/
  constants.ts        labels, status tones, category/pricing/link labels, stage → statuses
  match.ts            pure matching + reasons + needs warnings
  search-helpers.ts   pure: brief → helper links (operators allowed here only)
  listing-kit.ts      pure: profile → kit fields, missing-field notes, description cuts
  schemas.ts          zod for pick / add / update / spend / catalog upsert
  queries.ts          server-only: catalog for client, work list, counts, logins for client
  actions.ts          Server Actions, each starts with requirePermission(...)
  search-params.ts
  components/
    manual-search.tsx       the tab (sections in Suspense)
    work-list.tsx           table + cards + bulk bar
    catalog-picker.tsx      the Add from catalog sheet
    add-site-dialog.tsx
    submission-sheet.tsx    row sheet (stepper, fields, login, how-to, spend, timeline)
    listing-kit.tsx
    search-helpers.tsx
src/features/backlinks/catalog/ (agency page: queries, actions, components/catalog-table.tsx, catalog-edit-sheet.tsx)
src/app/(app)/clients/[clientSlug]/backlinks/page.tsx   manual branch only
src/app/(app)/backlinks/catalog/page.tsx
src/features/backlinks/components/mode-tabs.tsx          manual: soon false, new caption
src/lib/navigation.ts · src/lib/roles.ts · src/features/team/activity.ts
src/components/layout/notifications-bell.tsx
docs/architecture.md (Manual Search section) · CLAUDE.md (rule below)
```

**CLAUDE.md rule to add:** Manual Search writes picks only through `pick_catalog_sites` /
`add_manual_site` and submissions only through `update_submission` /
`bulk_update_submissions` / the spend RPCs. `work_items` for backlinks come only from the
submission trigger. Logins only via `client_logins` (never in notes). Search-helper operators
stay in `manual/search-helpers.ts`, never in `backlink_footprints`. Catalog rows are retired,
never deleted.

---

## 9. Phases

**Phase 0: decisions and catalog check (no code)**

- You answer Q1–Q5 below.
- Paste the four Reddit threads (or allow reading them in your Chrome). Add anything new to
  `10-manual-catalog.md`.
- Hand-check the ★★★ rows (submit URL, cost, link type).
- **Done when:** the catalog doc is final for seeding.

**Phase 1: database**

- M1–M4, rolled-back SQL tests through the MCP:
  - VA can't pick for a client they can't see.
  - VA can't pick a `managers_only` row or leave `needs_approval`.
  - Picking twice adds nothing.
  - Picking a pending Standard place approves it and keeps its source.
  - Picking a rejected place is refused with the reason.
  - Live without a URL is refused.
  - Live → `work_items` row; un-live → row gone; `live_on` change moves the month.
  - Restore of an approved opportunity skips its submission; a live one refuses.
  - Login from another client refused.
  - Follow-up function sends one notification per assignee.
- Advisors clean; types regenerated.
- **Done when:** every test passes, and nothing in Standard or AI changes (Review cap, store RPCs).

**Phase 2: the Manual tab (core)**

- Work list, StatStrip, listing kit, catalog picker with matching, row sheet (status, fields,
  timeline), permissions, activity.
- **Done when:** a VA with a task for Test Client picks 10 suggested sites, works one to Live,
  and the Overview counts 1. Lint, typecheck and build pass.

**Phase 3: by hand, logins, spend, helpers**

- Add a site by hand (+ suggestion), vault login link, spend approval flow with notifications,
  search helpers, strength button on the work list.
- **Done when:** a paid pick waits for a manager, approve notifies the VA, and a declined one is
  skipped with the note.

**Phase 4: catalog page**

- `/backlinks/catalog` table, edit, verify, retire, suggestions, whole-catalog strength check,
  CSV.
- **Done when:** a manager edits a row and every client's picker shows the change; a retired row
  disappears from pickers but stays on old submissions.

**Phase 5: follow-ups and polish**

- Daily follow-ups cron, notifications, `counts_as` off on backlink tasks (after Q2), mobile cards,
  dark mode, empty states, docs + CLAUDE.md.
- **Done when:** the live test below passes as manager, VA (with and without a task), writer and
  viewer.

**Later (not now)**

- Automatic live check and monthly lost-link check with the AI session's safe fetcher (D7 v2).
- Claude writes per-site descriptions (the 160/250/750 lengths) from the profile, saved per
  client.
- "Plan of the month": pick 20 against `backlinks_target` automatically from Suggested.
- Bulk handoff of a citation batch to BrightLocal.

---

## 10. Risks this prevents

| Risk | Prevention |
| --- | --- |
| A live link counted twice (task tick + submission) | `work_items` only from the trigger; unique `(source, source_id, client)`; `counts_as` off on backlink tasks (Q2) |
| VA spends client money | `needs_approval` set by the database for paid, membership and lead fees; only managers approve; `managers_only` marketplace rows |
| Link-scheme risk | Marketplaces managers-only with a warning; play rows explain safe versions; scholarships flagged |
| Inconsistent NAP across directories | One listing kit from the approved business profile, missing-field warnings, a copy button for every field |
| Passwords in notes | Login picker through the vault only; the notes field help says so |
| Stale catalog (prices, dead sites, link types change) | `verified_at`, "Not checked yet", problem reports, retire instead of delete, the actual link type saved per submission |
| Overwriting Standard/AI decisions | The pick RPC never flips rejected or filtered rows; it keeps the original source and hits; Review cap untouched (`source = 'search'` only) |
| VA sees or edits another client | Every RPC checks role and `can_see_client` per row; the catalog carries no client data |
| Merge conflict with the AI session | Separate components per mode; next free migration number; the combined `source` check list (§2) |
| Server fetching untrusted URLs | v1 never fetches; v2 only through the SSRF-safe fetcher |
| Cache Components errors | Static frame + Suspense sections; dates only inside Suspense or client components; the build checks it |

---

## 11. Verification

- Database: the Phase 1 SQL tests (rolled back), advisors clean.
- Pure: scratchpad Node script for `match.ts`, `search-helpers.ts` and `listing-kit.ts` with the
  three made-up clients.
- Live (Test Client):
  - Manual tab → picker shows Suggested → add 10 (2 paid → Needs approval).
  - Manager approves one, declines one.
  - Work one through Doing → Submitted (follow-up date) → Live with URL → Overview shows +1.
  - Move it back → Overview −1.
  - Add a site by hand with "suggest" → the manager accepts it in the catalog → it shows in the
    picker for another client.
  - VA account, writer (no page) and viewer (read only).
  - 375 px and dark mode.
- Then `npm run lint`, `npm run typecheck`, `npm run build`.

---

## 12. Questions for you

- **Q1. One work list for every approved place?** (D4) Recommended: yes. The Manual tab tracks
  submissions for places approved in Standard and AI too, filtered by source, with catalog picks
  shown by default. The alternative is Manual tracking only its own picks, with Standard/AI
  approvals tracked nowhere until later.
- **Q2. Live listings count toward the monthly target, and `counts_as` goes off on backlink
  tasks?** Recommended: yes, when Phase 5 ships.
- **Q3. Spend rule.** Recommended: any paid, membership or lead-fee site needs a manager's yes;
  marketplaces are managers-only. Or: VAs may spend up to $X without approval?
- **Q4. Countries for the first seed.** Recommended: US, AU, UK, CA plus the global rows. Any
  other country your clients are in?
- **Q5. Paid guest-post marketplaces in the catalog at all?** Recommended: yes, managers-only with
  the warning, because the team uses them and it's better to log the spend. Or: leave category R
  out.
