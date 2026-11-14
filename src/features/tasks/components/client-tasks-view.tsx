"use client"

import { ListChecks } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useOptimistic, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { Checkbox } from "@/components/ui/checkbox"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { toggleTaskClient } from "../actions"
import type { ClientTaskRow } from "../queries"
import { DueText, TaskMeta, TaskStatusBadge } from "./task-bits"

/** Every task that includes one client, with a tick for just this client. */
export function ClientTasksView({
  clientId,
  clientName,
  rows,
  today,
  currentMemberId,
  canManage,
  emptyAction,
}: {
  clientId: string
  clientName: string
  rows: ClientTaskRow[]
  today: string
  currentMemberId: string
  canManage: boolean
  emptyAction?: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()
  const [optimisticRows, setDone] = useOptimistic(
    rows,
    (state, change: { taskId: string; done: boolean }) =>
      state.map((r) => (r.id === change.taskId ? { ...r, doneForClient: change.done } : r)),
  )

  function open(number: number) {
    router.push(`${pathname}?task=${number}`, { scroll: false })
  }

  function tick(taskId: string, done: boolean) {
    startTransition(async () => {
      setDone({ taskId, done })
      const result = await toggleTaskClient(taskId, clientId, done)
      if (!result.ok) toast.error(result.error)
    })
  }

  if (rows.length === 0) {
    return (
      <Empty className="border py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListChecks />
          </EmptyMedia>
          <EmptyTitle>No tasks for {clientName}</EmptyTitle>
          <EmptyDescription>Tasks that include this client show up here.</EmptyDescription>
        </EmptyHeader>
        {emptyAction && <EmptyContent>{emptyAction}</EmptyContent>}
      </Empty>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table className="min-w-[860px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-9 w-24 pl-4 text-xs font-medium text-muted-foreground">
              Done here
            </TableHead>
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">Task</TableHead>
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">
              Other clients
            </TableHead>
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">
              Assigned to
            </TableHead>
            <TableHead className="h-9 text-xs font-medium text-muted-foreground">Due</TableHead>
            <TableHead className="h-9 pr-4 text-xs font-medium text-muted-foreground">
              Status
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {optimisticRows.map((t) => {
            const canTick = canManage || t.assignee?.id === currentMemberId
            const others = t.clientsTotal - 1
            return (
              <TableRow
                key={t.id}
                tabIndex={0}
                onClick={() => open(t.number)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") open(t.number)
                }}
                className={cn(
                  "h-14 cursor-pointer",
                  t.status === "done" && "text-muted-foreground",
                )}
              >
                <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={t.doneForClient}
                    disabled={!canTick}
                    onCheckedChange={(checked) => tick(t.id, checked === true)}
                    aria-label={`${t.doneForClient ? "Mark not done" : "Mark done"} for ${clientName}: ${t.title}`}
                  />
                </TableCell>
                <TableCell className="max-w-[360px]">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium">{t.title}</span>
                    <TaskMeta number={t.number} type={t.type} repeat={t.repeat} />
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {others > 0
                    ? `Shared with ${others} other ${others === 1 ? "client" : "clients"}`
                    : "This client only"}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {t.assignee?.name ?? <span className="text-muted-foreground">Nobody yet</span>}
                </TableCell>
                <TableCell>
                  <DueText dueOn={t.dueOn} done={t.status === "done"} today={today} />
                </TableCell>
                <TableCell className="pr-4">
                  <TaskStatusBadge status={t.status} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
