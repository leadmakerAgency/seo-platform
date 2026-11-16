# Plan: Add client becomes its own page (`/clients/new`)

## Context

Adding a client today is a small dialog on the Dashboard (`src/features/clients/components/add-client-dialog.tsx`). It has these fields:
- name, website, city
- region (free text), country (6 countries only), industry
- account manager, and 3 monthly targets

Everything else about the business comes later, through the client's onboarding link. The team can't record what they already know from the sales call, and the client has to type it all again.

**Goal: a full page that:**
- Covers every country in the world, with the right state, province or county field for the country.
- Captures everything the team already knows. **Your choice:** the essentials are required, everything else is optional.
- Pre-fills the client's onboarding wizard, so the client only confirms the details.
- Creates the onboarding link straight away and opens the client's Onboarding page with the link ready to send. **Your choice**, with a checkbox to skip it.
- Saves everything in **one database transaction**, so a half-created client is impossible.

**Current state, from exploring the code:**
- **Countries:** `COUNTRY_NAMES` in `src/lib/format.ts` has 6 countries. It's used by:
  - the add and edit dialogs
  - the Dashboard filter
  - the onboarding wizard (`business-step.tsx`)
  - `clients/schemas.ts` (`z.enum`)
  - The database already accepts any 2-letter code: `clients.country_code` is checked against `^[A-Z]{2}$`.
- **Where team-entered business info goes:** `client_business_profiles` is the team-approved profile that the rest of the app reads. Rankings takes its topic terms from it, and Backlinks uses it too.
  - It only has a select policy, so writes go through security-definer functions, as `apply_onboarding_profile` does.
  - The wizard pre-fills only from `onboarding_business_details` (`onboarding_get` → `business`). Otherwise it starts blank, apart from the name and country "US".
- **Onboarding links:** created by `createOnboardingLink` (`src/features/onboarding/actions.ts`, `newToken()`). There is one active link per client (unique index).
- **Edit details:** `editClientSchema` (`src/features/overview/schemas.ts`) extends `addClientSchema`. It adds stage, `startedOn`, package (`PACKAGES`: SEO, GEO, SEO + GEO, Custom) and the 6 targets.

## The page

**Route:** `src/app/(app)/clients/new/page.tsx`.
- Only people with `clients.create` (admins and account managers) can open it; everyone else is redirected to their home page.
- The Dashboard's "Add client" and "Add your first client" buttons become links to it.

**Layout:**
- Header: "Add client", with the description "Fill in what you know. The client confirms the rest in their onboarding link."
- One form in numbered sections.
- On wide screens, a sticky side column with:
  - the section list, showing which sections are complete or missing required fields
  - a "What happens next" box
- A sticky bottom bar with **Cancel** and **Add client**. Cancel asks before throwing away typed changes.
- It follows `docs/design-system.md`: `Section` titles, `Field` components, 32px controls, and no cards inside cards.

| Section | Fields (* = required) | Saved to |
|---|---|---|
| **1. Business** | Business name*, Website* (with a "No website yet" checkbox), Main category / industry*, Business phone, Public email | `clients` (name, website, industry) + profile (business_name, website, primary_category, phone, public_email) |
| **2. Location** | Country* (search all countries), Street address, City*, State / Province / County (required for the US, Canada and Australia), ZIP / Postcode, a "Visits customers (no shop front)" switch, Service areas (chips) | `clients` (city, region, country_code) + profile (street, city, region, postal_code, country_code, service_area_business, service_areas) |
| **3. Services** | Services* (chips, at least 1), Other categories (chips), Year founded, Short description | profile (services, other_categories, year_founded, description) |
| **4. Main contact** | Name*, Role, Email*, Phone, Preferred contact (email, phone, text, WhatsApp) | profile (contact_*) |
| **5. Plan** | Package, Client since (default: today, Phoenix time), Account manager (default: me), and the monthly targets for keywords, backlinks, articles, Google posts, review requests and AI fixes (defaults: the current values) | `clients` (package, started_on, owner_id, *_target), stage `onboarding` |
| **6. Onboarding link** | Checkbox "Create the onboarding link now" (on by default) | `onboarding_links` |

**Field details:**
- **Country picker** (`src/components/common/country-picker.tsx`):
  - A Popover with a Command list.
  - The common countries (US, CA, GB, IE, AU, NZ) are pinned at the top, then all countries A–Z.
  - It searches by name, code and common names (UK, USA, UAE…).
  - The same picker is used in Edit details and in the Dashboard country filter.
- **Labels follow the country:**
  - The State field is called State, Province, County or Region.
  - The postcode field is called ZIP code, Postcode or Postal code.
  - The US, Canada and Australia get a dropdown; other countries get free text.
  - Regions are stored as the short code (AZ, ON, NSW), matching the existing data such as "AZ".
- **Website:** reuses the existing normalizing and checks in `clients/schemas.ts`.
  - On blur, a small server action checks whether another client already has that domain. If so, it shows "Already a client: King Air (open)". This is a warning only, not a block.
  - "No website yet" saves it empty. Rankings and Backlinks already handle a missing domain.
- **Chips inputs:** reuse the pattern from the Rankings settings: Enter or comma adds a chip, × removes it.
- **Validation:** the same zod schema runs in the browser and in the action. Errors appear under each field, and on submit the page scrolls to the first section with an error.

**After saving:**
- With the link: open `/clients/<slug>/onboarding` with a toast "King Air added. Copy the onboarding link below and send it to John."
- Without the link: open the Overview.

## Countries and regions (shared, used everywhere)

- **`src/lib/countries.ts`:** every ISO 3166-1 country (249), as a static English list (no runtime `Intl`, so the server and browser render the same).
  - Exports `COUNTRIES`, `COMMON_COUNTRIES`, `countryName`, `isCountryCode` and search aliases.
  - `src/lib/format.ts` re-exports `countryName`/`countryShort` from it, so existing imports keep working.
- **`src/lib/regions.ts`:**
  - US states (moved from `US_STATES` in `src/features/rankings/constants.ts`), Canadian provinces and territories, and Australian states and territories.
  - Plus `regionLabel(country)`, `postalLabel(country)` and `regionName(country, code)`.
- **Update the existing users of the old 6-country list:**
  - `clients/schemas.ts`: zod enum → `isCountryCode`.
  - The Edit details dialog: picker plus region dropdown.
  - The Dashboard filter.
  - The onboarding wizard's country `<select>`: native select, common countries first through an `<optgroup>`, since it's the client-facing page with big touch targets.
  - Rankings `resolveCity` and Backlinks `stateOf`: use `regions.ts`, so "ON" or "NSW" match DataForSEO's full names, as "AZ" already does.
- **Note:** Rankings checks stay in English (`rank_settings.language_code = 'en'`). For a country DataForSEO doesn't cover, the location stays unset and the existing "Pick the location in Settings" notice shows. Language per country can be a later upgrade.

## Backend (Supabase): migration `0035_create_client.sql`

**`public.create_client(p jsonb, p_link_token text default null) returns jsonb`** is a security-definer function, so the whole thing runs in one transaction:
1. **Checks:**
   - `private.has_role('{admin,manager}')`, otherwise error 42501.
   - Validates the required fields and the 2-letter country.
   - The table checks enforce lengths and formats.
2. **Slug:** takes the base slug from the app, which skips reserved words (`new`, `search`). It tries `base`, then `base-2`, `base-3`…, re-trying on unique violation, which also covers two people adding the same name at once.
3. **Inserts:**
   - `clients`: stage `onboarding`, package, started_on, owner, all 6 targets, created_by.
   - `client_business_profiles`: everything the team entered, with `updated_by` set to the team member.
   - `client_onboarding` (`on conflict do nothing`).
4. **Link:** when `p_link_token` is given, inserts `onboarding_links` (token made by the existing `newToken()` in the app, 30-day expiry as today).
5. **History:** `activity_log` gets `client.created` with meta `{ name, onboarding_link: bool }`.
6. **Returns** `{ id, slug }`.

**Grants:**
- `create_client` is executable by `authenticated` only (anon revoked).
- Then run the advisors and regenerate `database.types.ts`.

**Wizard pre-fill:** update `public.onboarding_get` so that `business` falls back to the team profile (`client_business_profiles`) when the client hasn't saved anything yet, with a flag `business_from_profile: true`.
- In `business-step.tsx`, when that flag is set, the first open queues all pre-filled values once. This extends the existing "prefilled" effect, which today only saves the name and country.
- The client's copy then holds them, the step's status is right, and the onboarding review still compares the client's answers with the team profile as it does today.

## App code

- **`src/features/clients/schemas.ts`:** `newClientSchema` (the sections above, with the required rules), `slugify` with reserved words, and `addClientSchema` kept for Edit details (country rule updated).
- **`src/features/clients/actions.ts`:**
  - `createClient(input, { createLink })`:
    - `requirePermission("clients.create")`
    - zod validation
    - `slugify`
    - `newToken()` when a link is wanted
    - `rpc("create_client")`
    - `refresh()`
    - returns `{ slug, name, contactName }`, or field errors
  - `findClientByWebsite(website)`: domain check, returns name and slug only (through RLS).
  - The old `addClient` is removed.
- **New components** in `src/features/clients/components/`: `new-client-form.tsx` (client component, `react-hook-form` + zod as in `log-work-dialog.tsx`, `useWatch` per lint rules), `chips-input.tsx` and `region-field.tsx`.
- **`src/app/(app)/clients/new/page.tsx`:**
  - Static frame plus `<Suspense>` content.
  - Reads the member and the team list (`getTeamMembers`) for the account manager picker.
  - Redirects people without permission.
- **Header and sidebar:**
  - `site-header.tsx`: the breadcrumb shows "Clients › Add client" when the path is `/clients/new`.
  - `shell-context.tsx`: doesn't try to load a client called "new".
- **Removed:** `add-client-dialog.tsx`. The Dashboard buttons become `<Link href="/clients/new">`.
- **Docs:** `docs/architecture.md` (route table, `create_client`), the plan saved as `docs/plans/add-client-page.md`, and a `CLAUDE.md` rule: "Create clients only through `create_client`; countries and regions only from `src/lib/countries.ts` and `src/lib/regions.ts`".

## Verification

**Database** (rolled-back SQL tests):
- An admin creates a client: the client, profile, onboarding row, link and history line all exist.
- The second "King Air" gets `king-air-2`.
- A VA or viewer is refused.
- A bad country or a missing name raises an error and nothing is left behind.
- `onboarding_get` returns the profile values with the flag.

**Code:** typecheck, lint and `next build`.

**Live** (you sign in; I use the browser pane):
1. Add a test client in Kumanovo, North Macedonia, with services and a contact. Check that the Onboarding page has the link and the toast.
2. Open the link and confirm the wizard is pre-filled and the business step shows as done.
3. Add a US client and confirm the state dropdown, the ZIP label and the duplicate-website warning.
4. Check that Edit details and the Dashboard filter show all countries.
5. Check that the Rankings and Backlinks pages for the new client still load.
6. Check phone width and dark mode.
7. Delete the test clients afterwards (admin, with your OK).

Then commit and push.
