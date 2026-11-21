# AI Visibility · 00 · Research: REA, Peec AI, and what we can build

Status: research only, nothing built. Written 2026-11-21. Sources are linked at the end.

## 1. The REA tool (github.com/morluto/rea)

### What it is

**REA ("Reverse Engineer Anything")** is an MIT-licensed MCP server plus a CLI (`npx rea-agents setup`). It gives a coding agent tools to inspect software it has no source code for:

- **Native binaries**, through Hopper, Ghidra, IDA or Kuna.
- **JavaScript and Electron apps.**
- **.NET assemblies.**
- **Android apps,** through adb.
- **Firmware.**
- **Network captures** (HAR, SAZ, pcap).
- **Websites,** through a Chrome DevTools connection.

### What it can do with a website

1. Attach to a Chrome browser the user already has open.
2. `inspect_web_page`: record the DOM, the scripts, the resources and network metadata. Cookies and auth headers are always dropped.
3. `analyze_web_bundle`: parse the downloaded JavaScript bundles **without running them**. It derives chunk graphs, route and API-endpoint candidates, vendor fingerprints, and the original source from source maps if the site published them.
4. `observe_web_session`: record navigation while a person clicks through the site.

### What it cannot do

- **It only sees what reaches the browser:** the front-end code and the requests it makes.
- **It cannot see anything that runs on a company's servers:** their scrapers, queues, databases or AI prompts. For Peec, that server side is the actual engine.

### Its own rules

`DISCLAIMER.md` says REA "does not support, and will not help with":

- "copying proprietary software or reproducing its protected code and assets";
- "bypassing authentication, bot protection or access controls on systems you are not authorized to test".

It also says that results "do not grant rights to the original program".

### Why I did not install or run it

- **The intended use breaks both rulebooks.** Cloning Peec's product is what REA's disclaimer excludes, and Peec's terms forbid it (section 2).
- **It wouldn't reach the engine anyway.** The app is at `app.peec.ai` and needs an account. Opening it means accepting Peec's terms, and the engine stays on their servers regardless.
- **Setup changes the agent's own configuration** and installs third-party tooling. I don't do that on my own initiative.
- **The public information was enough.** Peec's marketing site and its public docs at `docs.peec.ai` explain the product in detail, including how they collect data. I read those with the browser instead.

## 2. Peec AI: what it is and how it works

### Legal boundary first

Peec's Terms of Service (v2026-11-11, §1.5) forbid customers to:

- **(c)** "use the Services to develop a similar or competing product";
- **(d)** "reverse engineer, decompile … or seek to access the source code or non-public APIs";
- **(e)** "copy any element of the Services";
- **(l)** access the service with "any engine, software, tool, agent … crawlers, and data mining tools".

What this means for us:

- **Not allowed:** a literal clone of their code, interface, text or design.
- **Allowed:** building our own AI-visibility module from publicly described ideas and industry-standard metrics. "Visibility = % of answers that mention the brand" isn't anyone's property. Ahrefs Brand Radar, Semrush, Profound and others all do the same.

### How Peec collects data (their own docs)

- **The core:** "Peec AI uses UI scraping technology … browser automation to interact with AI platforms through their web interfaces", as a logged-out user. This is the engine.
- **No official APIs:** they don't use the model APIs, because API answers and sources "often differ from what users see".
- **Daily runs:** each tracked prompt runs once every 24 hours, on every selected model and country.

### The product, by area

| Area | What it does |
|---|---|
| **Prompts** | Conversational questions ("What CRM works best for a 10-person sales team?"), not keywords. Organised with topics and tags (personas, funnel stage). Classified as branded or non-branded, and by intent (informational, commercial, transactional). A prompt volume score from 1 to 5. Prompts can be suggested, built from keywords, or bulk-imported. |
| **Chats** | One AI answer per prompt × model × country × day. Each keeps: the answer, the brands mentioned in order, sentiment, query fan-outs, **sources** (every URL it read) and **citations** (URLs referenced inline). |
| **Brand metrics** | **Visibility:** % of answers that mention the brand. **Share of voice:** the brand's mentions ÷ all tracked brands' mentions. **Position:** average rank among every brand in the answer. **Sentiment:** 0–100. **Win rate:** % of answers where the brand is ranked first. All tracked against competitors, by model, country and tag. |
| **Sources** | Per domain and per URL: retrievals, % of chats retrieved, % of chats cited, citation share. Each source is classified as competitor, editorial, reference or UGC. **Gap analysis:** sources where competitors appear and the client doesn't. |
| **Brand perception** | Attributes AI associates with the brand, objections, and fact-checking of AI claims against facts you enter. |
| **Actions** | Recommendations such as "get on G2", "join r/CRM", "pitch NYT", "fix this page", plus content briefs and technical blockers. Actions are tracked against metric changes. |
| **Shopping** | Product-level (SKU) visibility, AI price, and the retailers AI recommends. |
| **Agent analytics** | AI crawler logs (Cloudflare, Vercel, WordPress) and a robots.txt audit. |
| **Agent and MCP** | A chat agent over the data, an MCP server, an API, a Looker Studio connector and CSV exports. |
| **Models** | ChatGPT, Perplexity, AI Overview, AI Mode, Gemini, Naver, ERNIE and Bing AI Mode in their apps, plus about 18 API models (Claude, Grok, DeepSeek, Mistral …). |
| **Pricing (brands)** | Starter: $95/mo for 50 prompts × 3 models, daily. Pro: $245/mo for 150 prompts. Advanced: $495/mo for 350 prompts. |
| **Pricing (agencies)** | $245–795/mo in credits, plus pitch projects for prospects. |

## 3. What we can build

The building blocks are what we already have: DataForSEO, Claude Haiku, the shared backlink setup, and Runs and costs.

### The data sources

| Model or surface | How we'd get it | What we get | Price (DataForSEO pages, to confirm) |
|---|---|---|---|
| ChatGPT (what users see) | DataForSEO **LLM Scraper** `chat_gpt/llm_scraper` | The answer plus the sources shown | from $0.0012 per answer (standard, up to 45 min) |
| Gemini (what users see) | DataForSEO **LLM Scraper** `gemini/llm_scraper` | Same as ChatGPT | same |
| Google AI Overview / AI Mode | DataForSEO **SERP API** (we already pay for it) | The AI block plus the links it uses | same as normal searches |
| Claude, Perplexity, ChatGPT API, Gemini API | DataForSEO **LLM Responses** | The answer through the API | about $0.0006 plus the provider's cost |
| Where brands are mentioned (no runs needed) | DataForSEO **LLM Mentions** | Mentions database lookups | $0.10 per request plus $0.001 per row |
| Prompt demand | DataForSEO **AI Keyword Search Volume** | Volume | $0.0001 per keyword |

This gives the same "what real users see" approach as Peec for ChatGPT, Gemini and Google AI. DataForSEO runs the scraping, so we don't operate scrapers against OpenAI or Google ourselves.

### The module, phase by phase

1. **Project = the client.**
   - It reuses the shared backlink setup: brief, topics, places and countries. The client's brand name, domains and competitors are added on top.
   - It is one more section on the client, like Backlinks.
2. **Prompt library.**
   - **Drafting:** Haiku drafts 20–50 prompts from the brief, as topics × places × buyer intent. The team edits them.
   - **Labels:** tags and topics, branded or non-branded, and intent. Haiku does this classification.
   - **Volume:** taken from the AI keyword volume.
   - **Cap:** limits per client, the way search counts are capped today.
3. **Runs.**
   - **What runs:** each prompt × chosen model × country.
   - **When:** weekly by default, daily optional, from the existing job system. Checkpointed like the AI search tasks, with a budget cap, and recorded in Runs and costs.
4. **Reading each chat.** Haiku returns structured output:
   - every brand mentioned, in order (so Position counts every brand);
   - whether the client and each competitor appear;
   - sentiment from 0 to 100, with the sentence behind it;
   - citations versus sources.
   - The answer text is untrusted data in the prompt, the same rule as today's search snippets.
5. **Dashboard.**
   - Visibility, share of voice, position, sentiment and win rate over time, against competitors.
   - Filters by model, country and tag.
   - Prompt table, chat viewer and sources (domains and URLs, with retrieved % and cited %).
   - Source type: competitor, editorial, directory, UGC or reference.
6. **Gap analysis and actions.** This is where we're stronger than Peec.
   - The sources AI cites, where competitors appear and the client doesn't, go **straight into Backlinks**:
     - as Manual catalog suggestions;
     - as "places" in Shockwave AI Search.
   - Haiku writes a short action for each (get listed, pitch, join the thread, fix our page).
   - The best backlinks are now the ones AI reads, and our backlink system already knows how to work them to Live.
7. **Reports.** A CSV export, plus a client-ready summary card per month.
8. **Later, if wanted:**
   - brand attributes, objections and fact-checking (Haiku over the stored chats);
   - a robots.txt check for AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended);
   - the LLM Mentions lookups.

## 4. What we cannot build, or shouldn't, and why

| Item | Why not |
|---|---|
| **A copy of Peec's code, interface, text or design** | Their terms (§1.5 c, d, e, l) and REA's own disclaimer forbid it, and it would be copyright infringement. We build our own interface in our design system. |
| **Our own browser scrapers for ChatGPT, Gemini, Copilot or Perplexity** (Peec's actual engine) | It breaks those platforms' terms. It needs bot-protection and CAPTCHA evasion, which I won't build. It is a full-time maintenance job, because the interfaces change weekly. We use DataForSEO's scraper for ChatGPT and Gemini instead. |
| **Perplexity, Copilot, Naver, ERNIE or Bing AI Mode as users see them** | DataForSEO's scraper covers only ChatGPT and Gemini. Perplexity and Claude come through their APIs (answers can differ from the app). Naver, ERNIE and Bing are left out. |
| **Peec's 26-model list** | We'd have about 6–7 surfaces: ChatGPT, Gemini and Google AI Overview / AI Mode as users see them, plus Claude, Perplexity and the GPT and Gemini APIs. More could come later through direct provider APIs, at more cost and work. |
| **Their prompt-volume model** | It's proprietary ("AI conversation data"). We'd use DataForSEO's AI keyword volume and Google volume as a proxy, scored 1–5. |
| **Query fan-outs and the ads library** | They depend on whether DataForSEO's scraper returns those fields. Unconfirmed. We'd test with one live call ($0.01) before promising them. |
| **AI Shopping (products and SKUs)** | Possible later. It isn't useful for service clients, and it needs a product feed. |
| **Agent analytics (AI crawler logs)** | It needs log access through Cloudflare, Vercel or WordPress integrations per client. That's a separate project. The robots.txt check is easy. |
| **Peec Agent, MCP server, Looker connector** | Out of scope for a first version. Exports and a report card cover the need. |
| **Daily runs at Peec's scale, cheaply** | Each run costs money (section 5). We'd default to weekly, with daily for chosen clients. |

## 5. Rough running cost per client (estimates, not confirmed)

The example: 40 prompts, run **weekly** (about 4.3 runs a month).

| Surface set | Cost per prompt per run | Cost per month |
|---|---|---|
| **Lean:** ChatGPT and Gemini as users see them, plus Google AI Overview / AI Mode, plus Haiku reading every answer | about $0.02–0.03 | **about $4–6** |
| **Full:** Lean, plus Claude and Perplexity through their APIs | about $0.05–0.08 | **about $9–14** |

- **Daily runs** cost about 7× the weekly figures.
- **For comparison:** Peec Starter is $95 a month for 50 prompts × 3 models daily.
- **Unconfirmed:** the Claude and Perplexity API costs depend on the provider's price per answer with web search, and Haiku's reading cost depends on answer length. Both are estimates until one test run.

## 6. Decisions for you before any build

1. **Go or no-go** on our own AI Visibility module, as described in section 3.
2. **Which surfaces:** Lean (ChatGPT, Gemini, Google AI) or Full (plus Claude and Perplexity).
3. **Frequency:** weekly by default, and which clients get daily.
4. **Prompts per client:** 20, 40 or 50.
5. **Whether gap sources feed Backlinks automatically,** or only as suggestions.

## Sources

- REA: [repository](https://github.com/morluto/rea) · [README](https://github.com/morluto/rea/blob/main/README.md) · [DISCLAIMER](https://github.com/morluto/rea/blob/main/DISCLAIMER.md) · [browser analysis guide](https://github.com/morluto/rea/blob/main/docs/guides/web/browser-observation.md)
- Peec AI:
  - Site: [home](https://peec.ai/) · [AI Visibility](https://peec.ai/product/ai-visibility) · [Brand Perception](https://peec.ai/product/brand-perception) · [Actions](https://peec.ai/product/actions) · [Agent](https://peec.ai/product/agent) · [Agent Analytics](https://peec.ai/product/agent-analytics) · [Shopping](https://peec.ai/product/shopping)
  - Pricing: [brands](https://peec.ai/pricing) · [agencies](https://peec.ai/pricing-agencies)
  - Legal: [Terms of Service](https://peec.ai/legal/terms-of-service/v2026-11-11)
  - Docs: [intro and data collection](https://docs.peec.ai/intro-to-peec-ai) · [metrics](https://docs.peec.ai/metrics-overview) · [sources](https://docs.peec.ai/understanding-sources) · [chats](https://docs.peec.ai/understanding-chats) · [prompts](https://docs.peec.ai/setting-up-your-prompts)
- DataForSEO:
  - Overview: [AI Optimization API](https://dataforseo.com/ai-optimization-api) · [pricing](https://dataforseo.com/pricing/ai-optimization) · [LLM Mentions](https://dataforseo.com/apis/ai-optimization-api/llm-mentions-api)
  - Scraper docs: [ChatGPT LLM Scraper](https://docs.dataforseo.com/v3/ai_optimization-chat_gpt-llm_scraper-live-advanced/) · [Gemini LLM Scraper](https://docs.dataforseo.com/v3/ai_optimization-gemini-llm_scraper-live-advanced/)
  - Guides: [LLM Scraper vs LLM Responses](https://dataforseo.com/blog/llm-scraper-vs-llm-responses-how-to-choose-the-right-ai-data-solution)
