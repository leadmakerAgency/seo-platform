import { hasLocal, hasWide, type Brief } from "./brief"
import type { FootprintScope } from "./constants"
import { cleanTerm, normQuery } from "./footprints"

/**
 * The searches one Find places run makes (pure): the brief's reach, buyer, offering, site
 * types and topics × the places ticked. Built in the action, checked and saved by
 * public.request_backlink_discovery (≤ 60), then run by the job as saved.
 */

export const MAX_PLAN = 60
export const SEARCH_COST = 0.006

export type PlanFootprint = {
  id: string
  template: string
  scope: FootprintScope
  reach: string[]
  buyer: string[]
  offering: string[]
  site_type: string | null
  priority: number
}

export type PlanPlace = {
  id: string
  label: string
  searchName: string
  kind: "city" | "region" | "country"
  regionName: string | null
}

export type PlanGroup = "place" | "topic" | "service" | "buyer" | "industry"

export type PlannedQuery = {
  footprint_id: string
  scope: FootprintScope
  target_id: string
  query: string
  group: PlanGroup
}

export type SearchPlan = {
  queries: PlannedQuery[]
  /** Searches per group and per place, for the dialog. */
  groups: Record<PlanGroup, number>
  perPlace: Record<string, number>
  /** Searches that didn't fit under the cap. */
  dropped: number
}

const PLACE_PER_PLACE = 6
const SERVICE_PER_PLACE = 2
const CORE_TEMPLATES = 4
const ADJACENT_TEMPLATES = 2
const BUYER_MAX = 6
const INDUSTRY_MAX = 4

const overlaps = (a: readonly string[], b: readonly string[]) => a.some((x) => b.includes(x))

const applies = (f: PlanFootprint, b: Brief) =>
  overlaps(f.reach, b.reach) &&
  overlaps(f.buyer, b.buyer) &&
  overlaps(f.offering, b.offering) &&
  (!f.site_type || (b.site_types as string[]).includes(f.site_type)) &&
  !/\{(city|state_code)\}/.test(f.template)

export function buildSearchPlan(input: {
  footprints: PlanFootprint[]
  brief: Brief
  places: PlanPlace[]
  services: string[]
  industry: string | null
  max?: number
}): SearchPlan {
  const { brief, places } = input
  const max = input.max ?? MAX_PLAN
  const fps = input.footprints
    .filter((f) => applies(f, brief))
    .sort((a, b) => a.priority - b.priority || a.template.localeCompare(b.template))
  const services = [...new Set(input.services.map(cleanTerm).filter((s): s is string => Boolean(s)))].slice(0, 3)
  const industry = cleanTerm(input.industry)
  const core = brief.core_topics.map((t) => normQuery(t)).filter(Boolean)
  const adjacent = brief.adjacent_topics.map((t) => normQuery(t)).filter(Boolean)

  const queries: PlannedQuery[] = []
  const seen = new Set<string>()
  let dropped = 0

  const fill = (template: string, values: Record<string, string | null>) => {
    let missing = false
    const text = template.replace(/\{(place|topic|service|industry|state|city|state_code)\}/g, (_, key: string) => {
      const v = values[key] ?? null
      if (!v) missing = true
      return v ?? ""
    })
    return missing ? null : normQuery(text)
  }
  const push = (f: PlanFootprint, place: PlanPlace, group: PlanGroup, text: string | null) => {
    if (!text || /[:{}"]/.test(text)) return false
    const key = `${place.id}|${text}`
    if (seen.has(key)) return false
    if (queries.length >= max) {
      dropped++
      return false
    }
    seen.add(key)
    queries.push({ footprint_id: f.id, scope: f.scope, target_id: place.id, query: text, group })
    return true
  }
  const valuesFor = (place: PlanPlace) => ({
    place: normQuery(place.searchName),
    state: place.regionName ? normQuery(place.regionName) : null,
    industry,
  })

  const withPlace = (f: PlanFootprint) => f.template.includes("{place}")
  const geo = fps.filter((f) => f.scope === "geo")
  const service = fps.filter((f) => f.scope === "service")
  const topicPlaced = fps.filter((f) => f.scope === "topic" && withPlace(f))
  const topicFree = fps.filter((f) => f.scope === "topic" && !withPlace(f))
  const buyer = fps.filter((f) => f.scope === "buyer")
  const industryFps = fps.filter((f) => f.scope === "industry")

  const topicRound = (place: PlanPlace, list: PlanFootprint[], topics: string[], perTopic: number) => {
    for (const topic of topics) {
      let n = 0
      for (const f of list) {
        if (n >= perTopic) break
        if (push(f, place, "topic", fill(f.template, { ...valuesFor(place), topic }))) n++
      }
    }
  }
  const buyerRound = (place: PlanPlace) => {
    let n = 0
    for (const f of buyer) {
      if (n >= BUYER_MAX) break
      const vars = { ...valuesFor(place), topic: core[0] ?? null, service: services[0] ?? core[0] ?? null }
      if (push(f, place, "buyer", fill(f.template, vars))) n++
    }
  }
  const industryRound = (place: PlanPlace) => {
    let n = 0
    for (const f of industryFps) {
      if (n >= INDUSTRY_MAX) break
      if (push(f, place, "industry", fill(f.template, valuesFor(place)))) n++
    }
  }

  // Local customers: each city/region's own searches and topics there. National/global
  // customers: topic searches from each country. Both ticked: both, sharing the 60 searches.
  const local = hasLocal(brief)
  const wide = hasWide(brief)
  const mixed = local && wide
  let localPlaces = local ? places.filter((p) => p.kind !== "country") : []
  let markets = wide ? places.filter((p) => p.kind === "country") : []
  if (local && !wide && localPlaces.length === 0) localPlaces = places
  if (wide && !local && markets.length === 0) markets = places
  if (mixed && markets.length === 0 && localPlaces.length === 0) markets = places
  const anchor = markets[0] ?? localPlaces[0]

  if (anchor) {
    // 1. Each local place's own searches: one of each kind of site first (directory,
    //    chamber, local news, sponsorship…), then more.
    const firstOfKind = geo.filter((f, i) => geo.findIndex((g) => g.site_type === f.site_type) === i)
    const placeOrder = [...firstOfKind, ...geo.filter((f) => !firstOfKind.includes(f))]
    for (const place of localPlaces) {
      let n = 0
      for (const f of placeOrder) {
        if (n >= (mixed ? 4 : PLACE_PER_PLACE)) break
        if (push(f, place, "place", fill(f.template, valuesFor(place)))) n++
      }
    }
    // 2. Core topics in each local place, then core topics from the first country.
    for (const place of localPlaces) topicRound(place, topicPlaced, core, mixed ? 2 : 3)
    if (markets.length) topicRound(markets[0], topicFree, core, mixed ? 3 : CORE_TEMPLATES)
    // 3. The client's services in each local place.
    for (const place of localPlaces) {
      let n = 0
      for (const f of service) {
        for (const s of services) {
          if (n >= SERVICE_PER_PLACE) break
          if (push(f, place, "service", fill(f.template, { ...valuesFor(place), service: s }))) n++
        }
      }
    }
    // 4. What the buyers read, then adjacent topics, then the industry, then more countries.
    buyerRound(anchor)
    if (markets.length) topicRound(markets[0], topicFree, adjacent, ADJACENT_TEMPLATES)
    for (const place of localPlaces) topicRound(place, topicPlaced, adjacent, 1)
    if (!markets.length && localPlaces.length) topicRound(localPlaces[0], topicFree, core, 1)
    industryRound(anchor)
    for (const market of markets.slice(1)) topicRound(market, topicFree, core, 2)
  }

  const groups: Record<PlanGroup, number> = { place: 0, topic: 0, service: 0, buyer: 0, industry: 0 }
  const perPlace: Record<string, number> = {}
  for (const q of queries) {
    groups[q.group]++
    perPlace[q.target_id] = (perPlace[q.target_id] ?? 0) + 1
  }
  return { queries, groups, perPlace, dropped }
}
