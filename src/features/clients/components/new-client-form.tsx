"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { CircleAlert, CircleCheck, Circle } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition, type ReactNode } from "react"
import { Controller, useForm, useWatch, type FieldErrors } from "react-hook-form"
import { toast } from "sonner"

import { ChipsInput } from "@/components/common/chips-input"
import { CountryPicker } from "@/components/common/country-picker"
import { RegionInput } from "@/components/common/region-field"
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
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { clientHref } from "@/lib/navigation"
import { postalLabel, regionLabel, regionRequired } from "@/lib/regions"
import { cn } from "@/lib/utils"
import { createClient, findClientByWebsite } from "../actions"
import {
  newClientSchema,
  type NewClientField,
  type NewClientInput,
  type NewClientValues,
} from "../schemas"

type Owner = { id: string; name: string }

const PACKAGES = [
  { value: "seo", label: "SEO" },
  { value: "geo", label: "GEO" },
  { value: "seo_geo", label: "SEO + GEO" },
  { value: "custom", label: "Custom" },
] as const

const CONTACT_WAYS = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone call" },
  { value: "text", label: "Text message" },
  { value: "whatsapp", label: "WhatsApp" },
] as const

const TARGETS: [NewClientField, string, number][] = [
  ["keywords", "Keywords tracked", 500],
  ["backlinks", "Backlinks", 500],
  ["articles", "Articles", 200],
  ["gbpPosts", "Google posts", 500],
  ["reviewRequests", "Review requests", 500],
  ["aiFixes", "AI visibility fixes", 500],
]

type SectionId = "business" | "location" | "services" | "contact" | "plan" | "onboarding"

const SECTIONS: { id: SectionId; title: string; fields: NewClientField[] }[] = [
  { id: "business", title: "Business", fields: ["name", "website", "noWebsite", "industry", "phone", "publicEmail"] },
  {
    id: "location",
    title: "Location",
    fields: ["country", "street", "city", "region", "postalCode", "serviceAreaBusiness", "serviceAreas"],
  },
  { id: "services", title: "Services", fields: ["services", "otherCategories", "yearFounded", "description"] },
  { id: "contact", title: "Main contact", fields: ["contactName", "contactRole", "contactEmail", "contactPhone", "preferredContact"] },
  {
    id: "plan",
    title: "Plan",
    fields: ["package", "startedOn", "ownerId", "keywords", "backlinks", "articles", "gbpPosts", "reviewRequests", "aiFixes"],
  },
  { id: "onboarding", title: "Onboarding link", fields: ["createLink"] },
]

/** Is a section's required part filled in? (Drives the checklist beside the form.) */
function sectionDone(id: SectionId, v: NewClientInput): boolean {
  switch (id) {
    case "business":
      return v.name.trim().length >= 2 && (v.noWebsite || v.website.trim().length > 3) && v.industry.trim().length >= 2
    case "location":
      return Boolean(v.country && v.city.trim() && (!regionRequired(v.country) || v.region))
    case "services":
      return v.services.length > 0
    case "contact":
      return v.contactName.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.contactEmail.trim())
    default:
      return true
  }
}

export function NewClientForm({
  owners,
  defaultOwnerId,
  today,
}: {
  owners: Owner[]
  defaultOwnerId: string
  today: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<{ name: string; slug: string } | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [saved, setSaved] = useState(false)

  const form = useForm<NewClientInput, unknown, NewClientValues>({
    resolver: zodResolver(newClientSchema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      website: "",
      noWebsite: false,
      industry: "",
      phone: "",
      publicEmail: "",
      country: "US",
      street: "",
      city: "",
      region: "",
      postalCode: "",
      serviceAreaBusiness: false,
      serviceAreas: [],
      services: [],
      otherCategories: [],
      yearFounded: "",
      description: "",
      contactName: "",
      contactRole: "",
      contactEmail: "",
      contactPhone: "",
      preferredContact: "",
      package: "seo",
      startedOn: today,
      ownerId: defaultOwnerId,
      keywords: 20,
      backlinks: 20,
      articles: 8,
      gbpPosts: 8,
      reviewRequests: 30,
      aiFixes: 8,
      createLink: true,
    },
  })
  const { errors, isDirty } = form.formState
  const values = useWatch({ control: form.control }) as NewClientInput
  const country = values.country ?? "US"

  // Ask before leaving with typed changes (closing the tab or reloading).
  useEffect(() => {
    if (!isDirty || saved) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [isDirty, saved])

  function scrollToFirstError(errs: FieldErrors<NewClientInput>) {
    const section = SECTIONS.find((s) => s.fields.some((f) => errs[f]))
    if (section) document.getElementById(`section-${section.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const onSubmit = form.handleSubmit(
    (v) => {
      setFormError(null)
      startTransition(async () => {
        const r = await createClient(v)
        if (!r.ok) {
          setFormError(r.error)
          const fe = r.fieldErrors ?? {}
          for (const [field, message] of Object.entries(fe)) {
            if (message) form.setError(field as NewClientField, { message })
          }
          scrollToFirstError(fe as FieldErrors<NewClientInput>)
          return
        }
        setSaved(true)
        if (r.withLink) {
          toast.success(`${r.name} added`, {
            description: `Copy the onboarding link below and send it to ${r.contactName.split(" ")[0]}.`,
          })
          router.push(clientHref(r.slug, "onboarding"))
        } else {
          toast.success(`${r.name} added`)
          router.push(clientHref(r.slug))
        }
      })
    },
    (errs) => {
      setFormError("Some required details are missing. They're highlighted below.")
      scrollToFirstError(errs)
    },
  )

  async function checkWebsite() {
    const site = form.getValues("website").trim()
    if (!site || form.getValues("noWebsite")) return setDuplicate(null)
    setDuplicate(await findClientByWebsite(site))
  }

  const err = (f: NewClientField) => errors[f]?.message as string | undefined
  const sectionHasError = (id: SectionId) => SECTIONS.find((s) => s.id === id)!.fields.some((f) => errors[f])

  return (
    <div className="flex flex-col">
    <div className="grid items-start gap-8 pb-10 xl:grid-cols-[minmax(0,1fr)_260px]">
      <form id="new-client" onSubmit={onSubmit} noValidate className="flex min-w-0 flex-col gap-10">
        {/* 1. Business */}
        <FormSection id="business" n={1} title="Business" description="Who the client is. The name and website show across the app.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field data-invalid={Boolean(err("name"))} className="md:col-span-2">
              <FieldLabel htmlFor="nc-name">Business name</FieldLabel>
              <Input id="nc-name" autoFocus placeholder="King Air Duct Cleaning" autoComplete="organization" {...form.register("name")} />
              <FieldError>{err("name")}</FieldError>
            </Field>
            <Field data-invalid={Boolean(err("website"))}>
              <FieldLabel htmlFor="nc-website">Website</FieldLabel>
              <Input
                id="nc-website"
                inputMode="url"
                placeholder="kingairductcleaning.com"
                disabled={values.noWebsite}
                {...form.register("website", { onBlur: checkWebsite })}
              />
              <Label className="mt-1 flex items-center gap-2 text-[13px] font-normal text-muted-foreground">
                <Controller
                  control={form.control}
                  name="noWebsite"
                  render={({ field }) => (
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(c) => {
                        field.onChange(Boolean(c))
                        if (c) {
                          form.setValue("website", "")
                          form.clearErrors("website")
                          setDuplicate(null)
                        }
                      }}
                    />
                  )}
                />
                No website yet
              </Label>
              {duplicate && (
                <p className="flex items-center gap-1.5 text-[13px] text-warning">
                  <CircleAlert className="size-3.5" aria-hidden />
                  Already a client:{" "}
                  <Link href={clientHref(duplicate.slug)} target="_blank" className="font-medium underline">
                    {duplicate.name}
                  </Link>
                </p>
              )}
              <FieldError>{err("website")}</FieldError>
            </Field>
            <Field data-invalid={Boolean(err("industry"))}>
              <FieldLabel htmlFor="nc-industry">Main category</FieldLabel>
              <Input id="nc-industry" placeholder="Air duct cleaning service" {...form.register("industry")} />
              <FieldDescription>As on their Google Business Profile, if they have one.</FieldDescription>
              <FieldError>{err("industry")}</FieldError>
            </Field>
            <Field data-invalid={Boolean(err("phone"))}>
              <FieldLabel htmlFor="nc-phone">Business phone (optional)</FieldLabel>
              <Input id="nc-phone" type="tel" autoComplete="tel" placeholder="+1 602 555 0123" {...form.register("phone")} />
              <FieldError>{err("phone")}</FieldError>
            </Field>
            <Field data-invalid={Boolean(err("publicEmail"))}>
              <FieldLabel htmlFor="nc-public-email">Public email (optional)</FieldLabel>
              <Input id="nc-public-email" type="email" placeholder="info@kingair.com" {...form.register("publicEmail")} />
              <FieldError>{err("publicEmail")}</FieldError>
            </Field>
          </div>
        </FormSection>

        {/* 2. Location */}
        <FormSection
          id="location"
          n={2}
          title="Location"
          description="Rankings are checked from this city, and local backlinks are found around it."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field data-invalid={Boolean(err("country"))}>
              <FieldLabel htmlFor="nc-country">Country</FieldLabel>
              <Controller
                control={form.control}
                name="country"
                render={({ field }) => (
                  <CountryPicker
                    id="nc-country"
                    value={field.value}
                    invalid={Boolean(err("country"))}
                    onChange={(code) => {
                      field.onChange(code)
                      form.setValue("region", "")
                    }}
                  />
                )}
              />
              <FieldError>{err("country")}</FieldError>
            </Field>
            <Field data-invalid={Boolean(err("street"))}>
              <FieldLabel htmlFor="nc-street">Street address (optional)</FieldLabel>
              <Input id="nc-street" autoComplete="street-address" placeholder="1234 E Camelback Rd, Suite 5" {...form.register("street")} />
              <FieldError>{err("street")}</FieldError>
            </Field>
            <Field data-invalid={Boolean(err("city"))}>
              <FieldLabel htmlFor="nc-city">City</FieldLabel>
              <Input id="nc-city" autoComplete="address-level2" placeholder="Phoenix" {...form.register("city")} />
              <FieldError>{err("city")}</FieldError>
            </Field>
            <div className="grid grid-cols-[1fr_140px] gap-4">
              <Field data-invalid={Boolean(err("region"))}>
                <FieldLabel htmlFor="nc-region">
                  {regionLabel(country)}
                  {regionRequired(country) ? "" : " (optional)"}
                </FieldLabel>
                <Controller
                  control={form.control}
                  name="region"
                  render={({ field }) => (
                    <RegionInput id="nc-region" country={country} value={field.value} onChange={field.onChange} invalid={Boolean(err("region"))} />
                  )}
                />
                <FieldError>{err("region")}</FieldError>
              </Field>
              <Field data-invalid={Boolean(err("postalCode"))}>
                <FieldLabel htmlFor="nc-postal">{postalLabel(country)}</FieldLabel>
                <Input id="nc-postal" autoComplete="postal-code" {...form.register("postalCode")} />
                <FieldError>{err("postalCode")}</FieldError>
              </Field>
            </div>
            <div className="flex flex-col gap-3 md:col-span-2">
              <Label className="flex items-start gap-2 font-normal">
                <Controller
                  control={form.control}
                  name="serviceAreaBusiness"
                  render={({ field }) => (
                    <Checkbox className="mt-0.5" checked={field.value} onCheckedChange={(c) => field.onChange(Boolean(c))} />
                  )}
                />
                <span className="flex flex-col gap-0.5">
                  They go to their customers
                  <span className="text-[13px] text-muted-foreground">
                    A service-area business: Google hides the street address and shows the areas they serve.
                  </span>
                </span>
              </Label>
              <Field data-invalid={Boolean(err("serviceAreas"))}>
                <FieldLabel htmlFor="nc-areas">Areas they serve (optional)</FieldLabel>
                <Controller
                  control={form.control}
                  name="serviceAreas"
                  render={({ field }) => (
                    <ChipsInput id="nc-areas" values={field.value} onChange={field.onChange} placeholder="Scottsdale, Tempe, 85004…" />
                  )}
                />
                <FieldError>{err("serviceAreas")}</FieldError>
              </Field>
            </div>
          </div>
        </FormSection>

        {/* 3. Services */}
        <FormSection
          id="services"
          n={3}
          title="Services"
          description="What they sell. Keyword research and backlink searches only keep results about these."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field data-invalid={Boolean(err("services"))} className="md:col-span-2">
              <FieldLabel htmlFor="nc-services">Services</FieldLabel>
              <Controller
                control={form.control}
                name="services"
                render={({ field }) => (
                  <ChipsInput
                    id="nc-services"
                    values={field.value}
                    onChange={(v) => {
                      field.onChange(v)
                      if (v.length) form.clearErrors("services")
                    }}
                    invalid={Boolean(err("services"))}
                    placeholder="Air duct cleaning, dryer vent cleaning…"
                  />
                )}
              />
              <FieldDescription>Press Enter or type a comma after each one.</FieldDescription>
              <FieldError>{err("services")}</FieldError>
            </Field>
            <Field data-invalid={Boolean(err("otherCategories"))} className="md:col-span-2">
              <FieldLabel htmlFor="nc-categories">Other Google categories (optional)</FieldLabel>
              <Controller
                control={form.control}
                name="otherCategories"
                render={({ field }) => (
                  <ChipsInput id="nc-categories" values={field.value} onChange={field.onChange} max={20} placeholder="HVAC contractor" />
                )}
              />
              <FieldError>{err("otherCategories")}</FieldError>
            </Field>
            <Field data-invalid={Boolean(err("yearFounded"))}>
              <FieldLabel htmlFor="nc-year">Year founded (optional)</FieldLabel>
              <Input id="nc-year" inputMode="numeric" maxLength={4} placeholder="2012" className="max-w-32 tabular-nums" {...form.register("yearFounded")} />
              <FieldError>{err("yearFounded")}</FieldError>
            </Field>
            <Field data-invalid={Boolean(err("description"))} className="md:col-span-2">
              <FieldLabel htmlFor="nc-description">Short description (optional)</FieldLabel>
              <Textarea
                id="nc-description"
                rows={3}
                maxLength={2000}
                placeholder="Family-owned duct cleaning company serving the Phoenix valley since 2012."
                {...form.register("description")}
              />
              <FieldError>{err("description")}</FieldError>
            </Field>
          </div>
        </FormSection>

        {/* 4. Main contact */}
        <FormSection id="contact" n={4} title="Main contact" description="The person we work with. The onboarding link and reports go to them.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field data-invalid={Boolean(err("contactName"))}>
              <FieldLabel htmlFor="nc-contact-name">Name</FieldLabel>
              <Input id="nc-contact-name" autoComplete="name" placeholder="John Smith" {...form.register("contactName")} />
              <FieldError>{err("contactName")}</FieldError>
            </Field>
            <Field data-invalid={Boolean(err("contactRole"))}>
              <FieldLabel htmlFor="nc-contact-role">Role (optional)</FieldLabel>
              <Input id="nc-contact-role" placeholder="Owner" {...form.register("contactRole")} />
              <FieldError>{err("contactRole")}</FieldError>
            </Field>
            <Field data-invalid={Boolean(err("contactEmail"))}>
              <FieldLabel htmlFor="nc-contact-email">Email</FieldLabel>
              <Input id="nc-contact-email" type="email" autoComplete="email" placeholder="john@kingair.com" {...form.register("contactEmail")} />
              <FieldError>{err("contactEmail")}</FieldError>
            </Field>
            <Field data-invalid={Boolean(err("contactPhone"))}>
              <FieldLabel htmlFor="nc-contact-phone">Phone (optional)</FieldLabel>
              <Input id="nc-contact-phone" type="tel" autoComplete="tel" {...form.register("contactPhone")} />
              <FieldError>{err("contactPhone")}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="nc-contact-way">Best way to reach them (optional)</FieldLabel>
              <Controller
                control={form.control}
                name="preferredContact"
                render={({ field }) => (
                  <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                    <SelectTrigger id="nc-contact-way" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No preference</SelectItem>
                      {CONTACT_WAYS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>
        </FormSection>

        {/* 5. Plan */}
        <FormSection id="plan" n={5} title="Plan" description="What we deliver every month. You can change it any time in Edit details.">
          <div className="grid gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="nc-package">Package</FieldLabel>
              <Controller
                control={form.control}
                name="package"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="nc-package" className="w-full">
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
            <Field data-invalid={Boolean(err("startedOn"))}>
              <FieldLabel htmlFor="nc-started">Client since</FieldLabel>
              <Input id="nc-started" type="date" max={today} {...form.register("startedOn")} />
              <FieldError>{err("startedOn")}</FieldError>
            </Field>
            <Field data-invalid={Boolean(err("ownerId"))}>
              <FieldLabel htmlFor="nc-owner">Looked after by</FieldLabel>
              <Controller
                control={form.control}
                name="ownerId"
                render={({ field }) => (
                  <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                    <SelectTrigger id="nc-owner" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nobody yet</SelectItem>
                      {owners.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError>{err("ownerId")}</FieldError>
            </Field>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Every month</legend>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {TARGETS.map(([name, label, max]) => (
                <Field key={name} data-invalid={Boolean(err(name))}>
                  <FieldLabel htmlFor={`nc-${name}`} className="font-normal text-muted-foreground">
                    {label}
                  </FieldLabel>
                  <Input
                    id={`nc-${name}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={max}
                    className="tabular-nums"
                    {...form.register(name, { valueAsNumber: true })}
                  />
                  <FieldError>{err(name)}</FieldError>
                </Field>
              ))}
            </div>
          </fieldset>
        </FormSection>

        {/* 6. Onboarding link */}
        <FormSection id="onboarding" n={6} title="Onboarding link" description="A private link where the client confirms these details and gives us access.">
          <Label className="flex items-start gap-2 font-normal">
            <Controller
              control={form.control}
              name="createLink"
              render={({ field }) => (
                <Checkbox className="mt-0.5" checked={field.value} onCheckedChange={(c) => field.onChange(Boolean(c))} />
              )}
            />
            <span className="flex flex-col gap-0.5">
              Create the onboarding link now
              <span className="text-[13px] text-muted-foreground">
                What you filled in above is already in it, so the client only checks it and adds the rest:
                opening hours, Google and social accounts, website access and logins. The link works for 30 days.
              </span>
            </span>
          </Label>
        </FormSection>
      </form>

      {/* Checklist beside the form (wide screens). */}
      <aside className="sticky top-16 hidden flex-col gap-4 xl:flex">
        <nav aria-label="Sections" className="flex flex-col gap-0.5 rounded-lg border bg-card p-2">
          {SECTIONS.map((s, i) => {
            const hasError = sectionHasError(s.id)
            const done = sectionDone(s.id, values)
            return (
              <a
                key={s.id}
                href={`#section-${s.id}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                {hasError ? (
                  <CircleAlert className="size-4 text-danger" aria-label="Needs a fix" />
                ) : done ? (
                  <CircleCheck className="size-4 text-success" aria-label="Done" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" aria-label="Not done" />
                )}
                <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                {s.title}
              </a>
            )
          })}
        </nav>
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-[13px] text-muted-foreground">
          <p className="font-medium text-foreground">What happens next</p>
          <ol className="flex list-decimal flex-col gap-1 pl-4">
            <li>The client starts in Onboarding.</li>
            <li>{values.createLink ? "You copy the onboarding link and send it." : "You create the onboarding link when you're ready."}</li>
            <li>The client confirms the details and gives us access.</li>
            <li>You review it and mark the client Active.</li>
          </ol>
        </div>
      </aside>

    </div>

      {/* Actions stay in view at the bottom of the window while scrolling. */}
      <div className="sticky bottom-0 z-20 -mx-4 -mb-6 border-t bg-background px-4 py-3 md:-mx-8 md:-mb-8 md:px-8">
        <div className="flex flex-wrap items-center justify-end gap-3">
          {formError && (
            <p className="mr-auto flex items-center gap-1.5 text-sm text-danger" role="alert">
              <CircleAlert className="size-4" aria-hidden />
              {formError}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => (isDirty ? setConfirmLeave(true) : router.push("/dashboard"))}
          >
            Cancel
          </Button>
          <Button type="submit" form="new-client" disabled={pending}>
            {pending ? "Adding…" : "Add client"}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without adding the client?</AlertDialogTitle>
            <AlertDialogDescription>What you typed here will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setSaved(true)
                router.push("/dashboard")
              }}
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function FormSection({
  id,
  n,
  title,
  description,
  children,
}: {
  id: SectionId
  n: number
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section id={`section-${id}`} className={cn("flex scroll-mt-20 flex-col gap-4")} aria-labelledby={`h-${id}`}>
      <div className="flex flex-col gap-0.5 border-b pb-2">
        <h2 id={`h-${id}`} className="text-[15px] leading-[22px] font-semibold">
          <span className="text-muted-foreground tabular-nums">{n}.</span> {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}
