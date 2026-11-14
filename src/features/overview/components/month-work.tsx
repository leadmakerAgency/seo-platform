"use client"

import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Trash2 } from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { StatusTag } from "@/components/common/status"
import { Button } from "@/components/ui/button"
import type { ClientStage } from "@/features/clients/constants"
import { formatDay, formatMonth } from "@/lib/dates"
import { formatDate } from "@/lib/format"
import { clientHref } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import { removeWork } from "../actions"
import { DELIVERABLE_META, PROGRESS_META, SOURCE_LABELS } from "../constants"
import type { DeliverableProgress, WorkItem } from "../queries"
import { LogWorkDialog } from "./log-work-dialog"

type Props = {
  clientId: string
  slug: string
  stage: ClientStage
  startedOn: string
  month: string
  currentMonth: string
  today: string
  daysLeft: number
  rows: DeliverableProgress[]
  prevHref: string | null
  nextHref: string | null
  /** Can log work (and remove their own entries). */
  canLog: boolean
  /** Admins and managers remove anyone's entries. */
  canManage: boolean
  memberId: string
  /** Earliest month work can be logged for (last month). */
  earliestLogMonth: string
}

/** "This month's work": what we promised, how far along it is, and the items behind each number. */
export function MonthWork(props: Props) {
  const { month, currentMonth, rows, daysLeft, stage, startedOn } = props
  const isCurrent = month === currentMonth
  const visible = rows.filter((r) => r.target > 0 || r.done !== 0)
  const prorated = rows.some((r) => r.prorated)
  const paused = stage === "paused" || stage === "churned"
  const startMonth = `${startedOn.slice(0, 7)}-01`
  // Logging is for this month or last month, and never before the client started.
  const canLogHere = props.canLog && month >= props.earliestLogMonth && month >= startMonth

  const description = isCurrent
    ? `What we promised this client this month and how far along it is. ${
        daysLeft === 0 ? "Last day of the month." : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left.`
      }`
    : `What we promised in ${formatMonth(month, true)} and what was delivered.`

  return (
    <section aria-labelledby="work-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="work-title" className="text-[15px] leading-[22px] font-semibold">
            {formatMonth(month, month.slice(0, 4) !== currentMonth.slice(0, 4))} work
          </h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border bg-card">
            <MonthLink href={props.prevHref} label="Previous month">
              <ChevronLeft />
            </MonthLink>
            <MonthLink href={props.nextHref} label="Next month">
              <ChevronRight />
            </MonthLink>
          </div>
          {canLogHere && (
            <LogWorkDialog
              clientId={props.clientId}
              month={month}
              today={props.today}
              earliestMonth={props.earliestLogMonth}
            />
          )}
        </div>
      </div>

      {paused && isCurrent && (
        <p className="text-sm text-muted-foreground">
          The client is {stage === "paused" ? "paused" : "no longer with us"}, so no new work is
          planned.
        </p>
      )}
      {prorated && (
        <p className="text-[13px] text-muted-foreground">
          The client started on {formatDate(startedOn)}, so this month&apos;s targets are scaled to
          the days left.
        </p>
      )}

      {visible.length === 0 ? (
        <div className="rounded-lg border bg-card px-4 py-6 text-sm">
          <p className="font-medium">No work planned for {formatMonth(month, true)}</p>
          <p className="text-muted-foreground">
            {month < startMonth
              ? `The client started on ${formatDate(startedOn)}.`
              : "Set the monthly targets in Edit details to track the work here."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-card">
          {visible.map((row) => (
            <WorkRow key={row.kind} row={row} isCurrent={isCurrent} {...props} />
          ))}
        </ul>
      )}
    </section>
  )
}

function MonthLink({
  href,
  label,
  children,
}: {
  href: string | null
  label: string
  children: React.ReactNode
}) {
  if (!href) {
    return (
      <Button variant="ghost" size="icon-sm" disabled aria-label={label}>
        {children}
      </Button>
    )
  }
  return (
    <Button asChild variant="ghost" size="icon-sm" aria-label={label}>
      <Link href={href} scroll={false}>
        {children}
      </Link>
    </Button>
  )
}

function WorkRow({
  row,
  isCurrent,
  slug,
  canLog,
  canManage,
  memberId,
}: Props & { row: DeliverableProgress; isCurrent: boolean }) {
  const [open, setOpen] = useState(false)
  const meta = DELIVERABLE_META[row.kind]
  const status = PROGRESS_META[row.status]
  const pct = row.target > 0 ? Math.min(100, Math.max(0, (row.done / row.target) * 100)) : 0
  const expectedPct =
    isCurrent && row.target > 0 && row.done < row.target
      ? Math.min(100, (row.expected / row.target) * 100)
      : null
  const short = row.status === "short" ? row.target - row.done : 0
  const panelId = `work-${row.kind}`

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:grid-cols-[180px_1fr_auto_auto]"
      >
        <span className="col-start-1 row-start-1 flex items-center gap-1.5 text-sm font-medium">
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              !open && "-rotate-90",
            )}
          />
          {meta.label}
        </span>

        <span
          className="relative col-start-1 row-start-2 h-2 self-center rounded-full bg-muted md:col-start-2 md:row-start-1"
          role="progressbar"
          aria-label={`${meta.label}: ${row.done} of ${row.target}`}
          aria-valuemin={0}
          aria-valuemax={row.target}
          aria-valuenow={row.done}
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width]"
            style={{ width: `${pct}%` }}
          />
          {expectedPct !== null && (
            <span
              aria-hidden
              title={`About ${Math.round(row.expected)} expected by today`}
              className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-foreground/45"
              style={{ left: `calc(${expectedPct}% - 1px)` }}
            />
          )}
        </span>

        <span className="col-start-2 row-start-2 text-right text-sm tabular-nums md:col-start-3 md:row-start-1">
          {row.done} <span className="text-muted-foreground">/ {row.target}</span>
        </span>
        <span className="col-start-2 row-start-1 justify-self-end md:col-start-4 md:row-start-1">
          <StatusTag tone={status.tone}>
            {row.status === "short" ? `Short by ${short}` : status.label}
          </StatusTag>
        </span>
      </button>

      {open && (
        <div id={panelId} className="border-t bg-muted/30 px-4 py-3 md:pl-[38px]">
          {expectedPct !== null && (
            <p className="mb-2 text-[13px] text-muted-foreground">
              About {Math.round(row.expected)} expected by today; the tick on the bar marks where
              that is.
            </p>
          )}
          {row.items.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Nothing delivered yet. Ticking this client off a task that counts toward{" "}
              {meta.many}, or logging work, adds it here.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {row.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  slug={slug}
                  canRemove={
                    item.source === "manual" &&
                    canLog &&
                    (canManage || item.createdBy?.id === memberId)
                  }
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

function ItemRow({ item, slug, canRemove }: { item: WorkItem; slug: string; canRemove: boolean }) {
  const [pending, startTransition] = useTransition()
  const [confirm, setConfirm] = useState(false)

  return (
    <li className="flex items-start gap-3 text-sm">
      <span className="w-[76px] shrink-0 pt-px text-[13px] text-muted-foreground tabular-nums">
        {formatDay(item.deliveredOn)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2">
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-brand underline-offset-2 hover:underline"
            >
              {item.title}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : (
            <span>{item.title}</span>
          )}
          {item.quantity !== 1 && (
            <span
              className={cn(
                "rounded-sm bg-muted px-1 text-xs font-medium tabular-nums",
                item.quantity < 0 && "bg-warning-soft text-warning",
              )}
            >
              {item.quantity > 0 ? `×${item.quantity}` : `−${Math.abs(item.quantity)}`}
            </span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          {item.source === "task" && item.taskNumber ? (
            <Link
              href={`${clientHref(slug, "tasks")}?task=${item.taskNumber}`}
              className="underline-offset-2 hover:underline"
            >
              Task T-{item.taskNumber}
            </Link>
          ) : item.source === "manual" ? (
            `Logged by ${item.createdBy?.name ?? "a former team member"}`
          ) : (
            SOURCE_LABELS[item.source]
          )}
          {item.note && ` · ${item.note}`}
        </span>
      </div>
      {canRemove &&
        (confirm ? (
          <span className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await removeWork(item.id)
                  if (!r.ok) toast.error(r.error)
                  else toast.success("Removed")
                  setConfirm(false)
                })
              }
            >
              Remove
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              Keep
            </Button>
          </span>
        ) : (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Remove “${item.title}”`}
            onClick={() => setConfirm(true)}
          >
            <Trash2 />
          </Button>
        ))}
    </li>
  )
}
