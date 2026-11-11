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
