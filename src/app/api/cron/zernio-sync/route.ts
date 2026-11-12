import { NextResponse } from "next/server"

import { syncAll, type Db } from "@/features/connections/sync"
import { retryWebhookEvents } from "@/features/connections/webhooks"
import { hasZernioApiKey } from "@/lib/env.server"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"

/**
 * Hourly health check, called by pg_cron (see migration 0012) with a bearer
 * token that only the database knows. Mirrors every client from Zernio in a
 * few API calls, retries failed webhook events and tidies up.
 */
export async function POST(request: Request) {
  if (!hasSupabaseSecretKey()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 })
  }
  const token = /^Bearer\s+([A-Za-z0-9]{16,200})$/.exec(
    request.headers.get("authorization") ?? "",
  )?.[1]
  const db = createSupabaseAdminClient() as unknown as Db
  const { data: valid } = token
    ? await db.rpc("verify_zernio_cron_token", { p_token: token })
    : { data: false }
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!hasZernioApiKey())
    return NextResponse.json({ ok: true, skipped: "ZERNIO_API_KEY is missing" })

  const now = new Date().toISOString()
  const totals = await syncAll(db)
  const retried = await retryWebhookEvents(db)
  await db
    .from("social_connect_attempts")
    .update({ status: "expired", completed_at: now })
    .eq("status", "pending")
    .lt("expires_at", now)
  await db
    .from("zernio_webhook_events")
    .delete()
    .lt("received_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

  return NextResponse.json({ ok: true, ...totals, retriedEvents: retried })
}
