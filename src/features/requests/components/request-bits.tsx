import { dueLabel, dueState, type DueState } from "@/lib/dates"
import { cn } from "@/lib/utils"
import {
  KIND_META,
  REQUEST_STATUS_META,
  requestNumber,
  type RequestKind,
  type RequestStatus,
} from "../constants"

export function RequestStatusBadge({
  status,
  overdue,
  short,
  className,
}: {
  status: RequestStatus
  overdue?: boolean
  short?: boolean
  className?: string
}) {
  const meta = REQUEST_STATUS_META[status]
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap",
        overdue && status === "open" ? "bg-danger-soft text-danger" : meta.badge,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          overdue && status === "open" ? "bg-danger" : meta.dot,
        )}
      />
      {overdue && status === "open" ? "Overdue" : short ? meta.short : meta.label}
    </span>
  )
}

/** "R-101 · Code" */
export function RequestMeta({
  number,
  kind,
  className,
}: {
  number: number
  kind: RequestKind
  className?: string
}) {
  const Icon = KIND_META[kind].icon
  return (
    <span className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <span className="font-mono">{requestNumber(number)}</span>
      <span aria-hidden>·</span>
      <Icon className="size-3" aria-hidden />
      <span>{KIND_META[kind].label}</span>
    </span>
  )
}

const DUE_STYLE: Partial<Record<DueState, string>> = {
  overdue: "font-medium text-danger",
  today: "font-medium text-warning",
  none: "text-muted-foreground",
  done: "text-muted-foreground",
}

/** Due dates only matter while we're waiting on the client. */
export function RequestDue({
  dueOn,
  status,
  today,
}: {
  dueOn: string | null
  status: RequestStatus
  today: string
}) {
  const state = dueState(dueOn, status !== "open", today)
  return (
    <span className={cn("text-sm whitespace-nowrap tabular-nums", DUE_STYLE[state])}>
      {status !== "open" && dueOn ? "—" : dueLabel(dueOn, state)}
    </span>
  )
}

export function isOverdue(r: { status: RequestStatus; dueOn: string | null }, today: string) {
  return r.status === "open" && Boolean(r.dueOn) && r.dueOn! < today
}
