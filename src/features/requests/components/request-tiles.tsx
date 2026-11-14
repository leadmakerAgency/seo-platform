import { StatStrip, type StatItem } from "@/components/common/stat-strip"
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
  const tiles: [RequestShow, string, number, StatItem["tone"]][] = [
    ["open", "Waiting on client", counts.open, undefined],
    ["answered", "Answered, needs you", counts.answered, "brand"],
    ["overdue", "Overdue", counts.overdue, "danger"],
    ...(showDone
      ? [["done", "Done", counts.done, undefined] as [RequestShow, string, number, undefined]]
      : []),
  ]

  return (
    <StatStrip
      label="Filter requests"
      items={tiles.map(([show, label, count, tone]) => {
        const selected = params.show === show
        return {
          key: show,
          label,
          count,
          tone,
          selected,
          href: `${requestsHref(basePath, params, { show: selected ? undefined : show, request: undefined })}#requests`,
        }
      })}
    />
  )
}
