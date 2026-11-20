import { after, NextResponse } from "next/server"

import { processAiSearchRuns } from "@/features/backlinks/ai-search/pipeline"
import { processBacklinkRuns } from "@/features/backlinks/discovery"
import type { Db } from "@/lib/dataforseo/client"
import { hasAnthropicKey, hasDataForSeo } from "@/lib/env.server"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"

/**
 * Every 15 minutes (pg_cron, migration 0034), with a bearer token only the database knows.
 * It never starts a new search (searches start from the Find places button): it resumes
 * searches whose worker stopped (a redeploy, a crash), fails strength checks stuck for
 * 10 minutes and prunes old cached search results.
 */
export async function POST(request: Request) {
  if (!hasSupabaseSecretKey())
    return NextResponse.json({ error: "Not configured" }, { status: 503 })
  const token = /^Bearer\s+([A-Za-z0-9]{16,200})$/.exec(
    request.headers.get("authorization") ?? "",
  )?.[1]
  const db = createSupabaseAdminClient() as Db
  const { data: valid } = token
    ? await db.rpc("verify_backlinks_token", { p_token: token })
    : { data: false }
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: cleanup, error } = await db.rpc("dfs_backlinks_cleanup")
  if (error) console.error("[backlinks] cleanup failed", error.message)

  // Shockwave AI Search (Claude only, no DataForSEO): resume runs whose worker stopped or was
  // released on a redeploy.
  if (hasAnthropicKey()) {
    after(async () => {
      try {
        await processAiSearchRuns(db, 1)
      } catch (e) {
        console.error("[ai-search] cron resume failed", e)
      }
    })
  }

  if (!hasDataForSeo()) {
    return NextResponse.json({
      ok: true,
      cleanup,
      skipped: "DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD are missing",
    })
  }

  // Searches take a minute or two: run them after the response.
  after(async () => {
    try {
      await processBacklinkRuns(db, 2)
    } catch (e) {
      console.error("[backlinks] cron resume failed", e)
    }
  })
  return NextResponse.json({ ok: true, cleanup })
}
