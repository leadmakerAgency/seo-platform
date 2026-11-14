import { ArrowRight } from "lucide-react"
import Link from "next/link"

import { StatusDot } from "@/components/common/status"
import { Button } from "@/components/ui/button"
import { formatRelative } from "@/lib/format"
import { clientHref } from "@/lib/navigation"
import type { ClientAlert, OverviewDetails } from "../queries"

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

  return (
    <section aria-labelledby="attention-title" className="flex flex-col gap-3">
      <h2 id="attention-title" className="text-[15px] leading-[22px] font-semibold">
        Needs attention
      </h2>
      <ul className="flex flex-col divide-y rounded-lg border bg-card">
        {alerts.map((a) => (
          <li
            key={a.id}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <StatusDot
                tone={a.severity === "action_needed" ? "danger" : "warning"}
                className="mt-[7px] size-2"
              />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">{a.title}</span>
                {a.detail && <span className="text-[13px] text-muted-foreground">{a.detail}</span>}
                <span className="text-xs text-muted-foreground">
                  {a.severity === "action_needed" ? "Action needed" : "Needs a look"} · since{" "}
                  {formatRelative(a.createdAt, now)}
                </span>
              </div>
            </div>
            {a.actionHref && a.actionLabel && !isHere(a.actionHref, details.slug) && (
              <Button asChild variant="outline" size="sm" className="ml-5 w-fit sm:ml-0">
                <Link href={a.actionHref}>
                  {a.actionLabel}
                  <ArrowRight />
                </Link>
              </Button>
            )}
          </li>
        ))}

        {showOnboarding && (
          <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <StatusDot tone="info" className="mt-[7px] size-2" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {!onboarding || onboarding.status === "not_started"
                    ? "Onboarding hasn't started"
                    : onboarding.status === "reviewed"
                      ? "Onboarding reviewed"
                      : onboarding.status === "submitted"
                        ? "Onboarding sent in, ready for review"
                        : `Onboarding: ${onboarding.stepsDone} of ${onboarding.stepsTotal} steps done`}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {!onboarding || onboarding.status === "not_started"
                    ? "Send the client their onboarding link to collect details and connections."
                    : onboarding.status === "reviewed"
                      ? "Move the client to Active in Edit details when the work starts."
                      : onboarding.submittedAt
                        ? `Sent in ${formatRelative(onboarding.submittedAt, now)}.`
                        : "The client is still filling in their onboarding link."}
                </span>
              </div>
            </div>
            <Button asChild variant="outline" size="sm" className="ml-5 w-fit sm:ml-0">
              <Link href={clientHref(details.slug, "onboarding")}>
                Open onboarding
                <ArrowRight />
              </Link>
            </Button>
          </li>
        )}
      </ul>
    </section>
  )
}

/** The pace alert links to this page; no point showing a button to where you are. */
const isHere = (href: string, slug: string) => href === clientHref(slug)
