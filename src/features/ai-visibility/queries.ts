import "server-only"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { ActionGroup, AivFrequency, AivIntent, AivModel } from "./config"

/** Reads for the AI Visibility page. Every read goes through RLS (security-invoker functions). */

type Rec = Record<string, unknown>
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v))
type Filter = Record<string, unknown>

export type AivProject = {
  brandName: string
  description: string | null
  industry: string | null
  personas: string[]
  brandIdentity: string[]
  models: AivModel[]
  countries: string[]
  language: string
  frequency: AivFrequency
  runWeekday: number
  nextRunAt: string | null
  paused: boolean
  version: number
}

export type AivBrand = {
  id: string
  isOwn: boolean
  name: string
  trackedNames: string[]
  pattern: string | null
  domains: string[]
  colorSlot: number
  active: boolean
  source: string
}

export type AivTopic = { id: string; name: string }

export type AivPrompt = {
  id: string
  text: string
  topicId: string | null
  country: string
  tags: string[]
  intent: AivIntent | null
  branded: boolean
  persona: string | null
  volume: number | null
  status: "active" | "archived"
  source: string
  createdAt: string
}

export type AivSuggestion = { id: string; kind: "prompt" | "brand" | "topic"; payload: Rec; reason: string | null; mentions: number }

export type AivQuota = {
  hasProject: boolean
  setupMissing: string[]
  activePrompts: number
  promptCap: number
  budgetProblem: string | null
  monthSpend: number
  monthlyBudget: number
  maxRunUsd: number
  manualLimit: number
  manualUsed: number
  access: "unknown" | "active" | "denied"
  openRun: { id: string; status: string; stage: number; counts: Rec; createdAt: string; trigger: string; tasks: Record<string, number> } | null
  lastRun: { id: string; status: string; error: string | null; counts: Rec; createdAt: string; finishedAt: string | null; costUsd: number } | null
  lastDoneAt: string | null
}

export type AivBase = {
  quota: AivQuota
  project: AivProject | null
  brands: AivBrand[]
  topics: AivTopic[]
  prompts: AivPrompt[]
  suggestions: AivSuggestion[]
  actionCounts: Record<string, number>
}

export async function getAivBase(clientId: string): Promise<AivBase> {
  const db = await createSupabaseServerClient()
  const [quotaRes, projectRes, brandsRes, topicsRes, promptsRes, sugRes, actionsRes] = await Promise.all([
    db.rpc("aiv_quota", { p_client_id: clientId }),
    db.from("aiv_projects").select("*").eq("client_id", clientId).maybeSingle(),
    db.from("aiv_brands").select("*").eq("client_id", clientId).order("is_own", { ascending: false }).order("created_at"),
    db.from("aiv_topics").select("id, name").eq("client_id", clientId).order("sort"),
    db.from("aiv_prompts").select("*").eq("client_id", clientId).order("created_at"),
    db.from("aiv_suggestions").select("id, kind, payload, reason, mentions").eq("client_id", clientId).eq("status", "new")
      .order("mentions", { ascending: false }).order("created_at", { ascending: false }).limit(60),
    db.from("aiv_actions").select("status").eq("client_id", clientId),
  ])
  const q = (quotaRes.data ?? {}) as Rec
  const open = q.open_run as Rec | null
  const last = q.last_run as Rec | null
  const p = projectRes.data
  const actionCounts: Record<string, number> = {}
  for (const a of actionsRes.data ?? []) actionCounts[a.status] = (actionCounts[a.status] ?? 0) + 1
  return {
    quota: {
      hasProject: Boolean(q.has_project),
      setupMissing: Array.isArray(q.setup_missing) ? (q.setup_missing as string[]) : ["Set up the brand and platforms"],
      activePrompts: Number(q.active_prompts ?? 0),
      promptCap: Number(q.prompt_cap ?? 50),
      budgetProblem: (q.budget_problem as string | null) ?? null,
      monthSpend: Number(q.month_spend ?? 0),
      monthlyBudget: Number(q.monthly_budget ?? 0),
      maxRunUsd: Number(q.max_run_usd ?? 5),
      manualLimit: Number(q.manual_limit ?? 4),
      manualUsed: Number(q.manual_used ?? 0),
      access: (q.access as AivQuota["access"]) ?? "unknown",
      openRun: open
        ? {
            id: String(open.id), status: String(open.status), stage: Number(open.stage ?? 0), counts: (open.counts ?? {}) as Rec,
            createdAt: String(open.created_at), trigger: String(open.trigger), tasks: (open.tasks ?? {}) as Record<string, number>,
          }
        : null,
      lastRun: last
        ? {
            id: String(last.id), status: String(last.status), error: (last.error as string | null) ?? null, counts: (last.counts ?? {}) as Rec,
            createdAt: String(last.created_at), finishedAt: (last.finished_at as string | null) ?? null, costUsd: Number(last.cost_usd ?? 0),
          }
        : null,
      lastDoneAt: (q.last_done_at as string | null) ?? null,
    },
    project: p
      ? {
          brandName: p.brand_name, description: p.description, industry: p.industry, personas: p.personas,
          brandIdentity: p.brand_identity, models: p.models as AivModel[], countries: p.countries, language: p.language,
          frequency: p.frequency as AivFrequency, runWeekday: p.run_weekday, nextRunAt: p.next_run_at, paused: p.paused, version: p.version,
        }
      : null,
    brands: (brandsRes.data ?? []).map((b) => ({
      id: b.id, isOwn: b.is_own, name: b.display_name, trackedNames: b.tracked_names, pattern: b.pattern, domains: b.domains,
      colorSlot: b.color_slot, active: b.active, source: b.source,
    })),
    topics: (topicsRes.data ?? []).map((t) => ({ id: t.id, name: t.name })),
    prompts: (promptsRes.data ?? []).map((r) => ({
      id: r.id, text: r.text, topicId: r.topic_id, country: r.country, tags: r.tags, intent: (r.intent as AivIntent | null) ?? null,
      branded: r.branded, persona: r.persona, volume: r.volume, status: r.status as AivPrompt["status"], source: r.source, createdAt: r.created_at,
    })),
    suggestions: (sugRes.data ?? []).map((s) => ({
      id: s.id, kind: s.kind as AivSuggestion["kind"], payload: (s.payload ?? {}) as Rec, reason: s.reason, mentions: s.mentions,
    })),
    actionCounts,
  }
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export type Metrics = { visibility: number | null; sov: number | null; position: number | null; sentiment: number | null; winRate: number | null }
export type BrandRow = Metrics & { brandId: string; name: string; isOwn: boolean; colorSlot: number; mentioned: number; prev: Metrics & { answers: number } }
export type Overview = { answers: number; previousAnswers: number; brands: BrandRow[] }

const metricsOf = (r: Rec): Metrics => ({
  visibility: num(r.visibility), sov: num(r.sov), position: num(r.position), sentiment: num(r.sentiment), winRate: num(r.win_rate),
})

export async function getOverview(clientId: string, f: Filter): Promise<Overview> {
  const db = await createSupabaseServerClient()
  const { data } = await db.rpc("aiv_overview", { p_client_id: clientId, f: f as never })
  const d = (data ?? {}) as Rec
  return {
    answers: Number(d.answers ?? 0),
    previousAnswers: Number(d.previous_answers ?? 0),
    brands: ((d.brands as Rec[] | null) ?? []).map((b) => ({
      ...metricsOf(b),
      brandId: String(b.brand_id), name: String(b.name), isOwn: Boolean(b.is_own), colorSlot: Number(b.color_slot ?? 0),
      mentioned: Number(b.mentioned ?? 0),
      prev: { ...metricsOf((b.prev ?? {}) as Rec), answers: Number(((b.prev ?? {}) as Rec).answers ?? 0) },
    })),
  }
}

export type TrendPoint = {
  bucket: string; brandId: string; answers: number; mentioned: number; position: number | null; sentiment: number | null
  wins: number; named: number; brandTotal: number
}

export async function getTrend(clientId: string, f: Filter, bucket: "day" | "week" | "month"): Promise<TrendPoint[]> {
  const db = await createSupabaseServerClient()
  const { data } = await db.rpc("aiv_trend", { p_client_id: clientId, f: f as never, p_bucket: bucket })
  return ((data ?? []) as Rec[]).map((r) => ({
    bucket: String(r.bucket), brandId: String(r.brand_id), answers: Number(r.answers ?? 0), mentioned: Number(r.mentioned ?? 0),
    position: num(r.avg_position), sentiment: num(r.sentiment), wins: Number(r.wins ?? 0), named: Number(r.named ?? 0),
    brandTotal: Number(r.brand_total ?? 0),
  }))
}

export type MatrixCell = { row: string; col: string; answers: number; visibility: number | null; position: number | null; sentiment: number | null; winRate: number | null }

export async function getMatrix(clientId: string, f: Filter, rows: string, cols: string): Promise<MatrixCell[]> {
  const db = await createSupabaseServerClient()
  const { data } = await db.rpc("aiv_matrix", { p_client_id: clientId, f: f as never, p_rows: rows, p_cols: cols })
  return ((data ?? []) as Rec[]).map((r) => ({
    row: String(r.row_key), col: String(r.col_key), answers: Number(r.answers ?? 0), visibility: num(r.visibility),
    position: num(r.avg_position), sentiment: num(r.sentiment), winRate: num(r.win_rate),
  }))
}

export type PromptStats = { answers: number; visibility: number | null; position: number | null; sentiment: number | null; lastDate: string | null }

export async function getPromptStats(clientId: string, f: Filter): Promise<Record<string, PromptStats>> {
  const db = await createSupabaseServerClient()
  const { data } = await db.rpc("aiv_prompt_table", { p_client_id: clientId, f: f as never })
  const out: Record<string, PromptStats> = {}
  for (const r of (data ?? []) as Rec[]) {
    out[String(r.prompt_id)] = {
      answers: Number(r.answers ?? 0), visibility: num(r.visibility), position: num(r.avg_position), sentiment: num(r.sentiment),
      lastDate: (r.last_date as string | null) ?? null,
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export type ChatRow = {
  id: string; runDate: string; model: AivModel; country: string; promptId: string; prompt: string; ownMentioned: boolean
  mentions: { name: string; position: number; brandId: string | null }[]; sources: number
}

export async function getChats(clientId: string, f: Filter, opts: { brand?: string | null; q?: string | null; limit?: number; offset?: number }) {
  const db = await createSupabaseServerClient()
  const { data } = await db.rpc("aiv_chats_page", {
    p_client_id: clientId, f: f as never, p_brand: opts.brand ?? undefined, p_q: opts.q ?? undefined,
    p_limit: opts.limit ?? 25, p_offset: opts.offset ?? 0,
  })
  const d = (data ?? {}) as Rec
  return {
    total: Number(d.total ?? 0),
    rows: ((d.rows as Rec[] | null) ?? []).map((r) => ({
      id: String(r.id), runDate: String(r.run_date), model: r.model as AivModel, country: String(r.country), promptId: String(r.prompt_id),
      prompt: String(r.prompt ?? ""), ownMentioned: Boolean(r.own_mentioned),
      mentions: ((r.mentions as Rec[] | null) ?? []).map((m) => ({ name: String(m.name), position: Number(m.position), brandId: (m.brand_id as string | null) ?? null })),
      sources: Number(r.sources ?? 0),
    })) as ChatRow[],
  }
}

export type ChatDetail = {
  id: string; runDate: string; model: AivModel; country: string; countryFallback: boolean; status: string; answer: string | null
  modelVersion: string | null; fanOut: string[]; checkUrl: string | null; promptId: string; prompt: string; error: string | null; analyzed: boolean
  mentions: { name: string; position: number; brandId: string | null; sentiment: number | null; quote: string | null }[]
  sources: { url: string; domain: string; title: string | null; retrieved: boolean; cited: boolean; citeRank: number | null; type: string }[]
  ads: { advertiser: string | null; domain: string | null; title: string | null; url: string | null }[]
}

export async function getChat(chatId: string): Promise<ChatDetail | null> {
  const db = await createSupabaseServerClient()
  const { data } = await db.rpc("aiv_chat", { p_chat_id: chatId })
  if (!data) return null
  const c = data as Rec
  return {
    id: String(c.id), runDate: String(c.run_date), model: c.model as AivModel, country: String(c.country), countryFallback: Boolean(c.country_fallback),
    status: String(c.status), answer: (c.answer as string | null) ?? null, modelVersion: (c.model_version as string | null) ?? null,
    fanOut: (c.fan_out as string[] | null) ?? [], checkUrl: (c.check_url as string | null) ?? null, promptId: String(c.prompt_id),
    prompt: String(c.prompt ?? ""), error: (c.error as string | null) ?? null, analyzed: Boolean(c.analyzed),
    mentions: ((c.mentions as Rec[] | null) ?? []).map((m) => ({
      name: String(m.name), position: Number(m.position), brandId: (m.brand_id as string | null) ?? null,
      sentiment: num(m.sentiment), quote: (m.quote as string | null) ?? null,
    })),
    sources: ((c.sources as Rec[] | null) ?? []).map((s) => ({
      url: String(s.url), domain: String(s.domain), title: (s.title as string | null) ?? null, retrieved: Boolean(s.retrieved),
      cited: Boolean(s.cited), citeRank: num(s.cite_rank), type: String(s.type ?? "other"),
    })),
    ads: ((c.ads as Rec[] | null) ?? []).map((a) => ({
      advertiser: (a.advertiser as string | null) ?? null, domain: (a.domain as string | null) ?? null,
      title: (a.title as string | null) ?? null, url: (a.url as string | null) ?? null,
    })),
  }
}

// ---------------------------------------------------------------------------
// Sources and gap
// ---------------------------------------------------------------------------

export type DomainRow = {
  domain: string; type: string; retrievals: number; retrievedPct: number | null; citedPct: number | null; citationShare: number | null
  avgCiteRank: number | null; brandId: string | null; isOwn: boolean
}

export async function getSourceDomains(clientId: string, f: Filter, type: string | null, limit = 50, offset = 0) {
  const db = await createSupabaseServerClient()
  const { data } = await db.rpc("aiv_sources_domains", { p_client_id: clientId, f: f as never, p_type: type ?? undefined, p_limit: limit, p_offset: offset })
  const d = (data ?? {}) as Rec
  return {
    answers: Number(d.answers ?? 0),
    total: Number(d.total ?? 0),
    types: (d.types ?? {}) as Record<string, number>,
    rows: ((d.rows as Rec[] | null) ?? []).map((r) => ({
      domain: String(r.domain), type: String(r.type), retrievals: Number(r.retrievals ?? 0), retrievedPct: num(r.retrieved_pct),
      citedPct: num(r.cited_pct), citationShare: num(r.citation_share), avgCiteRank: num(r.avg_cite_rank),
      brandId: (r.brand_id as string | null) ?? null, isOwn: Boolean(r.is_own),
    })) as DomainRow[],
  }
}

export type UrlRow = { url: string; domain: string; title: string | null; retrievals: number; retrievedPct: number | null; citedPct: number | null; citationShare: number | null; avgCiteRank: number | null }

export async function getSourceUrls(clientId: string, f: Filter, domain: string | null, limit = 50, offset = 0) {
  const db = await createSupabaseServerClient()
  const { data } = await db.rpc("aiv_sources_urls", { p_client_id: clientId, f: f as never, p_domain: domain ?? undefined, p_limit: limit, p_offset: offset })
  const d = (data ?? {}) as Rec
  return {
    answers: Number(d.answers ?? 0),
    total: Number(d.total ?? 0),
    rows: ((d.rows as Rec[] | null) ?? []).map((r) => ({
      url: String(r.url), domain: String(r.domain), title: (r.title as string | null) ?? null, retrievals: Number(r.retrievals ?? 0),
      retrievedPct: num(r.retrieved_pct), citedPct: num(r.cited_pct), citationShare: num(r.citation_share), avgCiteRank: num(r.avg_cite_rank),
    })) as UrlRow[],
  }
}

export type GapRow = {
  domain: string; type: string; gapAnswers: number; competitors: string[]; gapScore: number; models: AivModel[]; urls: string[]
  prompts: string[]; inBacklinks: boolean; actionId: string | null
}

export async function getGap(clientId: string, f: Filter, limit = 30): Promise<GapRow[]> {
  const db = await createSupabaseServerClient()
  const { data } = await db.rpc("aiv_gap", { p_client_id: clientId, f: f as never, p_limit: limit })
  return ((data ?? []) as Rec[]).map((r) => ({
    domain: String(r.domain), type: String(r.type), gapAnswers: Number(r.gap_answers ?? 0), competitors: (r.competitors as string[] | null) ?? [],
    gapScore: Number(r.gap_score ?? 0), models: (r.models as AivModel[] | null) ?? [], urls: (r.urls as string[] | null) ?? [],
    prompts: (r.prompts as string[] | null) ?? [], inBacklinks: Boolean(r.in_backlinks), actionId: (r.action_id as string | null) ?? null,
  }))
}

// ---------------------------------------------------------------------------
// Actions and runs
// ---------------------------------------------------------------------------

export type AivAction = {
  id: string; group: ActionGroup; title: string; detail: string | null; evidence: Rec; impact: "high" | "medium" | "low"
  domain: string | null; url: string | null; status: "new" | "in_progress" | "done" | "declined"; source: "ai" | "team"
  opportunityId: string | null; createdAt: string; doneAt: string | null
}

export async function getActions(clientId: string): Promise<AivAction[]> {
  const db = await createSupabaseServerClient()
  const { data } = await db.from("aiv_actions").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(300)
  return (data ?? []).map((a) => ({
    id: a.id, group: a.group as ActionGroup, title: a.title, detail: a.detail, evidence: (a.evidence ?? {}) as Rec,
    impact: a.impact as AivAction["impact"], domain: a.domain, url: a.url, status: a.status as AivAction["status"],
    source: a.source as AivAction["source"], opportunityId: a.opportunity_id, createdAt: a.created_at, doneAt: a.done_at,
  }))
}

export type AivRun = {
  id: string; trigger: string; status: string; createdAt: string; finishedAt: string | null; counts: Rec; error: string | null
  estimateUsd: number; dfsUsd: number; aiUsd: number; answers: number; createdBy: string | null
  serpUsd: number; serpCalls: number; llmUsd: number; llmCalls: number; aiCalls: number; aiIn: number | null; aiOut: number | null
}

export async function getRunHistory(clientId: string): Promise<AivRun[]> {
  const db = await createSupabaseServerClient()
  const { data } = await db.rpc("aiv_run_history", { p_client_id: clientId, p_limit: 30 })
  return ((data ?? []) as Rec[]).map((r) => ({
    id: String(r.id), trigger: String(r.trigger), status: String(r.status), createdAt: String(r.created_at),
    finishedAt: (r.finished_at as string | null) ?? null, counts: (r.counts ?? {}) as Rec, error: (r.error as string | null) ?? null,
    estimateUsd: Number(r.estimate_usd ?? 0), dfsUsd: Number(r.dfs_usd ?? 0), aiUsd: Number(r.ai_usd ?? 0),
    answers: Number(r.answers ?? 0), createdBy: (r.created_by as string | null) ?? null,
    serpUsd: Number(r.serp_usd ?? 0), serpCalls: Number(r.serp_calls ?? 0), llmUsd: Number(r.llm_usd ?? 0), llmCalls: Number(r.llm_calls ?? 0),
    aiCalls: Number(r.ai_calls ?? 0), aiIn: num(r.ai_in), aiOut: num(r.ai_out),
  }))
}

// ---------------------------------------------------------------------------
// Detail panels
// ---------------------------------------------------------------------------

export type PromptLatest = {
  chatId: string; model: AivModel; runDate: string; status: string; error: string | null; ownMentioned: boolean
  ownPosition: number | null; mentions: { name: string; position: number; brandId: string | null }[]; sources: number
}

export async function getPromptDetail(promptId: string): Promise<PromptLatest[]> {
  const db = await createSupabaseServerClient()
  const { data } = await db.rpc("aiv_prompt_detail", { p_prompt_id: promptId })
  return ((data ?? []) as Rec[]).map((r) => ({
    chatId: String(r.chat_id), model: r.model as AivModel, runDate: String(r.run_date), status: String(r.status),
    error: (r.error as string | null) ?? null, ownMentioned: Boolean(r.own_mentioned), ownPosition: num(r.own_position),
    mentions: ((r.mentions as Rec[] | null) ?? []).map((m) => ({ name: String(m.name), position: Number(m.position), brandId: (m.brand_id as string | null) ?? null })),
    sources: Number(r.sources ?? 0),
  }))
}

export type SourceDetail = {
  domain: string; type: string; answers: number; cited: number
  prompts: { promptId: string; text: string; models: AivModel[]; answers: number; cited: number; lastDate: string }[]
  urls: { url: string; title: string | null; answers: number; cited: number }[]
  weeks: { week: string; answers: number }[]
}

export async function getSourceDetail(clientId: string, f: Filter, domain: string): Promise<SourceDetail> {
  const db = await createSupabaseServerClient()
  const { data } = await db.rpc("aiv_source_detail", { p_client_id: clientId, f: f as never, p_domain: domain })
  const d = (data ?? {}) as Rec
  return {
    domain: String(d.domain ?? domain), type: String(d.type ?? "other"), answers: Number(d.answers ?? 0), cited: Number(d.cited ?? 0),
    prompts: ((d.prompts as Rec[] | null) ?? []).map((p) => ({
      promptId: String(p.prompt_id), text: String(p.text), models: (p.models as AivModel[] | null) ?? [], answers: Number(p.answers ?? 0),
      cited: Number(p.cited ?? 0), lastDate: String(p.last_date),
    })),
    urls: ((d.urls as Rec[] | null) ?? []).map((u) => ({ url: String(u.url), title: (u.title as string | null) ?? null, answers: Number(u.answers ?? 0), cited: Number(u.cited ?? 0) })),
    weeks: ((d.weeks as Rec[] | null) ?? []).map((w) => ({ week: String(w.week), answers: Number(w.answers ?? 0) })),
  }
}

export type BrandInsight = {
  trend: { bucket: string; answers: number; mentioned: number; position: number | null; sentiment: number | null; read: number }[]
  prompts: { promptId: string; text: string; answers: number; mentioned: number; visibility: number | null; position: number | null }[]
}

export async function getBrandInsight(clientId: string, f: Filter, brandId: string, bucket: "day" | "week" | "month"): Promise<BrandInsight> {
  const db = await createSupabaseServerClient()
  const { data } = await db.rpc("aiv_brand_insight", { p_client_id: clientId, f: f as never, p_brand_id: brandId, p_bucket: bucket })
  const d = (data ?? {}) as Rec
  return {
    trend: ((d.trend as Rec[] | null) ?? []).map((t) => ({
      bucket: String(t.bucket), answers: Number(t.answers ?? 0), mentioned: Number(t.mentioned ?? 0), position: num(t.position),
      sentiment: num(t.sentiment), read: Number(t.read ?? 0),
    })),
    prompts: ((d.prompts as Rec[] | null) ?? []).map((p) => ({
      promptId: String(p.prompt_id), text: String(p.text), answers: Number(p.answers ?? 0), mentioned: Number(p.mentioned ?? 0),
      visibility: num(p.visibility), position: num(p.position),
    })),
  }
}
