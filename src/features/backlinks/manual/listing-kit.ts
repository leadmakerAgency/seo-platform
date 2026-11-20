/**
 * The listing kit: the client's details as VAs copy them into every directory, so the name,
 * address and phone (NAP) stay identical everywhere. Pure.
 */

export type KitProfile = {
  business_name: string | null
  legal_name: string | null
  street: string | null
  city: string | null
  region: string | null
  postal_code: string | null
  country_code: string | null
  phone: string | null
  website: string | null
  public_email: string | null
  primary_category: string | null
  other_categories: string[]
  services: string[]
  service_areas: string[]
  service_area_business: boolean
  description: string | null
  year_founded: number | null
  hours: unknown
}

export type KitField = { key: string; label: string; value: string; note?: string }

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const

/** "Mon 8:00–17:00; Tue …" from the profile's hours JSON (best effort; unknown shapes are skipped). */
export function hoursText(hours: unknown): string {
  if (!hours || typeof hours !== "object") return ""
  const h = hours as Record<string, unknown>
  const parts: string[] = []
  for (const d of DAYS) {
    const v = h[d] ?? h[d.slice(0, 3)]
    if (v === undefined) continue
    const label = d.slice(0, 1).toUpperCase() + d.slice(1, 3)
    if (v === null || v === false || v === "closed") parts.push(`${label} closed`)
    else if (typeof v === "string") parts.push(`${label} ${v}`)
    else if (typeof v === "object") {
      const o = v as Record<string, unknown>
      if (o.closed === true) parts.push(`${label} closed`)
      else if (typeof o.open === "string" && typeof o.close === "string")
        parts.push(`${label} ${o.open}–${o.close}`)
    }
  }
  return parts.join("; ")
}

/** Cut at a word boundary, no more than `max` characters. */
export function cutAt(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max + 1)
  const at = cut.lastIndexOf(" ")
  return `${(at > max * 0.6 ? cut.slice(0, at) : t.slice(0, max)).replace(/[,;:.\s]+$/, "")}`
}

export function listingKit(
  profile: KitProfile | null,
  fallback: {
    name: string
    website: string | null
    city: string | null
    region: string | null
    country: string
  },
): { fields: KitField[]; missing: string[] } {
  const p = profile
  const name = p?.business_name?.trim() || fallback.name
  const address = [
    p?.street,
    p?.city ?? fallback.city,
    [p?.region ?? fallback.region, p?.postal_code].filter(Boolean).join(" "),
  ]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join(", ")
  const website = p?.website?.trim() || fallback.website || ""
  const desc = p?.description?.trim() ?? ""
  const fields: KitField[] = [
    { key: "name", label: "Business name", value: name },
    {
      key: "address",
      label: "Address",
      value: address,
      note: p?.service_area_business
        ? "Service-area business: hide the street where the site allows it"
        : undefined,
    },
    { key: "phone", label: "Phone", value: p?.phone?.trim() ?? "" },
    { key: "website", label: "Website", value: website },
    { key: "email", label: "Public email", value: p?.public_email?.trim() ?? "" },
    { key: "category", label: "Primary category", value: p?.primary_category?.trim() ?? "" },
    { key: "categories", label: "Other categories", value: (p?.other_categories ?? []).join(", ") },
    { key: "services", label: "Services", value: (p?.services ?? []).join(", ") },
    { key: "areas", label: "Service areas", value: (p?.service_areas ?? []).join(", ") },
    { key: "hours", label: "Hours", value: hoursText(p?.hours) },
    { key: "founded", label: "Year founded", value: p?.year_founded ? String(p.year_founded) : "" },
    { key: "desc_short", label: "Short description (160)", value: desc ? cutAt(desc, 160) : "" },
    { key: "desc_medium", label: "Description (250)", value: desc ? cutAt(desc, 250) : "" },
    { key: "desc_long", label: "Full description", value: desc },
  ]
  const missing: string[] = []
  if (!p)
    missing.push("There's no business profile yet. Fill it in from Edit details or onboarding.")
  else {
    if (!p.phone) missing.push("No phone number: most directories need one.")
    if (!p.street && !p.service_area_business)
      missing.push("No street address: maps and citation sites need one.")
    if (!website) missing.push("No website.")
    if (!p.primary_category) missing.push("No primary category.")
    if (!desc) missing.push("No description.")
  }
  return { fields, missing }
}
