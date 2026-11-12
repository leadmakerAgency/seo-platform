import { after, NextResponse } from "next/server"

import type { Db } from "@/features/connections/sync"
import { processWebhookEvent } from "@/features/connections/webhooks"
import { getZernioWebhookSecret } from "@/lib/env.server"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"
import type { Json } from "@/lib/supabase/database.types"
import { zWebhookEnvelope } from "@/lib/zernio/schemas"
import { verifyZernioSignature } from "@/lib/zernio/webhook"

const MAX_BODY = 1_000_000

/**
 * Zernio webhook. Contract: verify the HMAC on the raw body, store the event
 * (its id is the primary key, so retries and duplicates are no-ops), answer
 * 2xx within 5 seconds, then process after the response.
 * A 5xx makes Zernio retry (7 times over ~51 hours); a 4xx drops the event.
 */
export async function POST(request: Request) {
  const secret = getZernioWebhookSecret()
  if (!secret || !hasSupabaseSecretKey()) {
    return NextResponse.json(
      { error: "Webhooks aren't configured on this server." },
      { status: 503 },
    )
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "Too large" }, { status: 413 })
  if (!verifyZernioSignature(raw, request.headers.get("x-zernio-signature"), secret)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 })
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const parsed = zWebhookEnvelope.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: "Unexpected payload" }, { status: 400 })
  const event = parsed.data
  if (event.test) return NextResponse.json({ ok: true, test: true })

  const db = createSupabaseAdminClient() as unknown as Db
  const { error } = await db.from("zernio_webhook_events").insert({
    id: event.id,
    event: event.event,
    zernio_profile_id: event.account?.profileId ?? event.profiles?.[0]?.id ?? null,
    zernio_account_id: event.account?.accountId ?? null,
    payload: json as Json,
  })
  if (error?.code === "23505") return NextResponse.json({ ok: true, duplicate: true })
  if (error) {
    console.error("[zernio] couldn't store webhook", error)
    return NextResponse.json({ error: "Couldn't store the event" }, { status: 500 })
  }

  after(() => processWebhookEvent(db, event.id))
  return NextResponse.json({ ok: true })
}
