"use client"

import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table"
import { ChevronLeft, ChevronRight, ListChecks, Search, SearchX, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatNumber, initials } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  PRIORITY_META,
  TASK_PRIORITIES,
  TASK_TYPES,
  TYPE_LABELS,
  type TaskPriority,
} from "../constants"
import type { MemberOption, TaskCounts, TaskRow } from "../queries"
import {
  TASKS_PAGE_SIZE,
  hasTaskFilters,
  tasksHref,
  type TaskParams,
  type TaskView,
} from "../search-params"
import {
  ClientChips,
  DueText,
  PriorityLabel,
  ProgressCell,
  TaskMeta,
  TaskStatusBadge,
} from "./task-bits"

const ALL = "all"

const features = tableFeatures({})
const column = createColumnHelper<typeof features, TaskRow & { today: string }>()
const columns = column.columns([
  column.display({
    id: "task",
    header: "Task",
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium">{row.original.title}</span>
        <TaskMeta
          number={row.original.number}
          type={row.original.type}
          repeat={row.original.repeat}
        />
      </div>
    ),
  }),
  column.display({
    id: "clients",
    header: "Clients",
    cell: ({ row }) => (
      <ClientChips names={row.original.clientPreview} total={row.original.clientsTotal} />
    ),
  }),
  column.display({
    id: "progress",
    header: "Progress",
    cell: ({ row }) => (
      <ProgressCell done={row.original.clientsDone} total={row.original.clientsTotal} />
    ),
  }),
  column.display({
    id: "assignee",
    header: "Assigned to",
    cell: ({ row }) =>
      row.original.assignee ? (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <Avatar className="size-6">
            <AvatarFallback className="bg-muted text-[10px] font-medium">
              {initials(row.original.assignee.name)}
            </AvatarFallback>
          </Avatar>
          {row.original.assignee.name}
        </span>
      ) : (
        <span className="text-muted-foreground">Nobody yet</span>
      ),
  }),
  column.display({
    id: "due",
    header: "Due",
    cell: ({ row }) => (
      <DueText
        dueOn={row.original.dueOn}
        done={row.original.status === "done"}
        today={row.original.today}
      />
    ),
  }),
  column.display({
    id: "priority",
    header: "Priority",
    cell: ({ row }) => <PriorityLabel priority={row.original.priority} />,
  }),
  column.display({
    id: "status",
    header: "Status",
    cell: ({ row }) => <TaskStatusBadge status={row.original.status} />,
  }),
])

/** Tabs, toolbar, table and pagination for /tasks. Filters live in the URL. */
export function TasksView({
  rows,
  total,
  params,
  counts,
  today,
  canSeeTeam,
  members,
  emptyAction,
}: {
  rows: TaskRow[]
  total: number
  params: TaskParams
  counts: TaskCounts
  today: string
  canSeeTeam: boolean
  members: MemberOption[]
  emptyAction?: ReactNode
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const data = rows.map((r) => ({ ...r, today }))
  const table = useTable({ features, columns, data })

  function go(patch: Partial<TaskParams>) {
    startTransition(() => router.replace(tasksHref(params, patch), { scroll: false }))
  }

  function open(number: number) {
    router.push(tasksHref(params, { task: number, page: params.page }), { scroll: false })
  }

  const filtered = hasTaskFilters(params)
  const pageCount = Math.max(1, Math.ceil(total / TASKS_PAGE_SIZE))
  const from = total === 0 ? 0 : (params.page - 1) * TASKS_PAGE_SIZE + 1
  const to = Math.min(params.page * TASKS_PAGE_SIZE, total)

  const tabs: { view: TaskView; label: string; count?: number }[] = [
    { view: "mine", label: "My tasks", count: counts.mineOpen },
    ...(canSeeTeam ? [{ view: "team" as const, label: "Whole team", count: counts.teamOpen }] : []),
    { view: "waiting", label: "Waiting on client", count: counts.waiting },
    { view: "done", label: "Done" },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Which tasks"
        className="flex w-fit max-w-full overflow-x-auto rounded-lg border p-0.5"
      >
        {tabs.map((tab) => {
          const active = params.view === tab.view
          return (
            <button
              key={tab.view}
              role="tab"
              aria-selected={active}
              onClick={() => go({ view: tab.view, task: undefined })}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-3 text-sm whitespace-nowrap transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "rounded px-1.5 text-xs tabular-nums",
                    active ? "bg-background/20" : "bg-muted",
                  )}
                >
                  {formatNumber(tab.count)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <Toolbar params={params} onChange={go} canSeeTeam={canSeeTeam} members={members} />

      <div
        className={cn(
          "overflow-hidden rounded-lg border transition-opacity",
          pending && "pointer-events-none opacity-60",
        )}
        aria-busy={pending}
      >
        {rows.length === 0 ? (
          <EmptyState
            params={params}
            filtered={filtered}
            onClear={() => go(CLEAR)}
            action={emptyAction}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[1040px]">
              <TableHeader className="bg-muted/40">
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id} className="hover:bg-transparent">
                    {group.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="h-9 text-xs font-medium text-muted-foreground first:w-[32%] first:pl-4 last:pr-4"
                      >
                        {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    tabIndex={0}
                    onClick={() => open(row.original.number)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        open(row.original.number)
                      }
                    }}
                    className={cn(
                      "h-14 cursor-pointer outline-none focus-visible:bg-muted/60",
                      params.task === row.original.number && "bg-brand-soft/60",
                    )}
                  >
                    {row.getAllCells().map((cell) => (
                      <TableCell key={cell.id} className="max-w-[340px] first:pl-4 last:pr-4">
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="tabular-nums">
            Showing {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}{" "}
            {total === 1 ? "task" : "tasks"}
          </span>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={params.page <= 1 || pending}
                onClick={() => go({ page: params.page - 1 })}
              >
                <ChevronLeft />
                Previous
              </Button>
              <span className="px-1 tabular-nums">
                Page {params.page} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={params.page >= pageCount || pending}
                onClick={() => go({ page: params.page + 1 })}
              >
                Next
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const CLEAR: Partial<TaskParams> = {
  q: undefined,
  assignee: undefined,
  type: undefined,
  priority: undefined,
  due: undefined,
}

function EmptyState({
  params,
  filtered,
  onClear,
  action,
}: {
  params: TaskParams
  filtered: boolean
  onClear: () => void
  action?: ReactNode
}) {
  if (filtered) {
    return (
      <Empty className="py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchX />
          </EmptyMedia>
          <EmptyTitle>No tasks match these filters</EmptyTitle>
          <EmptyDescription>Check the spelling or clear the filters.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={onClear}>
            Clear filters
          </Button>
        </EmptyContent>
      </Empty>
    )
  }
  const copy: Record<TaskView, [string, string]> = {
    mine: ["Nothing assigned to you", "Tasks assigned to you show up here, most urgent first."],
    team: ["No open tasks", "Create a task and assign it to someone on the team."],
    waiting: [
      "Nothing is waiting on a client",
      "Set a task to “Waiting on client” when you need something from them.",
    ],
    done: ["No finished tasks yet", "Tasks move here when every client is ticked off."],
  }
  const [title, description] = copy[params.view]
  return (
    <Empty className="py-14">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ListChecks />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && params.view === "team" && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}

function Toolbar({
  params,
  onChange,
  canSeeTeam,
  members,
}: {
  params: TaskParams
  onChange: (patch: Partial<TaskParams>) => void
  canSeeTeam: boolean
  members: MemberOption[]
}) {
  const [query, setQuery] = useState(params.q ?? "")
  const lastSent = useRef(params.q ?? "")

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed === lastSent.current) return
    const timer = window.setTimeout(() => {
      lastSent.current = trimmed
      onChange({ q: trimmed || undefined })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query, onChange])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1 sm:max-w-[320px]">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search task, T-number or client"
          aria-label="Search tasks"
          className="pl-8"
        />
      </div>

      {canSeeTeam && params.view !== "mine" && (
        <Select
          value={params.assignee ?? ALL}
          onValueChange={(v) => onChange({ assignee: v === ALL ? undefined : v })}
        >
          <SelectTrigger className="w-[180px]" aria-label="Assigned to">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Anyone</SelectItem>
            <SelectItem value="none">Nobody yet</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={params.type ?? ALL}
        onValueChange={(v) => onChange({ type: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="w-[170px]" aria-label="Type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All types</SelectItem>
          {TASK_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {TYPE_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={params.priority ?? ALL}
        onValueChange={(v) => onChange({ priority: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="w-[150px]" aria-label="Priority">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any priority</SelectItem>
          {TASK_PRIORITIES.map((p) => (
            <SelectItem key={p} value={p}>
              {PRIORITY_META[p as TaskPriority].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasTaskFilters(params) && (
        <Button
          variant="ghost"
          onClick={() => {
            setQuery("")
            lastSent.current = ""
            onChange(CLEAR)
          }}
        >
          <X />
          Clear filters
        </Button>
      )}
    </div>
  )
}
