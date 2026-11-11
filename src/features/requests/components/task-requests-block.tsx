"use client"

import { ExternalLink, MessageSquarePlus } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import type { MemberOption } from "@/features/tasks/queries"
import { formatRelative } from "@/lib/format"
import { clientHref } from "@/lib/navigation"
import type { TaskRequest } from "../queries"
import { isOverdue, RequestDue, RequestMeta, RequestStatusBadge } from "./request-bits"
import { RequestFormDialog } from "./request-form-dialog"
import { RequestResponse } from "./request-response"

/** "Waiting on the client" in the task panel: the task's requests and their answers. */
export function TaskRequestsBlock({
  task,
  requests,
  clients,
  canAsk,
  members,
  currentMemberId,
  today,
}: {
  task: { id: string; number: number; title: string }
  requests: TaskRequest[]
  clients: { id: string; name: string }[]
  canAsk: boolean
  members: MemberOption[]
  currentMemberId: string
  today: string
}) {
  const now = new Date()
  const open = requests.filter((r) => r.status === "open").length

  const ask =
    canAsk && clients.length > 0 ? (
      <RequestFormDialog
        clients={clients}
        taskOptions={[task]}
        fixedTaskId={task.id}
        members={members}
        currentMemberId={currentMemberId}
        openAfterCreate={false}
        trigger={
          <Button variant="outline" size="sm" className="w-fit">
            <MessageSquarePlus />
            Ask the client
          </Button>
        }
      />
    ) : null

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Waiting on the client</h3>
        {requests.length > 0 && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {open === 0 ? "Nothing open" : `${open} open`}
          </span>
        )}
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {clients.length === 0
            ? "Add a client to this task to ask them for codes, files or approvals."
            : "Need a code, photos or a yes from the client? Ask them here. The task waits until they answer."}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {requests.map((r) => (
            <li key={r.id} className="flex flex-col gap-2.5 px-3 py-3">
              <div className="flex items-start gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{r.title}</span>
                  <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <RequestMeta number={r.number} kind={r.kind} />
                    {clients.length > 1 && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">{r.client.name}</span>
                      </>
                    )}
                    {r.status === "open" && r.dueOn && (
                      <>
                        <span aria-hidden>·</span>
                        <RequestDue dueOn={r.dueOn} status={r.status} today={today} />
                      </>
                    )}
                  </span>
                </div>
                <RequestStatusBadge status={r.status} overdue={isOverdue(r, today)} short />
                <Button asChild variant="ghost" size="icon-sm" aria-label={`Open ${r.title}`}>
                  <Link href={`${clientHref(r.client.slug, "requests")}?request=${r.number}`}>
                    <ExternalLink />
                  </Link>
                </Button>
              </div>
              {(r.respondedAt || r.files.length > 0) && r.status !== "open" && (
                <div className="flex flex-col gap-1.5">
                  <RequestResponse
                    kind={r.kind}
                    responseText={r.responseText}
                    decision={r.decision}
                    files={r.files}
                    compact
                  />
                  {r.respondedAt && (
                    <span className="text-xs text-muted-foreground">
                      Answered {formatRelative(r.respondedAt, now)}
                      {r.responderName ? ` by ${r.responderName}` : ""}
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {ask}
    </section>
  )
}
