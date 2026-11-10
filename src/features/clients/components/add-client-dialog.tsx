"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
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
import { COUNTRIES } from "@/lib/format"
import { clientHref } from "@/lib/navigation"
import { addClient } from "../actions"
import { DEFAULT_PLAN } from "../constants"
import { addClientSchema, type AddClientInput, type AddClientValues } from "../schemas"

const NO_OWNER = "none"

const emptyValues: AddClientInput = {
  name: "",
  website: "",
  city: "",
  region: "",
  country: "US",
  industry: "",
  ownerId: "",
  keywords: DEFAULT_PLAN.keywords,
  backlinks: DEFAULT_PLAN.backlinks,
  articles: DEFAULT_PLAN.articles,
}

export type OwnerOption = { id: string; name: string }

export function AddClientDialog({
  owners,
  defaultOwnerId,
  trigger,
}: {
  owners: OwnerOption[]
  defaultOwnerId?: string
  trigger?: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<AddClientInput, unknown, AddClientValues>({
    resolver: zodResolver(addClientSchema),
    defaultValues: { ...emptyValues, ownerId: defaultOwnerId ?? "" },
  })
  const { errors } = form.formState

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      form.reset({ ...emptyValues, ownerId: defaultOwnerId ?? "" })
      setFormError(null)
    }
  }

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      const result = await addClient(values)
      if (!result.ok) {
        setFormError(result.error)
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(field as keyof AddClientInput, { message })
        }
        return
      }
      onOpenChange(false)
      toast.success(`${result.name} added`, {
        action: { label: "Open", onClick: () => router.push(clientHref(result.slug)) },
      })
    })
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus />
            Add client
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add client</DialogTitle>
          <DialogDescription>
            The client starts in onboarding. You can change any of this later.
          </DialogDescription>
        </DialogHeader>

        <form id="add-client-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor="name">Business name</FieldLabel>
              <Input
                id="name"
                autoFocus
                placeholder="King Air Duct Cleaning"
                {...form.register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field data-invalid={Boolean(errors.website)}>
              <FieldLabel htmlFor="website">Website</FieldLabel>
              <Input
                id="website"
                inputMode="url"
                placeholder="kingairductcleaning.com"
                {...form.register("website")}
              />
              <FieldError errors={[errors.website]} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field data-invalid={Boolean(errors.city)}>
                <FieldLabel htmlFor="city">City</FieldLabel>
                <Input id="city" placeholder="Peoria" {...form.register("city")} />
                <FieldError errors={[errors.city]} />
              </Field>
              <Field data-invalid={Boolean(errors.region)}>
                <FieldLabel htmlFor="region">State or region</FieldLabel>
                <Input id="region" placeholder="AZ" {...form.register("region")} />
                <FieldError errors={[errors.region]} />
              </Field>
              <Field data-invalid={Boolean(errors.country)}>
                <FieldLabel htmlFor="country">Country</FieldLabel>
                <Controller
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="country" className="w-full">
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
                <FieldError errors={[errors.country]} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.industry)}>
                <FieldLabel htmlFor="industry">Industry</FieldLabel>
                <Input
                  id="industry"
                  placeholder="Home services, HVAC"
                  {...form.register("industry")}
                />
                <FieldError errors={[errors.industry]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="ownerId">Looked after by</FieldLabel>
                <Controller
                  control={form.control}
                  name="ownerId"
                  render={({ field }) => (
                    <Select
                      value={field.value || NO_OWNER}
                      onValueChange={(v) => field.onChange(v === NO_OWNER ? "" : v)}
                    >
                      <SelectTrigger id="ownerId" className="w-full">
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
          </FieldGroup>

          <FieldSet className="gap-3">
            <FieldLegend variant="label">Every month</FieldLegend>
            <div className="grid grid-cols-3 gap-4">
              {(
                [
                  ["keywords", "Keywords"],
                  ["backlinks", "Backlinks"],
                  ["articles", "Articles"],
                ] as const
              ).map(([name, label]) => (
                <Field key={name} data-invalid={Boolean(errors[name])}>
                  <FieldLabel htmlFor={name} className="font-normal text-muted-foreground">
                    {label}
                  </FieldLabel>
                  <Input
                    id={name}
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
          <Button type="submit" form="add-client-form" disabled={pending}>
            {pending ? "Adding…" : "Add client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
