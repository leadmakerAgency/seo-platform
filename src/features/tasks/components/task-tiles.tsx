import { StatStrip, type StatItem } from "@/components/common/stat-strip"
import type { TaskCounts } from "../queries"
import { tasksHref, type DueFilter, type TaskParams } from "../search-params"

/** Overdue / Due today / Due this week / Waiting on a client: clickable filters. */
export function TaskTiles({ counts, params }: { counts: TaskCounts; params: TaskParams }) {
  const due: [DueFilter, string, number, StatItem["tone"]][] = [
    ["overdue", "Overdue", counts.overdue, "danger"],
    ["today", "Due today", counts.dueToday, undefined],
    ["week", "Due later this week", counts.dueThisWeek, undefined],
  ]

  const items: StatItem[] = [
    ...due.map(([key, label, count, tone]) => ({
      key,
      label,
      count,
      tone,
      selected: params.due === key,
      href: `${tasksHref(params, {
        due: params.due === key ? undefined : key,
        view: params.view === "done" || params.view === "waiting" ? "team" : params.view,
        task: undefined,
      })}#tasks`,
    })),
    {
      key: "waiting",
      label: "Waiting on a client",
      count: counts.waiting,
      selected: params.view === "waiting",
      href: `${tasksHref(params, { view: "waiting", due: undefined, task: undefined })}#tasks`,
    },
  ]

  return <StatStrip label="Filter tasks" items={items} />
}
