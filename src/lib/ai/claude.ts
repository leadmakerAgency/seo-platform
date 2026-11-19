import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import type { z } from "zod"

import type { Db } from "@/lib/dataforseo/client"
import { hasAnthropicKey } from "@/lib/env.server"

/**
 * Claude calls from server jobs. One structured-output request at a time, the reply checked
 * against a zod schema, and every call written to `ai_calls` with its real cost (the monthly
 * AI budget in dfs_settings reads that ledger). The key is ANTHROPIC_API_KEY (DigitalOcean
 * encrypted Run Time variable, .env.local locally).
 *
 * Model: Claude Haiku 5.5, the cheapest current model (about $0.003 per top-30 review). The job
 * is classification with a one-line reason, which Haiku handles well. Haiku has no server-side
 * refusal fallback; a refused review falls back to the rule score in the caller.
 */

export const CLAUDE_MODEL = "claude-haiku-5-5"

/** $ per million tokens (input, output), for the cost ledger. */
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

export async function claudeJson<S extends z.ZodType>(
  db: Db,
  opts: {
    schema: S
    system: string
    prompt: string
    feature: string
    clientId?: string | null
    ref?: string | null
    maxTokens?: number
    effort?: "low" | "medium" | "high"
  },
): Promise<z.infer<S>> {
  const started = Date.now()
  let inputTokens = 0
  let outputTokens = 0
  let cost = 0
  let model = CLAUDE_MODEL
  let ok = false
  let error: string | null = null
  try {
    const response = await anthropic().messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: opts.maxTokens ?? 16000,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
      output_config: { effort: opts.effort ?? "low", format: zodOutputFormat(opts.schema) },
    })
    model = response.model ?? CLAUDE_MODEL
    inputTokens = response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0)
    outputTokens = response.usage.output_tokens
    const [pin, pout] = PRICES[model] ?? PRICES[CLAUDE_MODEL]
    cost = (inputTokens * pin + outputTokens * pout) / 1_000_000
    if (response.stop_reason === "refusal") {
      throw new ClaudeError("Claude declined to review these results.", "refused")
    }
    if (response.stop_reason === "max_tokens") {
      throw new ClaudeError("Claude's answer was cut off.", "invalid_output")
    }
    if (response.parsed_output == null) {
      throw new ClaudeError("Claude's answer didn't match the expected format.", "invalid_output")
    }
    ok = true
    return response.parsed_output as z.infer<S>
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    if (e instanceof ClaudeError) throw e
    if (e instanceof Anthropic.APIError) throw new ClaudeError(`Claude API error ${e.status ?? ""}: ${e.message}`, "api")
    throw new ClaudeError(error, "api")
  } finally {
    const { error: logError } = await db.from("ai_calls").insert({
      client_id: opts.clientId ?? null,
      feature: opts.feature.slice(0, 60),
      model: model.slice(0, 80),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: Math.round(cost * 100000) / 100000,
      ms: Date.now() - started,
      ok,
      error: error?.slice(0, 500) ?? null,
      ref: opts.ref ?? null,
    })
    if (logError) console.error("[ai] could not record the call", logError.message)
  }
}
