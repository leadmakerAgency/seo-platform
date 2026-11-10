import { Repeat } from "lucide-react"

import { dueLabel, dueState, type DueState } from "@/lib/dates"
import { cn } from "@/lib/utils"
import {
  PRIORITY_META,
  REPEAT_LABELS,
  STATUS_META,
  TYPE_LABELS,
  taskNumber,
  type TaskPriority,
  type TaskRepeat,
  type TaskStatus,
  type TaskType,
} from "../constants"

export function TaskStatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap",
        meta.badge,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  )
}

export function PriorityLabel({ priority }: { priority: TaskPriority }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
      <span aria-hidden className={cn("size-2 rounded-full", PRIORITY_META[priority].dot)} />
      {PRIORITY_META[priority].label}
    </span>
  )
}

const DUE_STYLE: Partial<Record<DueState, string>> = {
  overdue: "font-medium text-danger",
  today: "font-medium text-warning",
  none: "text-muted-foreground",
  done: "text-muted-foreground",
}

export function DueText({
  dueOn,
  done,
  today,
  className,
}: {
  dueOn: string | null
  done: boolean
  today: string
  className?: string
}) {
  const state = dueState(dueOn, done, today)
  return (
    <span className={cn("text-sm whitespace-nowrap tabular-nums", DUE_STYLE[state], className)}>
      {dueLabel(dueOn, state)}
    </span>
  )
}

/** "T-1051 · Backlinks · Repeats every week" */
export function TaskMeta({
  number,
  type,
  repeat,
  className,
}: {
  number: number
  type: TaskType
  repeat: TaskRepeat
  className?: string
}) {
  return (
    <span className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <span className="font-mono">{taskNumber(number)}</span>
      <span aria-hidden>·</span>
      <span>{TYPE_LABELS[type]}</span>
      {repeat !== "none" && (
        <>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Repeat className="size-3" aria-hidden />
            {REPEAT_LABELS[repeat]}
          </span>
        </>
      )}
    </span>
  )
}

export function ProgressCell({ done, total }: { done: number; total: number }) {
  if (total === 0) return <span className="text-sm text-muted-foreground">No clients</span>
  if (total === 1) {
    return (
      <span className="text-sm text-muted-foreground">
        {done === 1 ? "1 client, done" : "1 client"}
      </span>
    )
  }
  const pct = Math.round((done / total) * 100)
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-sm tabular-nums">
        {done} / {total}
      </span>
    </span>
  )
}

export function ClientChips({ names, total }: { names: string[]; total: number }) {
  if (total === 0) return <span className="text-sm text-muted-foreground">—</span>
  const more = total - names.length
  return (
    <span className="flex max-w-[260px] flex-wrap gap-1">
      {names.map((name) => (
        <span key={name} className="max-w-[160px] truncate rounded-md bg-muted px-2 py-0.5 text-xs">
          {name}
        </span>
      ))}
      {more > 0 && (
        <span className="rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-primary">
          +{more} more
        </span>
      )}
    </span>
  )
}
