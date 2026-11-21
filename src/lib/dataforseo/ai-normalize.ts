/**
 * Pure: turns DataForSEO AI Optimization / SERP AI results into one shape for AI Visibility
 * (docs/plans/ai-visibility/02-data-sources.md §3). The field paths marked "(verify)" in the plan
 * are read defensively: every reader tolerates a missing or differently-shaped field.
 */
import { normalizeHost } from "./domains"

export type AivModel = "chatgpt" | "gemini" | "ai_overview" | "ai_mode" | "claude" | "perplexity"

export type SourceRef = { url: string; domain: string; title: string | null; rank: number }

export type NormalizedAnswer = {
  status: "ok" | "empty" | "failed"
  text: string
  /** Every page the platform looked at. */
  read: SourceRef[]
  /** Pages referenced in the answer, in cite order. */
  cited: SourceRef[]
  fanOut: string[]
  ads: { advertiser: string | null; title: string | null; url: string | null; domain: string | null }[]
  brandHints: string[]
  modelVersion: string | null
  checkUrl: string | null
  error: string | null
}

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

const MAX_TEXT = 40_000
const TRACKING = /^(utm_[a-z]+|srsltid|gclid|fbclid|mc_cid|mc_eid|ref_src)$/i

/** http(s) only, tracking parameters and fragments removed. */
export function cleanUrl(raw: unknown): string | null {
  const s = str(raw)
  if (!s) return null
  try {
    const u = new URL(s)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k)
    u.hash = ""
    const out = u.toString()
    return out.length <= 2000 ? out : null
  } catch {
    return null
  }
}

function ref(o: unknown, rank: number): SourceRef | null {
  if (!isRec(o)) return null
  const url = cleanUrl(o.url ?? o.link ?? o.source_url)
  if (!url) return null
  const domain = normalizeHost(str(o.domain) ?? url)
  if (!domain) return null
  const title = str(o.title) ?? str(o.source_name) ?? str(o.source) ?? null
  return { url, domain, title: title ? title.slice(0, 300) : null, rank }
}

function refs(list: unknown[]): SourceRef[] {
  const seen = new Set<string>()
  const out: SourceRef[] = []
  for (const o of list) {
    const r = ref(o, out.length + 1)
    if (r && !seen.has(r.url)) {
      seen.add(r.url)
      out.push(r)
    }
  }
  return out
}

/** Every {url, …} object anywhere inside a value (for shapes we haven't seen yet). */
function collectLinks(v: unknown, out: unknown[] = [], depth = 0): unknown[] {
  if (depth > 6) return out
  if (Array.isArray(v)) for (const x of v) collectLinks(x, out, depth + 1)
  else if (isRec(v)) {
    if (typeof v.url === "string") out.push(v)
    for (const [k, x] of Object.entries(v)) if (k !== "url") collectLinks(x, out, depth + 1)
  }
  return out
}

function texts(v: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 6) return out
  if (Array.isArray(v)) for (const x of v) texts(x, out, depth + 1)
  else if (isRec(v)) {
    const t = str(v.markdown) ?? str(v.text)
    if (t) out.push(t)
    else for (const [k, x] of Object.entries(v)) if (k !== "references" && k !== "annotations") texts(x, out, depth + 1)
  }
  return out
}

const fanOut = (v: unknown): string[] =>
  arr(v)
    .map((x) => (typeof x === "string" ? x : isRec(x) ? (str(x.query) ?? str(x.keyword) ?? str(x.text)) : null))
    .filter((x): x is string => Boolean(x))
    .map((x) => x.slice(0, 300))
    .slice(0, 20)

function finish(text: string, a: Omit<NormalizedAnswer, "status" | "text" | "error">): NormalizedAnswer {
  const t = text.trim().slice(0, MAX_TEXT)
  return { ...a, status: t ? "ok" : "empty", text: t, error: t ? null : "The platform returned no answer." }
}

export function failedAnswer(error: string): NormalizedAnswer {
  return {
    status: "failed", text: "", read: [], cited: [], fanOut: [], ads: [], brandHints: [],
    modelVersion: null, checkUrl: null, error: error.slice(0, 500),
  }
}

/** ChatGPT / Gemini LLM Scraper (task_get/advanced result[0]). */
export function normalizeScraper(result: unknown): NormalizedAnswer {
  if (!isRec(result)) return failedAnswer("The platform returned no result.")
  const items = arr(result.items)
  const text = str(result.markdown) ?? texts(items.filter((i) => isRec(i) && !/ad$/.test(String(i.type)))).join("\n\n")
  const cited = refs(arr(result.sources))
  const read = refs([...arr(result.search_results), ...arr(result.sources)])
  const ads = items
    .filter((i): i is Rec => isRec(i) && /(^|_)ad(s)?$/.test(String(i.type)))
    .map((i) => {
      const url = cleanUrl(i.url)
      return {
        advertiser: str(i.advertiser) ?? str(i.source_name) ?? str(i.source) ?? str(i.domain),
        title: str(i.title),
        url,
        domain: normalizeHost(str(i.domain) ?? url),
      }
    })
    .slice(0, 10)
  const brandHints = arr(result.brand_entities)
    .map((b) => (isRec(b) ? str(b.title) : null))
    .filter((b): b is string => Boolean(b))
    .slice(0, 40)
  return finish(text, {
    read, cited, ads, brandHints,
    fanOut: fanOut(result.fan_out_queries),
    modelVersion: str(result.model),
    checkUrl: cleanUrl(result.check_url),
  })
}

/** Google SERP (organic with load_async_ai_overview, or AI Mode): the ai_overview item. */
export function normalizeSerpAi(result: unknown): NormalizedAnswer {
  if (!isRec(result)) return failedAnswer("The platform returned no result.")
  const item = arr(result.items).find((i) => isRec(i) && i.type === "ai_overview") as Rec | undefined
  if (!item) {
    return { ...failedAnswer("No AI answer on this search."), status: "empty", checkUrl: cleanUrl(result.check_url) }
  }
  const text = str(item.markdown) ?? texts(arr(item.items)).join("\n\n") ?? ""
  const refList = arr(item.references).length ? arr(item.references) : collectLinks(item)
  const cited = refs(refList)
  return finish(text || "", {
    read: cited, cited, fanOut: [], ads: [], brandHints: [],
    modelVersion: "google",
    checkUrl: cleanUrl(result.check_url),
  })
}

/** Claude / Perplexity LLM Responses (live result[0]). */
export function normalizeLlmResponse(result: unknown): NormalizedAnswer {
  if (!isRec(result)) return failedAnswer("The platform returned no result.")
  const items = arr(result.items).filter((i) => !(isRec(i) && i.type === "reasoning"))
  const text = texts(items).join("\n\n")
  const cited = refs(collectLinks(items))
  return finish(text, {
    read: cited, cited, fanOut: [], ads: [], brandHints: [],
    modelVersion: str(result.model_name),
    checkUrl: null,
  })
}

/** Merge read and cited lists into rows for dfs_store_aiv_chat. */
export function sourceRows(a: NormalizedAnswer) {
  const rows = new Map<string, { url: string; domain: string; title: string | null; retrieved: boolean; cited: boolean; cite_rank: number | null }>()
  for (const r of a.read) rows.set(r.url, { url: r.url, domain: r.domain, title: r.title, retrieved: true, cited: false, cite_rank: null })
  for (const c of a.cited) {
    const row = rows.get(c.url) ?? { url: c.url, domain: c.domain, title: c.title, retrieved: true, cited: false, cite_rank: null }
    row.cited = true
    row.cite_rank = row.cite_rank ?? c.rank
    rows.set(c.url, row)
  }
  return [...rows.values()].slice(0, 150)
}
