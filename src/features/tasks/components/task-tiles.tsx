import Link from "next/link"

import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { TaskCounts } from "../queries"
import { tasksHref, type DueFilter, type TaskParams } from "../search-params"

/** Overdue / Due today / Due this week / Waiting on a client: clickable filters. */
export function TaskTiles({ counts, params }: { counts: TaskCounts; params: TaskParams }) {
  const tiles: {
    key: string
    label: string
    count: number
    href: string
    selected: boolean
    tone?: string
  }[] = [
    ...(
      [
        ["overdue", "Overdue", counts.overdue, "text-danger"],
        ["today", "Due today", counts.dueToday, undefined],
        ["week", "Due later this week", counts.dueThisWeek, undefined],
      ] as [DueFilter, string, number, string | undefined][]
    ).map(([due, label, count, tone]) => ({
      key: due,
      label,
      count,
      tone: count > 0 ? tone : undefined,
      selected: params.due === due,
      href: tasksHref(params, {
        due: params.due === due ? undefined : due,
        view: params.view === "done" || params.view === "waiting" ? "team" : params.view,
        task: undefined,
      }),
    })),
    {
      key: "waiting",
      label: "Waiting on a client",
      count: counts.waiting,
      selected: params.view === "waiting",
      href: tasksHref(params, { view: "waiting", due: undefined, task: undefined }),
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Link
          key={tile.key}
          href={`${tile.href}#tasks`}
          scroll={false}
          aria-current={tile.selected ? "true" : undefined}
          className={cn(
            "flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring",
            tile.selected && "border-primary hover:border-primary",
          )}
        >
          <span className="text-sm text-muted-foreground">{tile.label}</span>
          <span
            className={cn(
              "text-[28px] leading-none font-semibold tracking-tight tabular-nums",
              tile.tone,
            )}
          >
            {formatNumber(tile.count)}
          </span>
        </Link>
      ))}
    </div>
  )
}
