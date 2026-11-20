import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import type { z } from "zod"

import type { Db } from "@/lib/dataforseo/client"
import { hasAnthropicKey } from "@/lib/env.server"

/**
 * Claude calls from server jobs. Every call is written to `ai_calls` with its real cost (tokens,
 * cache reads and writes, and web searches); the monthly AI budgets in dfs_settings read that ledger.
 * The key is ANTHROPIC_API_KEY (DigitalOcean encrypted Run Time variable, .env.local locally).
 *
 * - claudeJson: one structured-output request (no tools), checked against a zod schema.
 * - claudeResearch: one request with Claude's server-side web search; returns the final text and
 *   the search result URLs it saw (callers turn the text into JSON, see ai-search/parse.ts).
 *
 * Model: Claude Haiku 5.5, the cheapest current model. Haiku has no server-side refusal fallback;
 * a refusal throws ClaudeError("refused") and the caller decides what to do.
 */

export const CLAUDE_MODEL = "claude-haiku-5-5"

/**
 * Web search for Haiku 5.5: the basic version (no dynamic filtering, so no code execution
 * container). docs/plans/backlinks/08-shockwave-ai-search.md, Phase 0 findings.
 */
export const WEB_SEARCH_TOOL = "web_search_20250305" as const

/** $ per million tokens (input, output) for prompts up to 100K tokens. Cache reads 10%, writes 125%. */
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
  "claude-sonnet-5-5": [2, 10],
  "claude-sonnet-5": [2, 10],
}

export class ClaudeError extends Error {
  constructor(
    message: string,
    readonly kind: "not_configured" | "refused" | "invalid_output" | "api",
  ) {
    super(message)
    this.name = "ClaudeError"
  }
}

let client: Anthropic | null = null
function anthropic() {
  if (!hasAnthropicKey()) throw new ClaudeError("ANTHROPIC_API_KEY isn't set.", "not_configured")
  client ??= new Anthropic({ timeout: 180_000, maxRetries: 2 })
  return client
}

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
  server_tool_use?: { web_search_requests?: number | null } | null
}

/** Where a call is logged: feature (e.g. "ai_search.judge"), client, run and task. */
export type CallContext = {
  feature: string
  clientId?: string | null
  ref?: string | null
  stage?: string | null
  taskId?: string | null
  /** $ per web search (dfs_settings.web_search_price_usd). */
  searchPrice?: number
}

export type CallUsage = {
  model: string
  inputTokens: number
  outputTokens: number
  cacheRead: number
  cacheWrite: number
  webSearches: number
  cost: number
}

function priceOf(model: string, u: Omit<CallUsage, "model" | "cost">, searchPrice: number) {
  const [pin, pout] = PRICES[model] ?? PRICES[CLAUDE_MODEL]
  return (
    (u.inputTokens * pin + u.cacheRead * pin * 0.1 + u.cacheWrite * pin * 1.25 + u.outputTokens * pout) / 1_000_000 +
    u.webSearches * searchPrice
  )
}

function addUsage(total: CallUsage, u: Usage | null | undefined, model: string, searchPrice: number) {
  if (!u) return
  total.model = model
  total.inputTokens += u.input_tokens ?? 0
  total.outputTokens += u.output_tokens ?? 0
  total.cacheRead += u.cache_read_input_tokens ?? 0
  total.cacheWrite += u.cache_creation_input_tokens ?? 0
  total.webSearches += u.server_tool_use?.web_search_requests ?? 0
  total.cost = priceOf(total.model, total, searchPrice)
}

async function logCall(db: Db, ctx: CallContext, usage: CallUsage, ms: number, ok: boolean, error: string | null) {
  const { error: logError } = await db.from("ai_calls").insert({
    client_id: ctx.clientId ?? null,
    feature: ctx.feature.slice(0, 60),
    model: usage.model.slice(0, 80),
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    cache_read_tokens: usage.cacheRead,
    cache_write_tokens: usage.cacheWrite,
    web_searches: usage.webSearches,
    cost_usd: Math.round(usage.cost * 100000) / 100000,
    ms,
    ok,
    error: error?.slice(0, 500) ?? null,
    ref: ctx.ref ?? null,
    stage: ctx.stage?.slice(0, 40) ?? null,
    task_id: ctx.taskId ?? null,
  })
  if (logError) console.error("[ai] could not record the call", logError.message)
}

/**
 * The system prompt as blocks: the stable part (rules, knowledge, client) is cached, so the
 * many calls of one step pay 10% for it after the first.
 */
function systemBlocks(system: string | { stable: string; tail?: string }): Anthropic.TextBlockParam[] {
  if (typeof system === "string") return [{ type: "text", text: system }]
  const blocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: system.stable, cache_control: { type: "ephemeral" } },
  ]
  if (system.tail) blocks.push({ type: "text", text: system.tail })
  return blocks
}

const emptyUsage = (model: string): CallUsage => ({
  model,
  inputTokens: 0,
  outputTokens: 0,
  cacheRead: 0,
  cacheWrite: 0,
  webSearches: 0,
  cost: 0,
})

function toClaudeError(e: unknown): ClaudeError {
  if (e instanceof ClaudeError) return e
  if (e instanceof Anthropic.APIError) return new ClaudeError(`Claude API error ${e.status ?? ""}: ${e.message}`, "api")
  return new ClaudeError(e instanceof Error ? e.message : String(e), "api")
}

/** One structured-output request. Throws ClaudeError; the call is logged either way. */
export async function claudeJson<S extends z.ZodType>(
  db: Db,
  opts: {
    schema: S
    system: string | { stable: string; tail?: string }
    prompt: string
    feature: string
    clientId?: string | null
    ref?: string | null
    stage?: string | null
    taskId?: string | null
    model?: string
    maxTokens?: number
    effort?: "low" | "medium" | "high"
  },
): Promise<z.infer<S>> {
  return (await claudeJsonWithUsage(db, opts)).data
}

/** claudeJson, plus the usage of the call (for task bookkeeping). */
export async function claudeJsonWithUsage<S extends z.ZodType>(
  db: Db,
  opts: Parameters<typeof claudeJson<S>>[1],
): Promise<{ data: z.infer<S>; usage: CallUsage }> {
  const started = Date.now()
  const model = opts.model ?? CLAUDE_MODEL
  const usage = emptyUsage(model)
  let ok = false
  let error: string | null = null
  try {
    const response = await anthropic().messages.parse({
      model,
      max_tokens: opts.maxTokens ?? 16000,
      system: systemBlocks(opts.system),
      messages: [{ role: "user", content: opts.prompt }],
      output_config: { effort: opts.effort ?? "low", format: zodOutputFormat(opts.schema) },
    })
    addUsage(usage, response.usage, response.model ?? model, 0)
    if (response.stop_reason === "refusal") {
      throw new ClaudeError("Claude declined this request.", "refused")
    }
    if (response.stop_reason === "max_tokens") {
      throw new ClaudeError("Claude's answer was cut off.", "invalid_output")
    }
    if (response.parsed_output == null) {
      throw new ClaudeError("Claude's answer didn't match the expected format.", "invalid_output")
    }
    ok = true
    return { data: response.parsed_output as z.infer<S>, usage }
  } catch (e) {
    const err = toClaudeError(e)
    error = err.message
    throw err
  } finally {
    await logCall(
      db,
      { feature: opts.feature, clientId: opts.clientId, ref: opts.ref, stage: opts.stage, taskId: opts.taskId },
      usage,
      Date.now() - started,
      ok,
      error,
    )
  }
}

export type ResearchResult = {
  text: string
  /** Every search result URL Claude was shown (to catch invented URLs later). */
  sources: { url: string; title: string; pageAge: string | null }[]
  /** The search queries Claude ran. */
  queries: string[]
  usage: CallUsage
}

/**
 * One request with Claude's web search. Claude runs up to `maxSearches` searches located in the
 * market, then answers in text (the caller asked for JSON in the prompt; parse.ts extracts it).
 * Long search turns can stop with `pause_turn`; we resend up to 3 times.
 */
export async function claudeResearch(
  db: Db,
  opts: {
    system: string | { stable: string; tail?: string }
    prompt: string
    ctx: CallContext
    maxSearches: number
    location?: { country?: string | null; city?: string | null; region?: string | null } | null
    blockedDomains?: string[]
    model?: string
    maxTokens?: number
    effort?: "low" | "medium" | "high"
  },
): Promise<ResearchResult> {
  const started = Date.now()
  const model = opts.model ?? CLAUDE_MODEL
  const usage = emptyUsage(model)
  const searchPrice = opts.ctx.searchPrice ?? 0.01
  let ok = false
  let error: string | null = null

  const location =
    opts.location && (opts.location.country || opts.location.city || opts.location.region)
      ? {
          type: "approximate" as const,
          ...(opts.location.country ? { country: opts.location.country.toUpperCase() } : {}),
          ...(opts.location.city ? { city: opts.location.city.slice(0, 255) } : {}),
          ...(opts.location.region ? { region: opts.location.region.slice(0, 255) } : {}),
        }
      : null
  const blocked = [...new Set((opts.blockedDomains ?? []).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d)))].slice(0, 50)

  const tool: Anthropic.WebSearchTool20250305 = {
    type: WEB_SEARCH_TOOL,
    name: "web_search",
    max_uses: Math.max(1, Math.min(10, opts.maxSearches)),
    ...(location ? { user_location: location } : {}),
    ...(blocked.length ? { blocked_domains: blocked } : {}),
  }

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.prompt }]
  const sources = new Map<string, { url: string; title: string; pageAge: string | null }>()
  const queries: string[] = []
  let text = ""

  try {
    for (let turn = 0; turn < 4; turn++) {
      const response = await anthropic().messages.create({
        model,
        max_tokens: opts.maxTokens ?? 6000,
        system: systemBlocks(opts.system),
        messages,
        tools: [tool],
        output_config: { effort: opts.effort ?? "low" },
      })
      addUsage(usage, response.usage as Usage, response.model ?? model, searchPrice)

      for (const block of response.content) {
        if (block.type === "server_tool_use" && block.name === "web_search") {
          const q = (block.input as { query?: unknown } | null)?.query
          if (typeof q === "string") queries.push(q.slice(0, 300))
        }
        if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
          for (const r of block.content) {
            if (r.type === "web_search_result" && typeof r.url === "string") {
              sources.set(r.url, { url: r.url, title: r.title ?? "", pageAge: r.page_age ?? null })
            }
          }
        }
        if (block.type === "text") text += block.text
      }

      if (response.stop_reason === "refusal") throw new ClaudeError("Claude declined this request.", "refused")
      if (response.stop_reason === "pause_turn") {
        // Send the paused turn back unchanged; the server continues it.
        messages.push({ role: "assistant", content: response.content })
        continue
      }
      if (response.stop_reason === "max_tokens" && !text.trim()) {
        throw new ClaudeError("Claude's answer was cut off.", "invalid_output")
      }
      break
    }
    ok = true
    return { text, sources: [...sources.values()], queries, usage }
  } catch (e) {
    const err = toClaudeError(e)
    error = err.message
    throw err
  } finally {
    await logCall(db, opts.ctx, usage, Date.now() - started, ok, error)
  }
}
