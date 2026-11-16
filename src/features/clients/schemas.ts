import { z } from "zod"

import { isCountryCode } from "@/lib/countries"
import { regionList, regionRequired } from "@/lib/regions"

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .transform((v) => v || undefined)
    .optional()

/** Accepts "kingair.com", "www.kingair.com" or a full URL. */
export function looksLikeWebsite(value: string) {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    return url.hostname.includes(".") && !url.hostname.startsWith(".")
  } catch {
    return false
  }
}

export function normalizeWebsite(value: string) {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`
  const url = new URL(withProtocol)
  return `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}`.toLowerCase()
}

const planNumber = (max: number) =>
  z
    .number({ error: "Enter a number." })
    .int("Use a whole number.")
    .min(0, "Can't be negative.")
    .max(max, `At most ${max}.`)

const country = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isCountryCode, "Choose a country.")

/** Edit details on the Overview (and the base of its schema). */
export const addClientSchema = z.object({
  name: z.string().trim().min(2, "Enter the business name.").max(120),
  website: z
    .string()
    .trim()
    .min(1, "Enter the website.")
    .max(200)
    .refine(looksLikeWebsite, "Enter a website like kingairductcleaning.com."),
  city: z.string().trim().min(1, "Enter the city.").max(80),
  region: optionalText(80),
  country,
  industry: optionalText(80),
  ownerId: z
    .string()
    .transform((v) => v || undefined)
    .pipe(z.uuid().optional())
    .optional(),
  keywords: planNumber(500),
  backlinks: planNumber(500),
  articles: planNumber(200),
})

export type AddClientInput = z.input<typeof addClientSchema>
export type AddClientValues = z.output<typeof addClientSchema>

const phone = z
  .string()
  .trim()
  .refine((v) => v === "" || /^[0-9+()\-. x]{5,40}$/.test(v), "Use digits, spaces and + ( ) - only.")
const email = (required: string | null) =>
  z
    .string()
    .trim()
    .max(254)
    .refine((v) => (required ? v !== "" : true), required ?? "")
    .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Enter a valid email address.")
const chips = (max: number, each: number) =>
  z
    .array(z.string().trim().min(1).max(each, `Keep each one under ${each} characters.`))
    .max(max, `Add ${max} or fewer.`)

export const PACKAGE_VALUES = ["seo", "geo", "seo_geo", "custom"] as const
export const PREFERRED_CONTACT = ["email", "phone", "text", "whatsapp"] as const

/**
 * The Add client page. Essentials are required; everything else is optional and pre-fills
 * the client's onboarding link. Checked in the browser, in the action and again in the
 * database (create_client + table checks).
 */
export const newClientSchema = z
  .object({
    // 1. Business
    name: z.string().trim().min(2, "Enter the business name.").max(120, "Use 120 characters or fewer."),
    website: z.string().trim().max(200),
    noWebsite: z.boolean(),
    industry: z.string().trim().min(2, "Enter the main category, like “Air duct cleaning”.").max(120),
    phone,
    publicEmail: email(null),
    // 2. Location
    country,
    street: z.string().trim().max(200),
    city: z.string().trim().min(1, "Enter the city.").max(80, "Use 80 characters or fewer."),
    region: z.string().trim().max(80),
    postalCode: z.string().trim().max(20, "Use 20 characters or fewer."),
    serviceAreaBusiness: z.boolean(),
    serviceAreas: chips(50, 120),
    // 3. Services
    services: chips(50, 120).min(1, "Add at least one service."),
    otherCategories: chips(20, 120),
    yearFounded: z
      .string()
      .trim()
      .refine((v) => v === "" || (/^\d{4}$/.test(v) && +v >= 1800 && +v <= new Date().getFullYear()), "Use a year, like 2012."),
    description: z.string().trim().max(2000, "Use 2,000 characters or fewer."),
    // 4. Main contact
    contactName: z.string().trim().min(2, "Enter the contact's name.").max(120),
    contactRole: z.string().trim().max(120),
    contactEmail: email("Enter the contact's email; the onboarding link goes there."),
    contactPhone: phone,
    preferredContact: z.enum(["", ...PREFERRED_CONTACT]),
    // 5. Plan
    package: z.enum(PACKAGE_VALUES),
    startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the start date."),
    ownerId: z.string(),
    keywords: planNumber(500),
    backlinks: planNumber(500),
    articles: planNumber(200),
    gbpPosts: planNumber(500),
    reviewRequests: planNumber(500),
    aiFixes: planNumber(500),
    // 6. Onboarding
    createLink: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!v.noWebsite) {
      if (!v.website) ctx.addIssue({ code: "custom", path: ["website"], message: "Enter the website, or tick “No website yet”." })
      else if (!looksLikeWebsite(v.website))
        ctx.addIssue({ code: "custom", path: ["website"], message: "Enter a website like kingairductcleaning.com." })
    }
    const list = regionList(v.country)
    if (regionRequired(v.country) && !v.region) {
      ctx.addIssue({ code: "custom", path: ["region"], message: "Choose the state or province." })
    } else if (list && v.region && !list.some((r) => r.code === v.region)) {
      ctx.addIssue({ code: "custom", path: ["region"], message: "Choose from the list." })
    }
    if (v.ownerId && !/^[0-9a-f-]{36}$/i.test(v.ownerId)) {
      ctx.addIssue({ code: "custom", path: ["ownerId"], message: "Choose a team member." })
    }
  })

export type NewClientInput = z.input<typeof newClientSchema>
export type NewClientValues = z.output<typeof newClientSchema>
export type NewClientField = keyof NewClientInput

export type NewClientResult =
  | { ok: true; slug: string; name: string; withLink: boolean; contactName: string }
  | { ok: false; error: string; fieldErrors?: Partial<Record<NewClientField, string>> }

/** Slugs that are page routes under /clients, so a client can never be named like them. */
const RESERVED_SLUGS = new Set(["new", "search"])

/** "King Air Duct Cleaning" -> "king-air-duct-cleaning" */
export function slugify(name: string) {
  const slug =
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 55)
      .replace(/-+$/g, "") || "client"
  return RESERVED_SLUGS.has(slug) ? `${slug}-client` : slug
}
