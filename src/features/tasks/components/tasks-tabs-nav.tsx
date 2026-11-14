import Link from "next/link"

import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { TaskCounts } from "../queries"
import type { TaskView } from "../search-params"

/**
 * The Tasks tab bar as plain links, for pages next to /tasks (Client requests).
 * /tasks itself renders the same bar in TasksView, where the task tabs filter in place.
 */
export function TasksTabsNav({
  active,
  counts,
  requestCount,
}: {
  active: TaskView | "requests"
  counts?: TaskCounts
  requestCount: number
}) {
  const tabs: { key: TaskView | "requests"; label: string; href: string; count?: number }[] = [
    { key: "mine", label: "My tasks", href: "/tasks?view=mine", count: counts?.mineOpen },
    { key: "team", label: "Whole team", href: "/tasks?view=team", count: counts?.teamOpen },
    {
      key: "waiting",
      label: "Waiting on client",
      href: "/tasks?view=waiting",
      count: counts?.waiting,
    },
    { key: "done", label: "Done", href: "/tasks?view=done" },
    { key: "requests", label: "Client requests", href: "/tasks/requests", count: requestCount },
  ]

  return (
    <nav
      aria-label="Which tasks"
      className="flex w-fit max-w-full overflow-x-auto rounded-lg border bg-card p-0.5"
    >
      {tabs.map((tab) => (
        <TabLink
          key={tab.key}
          href={tab.href}
          label={tab.label}
          count={tab.count}
          active={tab.key === active}
        />
      ))}
    </nav>
  )
}

export function TabLink({
  href,
  label,
  count,
  active,
}: {
  href: string
  label: string
  count?: number
  active: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2 rounded-md px-3 text-sm whitespace-nowrap transition-colors",
        active
          ? "bg-foreground text-background dark:bg-muted dark:text-foreground dark:ring-1 dark:ring-input"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "rounded-sm px-1.5 text-xs tabular-nums",
            active ? "bg-background/20 dark:bg-background" : "bg-muted",
          )}
        >
          {formatNumber(count)}
        </span>
      )}
    </Link>
  )
}
