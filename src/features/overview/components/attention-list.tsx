import { ArrowRight, CircleAlert, ClipboardCheck, Clock3, TriangleAlert } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import type { Tone } from "@/components/common/status"
import { Button } from "@/components/ui/button"
import { formatRelative } from "@/lib/format"
import { clientHref } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import type { ClientAlert, OverviewDetails } from "../queries"
import { IconTile } from "./icon-tile"

/**
 * "Needs attention" for one client: its open alerts (most severe first) and,
 * while it's still onboarding, how far the client got. Renders nothing when clear.
 */
export function AttentionList({
  alerts,
  details,
  now,
}: {
  alerts: ClientAlert[]
  details: OverviewDetails
  now: Date
}) {
  const showOnboarding = details.stage === "onboarding"
  const onboarding = details.onboarding
  if (alerts.length === 0 && !showOnboarding) return null

  const count = alerts.length + (showOnboarding ? 1 : 0)
  const urgent = alerts.some((a) => a.severity === "action_needed")
  const status = onboarding?.status ?? "not_started"
  const onboardingTone: Tone =
    status === "reviewed" ? "success" : status === "submitted" ? "brand" : "info"

  return (
    <section aria-labelledby="attention-title" className="flex flex-col gap-3">
      <h2
        id="attention-title"
        className="flex items-center gap-2 text-[15px] leading-[22px] font-semibold"
      >
        Needs attention
        <span
          className={cn(
            "inline-grid h-5 min-w-5 place-items-center rounded-sm px-1 font-sans text-xs font-semibold tabular-nums",
            urgent ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
          )}
        >
          {count}
        </span>
      </h2>
      <ul className="flex flex-col divide-y overflow-hidden rounded-lg border bg-card">
        {alerts.map((a) => {
          const action = a.severity === "action_needed"
          return (
            <Row
              key={a.id}
              tile={
                <IconTile
                  icon={action ? CircleAlert : TriangleAlert}
                  tone={action ? "danger" : "warning"}
                />
              }
              title={a.title}
              detail={a.detail}
              meta={
                <>
                  <span className={cn("font-medium", action ? "text-danger" : "text-warning")}>
                    {action ? "Action needed" : "Needs a look"}
                  </span>
                  <span aria-hidden>·</span>
                  <Clock3 aria-hidden className="size-3" />
                  since {formatRelative(a.createdAt, now)}
                </>
              }
              action={
                a.actionHref &&
                a.actionLabel &&
                !isHere(a.actionHref, details.slug) && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={a.actionHref}>
                      {a.actionLabel}
                      <ArrowRight />
                    </Link>
                  </Button>
                )
              }
            />
          )
        })}

        {showOnboarding && (
          <Row
            tile={<IconTile icon={ClipboardCheck} tone={onboardingTone} />}
            title={
              status === "not_started"
                ? "Onboarding hasn't started"
                : status === "reviewed"
                  ? "Onboarding reviewed"
                  : status === "submitted"
                    ? "Onboarding sent in, ready for review"
                    : `Onboarding: ${onboarding?.stepsDone ?? 0} of ${onboarding?.stepsTotal ?? 0} steps done`
            }
            detail={
              status === "not_started"
                ? "Send the client their onboarding link to collect details and connections."
                : status === "reviewed"
                  ? "Move the client to Active in Edit details when the work starts."
                  : onboarding?.submittedAt
                    ? `Sent in ${formatRelative(onboarding.submittedAt, now)}.`
                    : "The client is still filling in their onboarding link."
            }
            progress={
              onboarding && status !== "not_started" && onboarding.stepsTotal > 0
                ? { done: onboarding.stepsDone, total: onboarding.stepsTotal }
                : null
            }
            action={
              <Button asChild variant="outline" size="sm">
                <Link href={clientHref(details.slug, "onboarding")}>
                  Open onboarding
                  <ArrowRight />
                </Link>
              </Button>
            }
          />
        )}
      </ul>
    </section>
  )
}

function Row({
  tile,
  title,
  detail,
  meta,
  progress,
  action,
}: {
  tile: ReactNode
  title: string
  detail?: string | null
  meta?: ReactNode
  progress?: { done: number; total: number } | null
  action?: ReactNode
}) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {tile}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium">{title}</span>
          {detail && <span className="text-[13px] text-muted-foreground">{detail}</span>}
          {meta && (
            <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {meta}
            </span>
          )}
          {progress && (
            <span className="mt-1.5 flex items-center gap-2">
              <span
                role="progressbar"
                aria-label="Onboarding steps done"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                className="relative h-1.5 w-40 overflow-hidden rounded-full bg-muted"
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-primary"
                  style={{ width: `${Math.min(100, (progress.done / progress.total) * 100)}%` }}
                />
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {progress.done} of {progress.total} steps
              </span>
            </span>
          )}
        </div>
      </div>
      {action && <div className="shrink-0 pl-11 sm:pl-0">{action}</div>}
    </li>
  )
}

/** The pace alert links to this page; no point showing a button to where you are. */
const isHere = (href: string, slug: string) => href === clientHref(slug)
