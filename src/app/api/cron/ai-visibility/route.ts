import { after, NextResponse } from "next/server"

import { processAiVisibility } from "@/features/ai-visibility/pipeline"
import type { Db } from "@/lib/dataforseo/client"
import { hasDataForSeo } from "@/lib/env.server"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"

/**
 * Every 10 minutes (pg_cron, migration 0055), with a bearer token only the database knows.
 * Queues the AI visibility checks that are due, then works open checks after the response:
 * posting questions, collecting queued answers, reading them. Once a day it runs the cleanup.
 */
export async function POST(request: Request) {
  if (!hasSupabaseSecretKey()) return NextResponse.json({ error: "Not configured" }, { status: 503 })
  const token = /^Bearer\s+([A-Za-z0-9]{16,200})$/.exec(request.headers.get("authorization") ?? "")?.[1]
  const db = createSupabaseAdminClient() as Db
  const { data: valid } = token ? await db.rpc("verify_aiv_token", { p_token: token }) : { data: false }
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!hasDataForSeo()) return NextResponse.json({ ok: true, skipped: "DataForSEO isn't connected" })

  const { data: settings } = await db.from("dfs_settings").select("aiv_last_cleanup_at").eq("id", true).maybeSingle()
  const last = settings?.aiv_last_cleanup_at ? new Date(settings.aiv_last_cleanup_at).getTime() : 0
  if (Date.now() - last > 23 * 3_600_000) {
    const { error } = await db.rpc("aiv_cleanup")
    if (error) console.error("[ai-visibility] cleanup failed", error.message)
    // Location codes older than 30 days are dropped; the next check fetches them again.
    await db.from("aiv_locations").delete().lt("synced_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
  }

  const { data: queued, error } = await db.rpc("dfs_queue_aiv_runs", { p_limit: 10 })
  if (error) console.error("[ai-visibility] queue failed", error.message)

  after(async () => {
    try {
      await processAiVisibility(db, 3)
    } catch (e) {
      console.error("[ai-visibility] cron run failed", e)
    }
  })
  return NextResponse.json({ ok: true, queued: Array.isArray(queued) ? queued.length : 0 })
}
