# Plan: Backlinks searches by target places, not the client's location

## Context

Today, **Find places** builds every Google search from the client's own city (`clients.city` and `region`). The search runs from that city's location code, which is borrowed from Rankings settings (`ensureRankSettings` in `discovery.ts → loadContext`).

The database also refuses to search without a client city (`request_backlink_discovery`). The screenshot shows the result: "found by Google searches from Skopje, Kumanovo, MK".

**What you want:** the team first enters **every place where the client should be found**, and the searches run for those places. The client's own location no longer matters.

**Your choices:**
- **Place types:** cities, regions (state, province, county) **and** whole countries.
- **Running:** Find places opens a picker. The team ticks which places to search and sees the number of searches and the cost first. A run is capped at 60 searches (about $0.36), and the same place can't be searched again within 24 hours.

**What already helps:**
- **Location codes:** every DataForSEO location (country, state, county, city, DMA…) is cached in `dfs_locations` (free list, `syncCountryLocations` in `src/features/rankings/locations.ts`).
- **Search cache:** `serp_result_cache` is already keyed by `location_code`, so a place another client searched is free for 90 days.
- **Saved decisions:** opportunities are unique per client and site, so one directory found for two places stays one row, and decisions made on it are never changed.
- **Existing data:** nothing to migrate. No real runs exist yet; Stefan Novachki's page is empty.

## How it will work

```
1. Team adds target places (search box: country → city / region / whole country)
2. Find places → dialog: tick places (new ones pre-ticked) → "≈ 36 searches, about $0.22" → Start
3. request_backlink_discovery(client, place_ids[]) → checks → run queued with those places
4. Job: for each place, searches worded for it ("scottsdale az chamber of commerce",
   "arizona business directory", "uk business directory") and run FROM that place's location code;
   industry searches once per run; cache per place; classify per place; store
5. Table shows which place(s) each site was found for, with a filter by place
```

## Database: migration `0036_backlink_targets.sql`

### New table `backlink_targets` (the places a client wants to be found in)
- **Identity:** `id`, `client_id` (cascade), `location_code` (Google location code), `location_name` (DataForSEO's full name, e.g. "Scottsdale,Arizona,United States").
- **What kind of place:**
  - `kind`: `city`, `region` or `country`, from DataForSEO's type. City, Municipality, Neighborhood → city; State, Province, Region, County, DMA Region → region; Country → country.
  - `country_iso`, `region_name`, `region_code` (AZ, ON, NSW via `src/lib/regions.ts`), `city`.
- **Search wording:**
  - `search_name`: the words searches use, defaulting to "scottsdale az", "arizona" or "united kingdom". The team can edit it, for example "kumanovo north macedonia".
  - `label`: display text, e.g. "Scottsdale, AZ".
- **State:** `active` (unticked places are kept but not searched), `last_searched_at`, `created_by`, `created_at`.
- **Constraints:**
  - Unique `(client_id, location_code)`.
  - At most **25 active places per client**, enforced by a trigger with a clear message.
- **RLS:**
  - Select through `private.can_see_client`.
  - No direct writes: changes go through the functions below. Anon access revoked.

### Changes to existing tables
- `backlink_runs`: add `target_ids uuid[]`, the places this run covers.
- `backlink_run_queries`: add `target_id` (nullable, set null on delete; null = an industry search not tied to a place). Unique `(run_id, query_norm)` becomes `(run_id, target_id, query_norm)`, so the same words for two places are two searches.
- `backlink_opportunities`: add `target_ids uuid[]`, the places it was found for. The store function merges it, and core listings stay empty.
- `filter_reason`: rename the meaning of `other_state` to "Mentions a different area". The value stays, so no enum change.

### Functions (security definer, `search_path = ''`, explicit grants)
- **`add_backlink_target(client, location_code, search_name)`:**
  - Requires `backlinks.discover` (admin, manager or VA, and `can_see_client`).
  - Looks the code up in `dfs_locations` (source google). An unknown code is refused.
  - Fills kind, country, region, city, label and the default `search_name`.
  - Logs `backlink.target_added`.
- **`update_backlink_target(id, search_name, active)` and `remove_backlink_target(id)`:**
  - Removing a place keeps the history of past runs.
  - Logs `backlink.target_removed`.
- **`request_backlink_discovery(client, target_ids uuid[])`** (replaces the one-argument version):
  - Removes the client-city requirement.
  - Requires 1 or more active places of this client.
  - Refuses a place searched in the last 24 hours, naming it and the time.
  - Estimates the searches with the same rules as the job (below); more than 60 refuses with "Pick fewer places (this is about N searches; 60 at most)".
  - Keeps the monthly run limit, both budgets and the one-open-run rule.
  - Saves `target_ids` on the run and sets `last_searched_at` on those places.
- **`backlink_quota`:** adds a `targets` array (id, label, kind, active, last searched, searchable from).
- **`dfs_store_backlink_candidates`:** each item carries `target_ids`. They're merged into the opportunity's array; nothing else about decided rows changes.

**Then:** rolled-back tests, advisors, and regenerated `database.types.ts`.

## Searches (`footprints.ts`, `discovery.ts`)

**New `{place}` placeholder** = the place's `search_name`. A new seed (`backlink_footprints`, same table, `scope` as today) replaces the city-based templates. The old ones are set `active = false`, not deleted, so old hits keep their footprint.
- **Place searches (per place, at most 7):**
  - `{place} business directory`
  - `add your business {place}`
  - `submit business listing {place}`
  - `{place} chamber of commerce`
  - `{place} business association`
  - `{place} local business listings`
  - `{place} community news`
- **Service searches (per place, at most 5, using up to 3 services):**
  - `{service} {place} directory`
  - `best {service} {place}`
  - `top rated {service} {place}`
  - `{service} contractors {place}`
- **Industry searches (once per run, not tied to a place, run from the first ticked place's location code):**
  - `{industry} association {region}` (only for region or city places that have a region)
  - `{industry} directory`
  - `{industry} blog write for us`
  - `{industry} guest post`
- **Run size:** at most 12 searches per place plus 4 industry searches, capped at 60. The estimate in the database and in the dialog uses the same formula. `buildQueries` gets a `perTarget` limit and returns `target_id` on each query.

**`discovery.ts`:**
1. **`loadContext`:**
   - No longer reads the client's city and no longer calls `ensureRankSettings`/`syncAndResolve`.
   - Loads the run's places, plus the services, industry and domain from the business profile and client.
   - Language stays `en`, as in Rankings today; per-country language is a later upgrade.
2. **Searching:** each query uses its place's `location_code` for the Live search and the cache lookup. The cache already keys by location.
3. **Competitors:** one Maps search per place ("{first service} {place}", cached per place).
4. **Classifying** uses the context of the place that found the result, not one global city:
   - **Local:** the result mentions the place's city, or region for region places, or country for country places.
   - **Different area:** for US, Canadian and Australian places, mentioning another state or province of that country hides the result, unless that state is another of the client's places.
   - `isLocal` and the hits come from the query's own place.
5. **Storing:**
   - Each place carries the `target_ids` of the queries that found it.
   - `directories.city/region/country_code` are filled from that place, only when it's a city place.
6. **Core listings:** for the **countries of the searched places**, not the client's country.
7. **The run's `params`:** the place labels and search names, shown on the page.

`processBacklinkRuns`, the claim, the heartbeat, resume and budget checks are unchanged.

## Page (`/clients/[slug]/backlinks`)

- **Header:**
  - "Places to get listed, found by Google searches for 4 places: Scottsdale, Tempe, Arizona, United Kingdom · last search Mon 16 Nov".
  - No client location.
- **New section "Where the client wants to be found"** (above the table, always visible):
  - **Each place in a list:** label, kind tag (City, Region, Country), the search words (editable inline), "Searched 2 days ago · 14 places", an active checkbox and a remove action.
  - **"Add a place":** country (`CountryPicker`, default the client's country) plus a search box over `dfs_locations` for that country, with the type shown ("City", "State", "Country"). The country itself is offered as the first result.
    - If that country's list isn't downloaded yet, the server action downloads it first (`syncCountryLocations`, free, a few seconds) and says "Loading places for North Macedonia…".
  - **Suggestions:** one-click chips from the client's city and the service areas in their business profile, shown only when nothing is added yet. They're never added automatically.
- **Find places:** opens a dialog.
  - One checkbox per active place. New and never-searched places are pre-ticked; places searched in the last 24 hours are disabled with "again from Tue 9:40 AM".
  - A live estimate: "About 36 searches, about $0.22 (searches another client ran lately are free)". Over 60 disables Start with "Untick a place".
  - Admins, managers and VAs can start it (`backlinks.discover`).
- **Table:**
  - A new **Found for** column with place chips (core listings say "Core listing").
  - A **Place** filter in the toolbar, in the URL as `?place=<id>`.
  - The row sheet lists the searches that found the site, grouped by place.
- **Running banner:** "Searching Google: 12 of 36 · Scottsdale, Tempe…".
- **Empty states:**
  - No places yet: "Add the places where the client should be found, then run Find places."
  - Places added but no search yet: the Find places button.

**Files:**
- `src/features/backlinks/components/targets-panel.tsx` (new)
- `src/features/backlinks/components/find-places-dialog.tsx` (new)
- edits in `backlinks-view.tsx`, `place-sheet.tsx`, `bits.tsx`, `queries.ts` (targets and the place filter) and `actions.ts`:
  - `addTarget`, `updateTarget`, `removeTarget`
  - `searchTargetLocations(country, q)`, which downloads the country list when missing
  - `findPlaces(clientId, targetIds)`
- the page header in `src/app/(app)/clients/[clientSlug]/backlinks/page.tsx`

**Reuse:**
- `CountryPicker` (`src/components/common/country-picker.tsx`)
- `regionCode`/`regionName` (`src/lib/regions.ts`)
- `syncCountryLocations` (`src/features/rankings/locations.ts`)
- `formatUsd`
- `StatusTag`
- the Rankings location search pattern (`searchLocations` in `src/features/rankings/actions.ts`)

**Elsewhere:**
- History wording for `backlink.target_added` and `backlink.target_removed`; the run's history line names the places.
- `docs/plans/backlinks/06-target-places.md` (this plan), `docs/architecture.md` and the `CLAUDE.md` Backlinks rule ("searches come from `backlink_targets`, never the client's city").
- **Not changed:** Rankings still checks from the client's city (it's about where the client ranks today). Sharing these places with Rankings can be a later choice.

## Problems this handles

| Risk | How |
|---|---|
| Cost grows with places | The team picks the places per run; the estimate is shown first; 60 searches at most per run, enforced in the database; 24 hours per place; the monthly limit and budgets are unchanged; the shared cache per place |
| Same words, different place | `target_id` in the query's unique key and the place's own `location_code` |
| "Peoria" in the wrong state, or a place ambiguous abroad | `search_name` includes the region or country and can be edited; the "different area" filter uses each place's region |
| A site found for two places | One row per client and site, with `target_ids` merged; decisions kept |
| Removing a place | Searched places keep their history (set null), the rows stay, and the filter still works for kept ids |
| Unknown or ambiguous location | Only codes from DataForSEO's own list can be added (checked in the database) |

## Verification

- **Database** (rolled-back SQL):
  - Adding a place refuses a code that isn't in the list, and refuses the 26th place.
  - Request: no places → refused; a place searched in the last 24 hours → refused with its name; more than 60 searches → refused; a VA without the client → refused.
  - The store merges `target_ids` and doesn't touch a decided row.
- **Pure functions:** `buildQueries` for a city, a region and a country place: the counts, the wording and the cap.
- **Code:** typecheck, lint and build.
- **Live** (you sign in, ~$0.10–0.20 of your DataForSEO balance, your OK first):
  1. Add "Scottsdale, AZ" and "Arizona" to a test client.
  2. Run Find places with both ticked and check the estimate matches the searches made and `dfs_calls`.
  3. Check that rows show "Found for" and that the filter works.
  4. Running again within 24 hours is refused.
  5. Check phone width and dark mode.

Then commit and push.
