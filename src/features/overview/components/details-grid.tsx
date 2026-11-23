import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Contact,
  Flag,
  Globe,
  HeartPulse,
  Inbox,
  MapPin,
  Package,
  Plug,
  Target,
  UserRound,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { StatusTag, type Tone } from "@/components/common/status"
import { HEALTH_META, STAGE_LABELS } from "@/features/clients/constants"
import { displayUrl, formatDate, formatNumber } from "@/lib/format"
import { clientHref } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import { DELIVERABLES, DELIVERABLE_META, packageLabel } from "../constants"
import type { OverviewDetails } from "../queries"
import { DELIVERABLE_LOOK, IconTile, KEYWORDS_LOOK, type Hue } from "./icon-tile"

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

type Planned = { key: string; count: number; label: string; icon: LucideIcon; hue: Hue }

/** The monthly targets as chips: "20 backlinks", "8 articles", ..., "20 keywords tracked". */
function everyMonth(d: OverviewDetails): Planned[] {
  const parts: Planned[] = []
  for (const k of DELIVERABLES) {
    const n = d.targets[DELIVERABLE_META[k].target]
    if (n > 0) {
      parts.push({
        key: k,
        count: n,
        label: n === 1 ? DELIVERABLE_META[k].one : DELIVERABLE_META[k].many,
        ...DELIVERABLE_LOOK[k],
      })
    }
  }
  if (d.targets.keywords > 0) {
    parts.push({
      key: "keywords",
      count: d.targets.keywords,
      label: d.targets.keywords === 1 ? "keyword tracked" : "keywords tracked",
      ...KEYWORDS_LOOK,
    })
  }
  return parts
}

/** "Client details": who they are and how the account is set up. */
export function DetailsGrid({ details: d, today }: { details: OverviewDetails; today: string }) {
  const health = HEALTH_META[d.health]
  const conn = d.connections
  const planned = everyMonth(d)

  return (
    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
      <Item label="Business" icon={Building2} hue="indigo">
        {d.name}
      </Item>
      <Item label="Location" icon={MapPin} hue="clay">
        {d.location || <Muted>Not set</Muted>}
      </Item>
      <Item label="Website" icon={Globe} hue="teal">
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
      <Item label="Industry" icon={BriefcaseBusiness} hue="gold">
        {d.primaryCategory || d.industry || <Muted>Not set</Muted>}
      </Item>

      <Item label="Status" icon={HeartPulse} tone={health.tone}>
        <span className="flex flex-col items-start gap-1.5 pt-0.5">
          <StatusTag tone={health.tone}>{health.label}</StatusTag>
          {d.healthReason && (
            <span className="text-[13px] font-normal text-muted-foreground">{d.healthReason}</span>
          )}
        </span>
      </Item>
      <Item label="Stage" icon={Flag} hue="plum">
        {STAGE_LABELS[d.stage]}
      </Item>
      <Item label="Package" icon={Package} hue="brand">
        {packageLabel(d.package)}
      </Item>
      <Item label="Client since" icon={CalendarDays} hue="teal">
        {formatDate(d.startedOn)}
        <span className="font-normal text-muted-foreground"> · {since(d.startedOn, today)}</span>
      </Item>

      <Item label="Every month" icon={Target} hue="clay" className="sm:col-span-2">
        {planned.length === 0 ? (
          <Muted>Nothing planned yet. Set the targets in Edit details.</Muted>
        ) : (
          <ul className="flex flex-wrap gap-1.5 pt-1">
            {planned.map((p) => (
              <li
                key={p.key}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-background pr-2 pl-0.5 text-[13px]"
              >
                <IconTile icon={p.icon} hue={p.hue} size="sm" className="size-[22px] rounded-sm" />
                <span className="font-semibold tabular-nums">{formatNumber(p.count)}</span>
                <span className="font-normal text-muted-foreground">{p.label}</span>
              </li>
            ))}
          </ul>
        )}
      </Item>
      <Item label="Account manager" icon={UserRound} hue="indigo">
        {d.owner?.name ?? <Muted>Nobody yet</Muted>}
      </Item>
      <Item label="Main contact" icon={Contact} hue="plum">
        {d.contact ? (
          <span className="flex min-w-0 flex-col">
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
              <span className="text-[13px] font-normal text-muted-foreground tabular-nums">
                {d.contact.phone}
              </span>
            )}
          </span>
        ) : (
          <Muted>From onboarding, once applied</Muted>
        )}
      </Item>

      <Item label="Connections" icon={Plug} hue="teal" className="sm:col-span-2">
        <CellLink href={clientHref(d.slug, "connections")}>
          <span className="tabular-nums">{conn.connected}</span> connected
          {conn.broken > 0 && (
            <span className="font-medium text-warning">
              {" "}
              · <span className="tabular-nums">{conn.broken}</span> need reconnecting
            </span>
          )}
        </CellLink>
      </Item>
      <Item label="Waiting on the client" icon={Inbox} hue="gold" className="sm:col-span-2">
        <CellLink href={clientHref(d.slug, "requests")}>
          {d.openRequests === 0 ? (
            "Nothing open"
          ) : (
            <>
              <span className="tabular-nums">{d.openRequests}</span> open{" "}
              {d.openRequests === 1 ? "request" : "requests"}
            </>
          )}
        </CellLink>
      </Item>
    </dl>
  )
}

/**
 * One label/value cell. dt/dd sit directly in the group div (valid <dl> markup), so the
 * icon tile lives inside the dt and is placed in the left gutter.
 */
function Item({
  label,
  icon,
  hue,
  tone,
  children,
  className,
}: {
  label: string
  icon: LucideIcon
  hue?: Hue
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col gap-0.5 bg-card py-3.5 pr-4 pl-[60px]",
        className,
      )}
    >
      <dt className="text-xs text-muted-foreground">
        <IconTile icon={icon} hue={hue} tone={tone} className="absolute top-3.5 left-4" />
        {label}
      </dt>
      <dd className="min-w-0 text-sm font-medium break-words">{children}</dd>
    </div>
  )
}

function CellLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
    >
      <span>{children}</span>
      <ArrowRight
        aria-hidden
        className="size-3.5 text-muted-foreground transition-colors group-hover:text-foreground"
      />
    </Link>
  )
}

const Muted = ({ children }: { children: ReactNode }) => (
  <span className="font-normal text-muted-foreground">{children}</span>
)
