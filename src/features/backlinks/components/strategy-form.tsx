"use client"

import { Check, CircleAlert, Plus } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { ChipsInput } from "@/components/common/chips-input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { saveBrief } from "../actions"
import {
  BUYER_META,
  BUYERS,
  defaultSiteTypes,
  OFFERING_META,
  OFFERINGS,
  REACH_META,
  REACHES,
  SITE_TYPE_LABELS,
  SITE_TYPES,
  trustedSiteIdeas,
  type Brief,
  type SiteType,
} from "../brief"
import { adjacentIdeas } from "../topic-ideas"

type Values = Brief

/** The strategy brief form (docs/plans/backlinks/07-strategy-brief.md). */
export function StrategyForm({
  clientId,
  backHref,
  initial,
  isNew,
  ideasText,
  canEdit,
}: {
  clientId: string
  backHref: string
  initial: Values
  isNew: boolean
  /** Services, category and industry: what the idea chips are based on. */
  ideasText: string
  canEdit: boolean
}) {
  const router = useRouter()
  const [v, setV] = useState<Values>(initial)
  const [typesTouched, setTypesTouched] = useState(!isNew)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setV((prev) => {
      const next = { ...prev, [key]: value }
      // Kinds of sites follow reach / buyer / offering until someone changes them by hand.
      if (!typesTouched && (key === "reach" || key === "buyer" || key === "offering")) {
        next.site_types = defaultSiteTypes(next)
      }
      return next
    })
    setErrors((e) => ({ ...e, [key]: "" }))
  }

  const topics = v.core_topics.length + v.adjacent_topics.length
  const ideas = adjacentIdeas(ideasText, [...v.core_topics, ...v.adjacent_topics]).slice(0, 12)
  const siteIdeas = trustedSiteIdeas(v).filter((d) => !v.trusted_sites.includes(d))

  function save() {
    setFormError(null)
    startTransition(async () => {
      const r = await saveBrief(clientId, v)
      if (!r.ok) {
        setFormError(r.error)
        setErrors(("fieldErrors" in r && r.fieldErrors) || {})
        return
      }
      toast.success(`Brief saved (version ${r.data?.version ?? 1})`)
      router.push(backHref)
    })
  }

  const disabled = !canEdit || pending

  return (
    <div className="flex flex-col">
      <div className="flex max-w-4xl flex-col gap-10 pb-10">
        <Section n={1} title="Who the client sells to" description="This decides which kinds of sites are searched and how they're ranked.">
          <MultiChoice
            label="Where the customers are"
            options={REACHES.map((r) => ({ value: r, ...REACH_META[r] }))}
            value={v.reach}
            onChange={(x) => set("reach", x)}
            disabled={disabled}
            error={errors.reach}
            note={
              v.reach.includes("local") && v.reach.length > 1
                ? "Local and wider customers: each place's own searches, plus topic searches from your countries. Add a city or region and a country to the places."
                : undefined
            }
          />
          <MultiChoice
            label="Who buys"
            options={BUYERS.map((b) => ({ value: b, ...BUYER_META[b] }))}
            value={v.buyer}
            onChange={(x) => set("buyer", x)}
            disabled={disabled}
            error={errors.buyer}
          />
          <MultiChoice
            label="What the client sells"
            options={OFFERINGS.map((o) => ({ value: o, ...OFFERING_META[o] }))}
            value={v.offering}
            onChange={(x) => set("offering", x)}
            disabled={disabled}
            error={errors.offering}
          />
          <Field data-invalid={Boolean(errors.audience)}>
            <FieldLabel htmlFor="b-audience">The buyers in one sentence (optional)</FieldLabel>
            <Textarea
              id="b-audience"
              rows={2}
              maxLength={300}
              disabled={disabled}
              value={v.audience}
              onChange={(e) => set("audience", e.target.value)}
              placeholder="Homeowners in the Phoenix area planning backyard projects"
            />
            <FieldDescription>Claude uses this to judge whether a site&apos;s readers are the client&apos;s buyers.</FieldDescription>
            <FieldError>{errors.audience}</FieldError>
          </Field>
        </Section>

        <Section
          n={2}
          title="Topics"
          description={`The client's niche plus the neighbouring topics its buyers read about. Blogs on neighbouring topics link out more readily than competitors. ${topics} of 10–15 so far.`}
        >
          <Field data-invalid={Boolean(errors.core_topics)}>
            <FieldLabel htmlFor="b-core">Core topics (1–5)</FieldLabel>
            <ChipsInput
              id="b-core"
              values={v.core_topics}
              onChange={(x) => set("core_topics", x.map((t) => t.toLowerCase()))}
              max={5}
              maxLength={60}
              placeholder="deck restoration"
              invalid={Boolean(errors.core_topics)}
            />
            <FieldDescription>The client&apos;s own services, the way people search for them.</FieldDescription>
            <FieldError>{errors.core_topics}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.adjacent_topics)}>
            <FieldLabel htmlFor="b-adjacent">Adjacent topics (up to 12)</FieldLabel>
            <ChipsInput
              id="b-adjacent"
              values={v.adjacent_topics}
              onChange={(x) => set("adjacent_topics", x.map((t) => t.toLowerCase()))}
              max={12}
              maxLength={60}
              placeholder="backyard design"
              invalid={Boolean(errors.adjacent_topics)}
            />
            {canEdit && ideas.length > 0 && v.adjacent_topics.length < 12 && (
              <IdeaChips
                label="Ideas"
                ideas={ideas}
                onPick={(t) => set("adjacent_topics", [...v.adjacent_topics, t].slice(0, 12))}
              />
            )}
            <FieldError>{errors.adjacent_topics}</FieldError>
          </Field>
          {topics < 5 && (
            <p className="flex items-center gap-1.5 text-[13px] text-warning">
              <CircleAlert className="size-3.5" aria-hidden />
              Find places needs at least 5 topics in total (10–15 is best).
            </p>
          )}
        </Section>

        <Section n={3} title="Kinds of sites" description="Searches run only for the kinds ticked. The defaults follow the answers in section 1.">
          <div className="grid gap-2 sm:grid-cols-2">
            {SITE_TYPES.map((t) => (
              <Label key={t} className="flex items-center gap-2 font-normal">
                <Checkbox
                  checked={v.site_types.includes(t)}
                  disabled={disabled}
                  onCheckedChange={(c) => {
                    setTypesTouched(true)
                    set(
                      "site_types",
                      c
                        ? SITE_TYPES.filter((x) => x === t || v.site_types.includes(x))
                        : v.site_types.filter((x) => x !== t),
                    )
                  }}
                />
                {SITE_TYPE_LABELS[t as SiteType]}
              </Label>
            ))}
          </div>
          {canEdit && (
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTypesTouched(false)
                  set("site_types", defaultSiteTypes(v))
                }}
              >
                Use the defaults for this client
              </Button>
            </div>
          )}
          <FieldError>{errors.site_types}</FieldError>
        </Section>

        <Section
          n={4}
          title="Sites the buyers trust, and competitors"
          description="Trusted sites are added to the Basics tab. Competitors are always hidden from the results."
        >
          <Field data-invalid={Boolean(errors.trusted_sites)}>
            <FieldLabel htmlFor="b-trusted">Sites the buyers trust (optional)</FieldLabel>
            <ChipsInput
              id="b-trusted"
              values={v.trusted_sites}
              onChange={(x) => set("trusted_sites", x)}
              max={20}
              maxLength={120}
              placeholder="clutch.co"
              invalid={Boolean(errors.trusted_sites)}
            />
            {canEdit && siteIdeas.length > 0 && (
              <IdeaChips label="Ideas" ideas={siteIdeas} onPick={(d) => set("trusted_sites", [...v.trusted_sites, d].slice(0, 20))} />
            )}
            <FieldError>{errors.trusted_sites}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.competitors)}>
            <FieldLabel htmlFor="b-competitors">Competitors (optional)</FieldLabel>
            <ChipsInput
              id="b-competitors"
              values={v.competitors}
              onChange={(x) => set("competitors", x)}
              max={20}
              maxLength={120}
              placeholder="competitor.com"
              invalid={Boolean(errors.competitors)}
            />
            <FieldError>{errors.competitors}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.exclude_terms)}>
            <FieldLabel htmlFor="b-exclude">Leave out results that mention (optional)</FieldLabel>
            <ChipsInput
              id="b-exclude"
              values={v.exclude_terms}
              onChange={(x) => set("exclude_terms", x.map((t) => t.toLowerCase()))}
              max={30}
              maxLength={60}
              placeholder="jobs"
            />
            <FieldError>{errors.exclude_terms}</FieldError>
          </Field>
        </Section>

        <Section n={5} title="Notes for the review" description="Anything else that decides whether a site is a good fit (optional).">
          <Field data-invalid={Boolean(errors.notes)}>
            <FieldLabel htmlFor="b-notes" className="sr-only">
              Notes
            </FieldLabel>
            <Textarea
              id="b-notes"
              rows={3}
              maxLength={1000}
              disabled={disabled}
              value={v.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Premium brand: skip coupon and deal sites. Spanish-language sites are fine."
            />
            <FieldError>{errors.notes}</FieldError>
          </Field>
        </Section>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 -mb-6 border-t bg-background px-4 py-3 md:-mx-8 md:-mb-8 md:px-8">
        <div className="flex flex-wrap items-center justify-end gap-3">
          {formError && (
            <p className="mr-auto flex items-center gap-1.5 text-sm text-danger" role="alert">
              <CircleAlert className="size-4" aria-hidden />
              {formError}
            </p>
          )}
          <Button asChild variant="outline">
            <Link href={backHref}>{canEdit ? "Cancel" : "Back"}</Link>
          </Button>
          {canEdit && (
            <Button onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save brief"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ n, title, description, children }: { n: number; title: string; description: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5 border-b pb-2">
        <h2 className="text-[15px] leading-[22px] font-semibold">
          <span className="text-muted-foreground tabular-nums">{n}.</span> {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

/** Tick one or more cards. The last ticked card can't be unticked (at least one is needed). */
function MultiChoice<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  error,
  note,
}: {
  label: string
  options: { value: T; label: string; help: string }[]
  value: T[]
  onChange: (v: T[]) => void
  disabled?: boolean
  error?: string
  note?: string
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">
        {label} <span className="font-normal text-muted-foreground">(one or more)</span>
      </legend>
      <div className={cn("grid gap-2", options.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
        {options.map((o) => {
          const active = value.includes(o.value)
          const last = active && value.length === 1
          return (
            <button
              key={o.value}
              type="button"
              role="checkbox"
              aria-checked={active}
              disabled={disabled}
              title={last ? "Keep at least one ticked" : undefined}
              onClick={() => {
                if (last) return
                onChange(active ? value.filter((x) => x !== o.value) : options.map((x) => x.value).filter((x) => x === o.value || value.includes(x)))
              }}
              className={cn(
                "flex gap-2.5 rounded-lg border bg-card p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:opacity-60",
                active ? "border-primary bg-brand-soft" : "hover:bg-muted/60",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background",
                )}
              >
                {active && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-sm font-medium">{o.label}</span>
                <span className="text-xs text-muted-foreground">{o.help}</span>
              </span>
            </button>
          )
        })}
      </div>
      {note && <p className="text-[13px] text-muted-foreground">{note}</p>}
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}

function IdeaChips({ label, ideas, onPick }: { label: string; ideas: string[]; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      {label}:
      {ideas.map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPick(i)}
          className="inline-flex items-center gap-0.5 rounded-sm border border-dashed px-1.5 py-0.5 hover:border-primary hover:text-foreground"
        >
          <Plus className="size-3" aria-hidden />
          {i}
        </button>
      ))}
    </div>
  )
}
