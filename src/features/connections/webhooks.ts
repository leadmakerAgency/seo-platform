import "server-only"

import { syncClient, type Db } from "./sync"

const MAX_ATTEMPTS = 5

/**
 * Processes one stored Zernio webhook event (service client). Account events
 * re-sync the client from Zernio, so the payload itself is only a hint: a
 * forged or stale event can't put anything wrong in the mirror.
 */
export async function processWebhookEvent(db: Db, eventId: string) {
  const { data: event } = await db
    .from("zernio_webhook_events")
    .select("id, event, zernio_profile_id, payload, processed_at, attempts")
    .eq("id", eventId)
    .maybeSingle()
  if (!event || event.processed_at || event.attempts >= MAX_ATTEMPTS) return

  const done = (fields: { client_id?: string | null; last_error?: string | null }) =>
    db
      .from("zernio_webhook_events")
      .update({ processed_at: new Date().toISOString(), attempts: event.attempts + 1, ...fields })
      .eq("id", event.id)

  if (!event.event.startsWith("account.")) {
    await done({ last_error: null })
    return
  }

  // The profile id comes from Zernio; it must be one of ours.
  const { data: profile } = event.zernio_profile_id
    ? await db
        .from("zernio_profiles")
        .select("client_id")
        .eq("zernio_profile_id", event.zernio_profile_id)
        .maybeSingle()
    : { data: null }
  if (!profile) {
    await done({ last_error: "Profile isn't one of our clients (ignored)." })
    return
  }

  try {
    await syncClient(db, profile.client_id, null)

    // Keep Zernio's own words for why an account broke, when health had none.
    const payload = event.payload as {
      account?: { accountId?: string; reason?: string; disconnectionType?: string }
    }
    const reason = payload.account?.reason
    if (
      event.event === "account.disconnected" &&
      payload.account?.disconnectionType === "unintentional" &&
      payload.account.accountId &&
      reason
    ) {
      await db
        .from("social_accounts")
        .update({ disconnect_reason: reason.slice(0, 500) })
        .eq("zernio_account_id", payload.account.accountId)
        .eq("status", "needs_reconnect")
        .is("disconnect_reason", null)
    }
    await done({ client_id: profile.client_id, last_error: null })
  } catch (error) {
    await db
      .from("zernio_webhook_events")
      .update({
        client_id: profile.client_id,
        attempts: event.attempts + 1,
        last_error: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
      })
      .eq("id", event.id)
    console.error("[zernio] webhook processing failed", event.id, error)
  }
}

/** Retries events that failed or were never processed (the cron calls this). */
export async function retryWebhookEvents(db: Db) {
  const { data } = await db
    .from("zernio_webhook_events")
    .select("id")
    .is("processed_at", null)
    .lt("attempts", MAX_ATTEMPTS)
    .lt("received_at", new Date(Date.now() - 60 * 1000).toISOString())
    .order("received_at", { ascending: true })
    .limit(50)
  for (const e of data ?? []) await processWebhookEvent(db, e.id)
  return data?.length ?? 0
}
