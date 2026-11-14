import Link from "next/link"

import { StatusTag } from "@/components/common/status"
import { STATUS_META, taskNumber } from "@/features/tasks/constants"
import type { ClientTaskRow } from "@/features/tasks/queries"
import { dueLabel, dueState } from "@/lib/dates"
import { clientHref } from "@/lib/navigation"
import { cn } from "@/lib/utils"

/** Up to 5 open tasks for this client, overdue first (the query already sorts by due date). */
export function OpenTasks({
  tasks,
  slug,
  today,
}: {
  tasks: ClientTaskRow[]
  slug: string
  today: string
}) {
  const open = tasks.filter((t) => t.status !== "done" && !t.doneForClient)
  const shown = open.slice(0, 5)
  const base = clientHref(slug, "tasks")

  return (
    <section aria-labelledby="open-tasks-title" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="flex flex-col gap-0.5">
          <h2 id="open-tasks-title" className="text-[15px] leading-[22px] font-semibold">
            Open tasks for this client
          </h2>
          <p className="text-sm text-muted-foreground">Includes tasks shared with other clients.</p>
        </div>
        <Link
          href={base}
          className="text-[13px] font-medium text-brand underline-offset-2 hover:underline"
        >
          {open.length > shown.length ? `See all ${open.length} tasks` : "See all tasks"}
        </Link>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-lg border bg-card px-4 py-6 text-sm">
          <p className="font-medium">No open tasks</p>
          <p className="text-muted-foreground">
            Everything for this client is ticked off. New tasks show up here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-card">
          {shown.map((t) => {
            const state = dueState(t.dueOn, false, today)
            const others = t.clientsTotal - 1
            return (
              <li key={t.id}>
                <Link
                  href={`${base}?task=${t.number}`}
                  className="flex items-start gap-3 px-4 py-3 transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{t.title}</span>
                    <span className="text-xs text-muted-foreground">
                      <span className="font-mono">{taskNumber(t.number)}</span>
                      {" · "}
                      {t.assignee?.name ?? "Unassigned"}
                      {" · "}
                      <span
                        className={cn(
                          state === "overdue" && "font-medium text-danger",
                          state === "today" && "font-medium text-foreground",
                        )}
                      >
                        {t.dueOn ? dueLabel(t.dueOn, state) : "No due date"}
                      </span>
                      {others > 0 &&
                        ` · Shared with ${others} other ${others === 1 ? "client" : "clients"}`}
                    </span>
                  </div>
                  <StatusTag tone={STATUS_META[t.status].tone} className="mt-0.5 shrink-0">
                    {STATUS_META[t.status].label}
                  </StatusTag>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
