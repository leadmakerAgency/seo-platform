import { PLATFORM_META, type SocialPlatform } from "@/features/connections/constants"
import { STEPS } from "@/features/onboarding/constants"
import { STATUS_META, type TaskStatus } from "@/features/tasks/constants"
import { formatDay } from "@/lib/dates"
import { ROLE_LABELS, type AppRole } from "@/lib/roles"
import type { ActivityEntry } from "./queries"

const str = (v: unknown) => (typeof v === "string" ? v : "")
const role = (v: unknown) => ROLE_LABELS[v as AppRole] ?? str(v)

/** Who did it: client answers come through the portal, so they have no team actor. */
export function actorLabel(
  entry: { action: string; actorName: string | null; clientName?: string | null },
  fallback = "System",
) {
  if (entry.actorName) return entry.actorName
  return entry.action === "request.answered" ? (entry.clientName ?? "The client") : fallback
}

/** One plain sentence per activity_log row, without the actor ("invited Ana R. as a VA"). */
type ActivityLike = Pick<ActivityEntry, "action" | "meta" | "clientName">

const platform = (v: unknown) =>
  PLATFORM_META[v as SocialPlatform]?.label ?? (str(v) || "an account")
const statusLabel = (v: unknown) => STATUS_META[v as TaskStatus]?.label ?? str(v)
const num = (v: unknown) => (typeof v === "number" || typeof v === "string" ? String(v) : "")

export function describeActivity(entry: ActivityLike): string {
  const m = entry.meta
  switch (entry.action) {
    case "client.created":
      return `added the client ${str(m.name) || entry.clientName || ""}`.trim()
    case "team.invited":
      return `invited ${str(m.name) || str(m.email)} as ${role(m.role)}`
    case "team.joined":
      return "joined the team"
    case "team.role_changed":
      return `changed ${str(m.email)} to ${role(m.role)}`
    case "team.disabled":
      return `turned off access for ${str(m.email)}`
    case "team.enabled":
      return `turned access back on for ${str(m.email)}`
    case "team.removed":
      return `removed ${str(m.email)} from the team`
    case "task.created":
      return `created T-${num(m.number)} “${str(m.title)}”`
    case "task.repeated":
      return `finished a repeating task, so T-${num(m.number)} was created for next time`
    case "task.status_changed":
      return `moved T-${num(m.number)} to ${statusLabel(m.to)}`
    case "task.assigned":
      return `assigned T-${num(m.number)} to ${str(m.assignee_name) || "nobody"}`
    case "task.due_changed":
      return str(m.to)
        ? `set T-${num(m.number)} due ${formatDay(str(m.to))}`
        : `removed the due date of T-${num(m.number)}`
    case "task.client_done":
      return `ticked off ${entry.clientName ?? "a client"} on T-${num(m.number)}`
    case "task.client_undone":
      return `un-ticked ${entry.clientName ?? "a client"} on T-${num(m.number)}`
    case "task.commented":
      return `commented on T-${num(m.number)}`
    case "task.deleted":
      return `deleted T-${num(m.number)} “${str(m.title)}”`
    case "onboarding.link_created":
      return "created the onboarding link"
    case "onboarding.link_revoked":
      return "turned off the onboarding link"
    case "onboarding.opened":
      return "opened the onboarding link"
    case "onboarding.step_done":
      return `finished the “${STEPS.find((s) => s.key === str(m.step))?.label ?? str(m.step)}” step`
    case "onboarding.submitted":
      return "sent their onboarding to LeadMaker"
    case "onboarding.applied": {
      const n = Array.isArray(m.fields) ? m.fields.length : 0
      return `applied ${n} onboarding ${n === 1 ? "field" : "fields"} to the profile`
    }
    case "onboarding.reviewed":
      return m.activated
        ? "marked onboarding reviewed and moved the client to Active"
        : "marked onboarding reviewed"
    case "onboarding.reopened":
      return "reopened onboarding so the client can edit again"
    case "vault.viewed":
      return `revealed the ${str(m.site) || "stored"} login`
    case "vault.added":
      return `added a ${str(m.site) || "new"} login`
    case "vault.removed":
      return `removed the ${str(m.site) || "stored"} login`
    case "connection.connected":
      return `connected ${platform(m.platform)}${str(m.name) ? ` “${str(m.name)}”` : ""}`
    case "connection.needs_reconnect":
      return `noticed ${platform(m.platform)}${str(m.name) ? ` “${str(m.name)}”` : ""} needs reconnecting${str(m.reason) ? ` (${str(m.reason)})` : ""}`
    case "connection.restored":
      return `reconnected ${platform(m.platform)}${str(m.name) ? ` “${str(m.name)}”` : ""}`
    case "connection.removed":
      return `disconnected ${platform(m.platform)}${str(m.name) ? ` “${str(m.name)}”` : ""}`
    case "connection.failed":
      return `tried to connect ${platform(m.platform)}, but it didn't finish${str(m.error) ? ` (${str(m.error)})` : ""}`
    case "request.created":
      return `asked ${entry.clientName ?? "the client"} for “${str(m.title)}” (R-${num(m.number)})`
    case "request.answered":
      return `answered R-${num(m.number)} “${str(m.title)}”`
    case "request.done":
      return `marked R-${num(m.number)} “${str(m.title)}” done`
    case "request.reopened":
      return `asked ${entry.clientName ?? "the client"} again for R-${num(m.number)} “${str(m.title)}”`
    case "request.cancelled":
      return `cancelled R-${num(m.number)} “${str(m.title)}”`
    case "request.updated":
      return `updated R-${num(m.number)} “${str(m.title)}”`
    default:
      return entry.action.replace(/[._]/g, " ")
  }
}
