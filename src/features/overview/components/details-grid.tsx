import Link from "next/link"
import type { ReactNode } from "react"

import { StatusTag } from "@/components/common/status"
import { HEALTH_META, STAGE_LABELS } from "@/features/clients/constants"
import { displayUrl, formatDate } from "@/lib/format"
import { clientHref } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import { DELIVERABLES, DELIVERABLE_META, packageLabel } from "../constants"
import type { OverviewDetails } from "../queries"

/** "1 month", "3 months", "1 year 2 months" since the client started. */
function since(startedOn: string, today: string) {
  const [sy, sm, sd] = startedOn.split("-").map(Number)
  const [ty, tm, td] = today.split("-").map(Number)
  let months = (ty - sy) * 12 + (tm - sm) - (td < sd ? 1 : 0)
  if (months < 0) return "starts soon"
  if (months === 0) return "this month"
  const years = Math.floor(months / 12)
  months %= 12
  const parts = []
  if (years) parts.push(`${years} ${years === 1 ? "year" : "years"}`)
  if (months) parts.push(`${months} ${months === 1 ? "month" : "months"}`)
  return parts.join(" ")
}

/** "20 backlinks, 8 articles, 8 Google posts, 30 review requests, 8 AI visibility fixes" */
function everyMonth(d: OverviewDetails) {
  const parts = DELIVERABLES.map((k) => {
    const n = d.targets[DELIVERABLE_META[k].target]
    return n > 0 ? `${n} ${n === 1 ? DELIVERABLE_META[k].one : DELIVERABLE_META[k].many}` : null
  }).filter(Boolean)
  if (d.targets.keywords > 0) parts.push(`${d.targets.keywords} keywords tracked`)
  return parts.length ? parts.join(", ") : "Nothing planned"
}

/** "Client details": who they are and how the account is set up. */
export function DetailsGrid({ details: d, today }: { details: OverviewDetails; today: string }) {
  const health = HEALTH_META[d.health]
  const conn = d.connections

  return (
    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border @container sm:grid-cols-2 lg:grid-cols-4">
      <Item label="Business">{d.name}</Item>
      <Item label="Location">{d.location || "Not set"}</Item>
      <Item label="Website">
        {d.website ? (
          <a
            href={d.website}
            target="_blank"
            rel="noreferrer"
            className="break-all text-brand underline-offset-2 hover:underline"
          >
            {displayUrl(d.website)}
          </a>
        ) : (
          <Muted>Not set</Muted>
        )}
      </Item>
      <Item label="Industry">{d.primaryCategory || d.industry || <Muted>Not set</Muted>}</Item>

      <Item label="Status">
        <span className="flex flex-col items-start gap-1">
          <StatusTag tone={health.tone}>{health.label}</StatusTag>
          {d.healthReason && (
            <span className="text-[13px] text-muted-foreground">{d.healthReason}</span>
          )}
        </span>
      </Item>
      <Item label="Stage">{STAGE_LABELS[d.stage]}</Item>
      <Item label="Package">{packageLabel(d.package)}</Item>
      <Item label="Client since">
        {formatDate(d.startedOn)}
        <span className="text-muted-foreground"> · {since(d.startedOn, today)}</span>
      </Item>

      <Item label="Every month" className="sm:col-span-2">
        {everyMonth(d)}
      </Item>
      <Item label="Account manager">{d.owner?.name ?? <Muted>Nobody yet</Muted>}</Item>
      <Item label="Main contact">
        {d.contact ? (
          <span className="flex flex-col">
            {d.contact.name && <span>{d.contact.name}</span>}
            {d.contact.email && (
              <a
                href={`mailto:${d.contact.email}`}
                className="truncate text-[13px] text-brand underline-offset-2 hover:underline"
              >
                {d.contact.email}
              </a>
            )}
            {d.contact.phone && (
              <span className="text-[13px] text-muted-foreground">{d.contact.phone}</span>
            )}
          </span>
        ) : (
          <Muted>From onboarding, once applied</Muted>
        )}
      </Item>

      <Item label="Connections" className="sm:col-span-2">
        <Link
          href={clientHref(d.slug, "connections")}
          className="underline-offset-2 hover:underline"
        >
          {conn.connected} connected
          {conn.broken > 0 && (
            <span className="font-medium text-warning"> · {conn.broken} need reconnecting</span>
          )}
        </Link>
      </Item>
      <Item label="Waiting on the client" className="sm:col-span-2">
        <Link href={clientHref(d.slug, "requests")} className="underline-offset-2 hover:underline">
          {d.openRequests === 0
            ? "Nothing open"
            : `${d.openRequests} open ${d.openRequests === 1 ? "request" : "requests"}`}
        </Link>
      </Item>
    </dl>
  )
}

function Item({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 bg-card px-4 py-3", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium break-words">{children}</dd>
    </div>
  )
}

const Muted = ({ children }: { children: ReactNode }) => (
  <span className="font-normal text-muted-foreground">{children}</span>
)
