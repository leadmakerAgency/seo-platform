import "server-only"

import { createSupabasePublicClient } from "@/lib/supabase/public"
import {
  parseOptions,
  type RequestDecision,
  type RequestKind,
  type RequestOptions,
  type RequestStatus,
} from "./constants"
import { portalTokenSchema } from "./schemas"

export type PortalRequest = {
  id: string
  number: number
  kind: RequestKind
  status: RequestStatus
  title: string
  instructions: string | null
  options: RequestOptions
  dueOn: string | null
  askAgainNote: string | null
  decision: RequestDecision | null
  respondedAt: string | null
  responderName: string | null
  files: { id: string; name: string; size: number | null }[]
}

export type PortalData = {
  clientName: string
  contact: string | null
  requests: PortalRequest[]
}

type RawPortal = {
  client?: { name?: string }
  contact?: string | null
  requests?: {
    id: string
    number: number
    kind: RequestKind
    status: RequestStatus
    title: string
    instructions: string | null
    options: unknown
    due_on: string | null
    ask_again_note: string | null
    decision: RequestDecision | null
    responded_at: string | null
    responder_name: string | null
    files: { id: string; name: string; size: number | null }[] | null
  }[]
}

/**
 * Reads the portal for a private link. The token is checked inside the
 * database (portal_get), which only ever returns that one client's requests and
 * never internal notes, team emails or tasks. Null for an unknown or replaced link.
 */
export async function getPortal(token: string): Promise<PortalData | null> {
  if (!portalTokenSchema.safeParse(token).success) return null
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase.rpc("portal_get", { p_token: token })
  if (error || !data) return null
  const raw = data as RawPortal
  return {
    clientName: raw.client?.name ?? "",
    contact: raw.contact ?? null,
    requests: (raw.requests ?? []).map((r) => ({
      id: r.id,
      number: r.number,
      kind: r.kind,
      status: r.status,
      title: r.title,
      instructions: r.instructions,
      options: parseOptions(r.options),
      dueOn: r.due_on,
      askAgainNote: r.ask_again_note,
      decision: r.decision,
      respondedAt: r.responded_at,
      responderName: r.responder_name,
      files: r.files ?? [],
    })),
  }
}
