# AI Visibility · 02 · Data sources

All calls go through `dfsCall` in `src/lib/dataforseo/client.ts`, which handles the ledger, retries and `DfsError`. AI Optimization calls carry `api: 'ai_optimization'`, a new `dfs_api` value. SERP calls carry `api: 'serp_google'`. Every call has `clientId` and `ref = aiv_runs.id`, so run costs join from `dfs_calls`.

Wrappers live in a new file, `src/lib/dataforseo/ai-optimization.ts`, which has no React imports. **Nothing else may call these endpoints**; this becomes a `CLAUDE.md` rule.

> ⚠ Marked **(verify)** = taken from the public docs but not yet called on our account. Phase 0 confirms it.

## 1. Platforms

| `aiv_model` | What it is | Endpoint | Mode we use | Price (DataForSEO pricing page, 2026-11) |
|---|---|---|---|---|
| `chatgpt` | ChatGPT as a logged-out user sees it | `v3/ai_optimization/chat_gpt/llm_scraper/task_post`, then `.../tasks_ready` and `.../task_get/advanced/{id}` | Standard queue (≤45 min) | $0.0012 per result. Priority is $0.0024; Live is $0.004 |
| `gemini` | Gemini as users see it | `v3/ai_optimization/gemini/llm_scraper/task_post` … | Standard queue | $0.0012 |
| `ai_overview` | Google AI Overview on the results page | `v3/serp/google/organic/task_post` with `load_async_ai_overview: true` **(verify)**, read through the existing `getSerpTask` | SERP standard queue | Normal SERP task price **(verify exact)** |
| `ai_mode` | Google AI Mode | `v3/serp/google/ai_mode/task_post` **(verify name)** | SERP standard queue | **(verify)** |
| `claude` | Claude with web search | `v3/ai_optimization/claude/llm_responses/live` | Live (≤120 s), concurrency 4 | $0.0006 per task plus `money_spent` (the provider's cost) |
| `perplexity` | Perplexity (Sonar) | `v3/ai_optimization/perplexity/llm_responses/live` | Live | $0.0006 plus `money_spent` |

The LLM Responses standard queue is cheaper per task ($0.0002), but it takes up to 72 hours and holds a $0.01 advance. We don't use it.

## 2. Requests

**LLM Scraper** (ChatGPT, Gemini). One task per item; batches of up to 100 tasks per POST.

```json
{ "keyword": "<question, ≤400 chars>", "location_code": 2840, "language_code": "en",
  "force_web_search": false, "tag": "<aiv_tasks.key>" }
```

- **`force_web_search` stays false.** Leaving it off measures what users see; if the AI doesn't search by itself, that is part of the result.
- **The `tag` field** carries our task key. If it comes back in `data.tag`, a result can always be matched to its task.

**LLM Responses** (Claude, Perplexity):

```json
{ "user_prompt": "<question ≤400 chars>", "model_name": "<from .../llm_responses/models>",
  "web_search": true, "web_search_country_iso_code": "US", "max_output_tokens": 2048,
  "temperature": 0.7, "tag": "<key>" }
```

- **Length limit:** `user_prompt` takes 500 characters at most, which is why our questions are capped at 400.
- **No `system_message`.** We want the model's default behaviour.
- **Countries:** `web_search_country_iso_code` accepts a fixed list (AR, AT, AU, BE, BR, CA, CH, CL, CN, DE, DK, ES, FI, FR, GB, HK, ID, IN, IT, JP, KR, MX, MY, NL, NO, NZ, PH, PL, PT, RU, SA, SE, TR, TW, US, ZA). For any other country, the platform runs without a country, and the chat records `country_fallback: true`.
- **Model choice** comes from `dfs_settings.aiv_claude_model` and `aiv_perplexity_model`. Defaults are set from the `/models` list in phase 0. We pick the model the consumer app uses by default: a Sonnet-class model for Claude and `sonar` for Perplexity.

**SERP AI Overview** reuses `postSerpTasks` (it already batches and handles postback). It adds `load_async_ai_overview: true` and `depth: 10`. Only the item with `type = "ai_overview"` is parsed.

**SERP AI Mode** uses the endpoint and fields confirmed in phase 0.

## 3. Response → our normalised shape

Every platform is normalised in `ai-optimization.ts` into one shape. This is the only thing the pipeline stores.

```ts
type NormalizedAnswer = {
  model: AivModel
  modelVersion: string | null       // result.model / result.model_name
  status: "ok" | "empty" | "failed" // empty = no answer text
  text: string                      // markdown, capped at 40,000 chars
  read: SourceRef[]                 // every page the AI looked at
  cited: SourceRef[]                // pages referenced in the answer, in cite order
  fanOut: string[]                  // follow-up searches (≤20)
  ads: { advertiser: string | null; title: string | null; url: string | null; domain: string | null }[]
  brandHints: string[]              // platform-supplied brand names (ChatGPT brand_entities), a hint for analysis
  checkUrl: string | null
  fetchedAt: string
  costUsd: number                   // task cost from the envelope
}
type SourceRef = { url: string; domain: string; title: string | null; snippet: string | null; rank: number }
```

| Field | ChatGPT / Gemini scraper | AI Overview / AI Mode | LLM Responses (Claude, Perplexity) |
|---|---|---|---|
| `text` | `result.markdown` | The AI item's `markdown` or text **(verify)** | Join `items[].sections[].text` of type message **(verify)** |
| `read` | `result.search_results[]` (url, domain, title, description). Duplicates removed by URL, keeping the first | References | The same as `cited`: no separate list |
| `cited` | `result.sources[]` (url, domain, title, snippet) in order. Rank = index + 1 | `references[]` in order | Annotations or citations on the sections **(verify)** |
| `fanOut` | `result.fan_out_queries[]` | Empty | Empty |
| `ads` | `items[]` with `type = "chat_gpt_ad"` **(verify fields)** | Empty | Empty |
| `brandHints` | `result.brand_entities[].title` | Empty | Empty |
| `modelVersion` | `result.model` | `"google"` | `result.model_name` |
| `costUsd` | `tasks[].cost` | `tasks[].cost` | `tasks[].cost` (base plus `money_spent`) |

Normalising also does three things:
- **Strips tracking parameters from URLs:** `utm_*`, `srsltid` and `gclid`.
- **Lower-cases the host and removes `www.`**, using `normalizeHost`.
- **Drops non-http(s) URLs.**

`text` is stored as is: it is untrusted data and is never rendered as HTML (see 06-ui).

## 4. Locations and languages

- **New table `aiv_locations`** (`model_family`, `country_iso`, `location_code`, `language_code`, `synced_at`), filled once a month from `.../chat_gpt/llm_scraper/locations`, `.../gemini/llm_scraper/locations` and the existing SERP locations.
- **At run time:** a question's country (ISO-2) maps to the location code for that platform family.
- **A missing country** means that platform is skipped for that question, and the run counts it in `counts.unsupported`.
- **Language:** the question's language (default: the client's main language, `en`), checked against the languages list.

## 5. Errors

| DataForSEO response | What we do |
|---|---|
| `DfsError` kind `funds` (40200, 40210, 40203) | Stop the run (`StopRun`): "The DataForSEO balance is too low". Notify admins |
| Access refused for AI Optimization (40204–40206 or a 403-style code) **(verify code)** | Stop: "AI Optimization access isn't active on the DataForSEO account". Mark `dfs_settings.aiv_access = 'denied'`. The page shows a setup notice |
| A task-level error (40501 bad keyword, 40102 no results) | That chat becomes `failed` with the message. No retry |
| `server` or `network` (retried by `dfsCall`) | After `dfsCall` gives up, retry once in the next tick, then `failed` |
| Queue result not ready after 2 hours | `failed` ("no result from the platform") |

A failed chat is excluded from every metric's denominator.

## 6. Unit prices used by the estimate

Kept in `src/features/ai-visibility/config.ts` as `UNIT_USD` and updated after phase 0:

| Model | Assumed $ per answer |
|---|---|
| chatgpt | 0.0012 |
| gemini | 0.0012 |
| ai_overview | 0.0020 (verify) |
| ai_mode | 0.0020 (verify) |
| claude | 0.0006 + about 0.012 |
| perplexity | 0.0006 + about 0.006 |
| Haiku analysis per answer | about 0.0006 |
| Haiku per run (domains, insights, actions) | about 0.01 |

**Estimate per run** = Σ(active questions × enabled platforms × unit) + answers × 0.0006 + 0.01, then × 1.1.

For 50 questions on 6 platforms: 50 × 0.0254 + 300 × 0.0006 + 0.01 = **about $1.46**, or **about $1.6 with the margin**. That is **about $6.9 a month** weekly. **(verify)**

## 7. Phase 0 spike (one call per platform, about $0.05, only with your yes)

The script is `scripts/aiv-spike.ts`, run with `npx tsx`. It reads `.env.local` and writes into `dfs_calls` with `ref = null`.

1. **`GET .../llm_responses/models`** for Claude and Perplexity. Record the model names that support `web_search`.
2. **One question each**, for example "best web design agency in Scottsdale AZ", in the US:
   - ChatGPT and Gemini scraper (`task_post`, poll `tasks_ready`, `task_get/advanced`);
   - AI Overview (`load_async_ai_overview`);
   - AI Mode;
   - Claude and Perplexity live.
3. **Save the raw JSON** to `scratch/aiv-spike/<model>.json`, outside the repo, then write down:
   - the exact paths of answer text, sources, citations, fan-outs, ads and model version;
   - the error codes;
   - whether `tag` comes back;
   - whether `postback_url` works for `llm_scraper task_post`;
   - the real cost of each call from `dfs_calls`.
4. **Update this file:** remove the **(verify)** marks and set `UNIT_USD`.
