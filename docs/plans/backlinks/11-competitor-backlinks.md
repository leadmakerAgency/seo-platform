# 11 · Competitor backlinks: plan

**Status:** plan, not built.

**Where:** Backlinks page, **Shockwave AI Search** tab (`?mode=ai`).

**Builds on:**
- `08-shockwave-ai-search.md`: the AI pipeline, the `ai_*` tables and the prospects list.
- The DataForSEO wrappers already in `src/lib/dataforseo/`.

**Migrations:** start at **0049**. 0042–0043 are the AI search; 0045–0048 belong to Manual Search.

---

## 0. In one page

**Goal:** find **where the client's competitors get their backlinks**, so the team can get the client listed or linked in the same places.

**How it works.** It starts from the competitors themselves, not from guessing what to search for. A link database (DataForSEO Backlinks) holds every link it has crawled on the web. We ask it: *"which sites link to these 5 competitors, but not to the client?"* Every place a competitor is linked shows up, including ones nobody would think to search for. Each site is ranked by **how many of the 5 competitors it links to**: "links to 4 of 5" means it links to businesses like the client as a habit, so the client has a strong chance there. Claude then reads each page:
- what kind of page is it;
- can the client get the same link, and how;
- is it worth it.

Then the existing checks run: the page check, the four tests and the top 30.

**Two ways to run it:**
1. **Inside the full Shockwave AI Search:** a switch, **"Find competitors' backlinks"**, on by default when DataForSEO is ready.
2. **On its own:** a **"Competitor backlinks"** button that runs only this part, faster and cheaper.

**Cost:**
- **On its own:** about **$0.35–0.65** a run. DataForSEO ≈ $0.25–0.50, Claude ≈ $0.10.
- **Inside a full run:** adds about **$0.40–0.55**, taking a full run from ~$1.10 to ~$1.50–1.70.

**Time:** about 1–3 minutes on its own.

**Fallback:** if DataForSEO isn't available, it falls back to AI only (searching the competitors' names), clearly labelled as an estimate.

### Decisions this plan makes

| # | Decision | Why |
|---|---|---|
| C1 | **DataForSEO finds the links, Claude understands them.** | Web search can't list backlinks (there is no `link:` search any more). Only a link index can. Claude is good at reading a page and judging whether the link can be copied. |
| C2 | The **team confirms the 5 competitors** before each run. They're saved per client in a new `client_competitors` table. | A wrong competitor wastes the whole run. The table is also the start of the separate competitors system you planned. |
| C3 | Rank by **"links to N of 5"**, then by the AI judgement. | A site that links to many competitors does it as a habit (directory, list, association, publication), while one that links to a single competitor is usually a one-off. |
| C4 | Results go into the **same list** as the rest of Shockwave AI (`ai_link_prospects`), marked **"Competitor backlinks"**, with their own filter and a comparison table. | One Review list for the team, no duplicate sites, and the same approve flow into the shared Approved list. |
| C5 | Link data is **cached for 30 days** per competitor set. | Backlink profiles change slowly. Running again in the same month costs only Claude. |
| C6 | **AI-only fallback** (search the competitors' names) when DataForSEO can't be used. | The feature still works, labelled as "estimated from mentions". |

---

## 1. What the team sees

### 1.1 Saved competitors (per client)

A **Competitors** card on the Shockwave AI tab, under the places panel:
- **Up to 5 active competitors**, as rows with name, domain, where each came from, and a remove button.
- **Sources:**
  - **"Found by Shockwave AI":** step 3 of the AI run, from the client's buyer searches.
  - **"Shares keywords":** DataForSEO's keyword-overlap lookup.
  - **"Added by the team":** typed in by hand.
- **Suggestions** below the list, when we have more than 5: "Also competing: …", each with a + button.
- **Add a competitor:** a domain field, checked as a real domain. The client's own domain and big platforms are refused (Amazon, YouTube, Wikipedia, Reddit, Google, Facebook, LinkedIn, Yelp, G2, Clutch…).
- **Editing:** anyone who can run backlink searches (`backlinks.discover`) can edit the list.
- **Empty state:** "No competitors yet. Run Shockwave AI Search, or click Suggest competitors". The suggest button runs the cheap keyword lookup (about $0.015).

### 1.2 Running it

**Inside the full run.** The start dialog gets a switch row: **"Find competitors' backlinks"**. Under it:
- the 5 competitors as chips, with an "Edit" link that opens the card;
- the extra cost, "+ ≈ $0.45".

The switch:
- is **on** by default when DataForSEO is configured, Backlinks access is OK and the DataForSEO budget isn't reached;
- is **off and disabled** otherwise, with the reason as a tooltip ("DataForSEO isn't connected", "Backlinks access is off on the DataForSEO account", "This month's DataForSEO budget is used up", "Add at least 2 competitors").

If no competitors are saved yet, the full run finds them in step 3, uses the top 5, and saves them as "Found by Shockwave AI" for next time.

**On its own.** A second button next to "Run Shockwave AI Search": **"Competitor backlinks"**, with a compare icon. Its dialog shows:
- **Competitors:** the 5, with tick boxes. At least 2 are needed, since "shared by" means nothing with 1.
- **Shown in results:** "Sites that link to at least **2** competitors" (choice of 2 or 3), plus a tick box "Also show sites that link to only 1 (go to More)".
- **How many sites to check:** 100, 150 (default) or 200.
- **Estimate:** "DataForSEO ≈ $0.32, Claude ≈ $0.10, about 2 minutes". If the cache is fresh: "Link data from Nov 20 (cached), only Claude ≈ $0.10".
- **Start.**

The same rules apply as for the full run: one search per client at a time, across all tabs; the monthly limits; the budgets.

### 1.3 While it runs

The existing progress panel, with the competitor steps:
- **Competitors:** "5 competitors confirmed".
- **Competitors' links:** "Comparing link profiles… 1,240 linking sites, 312 link to 2 or more".
- **Linking pages:** "Getting the exact pages (3 of 5)".
- **Check pages**, **Judge**, **Top 30**, as today.

"Latest finds" shows lines like "irdirectory-example.com · links to 4 of 5".

### 1.4 Results

**In the prospects list:**
- Rows found this way get a **"Links to 4 of 5"** badge (the higher the count, the stronger the colour) and a compare-arrows icon.
- A filter row above the list: **All · Competitor backlinks · Research**.
- In the full run, the same site can be found by both, and shows both labels.

**Comparison view** (a toggle on the filter row, "Compare with competitors"), the "link gap table":
- **Rows:** linking sites.
- **Columns:** the 5 competitors plus the client. A tick where that domain is linked, ✗ for the client.
- **Sorted by:** how many competitors, then fit.
- **Other columns:** link type, kind of page, the action.
- **On phones:** cards with competitor chips instead of columns.

**Prospect panel** adds a **"How competitors are linked here"** section:
- for each competitor: the linking page (link), the link text, followed or nofollow, where on the page (article, footer, sidebar), and first seen;
- **"Can the client get this?"**, with Claude's answer and the action, e.g. "Submit to the IR media directory (free listing form)".

**Insights card** (shown when patterns are found), under the dossier, **"What competitors do"**, e.g.:
- "Competitor B gets 37 links from its own clients' websites ('Powered by…'). You could ask your clients for a credit link too."
- "4 competitors are listed as media partners of mining conferences."

Built from Claude's grouping of the link kinds.

**Runs and costs:**
- **The run's parts:** a standalone run shows as **"Competitor backlinks"**, and a full run with the switch on shows the extra parts.
- **The "Site strength" part:** renamed **"Link data"**, so it covers strength *and* competitor links (the same DataForSEO Backlinks API), with no new colour needed.

---

## 2. How it works, step by step

There are two run kinds in `ai_search_runs`: **`full`** (today's run, with the switch) and **`competitors`** (standalone). Both use the same checkpointed task runner, so a redeploy resumes them.

| Step | `full` with switch on | `competitors` (standalone) |
|---|---|---|
| 1 · Read the client | runs | reuses the latest dossier if it's under 30 days old and the brief version matches; otherwise runs (≈ $0.003) |
| 2 · Where to rank | runs | skipped |
| 3 · Competitors | runs; the top 5 are saved and offered | **confirmed list from the dialog** |
| 4 · Research | runs **plus the competitor link tasks** | **only the competitor link tasks** |
| 5 · Merge | merges everything | merges the competitor link candidates |
| 6 · Check pages | all candidates | competitor link candidates |
| 8 · Judge | all | competitor link candidates |
| 9 · Top 30 | from **all undecided places of the client** (see 2.6) | same |

### 2.1 Pick the 5 competitors

**Sources,** merged in this order:
1. The team's saved, active competitors (`client_competitors`).
2. In a full run, step 3's competitors per place: domains ranking for the client's buyer searches, confirmed by Claude.
3. **DataForSEO Labs `competitors_domain`** for the client's domain:
   - location: the first country place, or the US for a global brief;
   - `exclude_top_domains: true`;
   - filter: `intersections ≥ 10`;
   - limit 20.
   - Cost ≈ $0.012 + $0.00012 × items ≈ **$0.015**.
   - Used by "Suggest competitors" and when fewer than 2 competitors are known.

**Rules:**
- Never the client's domain or the same registrable domain.
- Never big platforms (a fixed list in `competitors.ts`).
- At most 5 per run.
- When a full run picks them by itself, it prefers domains seen in **more places** and **higher positions**.

### 2.2 Compare link profiles (DataForSEO, one call)

**The call:** `POST /v3/backlinks/domain_intersection/live`:
- `targets`: the 5 competitor domains (up to 20 allowed).
- `exclude_targets`: the client's domain, so sites that already link to the client are left out.
- `intersection_mode`: whichever mode returns domains that link to **any** of the targets, with a per-target breakdown (**phase 0 confirms which**). If neither mode does, we take the per-competitor fallback in 2.2b.
- `limit`: 1000; `order_by`: `["summary.intersections_count,desc"]` and the domain rank, if allowed.
- `include_subdomains`: true; `backlinks_status_type`: `live`.

**Result:** each item names a referring domain, and `domain_intersection` has one entry per target ("1"…"5") with its backlinks count, first seen and spam score. We compute:
- `shared`: how many competitors it links to;
- `competitors`: which ones;
- `spam`: the highest spam score.

**Keep:**
- `shared ≥ 2` (the dialog can make it 3);
- `shared = 1` only if "also show 1" is ticked (those go to More).

**Drop:**
- the competitors' own domains;
- big platforms and social networks;
- spam score ≥ 60 (goes to Hidden as "spam");
- obvious networks: the same IP range across many results, when the data shows it.

**Cap:** the best **150** (setting 100–200) by `shared`, then domain rank.

**Cost:** $0.024 + 1000 × $0.000036 ≈ **$0.06**.

**2.2b Fallback**, if the comparison call can't give per-competitor data: `backlinks/referring_domains/live` per competitor (5 calls, limit 1000, ≈ $0.06 each ≈ $0.30), counted in our code.

### 2.3 Get the exact linking pages (DataForSEO, one call per competitor)

**The call:** `POST /v3/backlinks/backlinks/live`, per competitor:
- `target`: the competitor domain;
- `mode`: `one_per_domain` (one example link per linking site);
- `filters`: `["domain_from","in",[…the kept domains that link to this competitor…]]` (**phase 0 confirms the list filter**; otherwise filter by `domain_from_rank` and match in code);
- `limit`: up to 1000.

**Fields kept per link:**
- the linking page: `url_from`, `domain_from`, `page_from_title`, `page_from_language`;
- the link itself: `anchor`, `dofollow`, `item_type`, `text_pre` / `text_post`;
- where and when: `semantic_location` (article, footer, sidebar…), `first_seen`, `last_seen`;
- quality: `backlink_spam_score`, `domain_from_rank`.

**Cost:** 5 × ($0.024 + rows × $0.000036) ≈ **$0.13–0.15**.

**Result:** for every kept site, the competitor links on it.

### 2.4 Spam and strength (existing calls)

**The calls:** `bulk_spam_score` and `bulk_ranks` on the kept domains, skipping any checked in the last 30 days (the existing `strength.ts`). This fills the shared site library, so Standard Search benefits too.

**Cost:** ≈ **$0.03–0.05**.

### 2.5 Merge, check, classify, judge (existing steps, extended)

1. **Merge:**
   - Each site becomes a prospect with `found_by` including `competitor_links`, the category from the page kind, `shared_count`, and `competitor_links` (the list from 2.3).
   - The page URL is the competitor's linking page, the best one: an article or listing over a footer.
   - If the site was also found by research, they merge and keep both labels.
2. **Check pages:** our fetcher opens the linking page (live? a way in? red flags?). The page check also confirms the **competitor's link is still on the page**: the old link-verification statuses (`verified`, `link_removed`, `unverifiable_js`, `lost`). A removed link lowers the score.
3. **Classify** (Haiku, inside the page-read call, batches of 8). New output per page:
   - `link_kind`: one of:
     - `directory_listing`
     - `best_of_list`
     - `editorial_mention`
     - `guest_article`
     - `resource_page`
     - `event_or_sponsorship`
     - `press_release`
     - `partner_or_vendor`
     - `client_credit` (the competitor's client's site saying "website by", "powered by")
     - `forum_or_comment`
     - `paid_or_sponsored`
     - `link_network`
     - `other`
   - `replicability`: `easy` (open listing or form), `possible` (pitch, membership, sponsorship), `hard` (relationship, past coverage), or `no` (client credit, the competitor's own network, paid network).
   - **How to get the same link**, in one line.
   - The prompt gets the competitor's link text, the text around it and where it sits.
4. **Judge** (Haiku, batches of 15): the four tests as today, plus `shared_count`, the competitors and the replicability in each row.
   - **Fit adds:** shared 2 → +5, 3 → +10, 4 or 5 → +15; dofollow competitor link → +3; replicability `hard` → −10.
   - `no` replicability → verdict `not_a_link_opportunity`, goes to Hidden with the reason "Can't be copied (e.g. their client's site credit)".
5. **Insights** (Haiku, 1 call): from the counts of link kinds per competitor, write 2–4 lines on "what competitors do" (cards in §1.4). Stored on the run.

### 2.6 Picking the top 30 across runs

**The current rule:** the top-30 step only looks at the places from **the current run**. With two kinds of runs, the Review list would mix old and new rankings.

**The new rule:** the top-30 step of any run looks at **all undecided places of the client** (Review and More, from any run), re-ranks them, and keeps the best 30 in Review. Places someone decided on are never touched.

### 2.7 AI-only fallback

**When it applies:** DataForSEO isn't configured, Backlinks access is denied, the DataForSEO budget is reached, or the balance is under the low-balance setting.

**What runs instead:** the competitor footprint (already built), widened to up to 5 web searches per competitor:
- "{competitor name}" directory / review / listed / featured / sponsor / conference / podcast;
- in each place's language.

**How it's shown:** results carry `found_by: competitor_footprint` and the label **"Estimated from mentions"**. There is no "links to N of 5" count, since mentions aren't links. The dialog says so before starting.

**Cost:** ≈ 25 searches = $0.25 + Claude ≈ $0.05.

### 2.8 Cache (30 days)

**Table:** `backlink_gap_cache`, keyed by the sorted competitor domains plus the client domain plus the settings. It stores the comparison result (2.2) and the linking pages (2.3).

**On a run:** a cache under 30 days old is reused, and the dialog says "cached on …". An admin can force a fresh pull ("Refresh link data", full price).

---

## 3. Database (migration 0049+)

**New table `client_competitors`:**

| Column | Notes |
|---|---|
| `id`, `client_id` | unique (client_id, domain) |
| `domain` | registrable domain, lower case, checked |
| `name` | ≤ 120 |
| `source` | `ai`, `dataforseo`, `team` |
| `active` | bool; at most 5 active per client (checked in the database function) |
| `evidence` | jsonb: where it was seen (searches, positions, places) |
| `added_by`, `created_at`, `updated_at` | |

RLS: anyone who can see the client can read it. Writes go through `save_client_competitors(client, jsonb)`, for `backlinks.discover`. The future competitors system can take this table over.

**New table `backlink_gap_cache`:** service role only. `key` (unique), `client_id`, `competitors text[]`, `client_domain`, `intersection jsonb`, `pages jsonb`, `rows int`, `cost_usd`, `fetched_at`. Rows over 90 days old are deleted by the existing cleanup.

**`ai_search_runs` additions:**
- `kind text not null default 'full' check (kind in ('full','competitors'))`;
- `competitors text[]`.

**`ai_link_prospects` additions:**
- `shared_count smallint` (0–20);
- `competitor_links jsonb default '[]'`: [{competitor, url_from, anchor, dofollow, location, first_seen, still_there}], up to 5;
- `link_kind text`;
- `replicability text check in ('easy','possible','hard','no')`.

**Function changes:**
- **`request_ai_search`:** a new signature with `p_kind` and `p_competitors text[]`.
  - Checks: 2–5 competitors for `competitors` runs; the DataForSEO budget (`private.backlinks_budget_problem()`) when the switch is on or the kind is `competitors`; a separate monthly limit for standalone runs (`ai_gap_runs_per_client_month`, default 6).
  - The old signature stays and passes `full` / no competitors, so nothing breaks.
- **`dfs_store_ai_prospects`:** accepts and merges `shared_count` (the larger one wins), `competitor_links`, `link_kind`, `replicability`.
- **`dfs_apply_ai_shortlist`:** unchanged. The top-30 step sends rows for all undecided places (§2.6).
- **`ai_search_quota`:**
  - DataForSEO status: configured, access, budget problem, low balance;
  - the saved competitors;
  - the latest gap cache date;
  - the standalone runs used and their limit.
- **`backlink_run_history`:** the AI branch also adds `dfs_calls` with `ref = run id` (link data) into the "Link data" part.
- **`dfs_settings`:**
  - `ai_gap_runs_per_client_month` (default 6);
  - `ai_gap_max_sites` (default 150);
  - `ai_gap_min_shared` (default 2).

**Tests (rolled back):**
- 6 active competitors refused;
- the client's own domain refused as a competitor;
- a `competitors` run with 1 competitor refused;
- the DataForSEO budget refusal;
- `shared_count` merge keeps the larger value;
- the cache is service-role only;
- old `request_ai_search` calls still work.

---

## 4. Code

**New:**
- **`src/lib/dataforseo/backlinks.ts`** additions:
  - `domainIntersection(db, targets, exclude, opts, ctx)`
  - `backlinksFrom(db, target, domains, opts, ctx)`
  - `referringDomains(db, target, opts, ctx)` (fallback)
  - All go through `dfsCall`, so every call is logged in `dfs_calls` with `ref = run id`.
- **`src/lib/dataforseo/api.ts`:** `competitorsDomain(db, domain, location, language, ctx)` (Labs).
- **`src/features/backlinks/ai-search/competitors.ts`:** the platform block list, domain checks, merging AI and Labs suggestions with the saved list, and the top-5 choice.
- **`src/features/backlinks/ai-search/gap.ts`:** step logic for 2.2–2.4, the cache, the per-competitor breakdown, filtering and the fallback.
- **`knowledge.ts`:** a new pack `COMPETITOR_LINKS`: which kinds of competitor links can be copied, client credits, paid and network links, and how to ask. Sources: claude-seo `seo-backlinks` §6 (competitor gap) and `backlink-quality.md`; marketingskills `link-building` (tactics, the four tests, risk rule).

**Changed:**
- **`config.ts`:** task kinds `gap_intersection`, `gap_pages`, `gap_strength`, `gap_insights`; `planGap()` for the estimate; the total estimate includes the gap when the switch is on.
- **`pipeline.ts`:**
  - the run `kind`;
  - step 1 reuses a recent dossier for standalone runs;
  - step 3 saves the top competitors to `client_competitors` when none are saved;
  - step 4 adds the gap tasks;
  - merge, check and judge handle the new fields;
  - the top 30 uses all undecided places (§2.6);
  - DataForSEO costs count toward the run's `$` cap, and the gap tasks are skipped when the DataForSEO budget is hit.
- **`prompts.ts`:** the page-read prompt takes the competitor-link context and returns `link_kind`, `replicability` and how to get it; judge rows include "links to N of 5 (A, C, D)"; a new insights prompt.
- **`schemas.ts`:** fields for page reads, judgements and insights.
- **`actions.ts`:** `startAiSearch(…, { competitorLinks: boolean })`, `startCompetitorBacklinks(clientId, competitors, opts)`, `saveCompetitors(clientId, list)`, `suggestCompetitors(clientId)`.
- **`queries.ts`:** competitors, the gap status, the new prospect fields, the insights.
- **UI** (`ai-search/components/`):
  - a `competitors-card.tsx` (new);
  - a `competitor-backlinks-dialog.tsx` (new);
  - the switch row in `ai-run-dialog.tsx`;
  - the filter row, badge and comparison view in `ai-prospects-view.tsx` (+ `gap-table.tsx`);
  - the "How competitors are linked here" section in the sheet;
  - an `ai-insights-card.tsx` (new);
  - the progress steps.
- **Runs and costs:** the "Link data" label, and the "Competitor backlinks" run kind and icon.

---

## 5. Costs and limits

| Part | Price (verified) | Typical |
|---|---|---|
| Suggest competitors (Labs) | $0.012 + $0.00012 per item | $0.015 |
| Compare link profiles | $0.024 + $0.000036 per row | ≈ $0.06 (1000 rows) |
| Linking pages (5 competitors) | the same | ≈ $0.13–0.15 |
| Spam and strength | the same, in bulk | ≈ $0.03–0.05 |
| Claude (check, classify, judge, insights, ~150 pages) | Haiku $0.10 / $0.50 per million tokens | ≈ $0.10 |
| **Standalone run** | | **≈ $0.35–0.45** (up to ~$0.65 with 200 sites or the fallback calls) |
| **Re-run within 30 days** (cache) | | **≈ $0.10** (Claude only) |
| AI-only fallback | 25 web searches × $0.01 + Claude | ≈ $0.30 |

**Limits:**
- standalone runs: 6 per client per month;
- the existing DataForSEO monthly budget;
- the AI search budget ($30 a month);
- the per-run cap ($4).

**DataForSEO balance:** it was **$0.42** on Nov 20. It must be topped up before the first run, and the dialog warns when the balance is under the estimate.

---

## 6. Safety and quality

**What the team is told:** link schemes are never recommended. Paid links are labelled "paid: must be sponsored/nofollow", and link networks and spam (score ≥ 60) go to Hidden.

**Client credits** (a competitor's client sites linking "website by") are never offered as a place to apply. They become an **insight** instead (ask your own clients).

**Data quality:**
- **Unchecked links:** the competitor's link is re-checked on the live page, and links shown as still there that weren't actually checked are marked "not confirmed".
- **Untrusted text:** text from DataForSEO and from pages is fenced as untrusted in every prompt, as today.

**Privacy:** only domains and public pages are sent anywhere.

**Quality checks before release,** on Market Beacon Report and one local client:
- ≥ 70% of Review items with "links to 2+" are live and the client could realistically get them;
- no competitor-owned or client-credit sites in Review;
- the cost matches the estimate within 20%;
- a forced redeploy mid-run resumes without paying twice.

---

## 7. Phases

### Phase 0 · Check before building

One tiny live DataForSEO call, about $0.03, with your OK, after a top-up:
- [ ] **Link gap modes:** which `intersection_mode` returns domains linking to *any* target with the per-target breakdown.
- [ ] **List filter:** whether `["domain_from","in",[…]]` works on `backlinks/backlinks/live`, and its list size limit.
- [ ] **Link position values:** the values of `semantic_location` (footer, article, nav…).
- [ ] **Agree defaults:** 5 competitors, minimum shared 2, 150 sites, 6 standalone runs a month, the 30-day cache.

### Phase 1 · Database
- [ ] Migration 0049: `client_competitors`, `backlink_gap_cache`, the new columns and settings.
- [ ] Migration 0050: the function changes and the new functions, plus rolled-back tests, advisors and types.

### Phase 2 · DataForSEO wrappers and the gap logic
- [ ] Wrappers (2.1–2.4), `gap.ts` with the cache, filters and fallback, and `competitors.ts`.
- [ ] Tests on saved sample responses (no live calls): the per-competitor counts, filtering and the cache key.

### Phase 3 · Pipeline
- [ ] Run kinds, the gap tasks, the merge, check, classify and judge changes, the insights, the top 30 across runs, and the cost and budget checks.

### Phase 4 · UI
- [ ] Competitors card, the switch in the full-run dialog, the standalone dialog, progress steps, the badges and filter, the comparison table, the sheet section, the insights card, and Runs and costs.
- [ ] Phone, dark mode and accessibility checks on a sample-data page.

### Phase 5 · Ship
- [ ] Typecheck, lint, build; commit only these files; push with no run open.
- [ ] Docs: `08-shockwave-ai-search.md` (link to this plan), `docs/architecture.md`.
- [ ] **First live run: you test it.**

---

## 8. Open questions for you

1. **Competitors:** fixed at 5, or allow up to 10 (DataForSEO compares up to 20; the cost barely changes)?
2. **Minimum shared:** 2 by default. Should sites linking to only 1 competitor show in More, or be left out?
3. **Who edits the saved competitors:** everyone with `backlinks.discover` (admins, managers, VAs), or managers and admins only?
4. **The separate competitors system you mentioned earlier:** should it take over `client_competitors` later? This plan is built so it can.
5. **DataForSEO top-up:** needed before Phase 0's test call and before the first run.
