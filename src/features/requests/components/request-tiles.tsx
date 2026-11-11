import Link from "next/link"

import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { RequestCounts } from "../filters"
import { requestsHref, type RequestParams, type RequestShow } from "../search-params"

/** Waiting on client / Answered, needs you / Overdue / Done: clickable filters. */
export function RequestTiles({
  counts,
  params,
  basePath,
  showDone = true,
}: {
  counts: RequestCounts
  params: RequestParams
  basePath: string
  showDone?: boolean
}) {
  const tiles: [RequestShow, string, number, string | undefined][] = [
    ["open", "Waiting on client", counts.open, undefined],
    ["answered", "Answered, needs you", counts.answered, "text-primary"],
    ["overdue", "Overdue", counts.overdue, "text-danger"],
    ...(showDone
      ? [["done", "Done", counts.done, undefined] as [RequestShow, string, number, undefined]]
      : []),
  ]

  return (
    <div className={cn("grid grid-cols-2 gap-3", showDone ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
      {tiles.map(([show, label, count, tone]) => {
        const selected = params.show === show
        return (
          <Link
            key={show}
            href={`${requestsHref(basePath, params, { show: selected ? undefined : show, request: undefined })}#requests`}
            scroll={false}
            aria-current={selected ? "true" : undefined}
            className={cn(
              "flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring",
              selected && "border-primary hover:border-primary",
            )}
          >
            <span className="text-sm text-muted-foreground">{label}</span>
            <span
              className={cn(
                "text-[28px] leading-none font-semibold tracking-tight tabular-nums",
                count > 0 && tone,
              )}
            >
              {formatNumber(count)}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
