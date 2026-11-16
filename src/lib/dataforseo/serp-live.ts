import "server-only"

import { dfsCall, DfsError, type Db } from "./client"

/**
 * Google SERP Live calls for Backlinks "Find places" (docs/plans/backlinks).
 * One task per call, about 6 s, $0.002 per 10 results. Search operators (site:, inurl: …)
 * cost 5x each, so footprints never contain them (checked in the database too).
 */

type Ctx = { clientId?: string | null; ref?: string | null }

export type LiveSearch = {
  keyword: string
  locationCode: number
  languageCode: string
  depth: number
}

export type OrganicRow = { p: number; url: string; title: string | null; desc: string | null }

export type OrganicResult = {
  items: OrganicRow[]
  /** Business domains in the local pack: competitors, not places to get listed on. */
  competitors: string[]
  cost: number
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)

function hostOf(value: string | null): string | null {
  if (!value) return null
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname
      .toLowerCase()
      .replace(/^www\./, "")
  } catch {
    return null
  }
}

function taskOf(env: Awaited<ReturnType<typeof dfsCall<Record<string, unknown>>>>) {
  const task = env.tasks?.[0]
  if (!task) throw new DfsError("No task in the response.", null, null, "server")
  // 40102 = no results: an empty page is a fine answer.
  if (task.status_code === 40102) return { task, result: null }
  if (task.status_code !== 20000) {
    throw new DfsError(
      task.status_message,
      task.status_code,
      null,
      task.status_code >= 50000 ? "server" : "input",
    )
  }
  return { task, result: (task.result?.[0] ?? null) as Record<string, unknown> | null }
}

/** Organic results (desktop) plus local-pack business domains. */
export async function googleOrganicLive(db: Db, s: LiveSearch, ctx: Ctx): Promise<OrganicResult> {
  const env = await dfsCall<Record<string, unknown>>(
    db,
    "POST",
    "v3/serp/google/organic/live/advanced",
    {
      api: "serp_google",
      body: [
        {
          keyword: s.keyword,
          location_code: s.locationCode,
          language_code: s.languageCode,
          device: "desktop",
          os: "windows",
          depth: s.depth,
        },
      ],
      clientId: ctx.clientId,
      ref: ctx.ref,
      idempotent: true,
    },
  )
  const { task, result } = taskOf(env)
  const items: OrganicRow[] = []
  const competitors = new Set<string>()
  for (const raw of (result?.items as Record<string, unknown>[] | null | undefined) ?? []) {
    if (!raw || typeof raw !== "object") continue
    if (raw.type === "organic") {
      const url = str(raw.url)
      if (!url || !/^https?:\/\//i.test(url)) continue
      items.push({
        p: num(raw.rank_group) ?? items.length + 1,
        url: url.slice(0, 2000),
        title: str(raw.title)?.slice(0, 300) ?? null,
        desc: str(raw.description)?.slice(0, 600) ?? null,
      })
    } else if (raw.type === "local_pack") {
      const host = hostOf(str(raw.domain) ?? str(raw.url))
      if (host) competitors.add(host)
    }
  }
  return { items, competitors: [...competitors], cost: num(task.cost) ?? num(env.cost) ?? 0 }
}

/** Google Maps business domains for one search: the competitors in that city. */
export async function googleMapsLive(db: Db, s: LiveSearch, ctx: Ctx): Promise<OrganicResult> {
  const env = await dfsCall<Record<string, unknown>>(
    db,
    "POST",
    "v3/serp/google/maps/live/advanced",
    {
      api: "serp_maps",
      body: [
        {
          keyword: s.keyword,
          location_code: s.locationCode,
          language_code: s.languageCode,
          device: "desktop",
          os: "windows",
          depth: Math.min(s.depth, 20),
        },
      ],
      clientId: ctx.clientId,
      ref: ctx.ref,
      idempotent: true,
    },
  )
  const { task, result } = taskOf(env)
  const competitors = new Set<string>()
  for (const raw of (result?.items as Record<string, unknown>[] | null | undefined) ?? []) {
    const host = hostOf(str(raw?.domain) ?? str(raw?.url))
    if (host) competitors.add(host)
  }
  return { items: [], competitors: [...competitors], cost: num(task.cost) ?? num(env.cost) ?? 0 }
}
