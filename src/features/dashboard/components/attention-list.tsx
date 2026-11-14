import { BellOff, CircleAlert, TriangleAlert } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { formatRelative } from "@/lib/format"
import { clientHref } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import type { OpenAlert } from "../queries"

/** Computed items (not stored alerts), e.g. overdue client requests. */
export type AttentionItem = {
  key: string
  urgent: boolean
  client: { slug: string; name: string } | null
  title: string
  detail?: string
  href: string | null
  actionLabel: string
}

export function AttentionList({
  alerts,
  items = [],
  now,
}: {
  alerts: OpenAlert[]
  items?: AttentionItem[]
  now: Date
}) {
  if (alerts.length === 0 && items.length === 0) {
    return (
      <Empty className="border py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BellOff />
          </EmptyMedia>
          <EmptyTitle>Nothing needs attention</EmptyTitle>
          <EmptyDescription>
            Alerts appear here when a connection breaks, a client falls behind, or a client request
            is overdue.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ul className="divide-y rounded-lg border bg-card">
      {items.map((item) => {
        const Icon = item.urgent ? TriangleAlert : CircleAlert
        return (
          <li key={item.key} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5">
            <Icon
              aria-label={item.urgent ? "Action needed" : "Needs a look"}
              className={cn("mt-0.5 size-4 shrink-0", item.urgent ? "text-danger" : "text-warning")}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-sm">
                {item.client && (
                  <>
                    <Link
                      href={clientHref(item.client.slug)}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {item.client.name}
                    </Link>
                    <span className="text-muted-foreground"> · </span>
                  </>
                )}
                <span>{item.title}</span>
              </p>
              {item.detail && <p className="text-sm text-muted-foreground">{item.detail}</p>}
            </div>
            {item.href && (
              <Button asChild variant="outline" size="sm" className="ml-8 sm:ml-0">
                <Link href={item.href}>{item.actionLabel}</Link>
              </Button>
            )}
          </li>
        )
      })}
      {alerts.map((alert) => {
        const urgent = alert.severity === "action_needed"
        const Icon = urgent ? TriangleAlert : CircleAlert
        return (
          <li key={alert.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5">
            <Icon
              aria-label={urgent ? "Action needed" : "Needs a look"}
              className={cn("mt-0.5 size-4 shrink-0", urgent ? "text-danger" : "text-warning")}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-sm">
                {alert.client && (
                  <Link
                    href={clientHref(alert.client.slug)}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {alert.client.name}
                  </Link>
                )}
                {alert.client && <span className="text-muted-foreground"> · </span>}
                <span>{alert.title}</span>
              </p>
              {alert.detail && <p className="text-sm text-muted-foreground">{alert.detail}</p>}
            </div>
            <div className="ml-8 flex items-center gap-3 sm:ml-0">
              <time
                dateTime={alert.createdAt}
                className="text-xs whitespace-nowrap text-muted-foreground"
              >
                {formatRelative(alert.createdAt, now)}
              </time>
              {alert.actionHref && (
                <Button asChild variant="outline" size="sm">
                  <Link href={alert.actionHref}>{alert.actionLabel ?? "Open"}</Link>
                </Button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
