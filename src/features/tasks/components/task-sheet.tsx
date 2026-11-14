"use client"

import {
  ChevronDown,
  Ellipsis,
  ExternalLink,
  History,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useOptimistic, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { DELIVERABLE_META } from "@/features/overview/constants"
import { TaskRequestsBlock } from "@/features/requests/components/task-requests-block"
import { actorLabel, describeActivity } from "@/features/team/activity"
import { formatRelative, initials } from "@/lib/format"
import { clientHref } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import {
  deleteComment,
  deleteTask,
  removeTaskClient,
  setTaskStatus,
  toggleTaskClient,
  updateTaskDetails,
} from "../actions"
import {
  PRIORITY_META,
  REPEAT_LABELS,
  STATUS_META,
  TASK_PRIORITIES,
  TASK_STATUSES,
  taskNumber,
  type TaskPriority,
  type TaskStatus,
} from "../constants"
import type { ClientOption, MemberOption, TaskDetail } from "../queries"
import { CommentBody, CommentBox } from "./comment-box"
import { DueDatePicker } from "./due-date-picker"
import { DueText, TaskMeta, TaskStatusBadge } from "./task-bits"
import { TaskFormDialog } from "./task-form-dialog"

const NOBODY = "nobody"

type Props = {
  task: TaskDetail
  closeHref: string
  today: string
  currentMemberId: string
  canManage: boolean
  canWork: boolean
  members: MemberOption[]
  clientOptions: ClientOption[]
}

/** The task panel: details, the client checklist, comments and history. */
export function TaskSheet(props: Props) {
  const router = useRouter()
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) router.replace(props.closeHref, { scroll: false })
      }}
    >
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[620px]">
        <TaskPanel {...props} />
      </SheetContent>
    </Sheet>
  )
}

export function TaskSheetSkeleton({ closeHref }: { closeHref: string }) {
  const router = useRouter()
  return (
    <Sheet open onOpenChange={(open) => !open && router.replace(closeHref, { scroll: false })}>
      <SheetContent className="w-full gap-6 p-6 sm:max-w-[620px]">
        <SheetHeader className="p-0">
          <SheetTitle className="sr-only">Loading task</SheetTitle>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-7 w-3/4" />
        </SheetHeader>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </SheetContent>
    </Sheet>
  )
}

export function TaskNotFoundSheet({ closeHref, number }: { closeHref: string; number: number }) {
  const router = useRouter()
  return (
    <Sheet open onOpenChange={(open) => !open && router.replace(closeHref, { scroll: false })}>
      <SheetContent className="w-full p-6 sm:max-w-[620px]">
        <SheetHeader className="p-0">
          <SheetTitle>{taskNumber(number)} isn&apos;t available</SheetTitle>
          <SheetDescription>It was deleted, or it isn&apos;t assigned to you.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  )
}

function TaskPanel({
  task,
  closeHref,
  today,
  currentMemberId,
  canManage,
  canWork,
  members,
  clientOptions,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [clientQuery, setClientQuery] = useState("")

  const [clients, setOptimisticTick] = useOptimistic(
    task.clients,
    (state, change: { clientId: string; done: boolean }) =>
      state.map((c) =>
        c.id === change.clientId
          ? {
              ...c,
              doneAt: change.done ? new Date().toISOString() : null,
              doneBy: change.done ? "You" : null,
            }
          : c,
      ),
  )
  const doneCount = clients.filter((c) => c.doneAt).length
  const visibleClients = useMemo(() => {
    const needle = clientQuery.trim().toLowerCase()
    return needle ? clients.filter((c) => c.name.toLowerCase().includes(needle)) : clients
  }, [clients, clientQuery])

  const isMine = task.assignee?.id === currentMemberId
  const canTick = canManage || (canWork && isMine)
  const mentionNames = members.map((m) => m.name)

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    startTransition(async () => {
      const result = await action()
      if (!result.ok) toast.error(result.error ?? "Something went wrong.")
      else if (success) toast.success(success)
    })
  }

  function tick(clientId: string, done: boolean) {
    startTransition(async () => {
      setOptimisticTick({ clientId, done })
      const result = await toggleTaskClient(task.id, clientId, done)
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <div className="flex flex-col">
      <SheetHeader className="gap-2 border-b p-6 pr-12">
        <TaskMeta number={task.number} type={task.type} repeat={task.repeat} />
        <SheetTitle className="text-lg leading-snug font-semibold">{task.title}</SheetTitle>
        <SheetDescription className="text-xs">
          Created {formatRelative(task.createdAt, new Date())}
          {task.createdBy ? ` by ${task.createdBy}` : ""}
          {task.isRepeatCopy ? " · repeat of an earlier task" : ""}
        </SheetDescription>
        {canManage && (
          <div className="absolute top-3.5 right-12">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Task actions">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil />
                  Edit task
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 />
                  Delete task
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </SheetHeader>

      <div className={cn("flex flex-col gap-8 p-6 transition-opacity", pending && "opacity-80")}>
        {/* Details */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
          <Detail label="Status">
            {canTick ? (
              <Select
                value={task.status}
                onValueChange={(v) =>
                  run(
                    () => setTaskStatus(task.id, v as TaskStatus),
                    `Moved to ${STATUS_META[v as TaskStatus].label}`,
                  )
                }
              >
                <SelectTrigger size="sm" className="w-full" aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <TaskStatusBadge status={task.status} />
            )}
          </Detail>
          <Detail label="Assigned to">
            {canManage ? (
              <Select
                value={task.assignee?.id ?? NOBODY}
                onValueChange={(v) =>
                  run(
                    () => updateTaskDetails(task.id, { assigneeId: v === NOBODY ? null : v }),
                    "Reassigned",
                  )
                }
              >
                <SelectTrigger size="sm" className="w-full" aria-label="Assigned to">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOBODY}>Nobody yet</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="flex flex-col gap-0.5">
                <span>{task.assignee?.name ?? "Nobody yet"}</span>
                <span className="text-xs text-muted-foreground">
                  Only an account manager can reassign this task.
                </span>
              </span>
            )}
          </Detail>
          <Detail label="Due">
            {canManage ? (
              <DueDatePicker
                value={task.dueOn}
                onChange={(v) =>
                  run(() => updateTaskDetails(task.id, { dueOn: v }), "Due date saved")
                }
                className="h-8"
              />
            ) : (
              <DueText dueOn={task.dueOn} done={task.status === "done"} today={today} />
            )}
          </Detail>
          <Detail label="Priority">
            {canManage ? (
              <Select
                value={task.priority}
                onValueChange={(v) =>
                  run(
                    () => updateTaskDetails(task.id, { priority: v as TaskPriority }),
                    "Priority saved",
                  )
                }
              >
                <SelectTrigger size="sm" className="w-full" aria-label="Priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_META[p as TaskPriority].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span>{PRIORITY_META[task.priority].label}</span>
            )}
          </Detail>
          <Detail label="Repeats" className="col-span-2">
            {task.repeat === "none" ? (
              <span className="text-muted-foreground">Does not repeat</span>
            ) : (
              <span>
                {REPEAT_LABELS[task.repeat]}.{" "}
                <span className="text-muted-foreground">
                  When it&apos;s done, a fresh copy is created automatically.
                </span>
              </span>
            )}
          </Detail>
          <Detail label="Counts toward" className="col-span-2">
            {task.countsAs ? (
              <span>
                {task.units === 1
                  ? `1 ${DELIVERABLE_META[task.countsAs].one}`
                  : `${task.units} ${DELIVERABLE_META[task.countsAs].many}`}{" "}
                per client.{" "}
                <span className="text-muted-foreground">
                  Ticking a client off adds it to their monthly work.
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">Not a monthly deliverable</span>
            )}
          </Detail>
        </dl>

        {task.description && (
          <Block title="Notes">
            <p className="text-sm whitespace-pre-line">{task.description}</p>
          </Block>
        )}

        <Block title="What to do">
          {task.steps.length > 0 ? (
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm marker:text-muted-foreground">
              {task.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No steps written for this task.</p>
          )}
        </Block>

        <Block
          title="Clients in this task"
          aside={
            clients.length > 0 && (
              <span className="text-sm tabular-nums">
                <span className="font-medium">{doneCount}</span>
                <span className="text-muted-foreground"> of {clients.length} done</span>
              </span>
            )
          }
        >
          {clients.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${Math.round((doneCount / clients.length) * 100)}%` }}
                />
              </div>
              {clients.length > 6 && (
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                    placeholder="Find a client in this task"
                    aria-label="Find a client in this task"
                    className="pl-8"
                  />
                </div>
              )}
              <ul className="divide-y rounded-lg border bg-card">
                {visibleClients.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Checkbox
                      checked={Boolean(c.doneAt)}
                      disabled={!canTick}
                      onCheckedChange={(checked) => tick(c.id, checked === true)}
                      aria-label={`${c.doneAt ? "Mark not done" : "Mark done"}: ${c.name}`}
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={cn(
                          "truncate text-sm font-medium",
                          c.doneAt && "text-muted-foreground line-through",
                        )}
                      >
                        {c.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {c.doneAt
                          ? `Done ${formatRelative(c.doneAt, new Date())}${c.doneBy ? ` by ${c.doneBy}` : ""}`
                          : c.location}
                      </span>
                    </div>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={clientHref(c.slug)}>
                        Open
                        <ExternalLink />
                      </Link>
                    </Button>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${c.name} from this task`}
                        onClick={() =>
                          run(() => removeTaskClient(task.id, c.id), `${c.name} removed`)
                        }
                      >
                        <X />
                      </Button>
                    )}
                  </li>
                ))}
                {visibleClients.length === 0 && (
                  <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                    No clients match.
                  </li>
                )}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No clients. This is an agency task; set its status when it&apos;s done.
            </p>
          )}
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-fit"
              onClick={() => setEditing(true)}
            >
              <Plus />
              Add or remove clients
            </Button>
          )}
        </Block>

        <TaskRequestsBlock
          task={{ id: task.id, number: task.number, title: task.title }}
          requests={task.requests}
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          canAsk={canTick && task.status !== "done"}
          members={members}
          currentMemberId={currentMemberId}
          today={today}
        />

        <Block title="Comments">
          <div className="flex flex-col gap-4">
            {task.comments.length === 0 && (
              <p className="text-sm text-muted-foreground">No comments yet.</p>
            )}
            {task.comments.length > 0 && (
              <ul className="flex flex-col gap-4">
                {task.comments.map((c) => (
                  <li key={c.id} className="flex gap-3">
                    <Avatar className="size-7">
                      <AvatarFallback className="bg-muted text-[10px] font-medium">
                        {initials(c.authorName ?? "?")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-baseline gap-2 text-xs">
                        <span className="font-medium">{c.authorName ?? "Someone"}</span>
                        <span className="text-muted-foreground">
                          {formatRelative(c.createdAt, new Date())}
                        </span>
                        {c.authorId === currentMemberId && (
                          <button
                            type="button"
                            className="ml-auto text-muted-foreground hover:text-destructive"
                            onClick={() => run(() => deleteComment(c.id))}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                      <p className="text-sm whitespace-pre-line">
                        <CommentBody body={c.body} names={mentionNames} />
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {canTick && <CommentBox taskId={task.id} members={members} />}
          </div>
        </Block>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2 w-fit gap-2 text-muted-foreground">
              <History />
              History ({task.history.length})
              <ChevronDown />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ol className="mt-2 flex flex-col gap-2 border-l pl-4">
              {task.history.map((h) => (
                <li key={h.id} className="text-sm">
                  <span className="font-medium">{actorLabel(h)}</span>{" "}
                  <span className="text-muted-foreground">{describeActivity(h)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatRelative(h.createdAt, new Date())}
                  </span>
                </li>
              ))}
            </ol>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {canManage && (
        <>
          <TaskFormDialog
            task={task}
            members={members}
            clientOptions={clientOptions}
            trigger={null}
            open={editing}
            onOpenChange={setEditing}
          />
          <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {taskNumber(task.number)}?</AlertDialogTitle>
                <AlertDialogDescription>
                  “{task.title}” and its comments are deleted for everyone. This can&apos;t be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteTask(task.id)
                      if (!result.ok) {
                        toast.error(result.error)
                        return
                      }
                      toast.success(`${taskNumber(task.number)} deleted`)
                      router.replace(closeHref, { scroll: false })
                    })
                  }
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
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
