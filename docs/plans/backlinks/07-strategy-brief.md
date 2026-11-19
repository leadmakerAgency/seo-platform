# Plan: a backlink strategy brief per client, tailored searches, and a top 30

## Context

Today Find places only knows the client's services and the places the team chose. It runs the same search templates for every client:
- "{place} business directory"
- "best {service} {place}"
- "{industry} guest post"

The first real run, for Stefan Novachki (web development, United States), showed what that does:
- **Mostly generic results:** 138 places, mostly generic US business directories.
- **Wrong kinds of sites:** competitors' "Top 10" blog posts, guest-post sellers, and pages that only count as "local" because they mention "United States".
- **Basics that don't fit:** 22 local-business listings such as Facebook, Apple Maps and Nextdoor, which mean little for a national web development firm.

**What you want.** Before searching, the team describes the client's link strategy. The search uses that description, and the result is **at most 30 best places**:
1. **A topic map of 10–15 themes:**
   - The client's core niche.
   - **Adjacent topics** the same buyers read about. Direct competitors rarely link to you; blogs on neighbouring topics do.
   - Example: a deck restoration firm would also cover backyard design, home remodelling and real estate.
2. **Reach:**
   - **Local** clients need local sources: city, county, state and neighbourhood directories, local news, chambers of commerce and community sponsorships.
   - **National or global** clients (SaaS, B2B, e-commerce) skip local directories. They need industry review sites, software and vendor marketplaces, niche blogs and podcasts.
3. **Buyer (B2B or B2C):** the sites, comparison lists and communities the client's buyers trust when they research a purchase.

Research agrees:
- Topical relevance (same or adjacent topic) is the strongest signal.
- B2B links come from industry publications, review platforms and content partnerships.
- Local links come from geographically tied sources.
- Clutch, GoodFirms and UpCity are the standard platforms for B2B services; G2, Capterra and GetApp for software.

**Your decisions:**
- The team **fills in the brief by hand**. The app pre-fills what it already knows and offers idea chips; there's no AI drafting.
- The **top 30** is picked by rules, then reviewed by **Claude**, which keeps up to 30 and gives a one-line reason for each.
- Results outside the top 30 go to a **More** tab, so nothing paid for is lost.

## How it works

```
1. Strategy brief (once per client, editable)  →  saved, versioned
2. Places (existing panel)                      →  where to search from
3. Find places → dialog shows the search plan built from brief × places
                 ("46 searches: 14 place, 22 topic, 6 buyer, 4 industry · about $0.32")
4. Search job: runs the plan (cache, retry failed once) → parse → classify → rule score
5. Shortlist: best ~80 by rule score → site strength (one bulk call) → Claude review vs the brief
             → up to 30 to Review (rank 1–30, with Claude's reason), rest → More, clear misfits → Hidden
6. Basics tab: the must-have listings that fit this client's reach and buyer, plus sites the team named
```

## 1. The strategy brief

**Table `backlink_briefs`** (one row per client; `version` goes up on each save, and every run records which version it used):

| Field | Values | Used for |
|---|---|---|
| `reach` | One or more of `local`, `national`, `global` (local + national runs both kinds of searches) | Which search templates run, which basics apply, how "local" counts in the score |
| `buyer` | `b2b`, `b2c`, or both ticked | Buyer templates, site-type weights, basics |
| `offering` | One or more of `services`, `software`, `products` | Marketplaces (software → G2 and Capterra; services → Clutch and GoodFirms; products → retail and review sites) |
| `audience` | Free text, up to 300 characters ("homeowners planning backyard projects", "CTOs at 20–200-person SaaS companies") | Claude's review: are this site's readers the buyers? |
| `core_topics` | 1–5 chips (the niche: "web development", "no-code development") | Topic searches; the topic match in the score |
| `adjacent_topics` | Up to 12 chips ("startup growth", "UX design", "SaaS marketing", "small business finance") | Topic searches; the topic match in the score (worth less than core) |
| `trusted_sites` | Up to 20 domains the buyers trust ("clutch.co", "g2.com", "houzz.com") | Added to Basics as "Named in the brief"; a signal for Claude |
| ~~`competitors`~~ | Removed from the form for now (competitors will be their own system); the column stays empty | — |
| `exclude_terms` | Chips ("free", "jobs", "course") | Hide results whose title matches |
| `site_types` | Multi-select, with defaults by reach and buyer: directories, review platforms, marketplaces, niche blogs, guest posts, local news, podcasts, associations, communities, sponsorships and events, resource pages | Templates that run; the site-type weights |
| `notes` | Up to 1,000 characters | Shown to Claude and the team |

**Required before Find places:**
- reach, buyer and offering (one or more of each; migration `0039` made them lists)
- 1 or more core topics and 5 or more topics in total. A hint asks for 10–15.
- local clients: at least one city or region place
- national and global clients: at least one country place (suggested: the client's country, or for global US, GB, CA and AU)

The button stays disabled until these are filled, saying what's missing.

**Filled in by hand, with help (no AI):**
- **Pre-filled** from the business profile: core topics from services and primary category, and the buyer guessed from the industry. The team can change all of it.
- **Adjacent-topic idea chips** from a small curated map of about 25 common industries (`src/features/backlinks/topic-ideas.ts`), shown as suggestions only. Examples:
  - home services → home improvement, real estate, interior design, landscaping, home insurance
  - web/software → startups, SaaS marketing, UX design, product management, small business tech
  - legal → personal finance, real estate, small business, insurance
- **Trusted-site idea chips** by offering and buyer:
  - B2B services: clutch.co, goodfirms.co, upcity.com, designrush.com, sortlist.com, themanifest.com
  - software: g2.com, capterra.com, getapp.com, softwareadvice.com, trustradius.com, producthunt.com, alternativeto.net, saashub.com
  - local B2C: yelp.com, nextdoor.com, angi.com, houzz.com, thumbtack.com
  - products: trustpilot.com, sitejabber.com
- **Where:**
  - A full page `/clients/[slug]/backlinks/strategy`, using the same form patterns as Add client (sections, chips, sticky Save).
  - The Backlinks page shows a **Strategy** summary card (reach · buyer · offering · "12 topics" · Edit) above the places panel.
- **Who can edit:** admins and managers, under a new permission `backlinks.strategy`. VAs can read it.

## 2. The search plan (brief × places), built before the run

**New `src/features/backlinks/search-plan.ts`** (pure). It replaces `buildQueries`'s fixed per-place rule:

- **Footprints table:**
  - New columns: `reach text[]`, `buyer text[]`, `offering text[]`, `site_type`, `priority`.
  - New placeholder `{topic}`. Existing `{place}`, `{service}` and `{industry}` stay. Search operators stay banned.
- **Local** (per place, then topics × place):
  - **Place templates:** "{place} business directory", "{place} chamber of commerce", "{place} local news", "{place} community sponsorship", "{place} events calendar submit", "{place} neighborhood association".
  - **Topic templates:** "{topic} blog {place}", "{place} {topic} association", "best {topic} {place}" (B2C), "{topic} {place} magazine".
- **National / global** (no local-directory templates; places are only the search location):
  - **Topics:** "{topic} blog", "{topic} write for us", "{topic} resources", "{topic} podcast", "{topic} newsletter".
  - **B2B:** "top {service} companies", "{topic} conference", "{industry} trade publication", "{topic} association".
  - **Software:** "best {topic} software", "{topic} tools comparison", "{service} alternatives".
  - **Products:** "{topic} gift guide", "{topic} product reviews".
- **B2C:** forums and communities ("{topic} forum", "{topic} community") and consumer blogs. **B2B:** associations, trade publications and webinars.
- **Order and cap:**
  - The order is core topics first, then templates by priority, then adjacent topics. Each adjacent topic gets 1–2 templates; each core topic gets 3–4.
  - Every template is filtered by the brief's `site_types`.
  - Duplicates are removed per place, and the total is capped at **60**.
- **Built in the action, not the job:**
  - `findPlaces` builds the plan and sends it to `request_backlink_discovery(client, target_ids, queries jsonb, brief_version)`.
  - The database checks the cap (60), lengths, no operators, the footprint ids and the places, then inserts the run and its query rows **in one transaction**. The job just runs them.
  - The dialog's estimate is therefore exact, and `private.backlink_search_estimate` is no longer needed.
- **The dialog** shows the plan grouped: "Scottsdale, AZ: 8 · Topics: 22 · Buyer: 6 · Industry: 4". "See every search" lists them. The cost line includes the AI review and the strength check (below).

## 3. Running and scoring (`discovery.ts`, `classify.ts`, `scoring.ts`)

- **Retry:** a failed search (DataForSEO "Internal SE Server Error" isn't charged) is retried once after the batch. 6 of 15 failed last time.
- **Topic match (new):**
  - Words of each core and adjacent topic are matched in the title, snippet and URL path.
  - Gives `topic_fit` (core 1.0, adjacent 0.7, none 0) and `matched_topic`, shown as "Matches: UX design".
- **Site types:** new `directory_type` values `marketplace`, `podcast`, `community`, `sponsorship`, `resource_page`, detected by host and title words ("podcast", "forum", "community", "sponsor", "resources", "/marketplace").
- **Weights depend on the brief** (`siteTypeWeight(type, brief)`):
  - local B2C: chamber, local news and community high; marketplaces low
  - national B2B: review platforms, marketplaces, industry directories and niche blogs high; generic business directories and chambers low
- **Rule score (0–1):**
  - **Local:** 0.30 topic + 0.25 site type + 0.15 local + 0.15 searches + 0.15 position.
  - **National / global:** "local" is dropped, and its weight moves to topic (0.40). A page that only mentions the country no longer counts as local; only a city or region mention does.
- **Competitors** are hidden when:
  - the domain is a Maps or local-pack business
  - the site sells the client's own service: the title says "{service} company/agency/services/studio", or it's "Top/Best {service} companies" on a site that is itself one of those companies (not a platform in the library)
  - Claude flags it (below)
- **Exclude terms:** results with an exclude term are hidden as "Excluded by the brief".
- **More** (new `opportunity_status` value `reserve`): the place is kept, stays undecided, and shows in the More tab.

## 4. Picking the top 30

After the search results are saved:
1. **Candidates:** every undecided searched place of the client (this run and earlier), best ~80 by rule score.
2. **Site strength:** one bulk call for the candidates not checked in 30 days (`bulkRanks` + `bulkSpamScore`, reusing `strength.ts`), about $0.03. It's skipped when Backlinks API access is denied or the budget is reached. Spam 60+ drops a candidate from the top 30.
3. **Claude review:**
   - **Model and input:** Haiku 5.5 (the cheapest model; under $0.01 a review), one call, structured output. Input: the brief (reach, buyer, offering, audience, topics, trusted sites, notes) plus, per candidate, the id, domain, type, title, snippet, the searches that found it, its strength and its rule score.
   - **Output per candidate:**
     - `fit` from 1 to 5
     - `verdict`: keep, competitor, irrelevant, paid_link_seller, spam or not_a_link_opportunity
     - `reason`: one line, up to 160 characters, about why this site's readers or listing matter to the client's buyers
     - `pick_rank`: 1–30 or none
   - **Safety:** search titles and snippets are untrusted text. The prompt marks them as data. Only known candidate ids are accepted, and output that doesn't fit the schema is ignored.
   - **About the call:** about 8k tokens in and 3k out, roughly $0.03–0.06. Recorded in a new `ai_calls` ledger (client, feature, model, tokens, cost, ref) under a monthly AI budget in settings.
4. **Applied by `dfs_apply_shortlist(run, picks jsonb)`** in the database. It never touches a row someone already decided:
   - Claude's picks go to Review as `pending_review` with `shortlist_rank` 1–30 and `ai_reason`.
   - The other kept candidates go to **More** as `reserve`, with the reason "Not in the top 30" and the AI fit.
   - competitor, irrelevant, paid-link-seller and spam verdicts go to **Hidden** with `filter_reason = 'ai_rejected'` and the AI reason.
5. **Without Claude** (no API key, error or budget reached): the top 30 by rule score × strength go to Review, the rest to More. The run notes "AI review skipped: …".
6. **Promoting:** Review never holds more than 30 undecided places. Approving or rejecting frees a slot. "Move to Review" from More fills a free slot and is refused when Review already has 30.

**Basics tab** (replaces mixing core listings into the list):
- **Core listings now match the client:**
  - `directories` gets `core_reach`, `core_buyer` and `core_offering`.
  - The existing US local list applies only to `local` clients.
  - New seeded sets:
    - B2B services: Clutch, GoodFirms, UpCity, DesignRush, Sortlist, The Manifest, Crunchbase
    - software: G2, Capterra, GetApp, Software Advice, TrustRadius, Product Hunt, AlternativeTo, SaaSHub
    - products: Trustpilot, Sitejabber
  - Each has a submit URL and its cost (free, paid or unknown).
- **The brief's trusted sites** are added as "Named in the brief".
- **Not counted in the 30.** Basics have their own tab and count ("Basics: 9").

**Re-rank without new searches.** A "Re-rank with the brief" action re-scores the client's saved results (search results are kept 90 days) and redoes the top 30 and the AI review. It costs only the AI review (about $0.05), no searches, so a brief change can be tried cheaply. This is how the existing Stefan Novachki results get re-ranked after the build.

## Database (migrations `0037`, `0038`)

**`0037_backlinks_brief_kinds`** (only `add value`, so `0038` can use them):
- `opportunity_status` + `reserve`
- `directory_type` + `marketplace`, `podcast`, `community`, `sponsorship`, `resource_page`
- `footprint_scope` + `topic`, `buyer`
- `dfs_api` gets no new value; AI calls have their own table

**`0038_backlinks_brief`:**
- **New tables:**
  - `backlink_briefs`: the columns above, `version`, `updated_by/at`, check constraints on lengths and counts, RLS select via `can_see_client`.
  - `ai_calls`: service role only, admins read.
- **`dfs_settings`:** + `ai_monthly_budget_usd` (default 20).
- **`backlink_opportunities`** + `source` (search, core or brief), `matched_topic`, `topic_fit`, `rule_score`, `ai_fit`, `ai_verdict`, `ai_reason`, `shortlist_rank`. `filter_reason` check + `ai_rejected`, `excluded_term`.
- **`backlink_footprints`** + `reach[]`, `buyer[]`, `offering[]`, `site_type`, `priority`. The placeholder check allows `{topic}`; the new templates are seeded and the old place templates are mapped to `reach = {local}`.
- **`directories`** + `core_reach[]`, `core_buyer[]`, `core_offering[]`. The existing US core set becomes `{local}`, and the new sets above are seeded.
- **`backlink_runs`** + `brief_version`.
- **New and changed functions** (security definer, explicit grants):
  - `save_backlink_brief(client, jsonb)`: managers; validates; bumps the version; logs history.
  - `request_backlink_discovery(client, target_ids, queries, brief_version)` replaces the 2-argument version: the brief must be complete and current, plus the 60 cap, 24 hours per place, monthly limit and budgets.
  - `dfs_store_backlink_candidates`: also the new fields, `reserve` as a stored status, and the source.
  - `dfs_apply_shortlist(run, picks)`: the 30 cap and frozen decided rows, service role.
  - `review_backlink_opportunities`: works from More, and adds `promote` (More → Review only when there's a slot).
  - `rerank_backlinks(client)`: queues a re-rank run (no searches).
  - `backlink_quota`: the brief's status and missing fields, plus counts for Basics and More.
- **Then:** rolled-back tests, advisors, and regenerated types.

## App code

- **New pure modules:**
  - `search-plan.ts`: brief × places × footprints → queries, the counts per group and the cost.
  - `topic-ideas.ts`
  - `brief.ts`: the zod schema, completeness check and defaults by reach and buyer.
  - **Tests:** a scratch Node script runs the planner for local B2C (deck restoration, Scottsdale), national B2B (web development, US) and global software (SaaS, US + GB) and checks the counts, wording and cap.
- **`classify.ts` / `scoring.ts`:** topic match, the new types, weights from the brief, the competitor rules, the national/global "local" fix.
- **`shortlist.ts`:** candidates → strength → `reviewWithClaude(brief, candidates)` → picks; the rules-only fallback.
- **`src/lib/ai/claude.ts`:** the Anthropic SDK (`@anthropic-ai/sdk`), `ANTHROPIC_API_KEY` (DigitalOcean encrypted, `.env.local`), structured output, timeout, cost written to `ai_calls`. Built after reading the `claude-api` skill; model `claude-haiku-5-5`.
- **`discovery.ts`:**
  - runs the run's saved queries
  - retries failures once
  - classifies with the brief snapshot (saved in the run's `params`)
  - stores results, then calls `shortlist.ts`
  - re-rank runs skip the search steps
- **`actions.ts`:** `saveBrief`, `findPlaces` (builds the plan), `rerankPlaces`, `promotePlace`.
- **UI:**
  - **`/clients/[slug]/backlinks/strategy` page:** brief form, idea chips, required markers, and "What the search will do" preview (counts by group).
  - **Backlinks page:**
    - the Strategy summary card and the places panel
    - tabs **Review (≤30)** · More · Basics · Approved · Rejected · Hidden
    - Review rows show rank #1–30, "Matches: {topic}", Claude's reason and fit
    - More shows "Move to Review"
    - the Find places dialog shows the plan
    - "Re-rank with the brief" in the header menu
  - **"How scores work":** rewritten for the new formula, the AI review and the 30 cap.
- **Also:**
  - **Permission:** `backlinks.strategy` in `roles.ts`.
  - **History wording:** `backlink.brief_saved`, `backlink.reranked`.
  - **Docs:** `docs/plans/backlinks/07-strategy-brief.md` (this plan), `docs/architecture.md`, the `CLAUDE.md` rules (searches come only from the brief × places plan; Review never above 30; AI output only through `dfs_apply_shortlist`; SERP text is untrusted in prompts), and `docs/deploy.md` (`ANTHROPIC_API_KEY`).

## Cost per Find places run

| Part | Typical | Most |
|---|---|---|
| Google searches (failed ones are free) | 30–45 × $0.006 = $0.18–0.27 | 60 × $0.006 = $0.36 |
| Maps competitors, per local place | $0.002 each | — |
| Site strength for new candidates | about $0.03 | $0.05 |
| Claude review | about $0.04 | $0.08 |
| **Total** | **about $0.25–0.40** | **about $0.50** |

A re-rank costs only the AI review (about $0.05). All of it is recorded (`dfs_calls`, `ai_calls`) and limited by the budgets.

## Order of work

1. **Database:** migrations 0037–0038, tests, types.
2. **Brief:** schema, actions, the strategy page, the summary card.
3. **Search plan:** planner and footprints seed, the new request function, the dialog preview.
4. **Classify and score:** classify and scoring changes, retry, the Basics tab and core sets.
5. **Top 30:** shortlist, strength step, the Claude client and review, `dfs_apply_shortlist`, the More tab, promote, re-rank.
6. **Finish:** docs, lint, typecheck and build, commit and push. You add `ANTHROPIC_API_KEY` in DigitalOcean.

## Verification

- **Database** (rolled-back SQL):
  - Find places is refused without a complete brief.
  - A 61-search plan and an operator in a query are refused.
  - Saving the brief bumps its version.
  - `dfs_apply_shortlist` never puts more than 30 places in Review, never changes a decided row, and handles hidden places.
  - Promote is refused when Review is full.
  - A VA can't save the brief.
- **Pure tests:**
  - the planner for the 3 example briefs
  - topic match and competitor rules on real titles from the last run (e.g. crystalinfoway.com "Top 10 Web Development Companies" → competitor; f6s.com and clutch.co → kept)
- **AI review:** with your OK, "Re-rank with the brief" on Stefan Novachki's saved results (about $0.05, no searches). Check that the top 30 are relevant to a US web development firm and that each reason makes sense.
- **Live:** with your OK, about $0.30. Write a local B2C brief for a test client, run Find places, and check the dialog estimate against `dfs_calls`, the Review tab (≤30 with reasons), More and Basics.
- **Display:** phone width and dark mode.

Sources: [Payhip — B2B vs B2C link building](https://payhip.com/socialcart/blog/news/differences-between-b2b-and-b2c-link-building-tactics), [Linkflow — B2B link building](https://linkflow.ai/blog/blog-b2b-link-building/), [Whitespark — local link opportunities](https://whitespark.ca/blog/how-to-find-opportunities-for-local-link-building/), [webtonic — local link building](https://www.webtonic.io/blog/local-link-building), [trustsignals — B2B software review sites 2026](https://www.trustsignals.com/blog/the-top-12-b2b-software-review-sites-2026), [b2bsaasreviews — review sites for B2B services](https://b2bsaasreviews.com/best-b2b-services-review-sites/).
