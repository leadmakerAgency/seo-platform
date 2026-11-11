"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useState, useTransition, type ReactNode } from "react"
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { DueDatePicker } from "@/features/tasks/components/due-date-picker"
import { taskNumber } from "@/features/tasks/constants"
import type { MemberOption } from "@/features/tasks/queries"
import { cn } from "@/lib/utils"
import { createRequest, updateRequest } from "../actions"
import {
  ACCEPT_LABELS,
  KIND_META,
  REQUEST_KINDS,
  requestNumber,
  type FileAccept,
  type RequestKind,
  type RequestOptions,
} from "../constants"
import type { RequestDetail, TaskOption } from "../queries"
import {
  canAutoComplete,
  requestFormSchema,
  type RequestFormInput,
  type RequestFormValues,
} from "../schemas"
import { REQUEST_TEMPLATES, type RequestTemplate } from "../templates"

const NONE = "none"

function optionFields(options: RequestOptions) {
  return {
    answer: options.answer ?? "short",
    accept: options.accept ?? "images",
    minFiles: String(options.min_files ?? 1),
    maxFiles: options.max_files ? String(options.max_files) : "",
    amount: options.amount !== undefined ? String(options.amount) : "",
    currency: options.currency ?? "USD",
    linkUrl: options.link_url ?? "",
    helpUrl: options.help_url ?? "",
    steps: (options.steps ?? []).map((text) => ({ text })),
  } satisfies Partial<RequestFormInput>
}

function initialValues(
  request: RequestDetail | undefined,
  clientId: string,
  taskId: string,
  ownerId: string,
): RequestFormInput {
  if (request) {
    return {
      clientId: request.client.id,
      taskId: request.task?.id ?? "",
      kind: request.kind,
      title: request.title,
      instructions: request.instructions ?? "",
      internalNote: request.internalNote ?? "",
      dueOn: request.dueOn ?? "",
      ownerId: request.owner?.id ?? "",
      autoComplete: request.autoComplete,
      ...optionFields(request.options),
    }
  }
  return {
    clientId,
    taskId,
    kind: "question",
    title: "",
    instructions: "",
    internalNote: "",
    dueOn: "",
    ownerId,
    autoComplete: false,
    ...optionFields({}),
  }
}

/** Ask a client for something, or edit a request that's still waiting on them. */
export function RequestFormDialog({
  request,
  clients,
  taskOptions,
  fixedTaskId,
  members,
  currentMemberId,
  trigger,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  openAfterCreate = true,
}: {
  request?: RequestDetail
  /** One client = fixed; several = a picker (e.g. from a task with many clients). */
  clients: { id: string; name: string }[]
  taskOptions: TaskOption[]
  fixedTaskId?: string
  members: MemberOption[]
  currentMemberId: string
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Open the new request's panel on this page after creating it. */
  openAfterCreate?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const [templateId, setTemplateId] = useState<string | null>(null)

  const defaults = () =>
    initialValues(request, clients[0]?.id ?? "", fixedTaskId ?? "", currentMemberId)
  const form = useForm<RequestFormInput, unknown, RequestFormValues>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: defaults(),
  })
  const { errors } = form.formState
  const kind = useWatch({ control: form.control, name: "kind" })
  const clientId = useWatch({ control: form.control, name: "clientId" })
  const steps = useFieldArray({ control: form.control, name: "steps" })

  function setOpen(next: boolean) {
    if (openProp === undefined) setOpenState(next)
    onOpenChangeProp?.(next)
    if (next) {
      form.reset(defaults())
      setTemplateId(null)
    } else setFormError(null)
  }

  function applyTemplate(t: RequestTemplate) {
    setTemplateId(t.id)
    const current = form.getValues()
    form.reset({
      ...current,
      kind: t.kind,
      title: t.title,
      instructions: t.instructions,
      autoComplete: t.autoComplete,
      ...optionFields(t.options),
    })
  }

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      const input: RequestFormInput = {
        ...values,
        taskId: values.taskId ?? "",
        instructions: values.instructions ?? "",
        internalNote: values.internalNote ?? "",
        dueOn: values.dueOn ?? "",
        ownerId: values.ownerId ?? "",
        minFiles: values.minFiles ? String(values.minFiles) : "",
        maxFiles: values.maxFiles ? String(values.maxFiles) : "",
        amount: values.amount !== null ? String(values.amount) : "",
        linkUrl: values.linkUrl ?? "",
        helpUrl: values.helpUrl ?? "",
        steps: values.steps.map((text) => ({ text })),
      }
      const result = request ? await updateRequest(request.id, input) : await createRequest(input)
      if (!result.ok) {
        setFormError(result.error)
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(field as keyof RequestFormInput, { message })
        }
        return
      }
      setOpen(false)
      if (request) {
        toast.success("Request saved")
        return
      }
      toast.success(`${requestNumber(result.data.number)} added to the client's list`, {
        description: "They see it the next time they open their link.",
      })
      if (openAfterCreate) {
        const search = new URLSearchParams(window.location.search)
        search.set("request", String(result.data.number))
        router.push(`${pathname}?${search.toString()}`, { scroll: false })
      }
    })
  })

  const clientName = clients.find((c) => c.id === clientId)?.name ?? "the client"
  const fixedTask = fixedTaskId ? taskOptions.find((t) => t.id === fixedTaskId) : undefined

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button>
              <Plus />
              New request
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>
            {request ? `Edit ${requestNumber(request.number)}` : `Ask ${clientName}`}
          </DialogTitle>
          <DialogDescription>
            The client sees the title and instructions on their private link. Write them for a busy
            business owner.
          </DialogDescription>
        </DialogHeader>

        <form id="request-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          {!request && (
            <FieldSet className="gap-2">
              <FieldLegend variant="label">Start from a template</FieldLegend>
              <div className="flex flex-wrap gap-1.5">
                {REQUEST_TEMPLATES.map((t) => {
                  const Icon = KIND_META[t.kind].icon
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => applyTemplate(t)}
                      aria-pressed={templateId === t.id}
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors hover:bg-muted",
                        templateId === t.id && "border-primary bg-brand-soft text-primary",
                      )}
                    >
                      <Icon className="size-3.5" aria-hidden />
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </FieldSet>
          )}

          <FieldGroup className="gap-4">
            {clients.length > 1 && !request && (
              <Field data-invalid={Boolean(errors.clientId)}>
                <FieldLabel htmlFor="request-client">Client</FieldLabel>
                <Controller
                  control={form.control}
                  name="clientId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="request-client" className="w-full">
                        <SelectValue placeholder="Choose a client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.clientId]} />
              </Field>
            )}

            <Field>
              <FieldLabel id="request-kind-label">Type</FieldLabel>
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    spacing={0}
                    aria-labelledby="request-kind-label"
                    value={field.value}
                    onValueChange={(v) => {
                      if (!v) return
                      field.onChange(v)
                      if (v === "code") form.setValue("autoComplete", true)
                      if (!canAutoComplete(v as RequestKind)) form.setValue("autoComplete", false)
                    }}
                    className="w-full flex-wrap"
                  >
                    {REQUEST_KINDS.map((k) => {
                      const Icon = KIND_META[k].icon
                      return (
                        <ToggleGroupItem key={k} value={k} className="flex-1 gap-1.5 px-2 text-xs">
                          <Icon aria-hidden />
                          {KIND_META[k].label}
                        </ToggleGroupItem>
                      )
                    })}
                  </ToggleGroup>
                )}
              />
              <FieldDescription>{KIND_META[kind].hint}</FieldDescription>
            </Field>

            <Field data-invalid={Boolean(errors.title)}>
              <FieldLabel htmlFor="request-title">What you need</FieldLabel>
              <Input
                id="request-title"
                placeholder="HomeAdvisor verification code"
                aria-invalid={Boolean(errors.title)}
                {...form.register("title")}
              />
              <FieldError errors={[errors.title]} />
            </Field>

            <Field data-invalid={Boolean(errors.instructions)}>
              <FieldLabel htmlFor="request-instructions">Instructions for the client</FieldLabel>
              <Textarea
                id="request-instructions"
                rows={3}
                placeholder="HomeAdvisor will text a 6-digit code to the business phone in the next few minutes."
                aria-invalid={Boolean(errors.instructions)}
                {...form.register("instructions")}
              />
              <FieldError errors={[errors.instructions]} />
            </Field>

            <KindFields form={form} kind={kind} steps={steps} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.dueOn)}>
                <FieldLabel htmlFor="request-due">Due</FieldLabel>
                <Controller
                  control={form.control}
                  name="dueOn"
                  render={({ field }) => (
                    <DueDatePicker
                      id="request-due"
                      value={field.value || null}
                      onChange={(v) => field.onChange(v ?? "")}
                      invalid={Boolean(errors.dueOn)}
                    />
                  )}
                />
                <FieldError errors={[errors.dueOn]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="request-owner">Follow-up owner</FieldLabel>
                <Controller
                  control={form.control}
                  name="ownerId"
                  render={({ field }) => (
                    <Select
                      value={field.value || NONE}
                      onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
                    >
                      <SelectTrigger id="request-owner" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Nobody</SelectItem>
                        {members.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.id === currentMemberId ? `${m.name} (you)` : m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldDescription>Gets notified when the client answers.</FieldDescription>
              </Field>
            </div>

            <Field data-invalid={Boolean(errors.taskId)}>
              <FieldLabel htmlFor="request-task">Linked task</FieldLabel>
              {fixedTask ? (
                <p className="flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">
                    {taskNumber(fixedTask.number)}
                  </span>
                  <span className="truncate">{fixedTask.title}</span>
                </p>
              ) : (
                <Controller
                  control={form.control}
                  name="taskId"
                  render={({ field }) => (
                    <Select
                      value={field.value || NONE}
                      onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
                    >
                      <SelectTrigger id="request-task" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>No task</SelectItem>
                        {taskOptions.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {taskNumber(t.number)} · {t.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
              <FieldDescription>
                The task waits on the client until this is answered, then goes back to In progress.
              </FieldDescription>
              <FieldError errors={[errors.taskId]} />
            </Field>

            {canAutoComplete(kind) && (
              <Controller
                control={form.control}
                name="autoComplete"
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Checkbox
                      id="request-auto"
                      checked={field.value}
                      onCheckedChange={(c) => field.onChange(c === true)}
                    />
                    <div className="flex flex-col gap-0.5">
                      <FieldLabel htmlFor="request-auto" className="font-normal">
                        Done when the client answers
                      </FieldLabel>
                      <FieldDescription>Skip the review step for this request.</FieldDescription>
                    </div>
                  </Field>
                )}
              />
            )}

            <Field data-invalid={Boolean(errors.internalNote)}>
              <FieldLabel htmlFor="request-note">Internal note (optional)</FieldLabel>
              <Textarea
                id="request-note"
                rows={2}
                placeholder="Only the team sees this."
                {...form.register("internalNote")}
              />
              <FieldError errors={[errors.internalNote]} />
            </Field>
          </FieldGroup>

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
          <Button type="submit" form="request-form" disabled={pending}>
            {pending ? "Saving…" : request ? "Save changes" : "Add request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type Form = ReturnType<typeof useForm<RequestFormInput, unknown, RequestFormValues>>
type Steps = ReturnType<typeof useFieldArray<RequestFormInput, "steps">>

/** The fields that only make sense for one type of request. */
function KindFields({ form, kind, steps }: { form: Form; kind: RequestKind; steps: Steps }) {
  const { errors } = form.formState

  if (kind === "question") {
    return (
      <Field>
        <FieldLabel htmlFor="request-answer">Answer box</FieldLabel>
        <Controller
          control={form.control}
          name="answer"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="request-answer" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Short answer (one line)</SelectItem>
                <SelectItem value="long">Long answer (a few sentences)</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </Field>
    )
  }

  if (kind === "files") {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="request-accept">What they can send</FieldLabel>
          <Controller
            control={form.control}
            name="accept"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="request-accept" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ACCEPT_LABELS) as FileAccept[]).map((a) => (
                    <SelectItem key={a} value={a}>
                      {ACCEPT_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field data-invalid={Boolean(errors.minFiles)}>
          <FieldLabel htmlFor="request-min">At least</FieldLabel>
          <Input
            id="request-min"
            inputMode="numeric"
            aria-invalid={Boolean(errors.minFiles)}
            {...form.register("minFiles")}
          />
          <FieldError errors={[errors.minFiles]} />
        </Field>
        <Field data-invalid={Boolean(errors.maxFiles)}>
          <FieldLabel htmlFor="request-max">At most (optional)</FieldLabel>
          <Input
            id="request-max"
            inputMode="numeric"
            placeholder="20"
            aria-invalid={Boolean(errors.maxFiles)}
            {...form.register("maxFiles")}
          />
          <FieldError errors={[errors.maxFiles]} />
        </Field>
        <FieldDescription className="sm:col-span-3">
          Images or PDF, up to 10 MB each.
        </FieldDescription>
      </div>
    )
  }

  if (kind === "approval") {
    return (
      <div className="grid gap-4 sm:grid-cols-[1fr_140px_90px]">
        <Field data-invalid={Boolean(errors.linkUrl)}>
          <FieldLabel htmlFor="request-link">Link to review (optional)</FieldLabel>
          <Input
            id="request-link"
            type="url"
            placeholder="https://docs.google.com/…"
            aria-invalid={Boolean(errors.linkUrl)}
            {...form.register("linkUrl")}
          />
          <FieldError errors={[errors.linkUrl]} />
        </Field>
        <Field data-invalid={Boolean(errors.amount)}>
          <FieldLabel htmlFor="request-amount">Cost (optional)</FieldLabel>
          <Input
            id="request-amount"
            inputMode="decimal"
            placeholder="250"
            aria-invalid={Boolean(errors.amount)}
            {...form.register("amount")}
          />
          <FieldError errors={[errors.amount]} />
        </Field>
        <Field data-invalid={Boolean(errors.currency)}>
          <FieldLabel htmlFor="request-currency">Currency</FieldLabel>
          <Input
            id="request-currency"
            maxLength={3}
            className="uppercase"
            aria-invalid={Boolean(errors.currency)}
            {...form.register("currency")}
          />
          <FieldError errors={[errors.currency]} />
        </Field>
      </div>
    )
  }

  if (kind === "action") {
    return (
      <FieldSet className="gap-3">
        <FieldLegend variant="label">Steps for the client</FieldLegend>
        {steps.fields.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Optional. Numbered steps make it easy to follow on a phone.
          </p>
        )}
        <ol className="flex flex-col gap-2">
          {steps.fields.map((field, index) => (
            <li key={field.id} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
                {index + 1}.
              </span>
              <Input
                aria-label={`Step ${index + 1}`}
                placeholder="Open search.google.com/search-console"
                {...form.register(`steps.${index}.text` as const)}
              />
              <div className="flex shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move step up"
                  disabled={index === 0}
                  onClick={() => steps.move(index, index - 1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move step down"
                  disabled={index === steps.fields.length - 1}
                  onClick={() => steps.move(index, index + 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove step"
                  onClick={() => steps.remove(index)}
                >
                  <X />
                </Button>
              </div>
            </li>
          ))}
        </ol>
        {steps.fields.length < 15 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => steps.append({ text: "" })}
          >
            <Plus />
            Add step
          </Button>
        )}
        <Field data-invalid={Boolean(errors.helpUrl)}>
          <FieldLabel htmlFor="request-help">Help link (optional)</FieldLabel>
          <Input
            id="request-help"
            type="url"
            placeholder="https://support.google.com/…"
            aria-invalid={Boolean(errors.helpUrl)}
            {...form.register("helpUrl")}
          />
          <FieldError errors={[errors.helpUrl]} />
        </Field>
      </FieldSet>
    )
  }

  return null
}
