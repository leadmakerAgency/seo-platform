import "server-only"

import { getOrCreateProfile } from "@/lib/zernio/client"
import type { Db } from "./sync"

/**
 * The client's Zernio profile id: from our table, or created (or found by
 * externalId) at Zernio and saved. Safe to call twice at once: Zernio returns
 * the existing profile on a duplicate, and the insert ignores conflicts.
 */
export async function ensureZernioProfile(
  db: Db,
  client: { id: string; name: string },
  createdBy: string | null,
): Promise<string> {
  const { data: existing } = await db
    .from("zernio_profiles")
    .select("zernio_profile_id")
    .eq("client_id", client.id)
    .maybeSingle()
  if (existing) return existing.zernio_profile_id

  const profileId = await getOrCreateProfile(client.id, client.name)
  await db
    .from("zernio_profiles")
    .upsert(
      { client_id: client.id, zernio_profile_id: profileId, created_by: createdBy },
      { onConflict: "client_id", ignoreDuplicates: true },
    )
  const { data: saved } = await db
    .from("zernio_profiles")
    .select("zernio_profile_id")
    .eq("client_id", client.id)
    .maybeSingle()
  if (!saved) throw new Error("Couldn't save the client's Zernio profile.")
  return saved.zernio_profile_id
}
