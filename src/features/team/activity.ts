import {
  HEALTH_META,
  STAGE_LABELS,
  type ClientHealth,
  type ClientStage,
} from "@/features/clients/constants"
import { PLATFORM_META, type SocialPlatform } from "@/features/connections/constants"
import { DELIVERABLES, DELIVERABLE_META, type DeliverableKind } from "@/features/overview/constants"
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

const listOf = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`

const TARGET_LABELS: Record<string, string> = {
  keywords: "keywords",
  ...Object.fromEntries(DELIVERABLES.map((k) => [k, DELIVERABLE_META[k].many])),
}

const deliverable = (kind: unknown, n: number) => {
  const meta = DELIVERABLE_META[kind as DeliverableKind]
  if (!meta) return "items"
  return n === 1 ? meta.one : meta.many
}

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
    case "client.updated": {
      const fields = Array.isArray(m.fields) ? (m.fields as unknown[]).map(str).filter(Boolean) : []
      if (str(m.stage))
        return `moved the client to ${STAGE_LABELS[m.stage as ClientStage] ?? str(m.stage)}`
      return fields.length ? `updated the client's ${listOf(fields)}` : "updated the client"
    }
    case "client.targets_changed": {
      const changes = (m.changes ?? {}) as Record<string, unknown>
      const parts = Object.entries(changes).map(([k, v]) => {
        const [from, to] = Array.isArray(v) ? v : []
        return `${TARGET_LABELS[k] ?? k} ${num(from)} → ${num(to)}`
      })
      return parts.length
        ? `changed the monthly plan: ${parts.join(", ")}`
        : "changed the monthly plan"
    }
    case "client.health_changed":
      return `changed the status to ${HEALTH_META[m.to as ClientHealth]?.label ?? str(m.to)}${
        str(m.reason) ? ` (${str(m.reason)})` : ""
      }`
    case "work.logged": {
      const q = Number(m.quantity)
      const what = deliverable(m.kind, Math.abs(q))
      return q < 0
        ? `corrected ${what} by −${Math.abs(q)}: “${str(m.title)}”`
        : `logged ${q} ${what}: “${str(m.title)}”`
    }
    case "work.removed":
      return `removed the logged work “${str(m.title)}”`
    case "keyword.added": {
      const n = Number(m.count) || 0
      const phrases = Array.isArray(m.phrases) ? (m.phrases as unknown[]).map(String) : []
      return n === 1 && phrases[0]
        ? `started tracking the keyword “${phrases[0]}”`
        : `started tracking ${n} keywords${
            phrases.length
              ? `: ${phrases
                  .slice(0, 3)
                  .map((p) => `“${p}”`)
                  .join(", ")}${n > 3 ? "…" : ""}`
              : ""
          }`
    }
    case "keyword.removed":
      return `stopped tracking the keyword “${str(m.phrase)}”${str(m.reason) ? ` (${str(m.reason)})` : ""}`
    case "keyword.replaced":
      return `replaced the keyword “${str(m.from)}” with “${str(m.to)}”`
    case "keyword.research_finished":
      return `ran keyword research: ${num(m.saved) || 0} keywords scored${Number(m.new) ? `, ${num(m.new)} new` : ""}`
    case "rank.check_requested":
      return "started a ranking check"
    case "rankings.settings_changed":
      return "changed the ranking settings"
    case "rank.check_finished": {
      const into = Number(m.moved_into_top10) || 0
      const out = Number(m.moved_out_of_top10) || 0
      const what =
        m.scope === "partial" ? "checked the new keywords" : "finished the weekly ranking check"
      const parts = [
        into ? `${into} keyword${into === 1 ? "" : "s"} moved into the Google top 10` : "",
        out ? `${out} dropped out` : "",
      ].filter(Boolean)
      return parts.length ? `${what}: ${parts.join(", ")}` : what
    }
    // Reserved for the AI visibility, Backlinks, Content, Reviews and Report pages.
    case "ai.check_finished":
      return `finished an AI visibility check${num(m.answers) ? `: named in ${num(m.mentions)} of ${num(m.answers)} answers` : num(m.mentions) ? `: named in ${num(m.mentions)} answers` : ""}`
    case "ai.project_saved":
      return m.seeded ? "set up AI visibility from the client's details" : "updated the AI visibility setup"
    case "ai.brand_saved":
      return `updated the tracked brand ${str(m.brand) || ""}`.trim()
    case "ai.prompts_added":
      return `added ${num(m.count) || 1} AI visibility ${Number(m.count) === 1 ? "question" : "questions"}`
    case "ai.run_started":
      return "started an AI visibility check"
    case "ai.action_done":
      return `marked an AI visibility fix done: ${str(m.title)}`
    case "ai.action_in_progress":
      return `started the AI visibility action: ${str(m.title)}`
    case "ai.action_declined":
      return `declined the AI visibility action: ${str(m.title)}`
    case "ai.action_new":
      return `reopened the AI visibility action: ${str(m.title)}`
    case "ai.sent_to_backlinks":
      return `sent ${str(m.site) || "a site"} from AI visibility to Backlinks`
    case "backlink.target_added":
      return `added ${str(m.place) || "a place"} to the places for backlinks`
    case "backlink.brief_saved":
      return `saved the backlink strategy brief (version ${num(m.version) || 1})`
    case "backlink.ai_search_started":
      if (str(m.kind) === "competitors")
        return `started competitor backlinks for ${num(m.competitors) || 2} competitors`
      return `started a Shockwave AI Search for ${num(m.places) || 1} ${Number(m.places) === 1 ? "place" : "places"}`
    case "backlink.ai_search_finished":
      if (str(m.kind) === "competitors")
        return `finished competitor backlinks: ${num(m.gap_sites) || 0} linking sites, ${num(m.review) || 0} in the top 30`
      return `finished a Shockwave AI Search: ${num(m.review) || 0} in the top 30`
    case "backlink.competitors_saved":
      return `updated the client's competitors${num(m.count) ? ` (${num(m.count)})` : ""}`
    case "backlink.ai_reviewed":
      return `${str(m.decision) === "approve" ? "approved" : str(m.decision) === "reject" ? "rejected" : "restored"} ${num(m.count) || 1} AI-found ${Number(m.count) === 1 ? "place" : "places"}`
    case "backlink.reranked":
      return `re-ranked the backlink places: ${num(m.review) || 0} in the top 30`
    case "backlink.target_removed":
      return `removed ${str(m.place) || "a place"} from the places for backlinks`
    case "backlink.discovery_finished": {
      const n = Number(m.new) || 0
      return `searched Google for backlink places: ${n} new place${n === 1 ? "" : "s"}${Number(m.known) ? `, ${num(m.known)} already known` : ""}`
    }
    case "backlink.reviewed": {
      const n = Number(m.count) || 0
      const sites = Array.isArray(m.sites) ? (m.sites as unknown[]).map(String) : []
      const verb =
        m.decision === "approve"
          ? "approved"
          : m.decision === "reject"
            ? "rejected"
            : "moved back to review"
      const what =
        n === 1 && sites[0]
          ? sites[0]
          : `${n} backlink places${sites.length ? ` (${sites.slice(0, 3).join(", ")}${n > 3 ? "…" : ""})` : ""}`
      return `${verb} ${what}`
    }
    case "backlink.strength_checked":
      return `checked the site strength of ${num(m.count) || 0} backlink places`
    case "backlink.directory_blocked":
      return `blocked ${str(m.site) || "a site"} for every client${str(m.reason) ? ` (${str(m.reason)})` : ""}`
    case "backlink.directory_unblocked":
      return `unblocked ${str(m.site) || "a site"}`
    case "backlink.live":
      return `confirmed a backlink live on ${str(m.site) || "a directory"}`
    case "backlink.manual_picked": {
      const n = Number(m.count) || 0
      const sites = Array.isArray(m.sites) ? (m.sites as unknown[]).map(String) : []
      return `added ${n === 1 && sites[0] ? sites[0] : `${n} catalog sites`} to the backlink work list${n > 1 && sites.length ? ` (${sites.slice(0, 3).join(", ")}${n > 3 ? "…" : ""})` : ""}`
    }
    case "backlink.manual_added":
      return `added ${str(m.site) || "a site"} by hand to the backlink work list`
    case "backlink.went_live":
      return `marked the ${str(m.site) || "backlink"} listing live`
    case "backlink.submission_status":
      return `moved the ${str(m.site) || "backlink"} listing to ${str(m.to).replace(/_/g, " ") || "a new status"}`
    case "backlink.submissions_bulk":
      return `updated ${num(m.count) || 0} backlink listings`
    case "catalog.site_saved":
      return `saved ${str(m.site) || "a site"} in the backlink catalog`
    case "catalog.suggestion_reviewed":
      return `${m.accepted ? "accepted" : "declined"} ${str(m.site) || "a site"} for the backlink catalog`
    case "article.published":
      return `published the article “${str(m.title)}”`
    case "rank.scan_requested":
      return "started a ranking scan"
    case "rank.scan_finished":
      return `finished a ranking scan: ${num(m.total)} keywords, ${num(m.keep)} to keep, ${num(m.quick_win)} quick wins`
    case "rank.scan_failed":
      return `ran a ranking scan that didn't finish${str(m.error) ? `: ${str(m.error)}` : ""}`
    case "rank.scan_settings_saved":
      return "changed the ranking scan settings"
    case "content.post_scheduled":
      return `scheduled the post “${str(m.title)}”`
    case "content.post_published":
      return `published the post “${str(m.title)}”`
    case "content.post_partial":
      return `published the post “${str(m.title)}” to some accounts; others failed`
    case "content.post_failed":
      return `couldn't publish the post “${str(m.title)}”${str(m.error) ? `: ${str(m.error)}` : ""}`
    case "content.post_cancelled":
      return `cancelled the post “${str(m.title)}”`
    case "content.post_deleted":
      return `deleted the post “${str(m.title)}”`
    case "content.article_scheduled":
      return `scheduled the article “${str(m.title)}” on WordPress`
    case "content.article_published":
      return `published the article “${str(m.title)}” on WordPress`
    case "content.article_failed":
      return `couldn't publish the article “${str(m.title)}”${str(m.error) ? `: ${str(m.error)}` : ""}`
    case "content.article_deleted":
      return `deleted the article draft “${str(m.title)}”`
    case "review.received":
      return `received a ${num(m.rating)}-star review${str(m.author) ? ` from ${str(m.author)}` : ""}`
    case "report.sent":
      return `emailed the ${str(m.month) || "monthly"} report to the client`
    default:
      return entry.action.replace(/[._]/g, " ")
  }
}
