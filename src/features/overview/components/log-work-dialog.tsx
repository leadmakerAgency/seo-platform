"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Plus } from "lucide-react"
import { useState, useTransition } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { daysInMonth } from "@/lib/dates"
import { logWork } from "../actions"
import { DELIVERABLES, DELIVERABLE_META } from "../constants"
import { logWorkSchema, type LogWorkInput, type LogWorkValues } from "../schemas"

/**
 * Work done outside the app, or a correction (negative number + a reason).
 * Dates are limited to last month and this month, never the future.
 */
export function LogWorkDialog({
  clientId,
  month,
  today,
  earliestMonth,
}: {
  clientId: string
  month: string
  today: string
  earliestMonth: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)

  // Viewing a past month: default to its last day; otherwise today.
  const monthEnd = `${month.slice(0, 8)}${String(daysInMonth(month)).padStart(2, "0")}`
  const defaultDate = monthEnd < today ? monthEnd : today
  const defaults: LogWorkInput = {
    clientId,
    kind: "backlinks",
    quantity: 1,
    deliveredOn: defaultDate,
    title: "",
    url: "",
    note: "",
  }

  const form = useForm<LogWorkInput, unknown, LogWorkValues>({
    resolver: zodResolver(logWorkSchema),
    defaultValues: defaults,
  })
  const { errors } = form.formState
  const quantity = useWatch({ control: form.control, name: "quantity" })
  const correcting = typeof quantity === "number" && quantity < 0

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      form.reset(defaults)
      setFormError(null)
    }
  }

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      const r = await logWork(values)
      if (!r.ok) {
        setFormError(r.error)
        for (const [field, message] of Object.entries(r.fieldErrors ?? {})) {
          if (message) form.setError(field as keyof LogWorkInput, { message })
        }
        return
      }
      onOpenChange(false)
      toast.success(values.quantity < 0 ? "Count corrected" : "Work logged")
    })
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus />
          Log work
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Log work</DialogTitle>
          <DialogDescription>
            For work done outside the app. Ticking a client off a task that counts toward a
            deliverable adds it automatically, so there&apos;s no need to log that too.
          </DialogDescription>
        </DialogHeader>

        <form id="log-work-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
              <Field data-invalid={Boolean(errors.kind)}>
                <FieldLabel htmlFor="lw-kind">What was delivered</FieldLabel>
                <Controller
                  control={form.control}
                  name="kind"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="lw-kind" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DELIVERABLES.map((k) => (
                          <SelectItem key={k} value={k}>
                            {DELIVERABLE_META[k].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.kind]} />
              </Field>
              <Field data-invalid={Boolean(errors.quantity)}>
                <FieldLabel htmlFor="lw-quantity">How many</FieldLabel>
                <Input
                  id="lw-quantity"
                  type="number"
                  inputMode="numeric"
                  min={-50}
                  max={50}
                  className="tabular-nums"
                  {...form.register("quantity", { valueAsNumber: true })}
                />
                <FieldError errors={[errors.quantity]} />
              </Field>
            </div>

            <Field data-invalid={Boolean(errors.title)}>
              <FieldLabel htmlFor="lw-title">What was done</FieldLabel>
              <Input
                id="lw-title"
                autoFocus
                placeholder={correcting ? "Counted twice" : "Listing live on Houzz"}
                {...form.register("title")}
              />
              <FieldError errors={[errors.title]} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.deliveredOn)}>
                <FieldLabel htmlFor="lw-date">Date</FieldLabel>
                <Input
                  id="lw-date"
                  type="date"
                  min={earliestMonth}
                  max={today}
                  {...form.register("deliveredOn")}
                />
                <FieldError errors={[errors.deliveredOn]} />
              </Field>
              <Field data-invalid={Boolean(errors.url)}>
                <FieldLabel htmlFor="lw-url">Link (optional)</FieldLabel>
                <Input
                  id="lw-url"
                  inputMode="url"
                  placeholder="houzz.com/pro/…"
                  {...form.register("url")}
                />
                <FieldError errors={[errors.url]} />
              </Field>
            </div>

            <Field data-invalid={Boolean(errors.note)}>
              <FieldLabel htmlFor="lw-note">
                {correcting ? "Why the count is being corrected" : "Note (optional)"}
              </FieldLabel>
              <Textarea id="lw-note" rows={2} maxLength={500} {...form.register("note")} />
              <FieldDescription>
                A negative number lowers the count, for example when something was counted twice.
              </FieldDescription>
              <FieldError errors={[errors.note]} />
            </Field>
          </FieldGroup>

          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="log-work-form" disabled={pending}>
            {pending ? "Saving…" : correcting ? "Correct the count" : "Log work"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

