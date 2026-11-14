"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Plus } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useState, useTransition, type ReactNode } from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { DELIVERABLES, DELIVERABLE_META } from "@/features/overview/constants"
import { ROLE_LABELS, type AppRole } from "@/lib/roles"
import { createTask, updateTask } from "../actions"
import {
  PRIORITY_META,
  REPEAT_LABELS,
  TASK_PRIORITIES,
  TASK_REPEATS,
  TASK_TYPES,
  TYPE_LABELS,
  taskNumber,
  type TaskPriority,
} from "../constants"
import type { ClientOption, MemberOption, TaskDetail } from "../queries"
import {
  defaultCountsAs,
  taskFormSchema,
  type TaskFormInput,
  type TaskFormValues,
} from "../schemas"
import { ClientPicker } from "./client-picker"
import { DueDatePicker } from "./due-date-picker"
import { StepsEditor } from "./steps-editor"

const NOBODY = "nobody"

function initialValues(task?: TaskDetail, defaultClientIds: string[] = []): TaskFormInput {
  if (!task) {
    return {
      title: "",
      description: "",
      type: "backlinks",
      priority: "normal",
      repeat: "none",
      assigneeId: "",
      dueOn: "",
      steps: [],
      clientIds: defaultClientIds,
      countsAs: defaultCountsAs("backlinks"),
      units: 1,
    }
  }
  return {
    title: task.title,
    description: task.description ?? "",
    type: task.type,
    priority: task.priority,
    repeat: task.repeat,
    assigneeId: task.assignee?.id ?? "",
    dueOn: task.dueOn ?? "",
    steps: task.steps.map((text) => ({ text })),
    clientIds: task.clients.map((c) => c.id),
    countsAs: task.countsAs ?? "none",
    units: task.units,
  }
}

/** Create a task, or edit one when `task` is given. */
export function TaskFormDialog({
  task,
  members,
  clientOptions,
  defaultClientIds,
  trigger,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  task?: TaskDetail
  members: MemberOption[]
  clientOptions: ClientOption[]
  defaultClientIds?: string[]
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<TaskFormInput, unknown, TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: initialValues(task, defaultClientIds),
  })
  const { errors } = form.formState

  function setOpen(next: boolean) {
    if (openProp === undefined) setOpenState(next)
    onOpenChangeProp?.(next)
    if (next) form.reset(initialValues(task, defaultClientIds))
    else setFormError(null)
  }

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      const input: TaskFormInput = {
        ...values,
        description: values.description ?? "",
        assigneeId: values.assigneeId ?? "",
        dueOn: values.dueOn ?? "",
        steps: values.steps.map((text) => ({ text })),
      }
      const result = task ? await updateTask(task.id, input) : await createTask(input)
      if (!result.ok) {
        setFormError(result.error)
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(field as keyof TaskFormInput, { message })
        }
        return
      }
      setOpen(false)
      toast.success(task ? "Task saved" : `${taskNumber(result.data.number)} created`)
      if (!task) {
        const search = new URLSearchParams(window.location.search)
        search.set("task", String(result.data.number))
        router.push(`${pathname}?${search.toString()}`, { scroll: false })
      }
    })
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button>
              <Plus />
              New task
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{task ? `Edit ${taskNumber(task.number)}` : "New task"}</DialogTitle>
          <DialogDescription>
            One task can cover many clients. Whoever it&apos;s assigned to ticks each client off.
          </DialogDescription>
        </DialogHeader>

        <form id="task-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(errors.title)}>
              <FieldLabel htmlFor="task-title">What needs doing</FieldLabel>
              <Input
                id="task-title"
                autoFocus
                placeholder="Submit Yelp listings for new clients"
                aria-invalid={Boolean(errors.title)}
                {...form.register("title")}
              />
              <FieldError errors={[errors.title]} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="task-type">Type</FieldLabel>
                <Controller
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v)
                        // New tasks: suggest what this type usually counts toward.
                        if (!task) form.setValue("countsAs", defaultCountsAs(v))
                      }}
                    >
                      <SelectTrigger id="task-type" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="task-assignee">Assign to</FieldLabel>
                <Controller
                  control={form.control}
                  name="assigneeId"
                  render={({ field }) => (
                    <Select
                      value={field.value || NOBODY}
                      onValueChange={(v) => field.onChange(v === NOBODY ? "" : v)}
                    >
                      <SelectTrigger id="task-assignee" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NOBODY}>Nobody yet</SelectItem>
                        {members.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                            <span className="text-muted-foreground">
                              {" "}
                              · {ROLE_LABELS[m.role as AppRole]}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field data-invalid={Boolean(errors.dueOn)}>
                <FieldLabel htmlFor="task-due">Due</FieldLabel>
                <Controller
                  control={form.control}
                  name="dueOn"
                  render={({ field }) => (
                    <DueDatePicker
                      id="task-due"
                      value={field.value || null}
                      onChange={(v) => field.onChange(v ?? "")}
                      invalid={Boolean(errors.dueOn)}
                    />
                  )}
                />
                <FieldError errors={[errors.dueOn]} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="task-priority">Priority</FieldLabel>
                <Controller
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="task-priority" className="w-full">
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
                  )}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="task-repeat">Repeat</FieldLabel>
                <Controller
                  control={form.control}
                  name="repeat"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="task-repeat" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_REPEATS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {REPEAT_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldDescription>When it&apos;s done, a fresh copy is created.</FieldDescription>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
              <Field>
                <FieldLabel htmlFor="task-counts">Counts toward</FieldLabel>
                <Controller
                  control={form.control}
                  name="countsAs"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="task-counts" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nothing (not a monthly deliverable)</SelectItem>
                        {DELIVERABLES.map((k) => (
                          <SelectItem key={k} value={k}>
                            {DELIVERABLE_META[k].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldDescription>
                  Ticking a client off adds to that client&apos;s monthly work on their Overview.
                </FieldDescription>
              </Field>
              <Field data-invalid={Boolean(errors.units)}>
                <FieldLabel htmlFor="task-units">Per client</FieldLabel>
                <Input
                  id="task-units"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  className="tabular-nums"
                  {...form.register("units", { valueAsNumber: true })}
                />
                <FieldError errors={[errors.units]} />
              </Field>
            </div>

            <Field data-invalid={Boolean(errors.description)}>
              <FieldLabel htmlFor="task-description">Notes (optional)</FieldLabel>
              <Textarea
                id="task-description"
                rows={2}
                placeholder="Anything the assignee should know before starting"
                {...form.register("description")}
              />
              <FieldError errors={[errors.description]} />
            </Field>
          </FieldGroup>

          <FieldSet className="gap-3">
            <FieldLegend variant="label">What to do</FieldLegend>
            <StepsEditor control={form.control} register={form.register} />
          </FieldSet>

          <FieldSet className="gap-3">
            <FieldLegend variant="label">Which clients</FieldLegend>
            <Controller
              control={form.control}
              name="clientIds"
              render={({ field }) => (
                <ClientPicker
                  options={clientOptions}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
            <FieldError errors={[errors.clientIds]} />
          </FieldSet>

          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="task-form" disabled={pending}>
            {pending ? "Saving…" : task ? "Save changes" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
