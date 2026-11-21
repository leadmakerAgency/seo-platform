"use server"

import { refresh } from "next/cache"
import { after } from "next/server"

import type { ActionResult } from "@/features/tasks/schemas"
import { PermissionError, requirePermission } from "@/lib/auth"
import type { Db } from "@/lib/dataforseo/client"
import { hasAnthropicKey, hasDataForSeo } from "@/lib/env.server"
import type { Permission } from "@/lib/roles"
import type { Json } from "@/lib/supabase/database.types"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { siteKeyOf } from "../backlinks/site-key"
import { AIV_MODELS, MODEL_META, planAiVisibility, PROMPT_MAX, type AivModel } from "./config"
import { processAiVisibility, suggestQuestions } from "./pipeline"
import { getChats, getGap, getOverview, getSourceDomains } from "./queries"

/** AI Visibility actions. Each checks its permission here; the database functions check again. */

async function guard(permission: Permission): Promise<string | null> {
  try {
    await requirePermission(permission)
    return null
  } catch (error) {
    if (error instanceof PermissionError) return error.message
    throw error
  }
}

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)

function dbError(error: { code?: string; message?: string } | null, fallback: string) {
  if (["P0001", "P0002", "42501", "22023"].includes(error?.code ?? "") && error?.message) return error.message
  return fallback
}

/** Start working a run after the response; the cron picks it up again if this stops. */
function kick() {
  if (!hasSupabaseSecretKey() || !hasDataForSeo()) return
  const db = createSupabaseAdminClient() as unknown as Db
  after(async () => {
    try {
      await processAiVisibility(db, 1)
    } catch (e) {
      console.error("[ai-visibility] start failed", e)
    }
  })
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export async function seedProject(clientId: string): Promise<ActionResult> {
  const denied = await guard("ai_visibility.manage")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const db = await createSupabaseServerClient()
  const { error } = await db.rpc("seed_aiv_from_setup", { p_client_id: clientId })
  if (error) return { ok: false, error: dbError(error, "Couldn't start the setup. Try again.") }
  refresh()
  return { ok: true }
}

export type ProjectInput = {
  brandName: string
  description: string
  industry: string
  personas: string[]
  brandIdentity: string[]
  models: AivModel[]
  countries: string[]
  frequency: "weekly" | "twice_weekly" | "daily"
  runWeekday: number
  paused: boolean
  ownNames: string[]
  ownDomains: string[]
}

export async function saveProject(clientId: string, v: ProjectInput): Promise<ActionResult<{ version: number }>> {
  const denied = await guard("ai_visibility.manage")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const db = await createSupabaseServerClient()
  const { data, error } = await db.rpc("save_aiv_project", {
    p_client_id: clientId,
    p: {
      brand_name: v.brandName,
      description: v.description,
      industry: v.industry,
      personas: v.personas,
      brand_identity: v.brandIdentity,
      models: v.models.filter((m) => (AIV_MODELS as readonly string[]).includes(m)),
      countries: v.countries.map((c) => c.toUpperCase()),
      frequency: v.frequency,
      run_weekday: v.runWeekday,
      paused: v.paused,
      own_names: v.ownNames,
      own_domains: v.ownDomains,
    } as unknown as Json,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't save the setup. Try again.") }
  refresh()
  return { ok: true, data: { version: Number((data as { version?: number } | null)?.version ?? 1) } }
}

export async function saveBrand(
  clientId: string,
  v: { id?: string; displayName: string; trackedNames: string[]; pattern: string; domains: string[]; active?: boolean },
): Promise<ActionResult<{ id: string }>> {
  const denied = await guard("ai_visibility.manage")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const db = await createSupabaseServerClient()
  const { data, error } = await db.rpc("save_aiv_brand", {
    p_client_id: clientId,
    p: {
      id: v.id ?? null,
      display_name: v.displayName,
      tracked_names: v.trackedNames,
      pattern: v.pattern,
      domains: v.domains,
      active: v.active ?? true,
    } as unknown as Json,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't save the brand. Try again.") }
  refresh()
  return { ok: true, data: { id: String(data) } }
}

export async function saveTopic(clientId: string, v: { id?: string; name?: string; delete?: boolean }): Promise<ActionResult> {
  const denied = await guard("ai_visibility.manage")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const db = await createSupabaseServerClient()
  const { error } = await db.rpc("save_aiv_topic", { p_client_id: clientId, p: v as unknown as Json })
  if (error) return { ok: false, error: dbError(error, "Couldn't save the topic.") }
  refresh()
  return { ok: true }
}

export async function updateSettings(v: { monthlyBudgetUsd: number; maxRunUsd: number; manualRuns: number }): Promise<ActionResult> {
  const denied = await guard("ai_visibility.frequency")
  if (denied) return { ok: false, error: denied }
  if (![v.monthlyBudgetUsd, v.maxRunUsd, v.manualRuns].every((n) => Number.isFinite(n) && n >= 0)) {
    return { ok: false, error: "Use positive numbers." }
  }
  const db = await createSupabaseServerClient()
  const { error } = await db.rpc("update_aiv_settings", {
    p: { monthly_budget_usd: v.monthlyBudgetUsd, max_run_usd: v.maxRunUsd, manual_runs_per_client_month: Math.round(v.manualRuns) },
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't save the budgets.") }
  refresh()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export type PromptInput = { text: string; country?: string; topic?: string; topicId?: string | null; tags?: string[]; intent?: string; persona?: string }

export async function addPrompts(clientId: string, items: PromptInput[], source: "team" | "import" = "team"): Promise<ActionResult<{ added: number; skipped: number }>> {
  const denied = await guard("ai_visibility.manage")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const clean = items
    .map((i) => ({ ...i, text: i.text.replace(/\s+/g, " ").trim() }))
    .filter((i) => i.text.length > 0)
  if (!clean.length) return { ok: false, error: "Write at least one question." }
  if (clean.some((i) => i.text.length > PROMPT_MAX)) return { ok: false, error: `Keep each question under ${PROMPT_MAX} characters.` }
  const db = await createSupabaseServerClient()
  const { data, error } = await db.rpc("save_aiv_prompts", {
    p_client_id: clientId,
    p_items: clean.slice(0, 100).map((i) => ({
      text: i.text, country: i.country, topic: i.topic, topic_id: i.topicId, tags: i.tags ?? [], intent: i.intent, persona: i.persona, source,
    })) as unknown as Json,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't add the questions. Try again.") }
  refresh()
  const r = (data ?? {}) as { added?: number; skipped?: number }
  return { ok: true, data: { added: Number(r.added ?? 0), skipped: Number(r.skipped ?? 0) } }
}

export async function updatePrompts(
  ids: string[],
  patch: { tagsAdd?: string[]; tagsRemove?: string[]; topicId?: string | null; topic?: string; status?: "active" | "archived"; intent?: string; text?: string; delete?: boolean },
): Promise<ActionResult> {
  const denied = await guard("ai_visibility.manage")
  if (denied) return { ok: false, error: denied }
  const valid = ids.filter(isUuid)
  if (!valid.length) return { ok: false, error: "Pick at least one question." }
  const p: Record<string, unknown> = {}
  if (patch.tagsAdd) p.tags_add = patch.tagsAdd
  if (patch.tagsRemove) p.tags_remove = patch.tagsRemove
  if (patch.topicId !== undefined) p.topic_id = patch.topicId
  if (patch.topic !== undefined) p.topic = patch.topic
  if (patch.status) p.status = patch.status
  if (patch.intent) p.intent = patch.intent
  if (patch.text !== undefined) p.text = patch.text
  if (patch.delete) p.delete = true
  const db = await createSupabaseServerClient()
  const { error } = await db.rpc("update_aiv_prompts", { p_ids: valid, p: p as Json })
  if (error) return { ok: false, error: dbError(error, "Couldn't update the questions. Try again.") }
  refresh()
  return { ok: true }
}

export async function reviewSuggestion(id: string, accept: boolean): Promise<ActionResult> {
  const denied = await guard("ai_visibility.manage")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(id)) return { ok: false, error: "Unknown suggestion." }
  const db = await createSupabaseServerClient()
  const { error } = await db.rpc("review_aiv_suggestion", { p_id: id, p_accept: accept })
  if (error) return { ok: false, error: dbError(error, "Couldn't update the suggestion.") }
  refresh()
  return { ok: true }
}

/** Ask Haiku for question ideas now (about $0.005). They land in the suggestions list. */
export async function suggestPromptsNow(clientId: string, count = 20): Promise<ActionResult<{ added: number }>> {
  const denied = await guard("ai_visibility.manage")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  if (!hasAnthropicKey()) return { ok: false, error: "Claude isn't connected yet. An admin adds ANTHROPIC_API_KEY on the server." }
  if (!hasSupabaseSecretKey()) return { ok: false, error: "The server is missing its database key (SUPABASE_SECRET_KEY)." }
  const user = await createSupabaseServerClient()
  const { data: problem } = await user.rpc("aiv_budget_problem")
  if (problem) return { ok: false, error: String(problem) }
  const db = createSupabaseAdminClient() as unknown as Db
  const [{ data: project }, { data: client }, { data: topics }] = await Promise.all([
    user.from("aiv_projects").select("*").eq("client_id", clientId).maybeSingle(),
    user.from("clients").select("website").eq("id", clientId).maybeSingle(),
    user.from("aiv_topics").select("name").eq("client_id", clientId),
  ])
  if (!project) return { ok: false, error: "Set up AI visibility for this client first." }
  try {
    const added = await suggestQuestions(
      { db, clientId, project, topics: (topics ?? []).map((t) => t.name), website: client?.website ?? null },
      Math.min(30, Math.max(5, count)),
      true,
    )
    refresh()
    return { ok: true, data: { added } }
  } catch (e) {
    console.error("[ai-visibility] suggest failed", e)
    return { ok: false, error: "Couldn't get suggestions right now. Try again in a minute." }
  }
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export async function runNow(clientId: string, promptIds?: string[]): Promise<ActionResult<{ runId: string; estimate: number }>> {
  const denied = await guard("ai_visibility.manage")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  if (!hasDataForSeo()) return { ok: false, error: "DataForSEO isn't connected yet." }
  if (!hasSupabaseSecretKey()) return { ok: false, error: "The server is missing its database key (SUPABASE_SECRET_KEY)." }
  const db = await createSupabaseServerClient()
  const [{ data: project }, { count }] = await Promise.all([
    db.from("aiv_projects").select("models").eq("client_id", clientId).maybeSingle(),
    promptIds?.length
      ? Promise.resolve({ count: promptIds.filter(isUuid).length })
      : db.from("aiv_prompts").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("status", "active"),
  ])
  if (!project) return { ok: false, error: "Set up AI visibility for this client first." }
  const plan = planAiVisibility({ prompts: count ?? 0, models: project.models as AivModel[] })
  const { data, error } = await db.rpc("request_aiv_run", {
    p_client_id: clientId,
    p_estimate: Math.max(0.0001, plan.estimateUsd),
    p_prompt_ids: promptIds?.length ? promptIds.filter(isUuid) : undefined,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't start the check. Try again.") }
  kick()
  refresh()
  return { ok: true, data: { runId: String(data), estimate: plan.estimateUsd } }
}

// ---------------------------------------------------------------------------
// Actions and Backlinks
// ---------------------------------------------------------------------------

export async function updateAction(id: string, patch: { status?: "new" | "in_progress" | "done" | "declined"; title?: string; detail?: string }): Promise<ActionResult> {
  const denied = await guard("ai_visibility.work")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(id)) return { ok: false, error: "Unknown action." }
  const db = await createSupabaseServerClient()
  const { error } = await db.rpc("update_aiv_action", { p_id: id, p: patch as unknown as Json })
  if (error) return { ok: false, error: dbError(error, "Couldn't update the action.") }
  refresh()
  return { ok: true }
}

export async function addAction(
  clientId: string,
  v: { group: "site" | "own_pages" | "earned"; title: string; detail: string; url?: string; impact?: "high" | "medium" | "low" },
): Promise<ActionResult> {
  const denied = await guard("ai_visibility.work")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const db = await createSupabaseServerClient()
  const { error } = await db.rpc("add_aiv_action", {
    p_client_id: clientId,
    p: { group: v.group, title: v.title, detail: v.detail, url: v.url ?? null, domain: v.url ?? null, impact: v.impact ?? "medium" } as unknown as Json,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't add the action.") }
  refresh()
  return { ok: true }
}

const DIRECTORY_TYPE: Record<string, string> = {
  editorial: "news_blog",
  directory: "business_directory",
  ugc: "community",
  reference: "resource_page",
  ecommerce: "marketplace",
  social: "social",
}

export async function sendToBacklinks(
  clientId: string,
  v: { domain: string; url: string | null; type: string; answers: number; competitors: string[]; models: string[]; actionId?: string | null },
): Promise<ActionResult<{ existed: boolean }>> {
  const denied = await guard("ai_visibility.work")
  if (denied) return { ok: false, error: denied }
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const key = siteKeyOf(v.url ?? `https://${v.domain}/`) ?? siteKeyOf(`https://${v.domain}/`)
  if (!key) return { ok: false, error: "That doesn't look like a website address." }
  const platforms = v.models.map((m) => MODEL_META[m as AivModel]?.short ?? m).slice(0, 3).join(", ")
  const reason = `AI answers use this site in ${v.answers} answer${v.answers === 1 ? "" : "s"}${platforms ? ` (${platforms})` : ""} where ${v.competitors.slice(0, 3).join(", ")} ${v.competitors.length === 1 ? "is" : "are"} named and the client isn't.`
  const db = await createSupabaseServerClient()
  const { data, error } = await db.rpc("send_aiv_source_to_backlinks", {
    p_client_id: clientId,
    p: {
      site_key: key.siteKey, domain: key.domain, url: v.url, name: key.domain, type: DIRECTORY_TYPE[v.type] ?? "other",
      reason: reason.slice(0, 200), action_id: v.actionId ?? null,
    } as unknown as Json,
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't send it to Backlinks. Try again.") }
  refresh()
  return { ok: true, data: { existed: Boolean((data as { existed?: boolean } | null)?.existed) } }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csv = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")

export async function exportAiVisibility(
  clientId: string,
  kind: "brands" | "prompts" | "sources" | "gap" | "chats",
  f: Record<string, unknown>,
): Promise<ActionResult<{ csv: string }>> {
  if (!isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const db = await createSupabaseServerClient()
  if (kind === "brands") {
    const o = await getOverview(clientId, f)
    return {
      ok: true,
      data: {
        csv: csv([
          ["Brand", "Client", "Visibility %", "Share of voice %", "Position", "Sentiment", "Win rate %", "Answers mentioning"],
          ...o.brands.map((b) => [b.name, b.isOwn ? "yes" : "", b.visibility, b.sov, b.position, b.sentiment, b.winRate, b.mentioned]),
        ]),
      },
    }
  }
  if (kind === "prompts") {
    const [{ data: prompts }, stats] = await Promise.all([
      db.from("aiv_prompts").select("id, text, country, tags, intent, branded, volume, status").eq("client_id", clientId),
      db.rpc("aiv_prompt_table", { p_client_id: clientId, f: f as unknown as Json }),
    ])
    const byId = new Map(((stats.data ?? []) as { prompt_id: string; visibility: number | null; avg_position: number | null; sentiment: number | null; answers: number }[]).map((s) => [s.prompt_id, s]))
    return {
      ok: true,
      data: {
        csv: csv([
          ["Question", "Country", "Tags", "Intent", "Branded", "Volume (1-5)", "Status", "Answers", "Visibility %", "Position", "Sentiment"],
          ...(prompts ?? []).map((p) => {
            const s = byId.get(p.id)
            return [p.text, p.country, p.tags.join("; "), p.intent, p.branded ? "yes" : "", p.volume, p.status, s?.answers ?? 0, s?.visibility, s?.avg_position, s?.sentiment]
          }),
        ]),
      },
    }
  }
  if (kind === "sources") {
    const d = await getSourceDomains(clientId, f, null, 2000, 0)
    return {
      ok: true,
      data: {
        csv: csv([
          ["Domain", "Type", "Retrievals", "Retrieved %", "Cited %", "Citation share %", "Avg cite rank"],
          ...d.rows.map((r) => [r.domain, r.isOwn ? "own" : r.brandId ? "competitor" : r.type, r.retrievals, r.retrievedPct, r.citedPct, r.citationShare, r.avgCiteRank]),
        ]),
      },
    }
  }
  if (kind === "gap") {
    const g = await getGap(clientId, f, 200)
    return {
      ok: true,
      data: {
        csv: csv([
          ["Domain", "Type", "Gap answers", "Competitors", "Gap score", "Platforms", "Sample pages", "In Backlinks"],
          ...g.map((r) => [r.domain, r.type, r.gapAnswers, r.competitors.join("; "), r.gapScore, r.models.join("; "), r.urls.join(" "), r.inBacklinks ? "yes" : ""]),
        ]),
      },
    }
  }
  const rows: unknown[][] = [["Date", "Platform", "Country", "Question", "Client named", "Brands named (in order)", "Sources"]]
  for (let offset = 0; offset < 10_000; offset += 500) {
    const page = await getChats(clientId, f, { limit: 500, offset })
    for (const c of page.rows) {
      rows.push([c.runDate, MODEL_META[c.model]?.label ?? c.model, c.country, c.prompt, c.ownMentioned ? "yes" : "", c.mentions.map((m) => m.name).join("; "), c.sources])
    }
    if (page.rows.length < 500) break
  }
  return { ok: true, data: { csv: csv(rows) } }
}
