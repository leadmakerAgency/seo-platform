# 12 · Shared backlink setup (brief + places) for all three tabs

Status: built (migration `0051`: `public.backlink_setup` returns `{missing, targets}`).

## Why

Two inputs drive every way of finding backlinks:

- **The strategy brief**: reach, buyer, offering, topics, kinds of sites, exclude terms and notes.
- **The places**: "Where the client wants to be found".

Today they are spread out:

| Tab | Brief | Places |
|---|---|---|
| Standard Search | Its own summary card, plus the `/strategy` page | Its own `TargetsPanel` |
| Shockwave AI Search | A second copy of the summary card | A second `TargetsPanel` |
| Manual Search | Read silently in `getManualData` for catalog matching | Read silently for the countries |

Each tab also loads both itself, with three separate queries.

The goal:
- **One setup** for the client, drawn once above the tabs and edited in one place.
- **Every tab reads it**, instead of loading it itself.
- **Required:** until the setup is complete, none of the tabs can be opened.
- **Opened on a button:** the setup is not laid out on the page.

## What the user sees

### 1. Setup complete (the normal case)

```
Backlinks                                          [tab actions]
Market Beacon Report

┌ Backlink setup ─────────────────────────────────────────────┐
│ ◎ Brief v4 · Local + National · B2B · Services · 12 topics  │
│ ⌖ Places: Scottsdale, AZ · Phoenix, AZ · United States       │
│                                            [⚙ Edit setup]   │
└──────────────────────────────────────────────────────────────┘

 [Standard Search] [Shockwave AI Search] [Manual Search]
 ─────────────────────────────────────────────────────────────
 …tab content…
```

- **A slim setup bar.** It is one card with two short lines, a check icon and an **Edit setup** button. It sits between the page header and the tabs.
  - **Long lists:** after 3 places it shows "+N more", and the topics are a count.
  - **Phones:** the two lines stack and the button goes full width under them.
- **Who sees which button:**
  - **Edit setup:** anyone with `backlinks.discover` (admin, manager, VA).
  - **View setup:** anyone else. The brief half of the setup is read-only without `backlinks.strategy` (admin, manager); places stay editable with `backlinks.discover`.

### 2. Setup not complete: the tabs are locked

```
┌ Set up backlinks for Stefan Novachki ───────────────────────┐
│ Every search (Standard, Shockwave AI and Manual) is built    │
│ from this setup. It takes about 5 minutes.                   │
│                                                              │
│  ① Strategy brief      ○ Not written yet                      │
│  ② Places              ○ Add a city or region (local clients) │
│                                                              │
│                                       [Start setup →]       │
└──────────────────────────────────────────────────────────────┘

 [🔒 Standard Search] [🔒 Shockwave AI Search] [🔒 Manual Search]
```

- **The gate card replaces the setup bar** and every tab's content.
- **The checklist** shows each step as done, missing or in progress. Each line of what's missing is the exact text from the database check (`private.backlink_brief_missing`), so the gate, the run RPCs and the UI always agree.
- **The tabs stay visible but locked:**
  - each shows a lock icon and has `aria-disabled`;
  - they are not links;
  - the tooltip says "Finish the backlink setup first".
- **A deep link** like `?mode=ai` lands on the gate too. The tab's data isn't even loaded, which saves the queries.
- **The button reads:**
  - "Start setup" when nothing is saved;
  - "Continue setup" when the brief is saved but places are missing.
- **For a VA on an unwritten brief:** the card says "Only an admin or manager can write the brief." The button opens the setup read-only, with the places step still editable.

### 3. The setup sheet (opened by the button)

- **What it is:** a right-hand sheet, about 760px wide. On phones it is full screen. The title is "Backlink setup · {client}", and a two-step stepper sits at the top:

```
 ① Strategy brief  ───  ② Where the client wants to be found
```

- **Step 1, Strategy brief:** today's `StrategyForm` (the 5 sections, idea chips and validation), moved into the sheet.
  - Footer: **Save and continue**. It saves the brief (version +1) and goes to step 2.
  - When nothing changed, the button is just **Next**.
- **Step 2, Places:** today's `TargetsPanel` (add, search location, edit words, remove), moved into the sheet.
  - Places save one by one, as they do today.
  - Above the list, a live **"This brief needs"** checklist follows from the brief's reach:
    - "A city or region (local customers) ✓"
    - "A country (national or global customers) ✗"
  - Footer: **Done**, enabled once the checklist is green, with **Back** to the brief.
- **Jumping between steps:** both steps can be opened directly from the stepper once the brief exists.
- **The URL:**
  - `?setup=brief` or `?setup=places` opens the sheet on that step, with the current `mode` kept.
  - Links and the gate button use the URL, so the back button closes the sheet.
- **Closing with unsaved brief changes** asks "Discard changes?" first.
- **After Done or Save:** the page refreshes on the server (`refresh()`), the gate turns into the setup bar and the tabs unlock. There is no full reload.

### 4. When a complete setup breaks again

- **When it can happen:** for example, someone removes the last country while the brief still says "national".
- **Before the removal:** the remove dialog warns "This is the only country. The backlink tabs lock until another country is added."
- **If they go ahead:** the tabs lock again (gate state).
- **Nothing is deleted.** Found places, approvals, submissions and run history all stay and come back once the setup is complete.
- **Running searches** keep running, because they already took a snapshot of the brief.

## How it is wired

### One loader for the shared setup

New file `src/features/backlinks/setup.ts` (server-only):

```ts
export type BacklinkSetup = {
  brief: BriefSnapshot | null        // saved brief, or null
  draft: Brief                        // what the form starts from (saved brief, or pre-filled from the profile)
  ideasText: string                   // services + categories + industry, for the idea chips
  targets: Target[]                   // every place, active or not
  suggestions: string[]               // client city + service areas, for the first place
  missing: string[]                   // exact text from private.backlink_brief_missing
  complete: boolean                   // missing.length === 0
  canEditBrief: boolean               // backlinks.strategy
  canEditPlaces: boolean              // backlinks.discover
}
export async function getBacklinkSetup(clientId: string, role: AppRole): Promise<BacklinkSetup>
```

- **What it takes over:**
  - the brief pre-fill that is now in `backlinks/strategy/page.tsx` (services → core topics, `guessBuyer`, local reach, default exclude terms and site types);
  - the `suggestions` code that is now copied twice in `page.tsx`.
- **Queries:** the brief row, the targets, the business profile (`services, primary_category, other_categories, service_areas`), `clients.industry/city`, and the `missing` RPC. All of them run in parallel.

### Database (migration `0051_backlink_setup.sql`)

- **New function:** `public.backlink_setup_missing(p_client_id uuid) returns text[]`.
  - Security definer, `search_path = ''`.
  - It checks `private.can_see_client(p_client_id)`, then returns `private.backlink_brief_missing(p_client_id)`.
  - Granted to `authenticated` only; revoked from `public` and `anon`.
- **Nothing else changes.** The run RPCs (`request_backlink_discovery`, `request_ai_search`) already refuse an incomplete setup through the same private function, so the server rule and the gate can't disagree.
- **Afterwards:** run the advisors and regenerate `database.types.ts`.

### The page (`backlinks/page.tsx`)

The page becomes the frame for all three tabs:

```
Content
 ├─ getClientBySlug, getCurrentMember, getBacklinkSetup     (always)
 ├─ PageHeader  (title, the tab's description, the tab's actions; no actions while locked)
 ├─ setup.complete ? <SetupBar setup /> : <SetupGate setup />
 ├─ <ModeTabs base mode locked={!setup.complete} />
 ├─ <SetupSheet setup clientId />                           (client; opens from ?setup=)
 └─ setup.complete && (
      mode === "standard" → <StandardSearch client member search setup />
      mode === "ai"       → <AiSearchTab … setup />
      mode === "manual"   → <ManualSearch … setup /> )
```

- **Standard Search gets its own component.** Its body moves out of `page.tsx` into `src/features/backlinks/components/standard-search.tsx`. The page is about 440 lines today, so this also makes it readable. `HowScoresWork`, `Notice` and `SetupNotice` move with it.
- **A single header.** `PageHeader` and `ModeTabs` are drawn once by the page; today each tab draws its own. Each tab hands the page its `description` and `actions`:

  | Tab | Header actions |
  |---|---|
  | Standard | Check strength, Re-rank, Find places |
  | Shockwave AI | Run AI search (moved up from the brief card it sits in now) |
  | Manual | `ManualActions` |

  Two ways to hand these over:
  - **Small per-tab header loaders** (`standardHeader(...)`, `aiHeader(...)`, `manualHeader(...)`) that return `{ description, actions }`.
  - **Or each tab draws a `TabToolbar`** at the top of its body. This is the fallback if the loaders would load data twice.

### What each tab changes

| | Removed from the tab | Read from `setup` instead |
|---|---|---|
| **Standard Search** | The Strategy brief card, `TargetsPanel`, the local `suggestions` query, and the empty-state wording that says "write the brief / add places above" | `setup.brief` (search plan, rerank, "How the top 30 is picked"), `setup.targets` (Find places dialog, header description, run progress labels), `setup.missing` (no longer needed in `findBlocked`; the gate covers it) |
| **Shockwave AI** | The Strategy brief card (its Run button moves to the header), `TargetsPanel`, `data.briefMissing` and its warnings, the "Add at least one place first" reason, the `/strategy` links | `setup.brief` (run dialog, dossier "brief changed" check), `setup.targets` (run dialog, place labels, competitor runs); `AiDossierCard.briefHref` → `?setup=brief` |
| **Manual Search** | Its own `PageHeader` and `ModeTabs`, plus loading the brief and targets in `getManualData` | `setup.brief` (reach, buyer, offering, topic words for catalog matching), `setup.targets` (active countries for the catalog and the listing kit) |

- **Query cleanup:**
  - `getBacklinksData`, `getAiSearchData` and `getManualData` stop selecting `backlink_briefs`.
  - `getAiSearchData` stops building `targets`.
  - The `brief_missing` and `targets` fields of the existing quota RPCs stay in the database (nothing breaks), but the app no longer reads them.
- **Not moving:** the Competitors card is specific to Shockwave AI and stays in that tab.

### Components

| File | Kind | What |
|---|---|---|
| `components/setup-bar.tsx` | server | The slim summary bar plus the Edit/View setup button (a link to `?setup=brief`) |
| `components/setup-gate.tsx` | server | The gate card with the 2-step checklist and the Start/Continue button |
| `components/setup-sheet.tsx` | client | The Sheet and stepper; reads `?setup=` with `useSearchParams`, closes by removing it; holds both steps |
| `components/strategy-form.tsx` | client | Changed: `onSaved(version)` callback instead of `router.push(backHref)`; footer rendered by the sheet (`renderFooter` prop); `isDirty` exposed for the discard prompt |
| `components/targets-panel.tsx` | client | Changed: optional `needs` checklist at the top; "last required place" warning in the remove dialog; heading can be hidden inside the sheet |
| `components/mode-tabs.tsx` | server | Changed: `locked` prop gives a lock icon, `aria-disabled`, `<span>` instead of `<Link>`, and a tooltip |
| `setup.ts` | server-only | `getBacklinkSetup` |

- **The old `/backlinks/strategy` page** becomes a redirect to `/backlinks?setup=brief`, so old links and bookmarks still work. Its form logic moves into `setup.ts` and the sheet.

### Manual Search server check

- **Blocked:** Manual Search actions that start new work (`pickFromCatalog`, `addSite`) refuse with "Finish the backlink setup first" when `backlink_setup_missing` isn't empty.
- **Still allowed:** updating submissions that already exist, so nothing in progress gets stuck.
- **Already covered:** Standard and AI are enforced in their RPCs today.

## Coordination

- **Shared files:** this touches files of the Manual Search session (`manual/components/manual-search.tsx`, `manual/queries.ts`, `manual/actions.ts`) and the shared `page.tsx`. Build it when that session has no uncommitted work, and `git add` only these paths.
- **Migration number:** `0051` is the next free one. The Manual session used up to 0048, competitor backlinks used 0049–0050.

## Effect on today's clients (checked in the database just now)

| Client | Setup | Effect after this ships |
|---|---|---|
| Market Beacon Report | Complete | No change; tabs open |
| Stefan Novachki | **No brief** (192 places found earlier) | Tabs locked until the brief is written; the 192 places are kept and reappear |
| Test Client | No brief | Tabs locked |

## Order of work

1. **Database:** the migration `0051` function, advisors, then regenerate types.
2. **Loader and components:**
   - `setup.ts` (`getBacklinkSetup`);
   - `StrategyForm` and `TargetsPanel` changes;
   - `SetupSheet`, `SetupBar`, `SetupGate`;
   - `ModeTabs` gets `locked`.
3. **Page frame:**
   - split Standard Search out into `standard-search.tsx`;
   - the single header with per-tab actions;
   - the gate/bar switch;
   - redirect the `/strategy` page.
4. **Wire the tabs:** Standard, then AI, then Manual. Each tab reads `setup` and its own brief/targets loading is removed. Add the Manual server check.
5. **Finish:**
   - update `docs/architecture.md` and the `CLAUDE.md` rule: "brief and places are edited only in the setup sheet; tabs open only when the setup is complete";
   - typecheck, lint and build;
   - check that no runs are open, then commit and push.

## Checks

- **Gate:**
  - with no brief, all three `?mode=` URLs show the gate and load no tab data;
  - the gate's checklist matches the database text.
- **Sheet:**
  - `?setup=brief`: save, then step 2;
  - add the required place, then Done; the tabs unlock without a full reload;
  - the back button closes the sheet;
  - closing with unsaved changes asks first.
- **Roles:**
  - a VA can add places but sees the brief read-only;
  - a VA on a client with no brief sees "Only an admin or manager can write the brief".
- **Lock again:** removing the only country on a national brief warns, then locks; nothing is deleted.
- **Each tab:**
  - Find places, Run AI search (full and competitors) and Manual catalog matching use the setup's brief and places;
  - old `/strategy` links redirect.
- **Display:** phone width (full-screen sheet, stacked setup bar) and dark mode.
- **No live searches are needed** to check any of this: no DataForSEO or Claude calls.
