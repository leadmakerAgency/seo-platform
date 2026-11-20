import "server-only"

import { dfsCall, DfsError, type Db } from "./client"

/**
 * DataForSEO Backlinks API (Live only): Domain Rank and spam score for up to 1,000 sites a
 * call ($0.024 per call + $0.000036 per row). Targets are domains or subdomains without a
 * scheme or "www.". 40204 = Backlinks access isn't active on the account.
 */

type Ctx = { clientId?: string | null; ref?: string | null }

export const BACKLINKS_ACCESS_DENIED =
  "Backlinks API access isn't active on the DataForSEO account. An admin can turn it on in DataForSEO."

export class BacklinksAccessError extends DfsError {
  constructor(code: number | null) {
    super(BACKLINKS_ACCESS_DENIED, code, null, "auth")
    this.name = "BacklinksAccessError"
  }
}

const ACCESS_CODES = new Set([40204, 40205, 40206])

export type BulkResult = { values: Record<string, number>; cost: number }

async function bulk(
  db: Db,
  endpoint: "bulk_ranks" | "bulk_spam_score",
  targets: string[],
  field: "rank" | "spam_score",
  extra: Record<string, unknown>,
  ctx: Ctx,
): Promise<BulkResult> {
  const values: Record<string, number> = {}
  let cost = 0
  for (let i = 0; i < targets.length; i += 1000) {
    const chunk = targets.slice(i, i + 1000)
    let env
    try {
      env = await dfsCall<{ items?: Record<string, unknown>[] | null }>(
        db,
        "POST",
        `v3/backlinks/${endpoint}/live`,
        {
          api: "backlinks",
          body: [{ targets: chunk, ...extra }],
          clientId: ctx.clientId,
          ref: ctx.ref,
          idempotent: true,
        },
      )
    } catch (e) {
      if (e instanceof DfsError && e.code !== null && ACCESS_CODES.has(e.code))
        throw new BacklinksAccessError(e.code)
      throw e
    }
    const task = env.tasks?.[0]
    if (!task) throw new DfsError("No task in the response.", null, null, "server")
    if (ACCESS_CODES.has(task.status_code)) throw new BacklinksAccessError(task.status_code)
    if (task.status_code !== 20000) {
      throw new DfsError(
        task.status_message,
        task.status_code,
        null,
        task.status_code >= 50000 ? "server" : "input",
      )
    }
    cost += typeof task.cost === "number" ? task.cost : typeof env.cost === "number" ? env.cost : 0
    for (const r of task.result ?? []) {
      for (const item of r?.items ?? []) {
        const target = typeof item.target === "string" ? item.target.toLowerCase() : null
        const value = item[field]
        if (target && typeof value === "number" && Number.isFinite(value)) values[target] = value
      }
    }
  }
  return { values, cost }
}

/** Domain Rank, 0–1000 (DataForSEO's own scale; the app shows it as 0–100). */
export function bulkRanks(db: Db, targets: string[], ctx: Ctx) {
  return bulk(db, "bulk_ranks", targets, "rank", { rank_scale: "one_thousand" }, ctx)
}

/** Spam score 0–100 (higher is worse). */
export function bulkSpamScore(db: Db, targets: string[], ctx: Ctx) {
  return bulk(db, "bulk_spam_score", targets, "spam_score", {}, ctx)
}

// ---------------------------------------------------------------------------
// Competitor backlinks (docs/plans/backlinks/11-competitor-backlinks.md)
// ---------------------------------------------------------------------------

/** One task of a Backlinks Live call: checks the status, returns the items and the cost. */
async function backlinksTask(
  db: Db,
  endpoint: "referring_domains" | "backlinks",
  body: Record<string, unknown>,
  ctx: Ctx,
): Promise<{ items: Record<string, unknown>[]; cost: number; code: number }> {
  let env
  try {
    env = await dfsCall<{ items?: Record<string, unknown>[] | null }>(db, "POST", `v3/backlinks/${endpoint}/live`, {
      api: "backlinks",
      body: [body],
      clientId: ctx.clientId,
      ref: ctx.ref,
      idempotent: true,
      timeoutMs: 90_000,
    })
  } catch (e) {
    if (e instanceof DfsError && e.code !== null && ACCESS_CODES.has(e.code)) throw new BacklinksAccessError(e.code)
    throw e
  }
  const task = env.tasks?.[0]
  if (!task) throw new DfsError("No task in the response.", null, null, "server")
  if (ACCESS_CODES.has(task.status_code)) throw new BacklinksAccessError(task.status_code)
  const cost = typeof task.cost === "number" ? task.cost : typeof env.cost === "number" ? env.cost : 0
  if (task.status_code === 40102) return { items: [], cost, code: task.status_code } // no results
  if (task.status_code !== 20000) {
    throw new DfsError(task.status_message, task.status_code, null, task.status_code >= 50000 ? "server" : "input")
  }
  return { items: (task.result ?? []).flatMap((r) => r?.items ?? []), cost, code: task.status_code }
}

export type ReferringDomain = {
  domain: string
  rank: number | null
  backlinks: number
  spam: number | null
  firstSeen: string | null
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)

/** The sites that link to one domain (live links), strongest first. */
export async function referringDomains(
  db: Db,
  target: string,
  limit: number,
  ctx: Ctx,
): Promise<{ domains: ReferringDomain[]; cost: number }> {
  const { items, cost } = await backlinksTask(
    db,
    "referring_domains",
    {
      target,
      limit: Math.max(1, Math.min(1000, limit)),
      order_by: ["rank,desc"],
      backlinks_status_type: "live",
      include_subdomains: true,
      exclude_internal_backlinks: true,
      rank_scale: "one_thousand",
    },
    ctx,
  )
  const domains = items
    .map((i) => ({
      domain: typeof i.domain === "string" ? i.domain.toLowerCase().replace(/^www\./, "") : "",
      rank: n(i.rank),
      backlinks: n(i.backlinks) ?? 1,
      spam: n(i.backlinks_spam_score),
      firstSeen: typeof i.first_seen === "string" ? i.first_seen : null,
    }))
    .filter((d) => d.domain)
  return { domains, cost }
}

export type CompetitorLink = {
  domainFrom: string
  urlFrom: string
  title: string | null
  anchor: string | null
  dofollow: boolean | null
  location: string | null
  textPre: string | null
  textPost: string | null
  firstSeen: string | null
  language: string | null
  spam: number | null
}

/**
 * One example link per linking site to `target` (mode one_per_domain). With `fromDomains`, the
 * call asks only for those sites; if DataForSEO refuses that filter, it asks for the strongest
 * 1,000 and the caller matches in code.
 */
export async function linksToTarget(
  db: Db,
  target: string,
  fromDomains: string[],
  ctx: Ctx,
): Promise<{ links: CompetitorLink[]; cost: number; filtered: boolean }> {
  const base = {
    target,
    mode: "one_per_domain",
    backlinks_status_type: "live",
    include_subdomains: true,
    exclude_internal_backlinks: true,
    rank_scale: "one_thousand",
    order_by: ["domain_from_rank,desc"],
  }
  const map = (items: Record<string, unknown>[]) =>
    items
      .map((i) => ({
        domainFrom: typeof i.domain_from === "string" ? i.domain_from.toLowerCase().replace(/^www\./, "") : "",
        urlFrom: typeof i.url_from === "string" ? i.url_from : "",
        title: typeof i.page_from_title === "string" ? i.page_from_title.slice(0, 300) : null,
        anchor: typeof i.anchor === "string" ? i.anchor.slice(0, 200) : null,
        dofollow: typeof i.dofollow === "boolean" ? i.dofollow : null,
        location: typeof i.semantic_location === "string" ? i.semantic_location : null,
        textPre: typeof i.text_pre === "string" ? i.text_pre.slice(-160) : null,
        textPost: typeof i.text_post === "string" ? i.text_post.slice(0, 160) : null,
        firstSeen: typeof i.first_seen === "string" ? i.first_seen : null,
        language: typeof i.page_from_language === "string" ? i.page_from_language : null,
        spam: n(i.backlink_spam_score),
      }))
      .filter((l) => l.domainFrom && /^https?:\/\//.test(l.urlFrom))

  const wanted = [...new Set(fromDomains)].slice(0, 1000)
  if (wanted.length) {
    try {
      const r = await backlinksTask(
        db,
        "backlinks",
        { ...base, limit: Math.min(1000, wanted.length * 2), filters: ["domain_from", "in", wanted] },
        ctx,
      )
      return { links: map(r.items), cost: r.cost, filtered: true }
    } catch (e) {
      if (e instanceof BacklinksAccessError) throw e
      // The "in" filter isn't accepted: fall back to the strongest links and match in code.
    }
  }
  const r = await backlinksTask(db, "backlinks", { ...base, limit: 1000 }, ctx)
  const keep = new Set(wanted)
  return { links: map(r.items).filter((l) => !keep.size || keep.has(l.domainFrom)), cost: r.cost, filtered: false }
}
