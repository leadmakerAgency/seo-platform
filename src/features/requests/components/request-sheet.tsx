"use client"

import {
  Ban,
  ChevronDown,
  CircleCheck,
  Copy,
  Ellipsis,
  ExternalLink,
  History,
  Pencil,
  RotateCcw,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { STATUS_META, taskNumber } from "@/features/tasks/constants"
import type { MemberOption } from "@/features/tasks/queries"
import { actorLabel, describeActivity } from "@/features/team/activity"
import { formatDay } from "@/lib/dates"
import { formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import { askAgain, saveInternalNote, setRequestStatus } from "../actions"
import { ACCEPT_LABELS, filesRule, formatAmount, requestNumber } from "../constants"
import type { RequestDetail, TaskOption } from "../queries"
import { canAutoComplete as canAutoCompleteKind } from "../schemas"
import { isOverdue, RequestDue, RequestMeta, RequestStatusBadge } from "./request-bits"
import { RequestFormDialog } from "./request-form-dialog"
import { RequestResponse } from "./request-response"

type Props = {
  request: RequestDetail
  closeHref: string
  today: string
  nowIso: string
  currentMemberId: string
  canManage: boolean
  canCreate: boolean
  members: MemberOption[]
  taskOptions: TaskOption[]
  portalUrl: string | null
}

function SheetShell({ closeHref, children }: { closeHref: string; children: React.ReactNode }) {
  const router = useRouter()
  return (
    <Sheet open onOpenChange={(open) => !open && router.replace(closeHref, { scroll: false })}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[600px]">
        {children}
      </SheetContent>
    </Sheet>
  )
}

export function RequestSheetSkeleton({ closeHref }: { closeHref: string }) {
  return (
    <SheetShell closeHref={closeHref}>
      <div className="flex flex-col gap-6 p-6">
        <SheetHeader className="p-0">
          <SheetTitle className="sr-only">Loading request</SheetTitle>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-7 w-3/4" />
        </SheetHeader>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </SheetShell>
  )
}

export function RequestNotFoundSheet({ closeHref, number }: { closeHref: string; number: number }) {
  return (
    <SheetShell closeHref={closeHref}>
      <SheetHeader className="p-6">
        <SheetTitle>{requestNumber(number)} isn&apos;t available</SheetTitle>
        <SheetDescription>
          It was deleted, or it&apos;s for a client you don&apos;t work on.
        </SheetDescription>
      </SheetHeader>
    </SheetShell>
  )
}

/** The request panel: what we asked, what the client sent, and what to do next. */
export function RequestSheet(props: Props) {
  return (
    <SheetShell closeHref={props.closeHref}>
      <RequestPanel {...props} />
    </SheetShell>
  )
}

function RequestPanel({
  request: r,
  today,
  nowIso,
  currentMemberId,
  canManage,
  canCreate,
  members,
  taskOptions,
  portalUrl,
}: Props) {
  const now = new Date(nowIso)
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState(r.internalNote ?? "")

  const canEdit =
    canCreate &&
    (canManage ||
      r.owner?.id === currentMemberId ||
      r.createdById === currentMemberId ||
      r.task?.assigneeId === currentMemberId)
  const responded = Boolean(r.respondedAt) || r.files.length > 0
  const overdue = isOverdue(r, today)

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (!result.ok) toast.error(result.error ?? "Something went wrong.")
      else toast.success(success)
    })
  }

  async function copyReminder() {
    const text = portalUrl
      ? `Hi, a quick reminder from LeadMaker: we still need “${r.title}” from you. It only takes a minute here: ${portalUrl}`
      : `Hi, a quick reminder from LeadMaker: we still need “${r.title}” from you.`
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Reminder copied", {
        description: portalUrl
          ? undefined
          : "This client has no link yet, so it has no link in it.",
      })
    } catch {
      toast.error("Couldn't copy. Your browser blocked the clipboard.")
    }
  }

  return (
    <div className="flex flex-col">
      <SheetHeader className="gap-2 border-b p-6 pr-12">
        <RequestMeta number={r.number} kind={r.kind} />
        <SheetTitle className="text-lg leading-snug font-semibold">{r.title}</SheetTitle>
        <SheetDescription className="text-xs">
          For{" "}
          <Link
            href={`/clients/${r.client.slug}/requests`}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {r.client.name}
          </Link>{" "}
          · asked {formatRelative(r.createdAt, now)}
          {r.createdBy ? ` by ${r.createdBy}` : ""}
          {r.reopenCount > 0 ? ` · asked ${r.reopenCount + 1} times` : ""}
        </SheetDescription>
        {canEdit && (
          <div className="absolute top-3.5 right-12">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Request actions">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {r.status === "open" && (
                  <DropdownMenuItem onSelect={() => setEditing(true)}>
                    <Pencil />
                    Edit request
                  </DropdownMenuItem>
                )}
                {r.status === "open" && (
                  <DropdownMenuItem onSelect={copyReminder}>
                    <Copy />
                    Copy reminder message
                  </DropdownMenuItem>
                )}
                {(r.status === "open" || r.status === "answered") && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() =>
                        run(() => setRequestStatus(r.id, "cancelled"), "Request cancelled")
                      }
                    >
                      <Ban />
                      Cancel request
                    </DropdownMenuItem>
                  </>
                )}
                {r.status === "done" && (
                  <DropdownMenuItem onSelect={() => setAsking(true)}>
                    <RotateCcw />
                    Ask again
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </SheetHeader>

      <div className={cn("flex flex-col gap-8 p-6 transition-opacity", pending && "opacity-80")}>
        {/* Where it stands, and the next step */}
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <RequestStatusBadge status={r.status} overdue={overdue} />
            <span className="text-sm text-muted-foreground">{statusLine(r, now)}</span>
          </div>
          {canEdit && (r.status === "answered" || r.status === "open") && (
            <div className="flex flex-wrap gap-2">
              {r.status === "answered" && (
                <>
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => setRequestStatus(r.id, "done"), "Marked done")}
                  >
                    <CircleCheck />
                    Mark done
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAsking(true)}>
                    <RotateCcw />
                    Ask again
                  </Button>
                </>
              )}
              {r.status === "open" && (
                <>
                  <Button size="sm" variant="outline" onClick={copyReminder}>
                    <Copy />
                    Copy reminder
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => setRequestStatus(r.id, "done"), "Marked done")}
                  >
                    <CircleCheck />
                    Got it another way
                  </Button>
                </>
              )}
            </div>
          )}
          {r.status === "done" && canEdit && (
            <Button size="sm" variant="outline" className="w-fit" onClick={() => setAsking(true)}>
              <RotateCcw />
              Ask again
            </Button>
          )}
        </div>

        {r.status === "open" && r.askAgainNote && (
          <div className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm">
            <span className="font-medium text-warning">You asked again: </span>
            {r.askAgainNote}
          </div>
        )}

        {responded && (
          <Block
            title="The client's answer"
            aside={
              r.respondedAt && (
                <span className="text-xs text-muted-foreground">
                  {r.responderName ? `${r.responderName}, ` : ""}
                  {formatRelative(r.respondedAt, now)}
                </span>
              )
            }
          >
            <RequestResponse
              kind={r.kind}
              responseText={r.responseText}
              decision={r.decision}
              files={r.files}
            />
            {r.status === "open" && r.files.length > 0 && (
              <p className="text-xs text-muted-foreground">
                The client has started uploading but hasn&apos;t sent them yet.
              </p>
            )}
          </Block>
        )}

        <Block title="What the client sees">
          <div className="flex flex-col gap-3 rounded-lg bg-muted/40 p-4 text-sm">
            {r.instructions ? (
              <p className="whitespace-pre-line">{r.instructions}</p>
            ) : (
              <p className="text-muted-foreground">No instructions, just the title.</p>
            )}
            <KindSummary request={r} />
          </div>
        </Block>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
          <Detail label="Due">
            <RequestDue dueOn={r.dueOn} status={r.status} today={today} />
            {r.status !== "open" && r.dueOn && (
              <span className="text-xs text-muted-foreground"> (was {formatDay(r.dueOn)})</span>
            )}
          </Detail>
          <Detail label="Follow-up owner">{r.owner?.name ?? "Nobody"}</Detail>
          <Detail label="Linked task" className="col-span-2">
            {r.task ? (
              <Link
                href={`/tasks?task=${r.task.number}`}
                className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {taskNumber(r.task.number)}
                </span>
                {r.task.title}
                <span className="text-xs text-muted-foreground">
                  · {STATUS_META[r.task.status].label}
                </span>
                <ExternalLink className="size-3.5 text-muted-foreground" />
              </Link>
            ) : (
              <span className="text-muted-foreground">Not linked to a task</span>
            )}
          </Detail>
          {canAutoCompleteKind(r.kind) && (
            <Detail label="When the client answers" className="col-span-2">
              {r.autoComplete ? "Done straight away, no review" : "Comes back to us for review"}
            </Detail>
          )}
        </dl>

        <Block title="Internal note">
          {canEdit ? (
            <div className="flex flex-col gap-2">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Only the team sees this."
                aria-label="Internal note"
              />
              {note !== (r.internalNote ?? "") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-fit"
                  disabled={pending}
                  onClick={() => run(() => saveInternalNote(r.id, note), "Note saved")}
                >
                  Save note
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm whitespace-pre-line text-muted-foreground">
              {r.internalNote || "No note."}
            </p>
          )}
        </Block>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2 w-fit gap-2 text-muted-foreground">
              <History />
              History ({r.history.length})
              <ChevronDown />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ol className="mt-2 flex flex-col gap-2 border-l pl-4">
              {r.history.map((h) => (
                <li key={h.id} className="text-sm">
                  <span className="font-medium">
                    {actorLabel({ ...h, clientName: r.client.name })}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {describeActivity({ ...h, clientName: r.client.name })}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatRelative(h.createdAt, now)}
                  </span>
                </li>
              ))}
            </ol>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {canEdit && r.status === "open" && (
        <RequestFormDialog
          request={r}
          clients={[r.client]}
          taskOptions={taskOptions}
          members={members}
          currentMemberId={currentMemberId}
          trigger={null}
          open={editing}
          onOpenChange={setEditing}
        />
      )}
      {canEdit && <AskAgainDialog requestId={r.id} open={asking} onOpenChange={setAsking} />}
    </div>
  )
}

function statusLine(r: RequestDetail, now: Date) {
  if (r.status === "open") {
    return r.reopenCount > 0
      ? "Sent back to the client."
      : `Waiting since ${formatRelative(r.createdAt, now)}.`
  }
  if (r.status === "answered") return "Check the answer, then mark it done or ask again."
  if (r.status === "done") {
    return `Done ${r.completedAt ? formatRelative(r.completedAt, now) : ""}${r.completedBy ? ` by ${r.completedBy}` : r.respondedAt ? " when the client answered" : ""}.`
  }
  return "No longer needed. The client doesn't see it."
}

function KindSummary({ request: r }: { request: RequestDetail }) {
  const o = r.options
  if (r.kind === "question") {
    return (
      <p className="text-xs text-muted-foreground">
        {o.answer === "long" ? "Long answer box" : "Short answer box"}
      </p>
    )
  }
  if (r.kind === "code") {
    return <p className="text-xs text-muted-foreground">One box for the code</p>
  }
  if (r.kind === "files") {
    return (
      <p className="text-xs text-muted-foreground">
        {filesRule(o)} · {ACCEPT_LABELS[o.accept ?? "any"]} · 10 MB each
      </p>
    )
  }
  if (r.kind === "approval") {
    return (
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        {o.amount !== undefined && (
          <span>
            Cost: <span className="text-foreground">{formatAmount(o.amount, o.currency)}</span>
          </span>
        )}
        {o.link_url && (
          <a
            href={o.link_url}
            target="_blank"
            rel="noreferrer"
            className="w-fit truncate text-primary underline-offset-4 hover:underline"
          >
            {o.link_url}
          </a>
        )}
        <span>Approve, or ask for changes with a note</span>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {o.steps && o.steps.length > 0 && (
        <ol className="flex list-decimal flex-col gap-1 pl-5 marker:text-muted-foreground">
          {o.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
      {o.help_url && (
        <a
          href={o.help_url}
          target="_blank"
          rel="noreferrer"
          className="w-fit text-xs text-primary underline-offset-4 hover:underline"
        >
          Help article
        </a>
      )}
      <p className="text-xs text-muted-foreground">Then they tap “I’ve done this”</p>
    </div>
  )
}

function AskAgainDialog({
  requestId,
  open,
  onOpenChange,
}: {
  requestId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setNote("")
          setError(null)
        }
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Ask the client again</DialogTitle>
          <DialogDescription>
            The request goes back on their list with your note on top. Their previous answer is
            cleared.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          placeholder="The code expired. Please send the new one when it arrives."
          aria-label="Note for the client"
          aria-invalid={Boolean(error)}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await askAgain(requestId, note)
                if (!result.ok) {
                  setError(result.error)
                  return
                }
                toast.success("Sent back to the client")
                onOpenChange(false)
                setNote("")
              })
            }
          >
            {pending ? "Sending…" : "Send back"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Detail({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Block({
  title,
  aside,
  children,
}: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}
