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
