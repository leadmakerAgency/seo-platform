import "server-only"

import { BacklinksAccessError, bulkRanks, bulkSpamScore } from "@/lib/dataforseo/backlinks"
import { DfsError, type Db } from "@/lib/dataforseo/client"
import type { Json } from "@/lib/supabase/database.types"

/**
 * "Check site strength" (docs/plans/backlinks/03-site-strength.md). The database already
 * decided which sites need a check (request_strength_check: role, budget, 30-day freshness,
 * one at a time); this calls DataForSEO with the service role and stores the numbers.
 */
export async function runStrengthCheck(
  db: Db,
  check: { id: string; clientId: string; targets: string[] },
): Promise<{ checked: number; found: number; cost: number }> {
  const ctx = { clientId: check.clientId, ref: check.id }
  const [ranks, spam] = await Promise.allSettled([
    bulkRanks(db, check.targets, ctx),
    bulkSpamScore(db, check.targets, ctx),
  ])

  const denied = [ranks, spam].some(
    (r) => r.status === "rejected" && r.reason instanceof BacklinksAccessError,
  )
  if (denied) {
    await db
      .from("dfs_settings")
      .update({ backlinks_access: "denied", backlinks_access_checked_at: new Date().toISOString() })
      .eq("id", true)
  }

  if (ranks.status === "rejected") {
    const reason = ranks.reason
    const message =
      reason instanceof DfsError || reason instanceof Error
        ? reason.message
        : "DataForSEO didn't answer."
    const cost = spam.status === "fulfilled" ? spam.value.cost : 0
    await db.rpc("dfs_store_strength", {
      p_check_id: check.id,
      p_ranks: {} as Json,
      p_spam: {} as Json,
      p_cost: cost,
      p_error: message.slice(0, 500),
    })
    throw reason instanceof Error ? reason : new Error(message)
  }

  const spamValues = spam.status === "fulfilled" ? spam.value.values : {}
  if (spam.status === "rejected")
    console.error("[backlinks] spam score failed", check.id, spam.reason)
  const cost = ranks.value.cost + (spam.status === "fulfilled" ? spam.value.cost : 0)
  const { error } = await db.rpc("dfs_store_strength", {
    p_check_id: check.id,
    p_ranks: ranks.value.values as unknown as Json,
    p_spam: spamValues as unknown as Json,
    p_cost: cost,
    p_error: undefined,
  })
  if (error) throw new Error(`Could not save site strength: ${error.message}`)
  return { checked: check.targets.length, found: Object.keys(ranks.value.values).length, cost }
}
