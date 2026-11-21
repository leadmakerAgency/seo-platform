# AI Visibility · 01 · Overview

Status: built (2026-11-21), not yet tested live. Phase 0 was skipped at the user's request: fields marked (verify) in 02 are read defensively and confirmed by the first real check. The research is in [00-research.md](00-research.md).

## What it is

Each client gets an **AI visibility** section at `/clients/[slug]/ai-visibility`. The nav item already exists as "coming soon". The section shows:

- **How AI platforms talk about the client and its competitors:** ChatGPT, Gemini, Google's AI Overview and AI Mode, Claude and Perplexity.
- **Which websites those answers rely on**, as pages read and pages cited.
- **What to do to appear more often.** These actions feed Backlinks and count as "AI visibility fixes" on the Overview.

It follows the process Peec AI describes publicly: questions (prompts), answers (chats), brands, sources and actions. The metric definitions are industry-standard. The code, interface and wording are our own. We don't copy Peec's product, use REA on it, or scrape AI apps ourselves (see 00-research §1–2).

## Decisions

| Topic | Decision |
|---|---|
| Platforms | All 6, each switchable per client: `chatgpt` and `gemini` as users see them (DataForSEO LLM Scraper), `ai_overview` and `ai_mode` (DataForSEO SERP), `claude` and `perplexity` (DataForSEO LLM Responses with web search) |
| Frequency | Weekly by default. An admin can switch a client to twice a week or daily |
| Questions | At most 50 active per client |
| Countries | Up to 3 per client, taken from the Backlinks places. Each question runs in one country |
| Backlinks hand-off | Suggested only. "Send to Backlinks" creates a place in Standard Search Review with the evidence attached |
| Who | Admins and managers set it up. VAs work the actions. Viewers can read |
| Models used inside | Claude Haiku (`claude-haiku-5-5`, the existing `src/lib/ai/claude.ts`) for analysis, source types, suggestions and actions |
| Budget | A separate AI Visibility monthly budget (default $40) and a per-run cap (default $5) |

## The process

```
Setup ─► Questions ─► Scheduled run ─► Answers ─► Analysis ─► Metrics ─► Sources & gaps ─► Actions ─► Backlinks / Overview
 (profile,  (≤50, topics,   (weekly cron    (6 platforms,  (brands,    (visibility,  (read vs cited,   (owned, earned,  (Send to Backlinks,
  brands,    tags, intent,   or Run now)     DataForSEO)    position,   SoV, position, domain types,     site fixes)      work_items)
  platforms) country)                                       sentiment)  sentiment, win) gap score)
```

## Documents

| File | Contents |
|---|---|
| [02-data-sources.md](02-data-sources.md) | DataForSEO endpoints, parameters, field mapping, prices, the phase 0 spike |
| [03-data-model.md](03-data-model.md) | Enums, tables, RLS, RPCs, read functions, migrations `0052`–`0055` |
| [04-pipeline.md](04-pipeline.md) | Run lifecycle, scheduling, dispatch and collect, budgets, retries, cron |
| [05-analysis.md](05-analysis.md) | Brand matching, position, sentiment, source types, metric formulas, Haiku prompts |
| [06-ui.md](06-ui.md) | Page, tabs, filters, charts, sheets, empty states, permissions |
| [07-actions-backlinks.md](07-actions-backlinks.md) | Actions engine, gap analysis, Send to Backlinks, work_items, Overview |
| [08-checks.md](08-checks.md) | Verification checklist for each phase |

## Build phases

Each phase ends with `npm run lint`, `npm run typecheck` and `npm run build` passing.

| # | Phase | Ends with |
|---|---|---|
| 1 | These documents | Docs committed |
| 2 | **Phase 0 spike.** One live call per platform, about $0.05, only after a yes | `02-data-sources.md` updated with the real fields and costs |
| 3 | Database: migrations `0052`–`0055`, rolled-back SQL tests, advisors, types | Tables and functions live |
| 4 | Data fetchers: `src/lib/dataforseo/ai-optimization.ts`, the AI Overview and AI Mode parsers, location sync | Pure parse tests pass |
| 5 | Setup: project, brands, topics, questions, Haiku suggestions, settings tab, setup gate, nav flag, permissions | A client can be set up |
| 6 | Pipeline: queue, claim, dispatch, collect, analyse, classify, insights, finish, cron route, Runs and costs | A run completes end to end |
| 7 | Dashboard: filter bar, Overview, Prompts, Chats, Brands (insights and matrix), Sources and gap, TrendChart, export | All tabs show data |
| 8 | Actions: engine, Send to Backlinks (Review badge), work_items, Overview `ai_place` | The loop closes |
| 9 | Finish: architecture doc, `CLAUDE.md` rules, check no runs are open, commit and push | Shipped |

## Shared-folder rules

- **Commits:** `git add` only this feature's paths. The Manual Search work may be in progress in the same folder.
- **Migration numbers:** check `ls supabase/migrations` before numbering. The plan starts at `0052`.
- **Pushing:** never push while a backlink, AI search, strength or AI visibility run is open, because a redeploy pauses running jobs.

## Not in the first version (phase 2)

- Fact-checking AI claims against facts you enter ("Fix wrong claims").
- Brand perception: attributes and objections.
- LLM Mentions database lookups, as a benchmark without running questions.
- AI Shopping (products and SKUs).
- AI-crawler logs through Cloudflare, Vercel or WordPress.
- An agent or MCP server over the data, a Looker connector, and PDF reports.
