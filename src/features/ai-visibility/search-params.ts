import { addDays } from "@/lib/dates"
import { isAivModel, TABS, type AivModel, type AivTab } from "./config"

/**
 * AI Visibility filters live in the URL (?tab=&range=&from=&to=&models=&countries=&tags=&tagmode=
 * &topics=&brand=&q=&page=&sheet=&view=), so every view can be linked. Bad values fall back to
 * defaults instead of erroring.
 */

export const RANGES = ["7d", "30d", "90d", "custom"] as const
export type Range = (typeof RANGES)[number]

export type AivParams = {
  tab: AivTab
  range: Range
  from: string
  to: string
  models: AivModel[]
  countries: string[]
  tags: string[]
  tagsAll: boolean
  topics: string[]
  brand: string | null
  q: string | null
  page: number
  sheet: string | null
  view: string | null
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const list = (v: string | string[] | undefined) =>
  (one(v) ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 20)
const DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f-]{36}$/i

export function parseAivParams(raw: Record<string, string | string[] | undefined>, today: string): AivParams {
  const tabRaw = one(raw.tab)
  const tab: AivTab = (TABS as readonly string[]).includes(tabRaw ?? "") ? (tabRaw as AivTab) : "overview"
  const rangeRaw = one(raw.range)
  let range: Range = (RANGES as readonly string[]).includes(rangeRaw ?? "") ? (rangeRaw as Range) : "30d"
  let from = one(raw.from) ?? ""
  let to = one(raw.to) ?? ""
  if (range === "custom" && DATE.test(from) && DATE.test(to) && from <= to) {
    // keep
  } else {
    if (range === "custom") range = "30d"
    const days = range === "7d" ? 7 : range === "90d" ? 90 : 30
    to = today
    from = addDays(today, -(days - 1))
  }
  const pageRaw = Number(one(raw.page))
  return {
    tab,
    range,
    from,
    to,
    models: list(raw.models).filter(isAivModel),
    countries: list(raw.countries).filter((c) => /^[A-Z]{2}$/.test(c)),
    tags: list(raw.tags).map((t) => t.toLowerCase()).slice(0, 10),
    tagsAll: one(raw.tagmode) === "all",
    topics: list(raw.topics).filter((t) => UUID.test(t)),
    brand: UUID.test(one(raw.brand) ?? "") ? one(raw.brand)! : null,
    q: (one(raw.q) ?? "").trim().slice(0, 80) || null,
    page: Number.isInteger(pageRaw) && pageRaw >= 1 && pageRaw <= 10_000 ? pageRaw : 1,
    sheet: UUID.test(one(raw.sheet) ?? "") ? one(raw.sheet)! : null,
    view: (one(raw.view) ?? "").slice(0, 20) || null,
  }
}

/** The filter object the database read functions take. */
export function filterOf(p: AivParams, extra: Record<string, unknown> = {}) {
  return {
    from: p.from,
    to: p.to,
    models: p.models,
    countries: p.countries,
    tags: p.tags,
    tags_all: p.tagsAll,
    topics: p.topics,
    ...extra,
  }
}

/** URL for the current view with a change. Changing anything but the page goes back to page 1. */
export function aivHref(base: string, p: AivParams, patch: Partial<AivParams>) {
  const n = { ...p, ...patch }
  if (!("page" in patch)) n.page = 1
  const s = new URLSearchParams()
  if (n.tab !== "overview") s.set("tab", n.tab)
  if (n.range !== "30d") s.set("range", n.range)
  if (n.range === "custom") {
    s.set("from", n.from)
    s.set("to", n.to)
  }
  if (n.models.length) s.set("models", n.models.join(","))
  if (n.countries.length) s.set("countries", n.countries.join(","))
  if (n.tags.length) s.set("tags", n.tags.join(","))
  if (n.tagsAll) s.set("tagmode", "all")
  if (n.topics.length) s.set("topics", n.topics.join(","))
  if (n.brand) s.set("brand", n.brand)
  if (n.q) s.set("q", n.q)
  if (n.page > 1) s.set("page", String(n.page))
  if (n.sheet) s.set("sheet", n.sheet)
  if (n.view) s.set("view", n.view)
  const qs = s.toString()
  return qs ? `${base}?${qs}` : base
}

export const hasAivFilters = (p: AivParams) =>
  Boolean(p.models.length || p.countries.length || p.tags.length || p.topics.length || p.range !== "30d")
