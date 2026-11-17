import "server-only"

import { dfsCall, DfsError, type Db } from "./client"

/**
 * Google SERP Live calls for Backlinks "Find places" (docs/plans/backlinks).
 * One task per call, about 6 s, $0.002 per 10 results. Search operators (site:, inurl: …)
 * cost 5x each, so footprints never contain them (checked in the database too).
 *
 * Google now links organic results through google.com/goto redirects. Live searches ask
 * DataForSEO to resolve them (`resolve_goto_urls`, up to 40 s more per search); a result
 * still pointing at a redirect is rebuilt from its `domain` and breadcrumb, or dropped.
 * A redirect link is never saved: it hides which site the result is.
 */

type Ctx = { clientId?: string | null; ref?: string | null }

export type LiveSearch = {
  keyword: string
  locationCode: number
  languageCode: string
  depth: number
}

export type OrganicRow = {
  p: number
  url: string
  title: string | null
  desc: string | null
  /** The site's domain as Google showed it (kept since goto links hide it in the url). */
  d?: string | null
}

/** Live searches that resolve goto links can take up to 260 s at DataForSEO. */
const RESOLVING_TIMEOUT_MS = 280_000

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

/** google.com/goto?url=… or google.com/url?q=… : a redirect, not the result's site. */
export function isGoogleRedirect(value: string | null): boolean {
  if (!value) return false
  try {
    const u = new URL(value)
    return /(^|\.)google\.[a-z.]+$/i.test(u.hostname) && /^\/(goto|url)\b/i.test(u.pathname)
  } catch {
    return false
  }
}

/**
 * The result's real address: its url when that isn't a redirect; otherwise https://<domain>
 * plus the path from the breadcrumb ("https://site.com › blog › write-for-us"). Null when
 * the site can't be told (the result is then skipped).
 */
export function resultUrl(raw: Record<string, unknown>): string | null {
  const url = str(raw.url)
  if (url && /^https?:\/\//i.test(url) && !isGoogleRedirect(url)) return url
  const domain = hostOf(str(raw.domain))
  if (!domain || /(^|\.)google\.[a-z.]+$/i.test(domain)) return null
  const crumb = str(raw.breadcrumb)
  const path = crumb
    ? crumb
        .split("›")
        .slice(1)
        .map((part) => part.trim())
        .filter((part) => part && !part.includes("...") && !part.includes("…") && !/\s/.test(part))
        .map((part) => encodeURIComponent(part))
        .join("/")
    : ""
  return `https://${domain}/${path}`
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
          resolve_goto_urls: true,
        },
      ],
      clientId: ctx.clientId,
      ref: ctx.ref,
      idempotent: true,
      timeoutMs: RESOLVING_TIMEOUT_MS,
    },
  )
  const { task, result } = taskOf(env)
  const items: OrganicRow[] = []
  const competitors = new Set<string>()
  for (const raw of (result?.items as Record<string, unknown>[] | null | undefined) ?? []) {
    if (!raw || typeof raw !== "object") continue
    if (raw.type === "organic") {
      const url = resultUrl(raw)
      if (!url) continue
      items.push({
        p: num(raw.rank_group) ?? items.length + 1,
        url: url.slice(0, 2000),
        title: str(raw.title)?.slice(0, 300) ?? null,
        desc: str(raw.description)?.slice(0, 600) ?? null,
        d: hostOf(str(raw.domain)),
      })
    } else if (raw.type === "local_pack") {
      const link = str(raw.url)
      const host = hostOf(str(raw.domain) ?? (isGoogleRedirect(link) ? null : link))
      if (host && !/(^|\.)google\.[a-z.]+$/i.test(host)) competitors.add(host)
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
    const link = str(raw?.url)
    const host = hostOf(str(raw?.domain) ?? (isGoogleRedirect(link) ? null : link))
    if (host && !/(^|\.)google\.[a-z.]+$/i.test(host)) competitors.add(host)
  }
  return { items: [], competitors: [...competitors], cost: num(task.cost) ?? num(env.cost) ?? 0 }
}
