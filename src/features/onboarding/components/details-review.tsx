"use client"

import { Loader2 } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { countryName, formatRelative } from "@/lib/format"
import type { Tables } from "@/lib/supabase/database.types"
import { cn } from "@/lib/utils"
import { APPLY_FIELDS, DAYS, PREFERRED_CONTACT, type ApplyField, type Hours } from "../constants"
import type { OnboardingOverview } from "../queries"

type Details =
  | Partial<Tables<"onboarding_business_details">>
  | Partial<Tables<"client_business_profiles">>
  | null

const join = (parts: (string | null | undefined)[], sep = ", ") => parts.filter(Boolean).join(sep)

function hoursText(hours: unknown): string {
  const h = (hours ?? null) as Hours | null
  if (!h) return ""
  return DAYS.map(({ key, label }) => {
    const slots = h[key]
    if (!slots) return null
    const short = label.slice(0, 3)
    if (slots.length === 0) return `${short} closed`
    if (slots[0].open === "00:00" && slots[0].close === "24:00") return `${short} 24h`
    return `${short} ${slots.map((s) => `${s.open}–${s.close}`).join(", ")}`
  })
    .filter(Boolean)
    .join(" · ")
}

/** One comparable string per field group, so submitted and current can be compared. */
function valueOf(field: ApplyField, d: Details, client?: OnboardingOverview["client"]): string {
  if (!d && !client) return ""
  switch (field) {
    case "business_name":
      return d?.business_name ?? client?.name ?? ""
    case "legal_name":
      return d?.legal_name ?? ""
    case "phone":
      return d?.phone ?? ""
    case "public_email":
      return d?.public_email ?? ""
    case "website":
      return d?.website ?? client?.website ?? ""
    case "address":
      return join([
        d?.street,
        d?.city ?? client?.city,
        join([d?.region ?? client?.region, d?.postal_code], " "),
        d?.country_code || client?.country_code
          ? countryName((d?.country_code ?? client?.country_code)!)
          : null,
      ])
    case "service_areas":
      return join(
        [
          d?.service_area_business ? "Goes to customers (address hidden)" : null,
          (d?.service_areas ?? []).join(", "),
        ],
        " · ",
      )
    case "categories":
      return join(
        [d?.primary_category ?? client?.industry, (d?.other_categories ?? []).join(", ")],
        " · ",
      )
    case "services":
      return (d?.services ?? []).join(", ")
    case "hours":
      return hoursText(d?.hours)
    case "about":
      return join([d?.year_founded ? `Since ${d.year_founded}` : null, d?.description], " · ")
    case "contact":
      return join([
        d?.contact_name && d?.contact_role
          ? `${d.contact_name} (${d.contact_role})`
          : d?.contact_name,
        d?.contact_email,
        d?.contact_phone,
        PREFERRED_CONTACT.find((p) => p.value === d?.preferred_contact)?.label
          ? `prefers ${PREFERRED_CONTACT.find((p) => p.value === d?.preferred_contact)!.label.toLowerCase()}`
          : null,
      ])
  }
}

/** Submitted business details next to the current profile; apply the ticked ones. */
export function DetailsReview({
  clientId,
  submitted,
  profile,
  client,
  canManage,
  now,
  onApply,
}: {
  clientId: string
  submitted: OnboardingOverview["submitted"]
  profile: OnboardingOverview["profile"]
  client: OnboardingOverview["client"]
  canManage: boolean
  now: Date
  onApply: (clientId: string, fields: string[]) => Promise<{ ok: boolean; error?: string }>
}) {
  const rows = APPLY_FIELDS.map((f) => {
    const sent = valueOf(f.key, submitted)
    const current = valueOf(f.key, profile, client)
    return { ...f, sent, current, differs: Boolean(sent) && sent !== current }
  })
  const [chosen, setChosen] = useState<Set<ApplyField>>(
    () => new Set(rows.filter((r) => r.differs).map((r) => r.key)),
  )
  const [pending, startTransition] = useTransition()

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold tracking-tight">Business details</h2>
          <p className="text-sm text-muted-foreground">
            What the client sent, next to the profile we use. Nothing changes until you apply it.
            {submitted?.applied_at
              ? ` Last applied ${formatRelative(submitted.applied_at, now)}.`
              : ""}
          </p>
        </div>
        {canManage && submitted && (
          <Button
            disabled={pending || chosen.size === 0}
            onClick={() =>
              startTransition(async () => {
                const r = await onApply(clientId, [...chosen])
                if (!r.ok) return void toast.error(r.error ?? "Couldn't apply.")
                toast.success(
                  `Applied ${chosen.size} ${chosen.size === 1 ? "field" : "fields"} to the profile`,
                )
                setChosen(new Set())
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            Apply {chosen.size || ""} to profile
          </Button>
        )}
      </div>

      {!submitted ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          The client hasn&apos;t filled in any business details yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                {canManage && (
                  <th className="w-10 py-2 pl-4 text-left font-medium" aria-label="Apply" />
                )}
                <th className="py-2 pl-4 text-left font-medium">Field</th>
                <th className="py-2 pl-4 text-left font-medium">Client sent</th>
                <th className="py-2 pr-4 pl-4 text-left font-medium">Current profile</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.key} className={cn(r.differs && "bg-brand-soft/30")}>
                  {canManage && (
                    <td className="py-2.5 pl-4 align-top">
                      <Checkbox
                        aria-label={`Apply ${r.label}`}
                        disabled={!r.sent}
                        checked={chosen.has(r.key)}
                        onCheckedChange={(c) =>
                          setChosen((s) => {
                            const next = new Set(s)
                            if (c === true) next.add(r.key)
                            else next.delete(r.key)
                            return next
                          })
                        }
                      />
                    </td>
                  )}
                  <td className="py-2.5 pl-4 align-top font-medium whitespace-nowrap">{r.label}</td>
                  <td className="max-w-[320px] py-2.5 pl-4 align-top break-words">
                    {r.sent || <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="max-w-[320px] py-2.5 pr-4 pl-4 align-top break-words text-muted-foreground">
                    {r.current || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
