import { z } from "zod"

/**
 * Shared validation for the onboarding wizard: run in the browser, in the
 * server action, and again as check constraints in the database.
 * Patches are partial: autosave sends only the fields that changed.
 */

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .transform((v) => v || null)
const phone = z
  .string()
  .trim()
  .refine(
    (v) => v === "" || /^[0-9+()\-. x]{5,40}$/.test(v),
    "Use digits, spaces and + ( ) - only.",
  )
  .transform((v) => v || null)
const email = z
  .string()
  .trim()
  .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Enter a valid email address.")
  .transform((v) => (v ? v.toLowerCase() : null))
const url = z
  .string()
  .trim()
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
  .refine(
    (v) => v === "" || (v.length <= 300 && /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v)),
    "Enter a web address, like example.com.",
  )
  .transform((v) => v || null)
const list = z
  .array(z.string().trim().min(1).max(120, "Keep each item under 120 characters."))
  .max(50, "Add 50 or fewer.")

const time = z.string().regex(/^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$/, "Use a time like 09:00.")
const slot = z.object({ open: time, close: time })
export const hoursSchema = z
  .object({
    mon: z.array(slot).max(4),
    tue: z.array(slot).max(4),
    wed: z.array(slot).max(4),
    thu: z.array(slot).max(4),
    fri: z.array(slot).max(4),
    sat: z.array(slot).max(4),
    sun: z.array(slot).max(4),
  })
  .partial()

export const businessPatchSchema = z
  .object({
    business_name: text(160),
    legal_name: text(160),
    phone,
    public_email: email,
    website: url,
    street: text(200),
    city: text(120),
    region: text(120),
    postal_code: text(20),
    country_code: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v === "" || /^[A-Z]{2}$/.test(v), "Choose a country.")
      .transform((v) => v || null),
    service_area_business: z.boolean(),
    service_areas: list,
    primary_category: text(120),
    other_categories: list,
    services: list,
    hours: hoursSchema.nullable(),
    year_founded: z
      .string()
      .trim()
      .refine(
        (v) => v === "" || (/^\d{4}$/.test(v) && +v >= 1800 && +v <= 2100),
        "Use a year, like 2012.",
      )
      .transform((v) => v || null),
    description: text(2000),
    contact_name: text(120),
    contact_role: text(120),
    contact_email: email,
    contact_phone: phone,
    preferred_contact: z
      .enum(["", "email", "phone", "text", "whatsapp"])
      .transform((v) => v || null),
    notes: text(2000),
  })
  .partial()
export type BusinessPatchInput = z.input<typeof businessPatchSchema>

const googleStatus = z.enum(["todo", "added", "no_access", "not_using", "help"])
export const googlePatchSchema = z
  .object({
    sc_status: googleStatus,
    sc_property: text(300),
    ga4_status: googleStatus,
    ga4_property: text(300),
    notes: text(1000),
  })
  .partial()
export type GooglePatchInput = z.input<typeof googlePatchSchema>

export const websitePatchSchema = z
  .object({
    platform: z
      .enum([
        "",
        "wordpress",
        "webflow",
        "shopify",
        "wix",
        "squarespace",
        "godaddy",
        "other",
        "none",
        "unknown",
      ])
      .transform((v) => v || null),
    url,
    managed_by: z.enum(["", "self", "developer", "agency", "unknown"]).transform((v) => v || null),
    developer_name: text(120),
    developer_email: email,
    access_status: z.enum(["todo", "invited_us", "login_in_vault", "later"]),
    notes: text(1000),
  })
  .partial()
export type WebsitePatchInput = z.input<typeof websitePatchSchema>

export const loginSchema = z.object({
  site_name: z
    .string()
    .trim()
    .min(1, "Which site is this?")
    .max(120, "Use 120 characters or fewer."),
  site_url: url,
  username: z
    .string()
    .trim()
    .min(1, "Enter the username or email.")
    .max(200, "Use 200 characters or fewer."),
  password: z.string().min(1, "Enter the password.").max(500, "Use 500 characters or fewer."),
  has_2fa: z.boolean(),
  notes: text(500),
})
export type LoginInput = z.input<typeof loginSchema>

/** "/king-air-duct-cleaning-8fK2aB…" or the bare token → the token (or null). */
export function tokenFromLink(link: string): string | null {
  const m = /(?:^|-)([A-Za-z0-9]{22})$/.exec(decodeURIComponent(link).trim())
  return m ? m[1] : null
}

export function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {}
  for (const issue of issues) out[String(issue.path[0] ?? "form")] ??= issue.message
  return out
}
