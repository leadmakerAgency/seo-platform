"use client"

import { Inbox } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ReactNode } from "react"

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
import { taskNumber } from "@/features/tasks/constants"
import { formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { RequestRow } from "../queries"
import { requestsHref, type RequestParams } from "../search-params"
import { isOverdue, RequestDue, RequestMeta, RequestStatusBadge } from "./request-bits"

/** The list of requests; rows open the request panel (?request=N). */
export function RequestsTable({
  rows,
  params,
  basePath,
  today,
  nowIso,
  showClient = false,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  rows: RequestRow[]
  params: RequestParams
  basePath: string
  today: string
  nowIso: string
  showClient?: boolean
  emptyTitle: string
  emptyDescription: string
  emptyAction?: ReactNode
}) {
  const router = useRouter()
  const now = new Date(nowIso)

  function open(number: number) {
    router.push(requestsHref(basePath, params, { request: number }), { scroll: false })
  }

  if (rows.length === 0) {
    return (
      <Empty className="border py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Inbox />
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
        {emptyAction && <EmptyContent>{emptyAction}</EmptyContent>}
      </Empty>
    )
  }

  const head = "h-9 text-xs font-medium text-muted-foreground"
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table className={showClient ? "min-w-[980px]" : "min-w-[820px]"}>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(head, "w-40 pl-4")}>Status</TableHead>
            <TableHead className={head}>Request</TableHead>
            {showClient && <TableHead className={head}>Client</TableHead>}
            <TableHead className={head}>Due</TableHead>
            <TableHead className={head}>Linked task</TableHead>
            <TableHead className={head}>Follow-up</TableHead>
            <TableHead className={cn(head, "pr-4 text-right")}>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow
              key={r.id}
              tabIndex={0}
              onClick={() => open(r.number)}
              onKeyDown={(e) => {
                if (e.key === "Enter") open(r.number)
              }}
              className={cn(
                "h-14 cursor-pointer",
                (r.status === "done" || r.status === "cancelled") && "text-muted-foreground",
              )}
            >
              <TableCell className="pl-4">
                <RequestStatusBadge status={r.status} overdue={isOverdue(r, today)} short />
              </TableCell>
              <TableCell className="max-w-[380px]">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium">{r.title}</span>
                  <span className="flex items-center gap-1.5">
                    <RequestMeta number={r.number} kind={r.kind} />
                    {r.reopenCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        · asked {r.reopenCount + 1} times
                      </span>
                    )}
                  </span>
                </div>
              </TableCell>
              {showClient && (
                <TableCell className="max-w-[200px]" onClick={(e) => e.stopPropagation()}>
                  <Link
                    href={`/clients/${r.client.slug}/requests`}
                    className="block truncate text-sm underline-offset-4 hover:underline"
                  >
                    {r.client.name}
                  </Link>
                </TableCell>
              )}
              <TableCell>
                <RequestDue dueOn={r.dueOn} status={r.status} today={today} />
              </TableCell>
              <TableCell className="max-w-[200px] text-sm">
                {r.task ? (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="font-mono text-xs text-muted-foreground">
                      {taskNumber(r.task.number)}
                    </span>
                    <span className="truncate">{r.task.title}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap">
                {r.owner?.name ?? <span className="text-muted-foreground">Nobody</span>}
              </TableCell>
              <TableCell className="pr-4 text-right text-xs whitespace-nowrap text-muted-foreground">
                {formatRelative(
                  r.respondedAt && r.status === "answered" ? r.respondedAt : r.updatedAt,
                  now,
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
