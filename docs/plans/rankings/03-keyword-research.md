# Rankings phase 3: finding better keywords

Part of the Rankings plan (`00-overview.md`). On demand (and when tracking is first set up), find
keywords that bring more local customers, flag weak tracked keywords and suggest swaps. The team
approves every change.

## Research run (`runResearch`, one at a time per client, resumable)

Each step saves its output in `keyword_research_runs.params/counts` and bumps `heartbeat_at`;
cron resumes a run whose heartbeat is older than 10 minutes, and fails it after 3 attempts.

| Step | Call | Notes |
|---|---|---|
| 1 Context | — | domain, country code (Labs), city code (Google Ads), topic terms, negative terms, tracked keywords |
| 2 Already ranking | `labs/google/ranked_keywords/live` (limit 1000, `search_volume > 0`, item_types organic + local_pack) | national position and URL |
| 3 Ideas | `labs/google/keyword_ideas/live` (≤ 20 seeds: service × {"", city, "near me"} + primary category; limit 700; volume ≥ 10) | |
| 4 Suggestions / related | `keyword_suggestions` (top 3 service seeds, limit 200), `related_keywords` (depth 2, top 2 seeds) | |
| 5 Competitors | `competitors_domain` (exclude top domains, limit 10) → top 3 non-directory domains → `ranked_keywords` each (topic-filtered, limit 300) | "competitors rank, you don't" |
| 6 Clean up | — | normalize, dedupe, relevance gate, negative terms, other-language out, group by `core_keyword` |
| 7 City volume | `keywords_data/google_ads/search_volume/live` at the city code (≤ 1000 per call, 12/min) | skip keywords cached < 35 days in `keyword_metrics` |
| 8 Score and save | — | upsert `keyword_candidates`, weak flags, swaps, `keyword.research_finished`, notify requester |

Estimated cost about $0.50 per run; blocked by the monthly budget and the per-client run limit
(`dfs_settings`).

## Score (pure function, `scoring.ts`)

`score = 100 × (0.40 volume + 0.20 intent + 0.20 ease + 0.10 value + 0.10 quick win)`

- volume: `min(1, log10(city volume + 1) / 3)`; without a city figure, national at half weight
  (flagged "national estimate")
- intent: transactional 1, commercial 0.9, informational 0.3, navigational 0.2, unknown 0.5
- ease: `1 − difficulty / 100` (unknown 0.5)
- value: `min(1, cpc / 20)`
- quick win: current position 4–20 → 1, 21–50 → 0.5

## Weak tracked keywords (each reason shown in plain words)

- fewer than 10 searches a month in the city
- informational intent ("people are looking for information, not a business")
- not in the top 100 after 8 weekly checks while difficulty is over 40
- duplicate: same `core_keyword` as a stronger tracked keyword
- score under 35

Suggested swap: the best untracked candidate on the same topic scoring at least 15 points more.

## Done when

A run on Test Client completes, costs are in `dfs_calls`, candidates show sources, city and
national volume, difficulty and intent; weak keywords show reasons and a swap; Replace archives
the old keyword (history kept), tracks the new one and starts its first check.
