# Rankings phase 4: the page and the rest of the app

Part of the Rankings plan (`00-overview.md`). Follows `docs/design-system.md`.

## `/clients/[slug]/rankings` (`?tab=keywords|research|settings`)

- **Header**: where and how rankings are checked, last and next check; **Add keywords**, **Check
  now** (managers); "Weak keywords: N" link.
- **Keywords**: `StatStrip` (Top 3, Top 10, Top 20, Not in top 100, In map pack, with change since
  last week); table (keyword + intent/topic/weak flag, Google position with change and start, Maps,
  Bing, city searches, difficulty, ranking page, updated); row sheet with a 12-week chart (one line
  per engine, inverted axis, gaps for missing weeks), SERP features, monthly trend, Replace / Stop
  tracking. Empty state starts research to pick the first keywords.
- **Find better keywords**: research status and cost, "Run research" with runs left this month,
  suggested swaps (weak keyword, reasons, replacement, Replace / Keep), candidates table with
  filters and Track / Dismiss.
- **Settings** (admins, managers): location picker, language, engines, check weekday, pause, Maps
  business picker, topic and negative terms; admin card with DataForSEO balance, spend vs budget,
  failed tasks, budget and research limit.

## Elsewhere

- `src/lib/navigation.ts`: Rankings `comingSoon: false`.
- `src/lib/roles.ts`: `rankings.manage` (admins, managers).
- History wording (`src/features/team/activity.ts`): `keyword.added`, `keyword.removed`,
  `keyword.replaced`, `keyword.research_finished`, `rank.check_finished`.
- Dashboard client list: "Google top 10 (x/20)".
- Docs: `docs/architecture.md` (Rankings section, cron, postback), `CLAUDE.md` rule, `docs/deploy.md`
  (DataForSEO env vars).

## Done when

All three tabs work on Test Client in light and dark mode and at 375 px; lint, typecheck and build
pass; pushed and checked live.
