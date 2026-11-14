"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Pencil } from "lucide-react"
import { useState, useTransition } from "react"
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
import type { OwnerOption } from "@/features/clients/components/add-client-dialog"
import { STAGE_LABELS } from "@/features/clients/constants"
import { COUNTRIES } from "@/lib/format"
import { updateClientDetails } from "../actions"
import { PACKAGES } from "../constants"
import type { OverviewDetails } from "../queries"
import { editClientSchema, type EditClientInput, type EditClientValues } from "../schemas"

const NO_OWNER = "none"

const TARGETS = [
  ["keywords", "Keywords tracked"],
  ["backlinks", "Backlinks"],
  ["articles", "Articles"],
  ["gbpPosts", "Google posts"],
  ["reviewRequests", "Review requests"],
  ["aiFixes", "AI visibility fixes"],
] as const

function valuesOf(d: OverviewDetails): EditClientInput {
  return {
    clientId: d.id,
    name: d.name,
    website: d.website ?? "",
    city: d.city ?? "",
    region: d.region ?? "",
    country: d.country,
    industry: d.industry ?? "",
    ownerId: d.owner?.id ?? "",
    stage: d.stage,
    startedOn: d.startedOn,
    package: d.package,
    keywords: d.targets.keywords,
    backlinks: d.targets.backlinks_target,
    articles: d.targets.articles_target,
    gbpPosts: d.targets.gbp_posts_target,
    reviewRequests: d.targets.review_requests_target,
    aiFixes: d.targets.ai_fixes_target,
  }
}

/** Admins and managers: the client's details, stage, package and monthly targets. */
export function EditClientDialog({
  details,
  owners,
}: {
  details: OverviewDetails
  owners: OwnerOption[]
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<EditClientInput, unknown, EditClientValues>({
    resolver: zodResolver(editClientSchema),
    defaultValues: valuesOf(details),
  })
  const { errors } = form.formState

  function onOpenChange(next: boolean) {
    setOpen(next)
    // Always start from what's saved now (the page refreshes in the background).
    if (next) form.reset(valuesOf(details))
    else setFormError(null)
  }

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      const r = await updateClientDetails(values)
      if (!r.ok) {
        setFormError(r.error)
        for (const [field, message] of Object.entries(r.fieldErrors ?? {})) {
          if (message) form.setError(field as keyof EditClientInput, { message })
        }
        return
      }
      setOpen(false)
      toast.success("Client details saved")
    })
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil />
          Edit details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit {details.name}</DialogTitle>
          <DialogDescription>
            Target changes apply to this month and later; past months keep what was promised.
          </DialogDescription>
        </DialogHeader>

        <form id="edit-client-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.name)}>
                <FieldLabel htmlFor="ec-name">Business name</FieldLabel>
                <Input id="ec-name" {...form.register("name")} />
                <FieldError errors={[errors.name]} />
              </Field>
              <Field data-invalid={Boolean(errors.website)}>
                <FieldLabel htmlFor="ec-website">Website</FieldLabel>
                <Input id="ec-website" inputMode="url" {...form.register("website")} />
                <FieldError errors={[errors.website]} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field data-invalid={Boolean(errors.city)}>
                <FieldLabel htmlFor="ec-city">City</FieldLabel>
                <Input id="ec-city" {...form.register("city")} />
                <FieldError errors={[errors.city]} />
              </Field>
              <Field data-invalid={Boolean(errors.region)}>
                <FieldLabel htmlFor="ec-region">State or region</FieldLabel>
                <Input id="ec-region" {...form.register("region")} />
                <FieldError errors={[errors.region]} />
              </Field>
              <Field data-invalid={Boolean(errors.country)}>
                <FieldLabel htmlFor="ec-country">Country</FieldLabel>
                <Controller
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="ec-country" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.industry)}>
                <FieldLabel htmlFor="ec-industry">Industry</FieldLabel>
                <Input id="ec-industry" {...form.register("industry")} />
                <FieldError errors={[errors.industry]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="ec-owner">Account manager</FieldLabel>
                <Controller
                  control={form.control}
                  name="ownerId"
                  render={({ field }) => (
                    <Select
                      value={field.value || NO_OWNER}
                      onValueChange={(v) => field.onChange(v === NO_OWNER ? "" : v)}
                    >
                      <SelectTrigger id="ec-owner" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_OWNER}>Nobody yet</SelectItem>
                        {owners.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="ec-stage">Stage</FieldLabel>
                <Controller
                  control={form.control}
                  name="stage"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="ec-stage" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["onboarding", "active", "paused", "churned"] as const).map((s) => (
                          <SelectItem key={s} value={s}>
                            {STAGE_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ec-package">Package</FieldLabel>
                <Controller
                  control={form.control}
                  name="package"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="ec-package" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PACKAGES.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field data-invalid={Boolean(errors.startedOn)}>
                <FieldLabel htmlFor="ec-started">Client since</FieldLabel>
                <Input id="ec-started" type="date" {...form.register("startedOn")} />
                <FieldError errors={[errors.startedOn]} />
              </Field>
            </div>
          </FieldGroup>

          <FieldSet className="gap-3">
            <FieldLegend variant="label">Every month</FieldLegend>
            <FieldDescription>
              Set a target to 0 to stop tracking it. Behind-schedule warnings only apply to Active
              clients.
            </FieldDescription>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {TARGETS.map(([name, label]) => (
                <Field key={name} data-invalid={Boolean(errors[name])}>
                  <FieldLabel htmlFor={`ec-${name}`} className="font-normal text-muted-foreground">
                    {label}
                  </FieldLabel>
                  <Input
                    id={`ec-${name}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="tabular-nums"
                    {...form.register(name, { valueAsNumber: true })}
                  />
                  <FieldError errors={[errors[name]]} />
                </Field>
              ))}
            </div>
          </FieldSet>

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
          <Button type="submit" form="edit-client-form" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
