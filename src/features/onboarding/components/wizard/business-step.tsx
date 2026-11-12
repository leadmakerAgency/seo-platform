"use client"

import { useState } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { COUNTRIES } from "@/lib/format"
import { PREFERRED_CONTACT, type Hours, type StepStatuses } from "../../constants"
import type { OnboardingBusiness } from "../../public"
import { saveBusiness } from "../../public-actions"
import type { BusinessPatchInput } from "../../schemas"
import { ChipsInput, Field, HoursEditor, inputClass, SaveIndicator, selectClass } from "./fields"
import { useAutosave } from "./use-autosave"

type Values = {
  business_name: string
  legal_name: string
  phone: string
  public_email: string
  website: string
  street: string
  city: string
  region: string
  postal_code: string
  country_code: string
  service_area_business: boolean
  service_areas: string[]
  primary_category: string
  other_categories: string[]
  services: string[]
  hours: Hours | null
  year_founded: string
  description: string
  contact_name: string
  contact_role: string
  contact_email: string
  contact_phone: string
  preferred_contact: string
}

function initial(b: OnboardingBusiness | null, clientName: string): Values {
  return {
    business_name: b?.business_name ?? clientName,
    legal_name: b?.legal_name ?? "",
    phone: b?.phone ?? "",
    public_email: b?.public_email ?? "",
    website: b?.website ?? "",
    street: b?.street ?? "",
    city: b?.city ?? "",
    region: b?.region ?? "",
    postal_code: b?.postal_code ?? "",
    country_code: b?.country_code ?? "US",
    service_area_business: b?.service_area_business ?? false,
    service_areas: b?.service_areas ?? [],
    primary_category: b?.primary_category ?? "",
    other_categories: b?.other_categories ?? [],
    services: b?.services ?? [],
    hours: b?.hours ?? null,
    year_founded: b?.year_founded ? String(b.year_founded) : "",
    description: b?.description ?? "",
    contact_name: b?.contact_name ?? "",
    contact_role: b?.contact_role ?? "",
    contact_email: b?.contact_email ?? "",
    contact_phone: b?.contact_phone ?? "",
    preferred_contact: b?.preferred_contact ?? "",
  }
}

export function BusinessStep({
  token,
  clientName,
  business,
  readOnly,
  onSteps,
}: {
  token: string
  clientName: string
  business: OnboardingBusiness | null
  readOnly: boolean
  onSteps: (s: StepStatuses) => void
}) {
  const [v, setV] = useState<Values>(() => initial(business, clientName))
  const save = useAutosave<BusinessPatchInput>((patch) => saveBusiness(token, patch), onSteps)
  const err = save.errors

  /** Text fields: save shortly after typing stops, and at once on blur. */
  const text = (key: keyof Values) => ({
    id: `b-${key}`,
    value: v[key] as string,
    disabled: readOnly,
    "aria-invalid": Boolean(err[key]),
    onChange: (e: { target: { value: string } }) => {
      const value = e.target.value
      setV((s) => ({ ...s, [key]: value }))
      save.queue({ [key]: value } as BusinessPatchInput)
    },
    onBlur: () => void save.flush(),
  })
  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setV((s) => ({ ...s, [key]: value }))
    save.queue({ [key]: value } as BusinessPatchInput, true)
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex justify-end">
        <SaveIndicator state={save.state} message={save.message} />
      </div>

      <Section
        title="Your business"
        hint="How customers know you. We use this on Google, directories and your reports."
      >
        <Field id="b-business_name" label="Business name" error={err.business_name}>
          <Input {...text("business_name")} className={inputClass} autoComplete="organization" />
        </Field>
        <Field
          id="b-legal_name"
          label="Legal name"
          optional
          hint="Only if it's different, like “King Air LLC”."
          error={err.legal_name}
        >
          <Input {...text("legal_name")} className={inputClass} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="b-phone" label="Business phone" error={err.phone}>
            <Input
              {...text("phone")}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className={inputClass}
            />
          </Field>
          <Field id="b-public_email" label="Public email" optional error={err.public_email}>
            <Input
              {...text("public_email")}
              type="email"
              autoComplete="email"
              className={inputClass}
            />
          </Field>
        </div>
        <Field id="b-website" label="Website" optional error={err.website}>
          <Input
            {...text("website")}
            inputMode="url"
            placeholder="example.com"
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="Location" hint="Where you're based, and the areas you serve.">
        <label className="flex items-start gap-3 text-[15px]">
          <Checkbox
            checked={v.service_area_business}
            disabled={readOnly}
            onCheckedChange={(c) => set("service_area_business", c === true)}
            className="mt-0.5"
          />
          <span>
            We go to our customers, and customers don&apos;t visit us.
            <span className="block text-sm text-muted-foreground">
              Your street address then stays hidden on Google.
            </span>
          </span>
        </label>
        <Field
          id="b-street"
          label="Street address"
          optional={v.service_area_business}
          error={err.street}
        >
          <Input {...text("street")} autoComplete="street-address" className={inputClass} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field id="b-city" label="City" error={err.city}>
            <Input {...text("city")} autoComplete="address-level2" className={inputClass} />
          </Field>
          <Field id="b-region" label="State or region" error={err.region}>
            <Input {...text("region")} autoComplete="address-level1" className={inputClass} />
          </Field>
          <Field id="b-postal_code" label="ZIP / postal code" error={err.postal_code}>
            <Input {...text("postal_code")} autoComplete="postal-code" className={inputClass} />
          </Field>
        </div>
        <Field id="b-country_code" label="Country" error={err.country_code}>
          <select
            id="b-country_code"
            className={selectClass}
            disabled={readOnly}
            value={v.country_code}
            onChange={(e) => set("country_code", e.target.value)}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="b-service_areas"
          label="Areas you serve"
          optional={!v.service_area_business}
          hint="Towns, cities or counties. Press Enter after each one."
          error={err.service_areas}
        >
          <ChipsInput
            id="b-service_areas"
            value={v.service_areas}
            onChange={(next) => set("service_areas", next)}
            placeholder="Glendale"
            invalid={Boolean(err.service_areas)}
          />
        </Field>
      </Section>

      <Section title="What you do">
        <Field
          id="b-primary_category"
          label="Main category"
          hint="The one that best describes you, as on Google. For example “Air duct cleaning service”."
          error={err.primary_category}
        >
          <Input {...text("primary_category")} className={inputClass} />
        </Field>
        <Field
          id="b-other_categories"
          label="Other categories"
          optional
          error={err.other_categories}
        >
          <ChipsInput
            id="b-other_categories"
            value={v.other_categories}
            onChange={(next) => set("other_categories", next)}
            placeholder="HVAC contractor"
          />
        </Field>
        <Field
          id="b-services"
          label="Services you offer"
          hint="Press Enter after each one."
          error={err.services}
        >
          <ChipsInput
            id="b-services"
            value={v.services}
            onChange={(next) => set("services", next)}
            placeholder="Dryer vent cleaning"
          />
        </Field>
      </Section>

      <Section title="Opening hours" hint="Leave a day on “Choose…” if you're not sure.">
        <HoursEditor value={v.hours} onChange={(next) => set("hours", next)} />
      </Section>

      <Section title="About you">
        <Field id="b-year_founded" label="Year founded" optional error={err.year_founded}>
          <Input
            {...text("year_founded")}
            inputMode="numeric"
            maxLength={4}
            className={`${inputClass} w-32`}
          />
        </Field>
        <Field
          id="b-description"
          label="Short description"
          optional
          hint="A few sentences about your business, in your own words."
          error={err.description}
        >
          <Textarea {...text("description")} rows={4} maxLength={2000} className="text-base" />
        </Field>
      </Section>

      <Section title="Main contact" hint="Who we talk to about your account.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="b-contact_name" label="Name" error={err.contact_name}>
            <Input {...text("contact_name")} autoComplete="name" className={inputClass} />
          </Field>
          <Field id="b-contact_role" label="Role" optional error={err.contact_role}>
            <Input {...text("contact_role")} placeholder="Owner" className={inputClass} />
          </Field>
          <Field id="b-contact_email" label="Email" error={err.contact_email}>
            <Input
              {...text("contact_email")}
              type="email"
              autoComplete="email"
              className={inputClass}
            />
          </Field>
          <Field id="b-contact_phone" label="Mobile" optional error={err.contact_phone}>
            <Input {...text("contact_phone")} type="tel" inputMode="tel" className={inputClass} />
          </Field>
        </div>
        <Field id="b-preferred_contact" label="Best way to reach you" optional>
          <select
            id="b-preferred_contact"
            className={selectClass}
            disabled={readOnly}
            value={v.preferred_contact}
            onChange={(e) => set("preferred_contact", e.target.value)}
          >
            <option value="">No preference</option>
            {PREFERRED_CONTACT.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      </Section>
    </div>
  )
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        {hint && <p className="text-[15px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  )
}
