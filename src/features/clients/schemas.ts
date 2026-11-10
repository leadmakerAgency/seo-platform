import { z } from "zod"

import { COUNTRIES } from "@/lib/format"

const countryCodes = COUNTRIES.map((c) => c.code) as [string, ...string[]]

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || undefined)
    .optional()

/** Accepts "kingair.com", "www.kingair.com" or a full URL. */
function looksLikeWebsite(value: string) {
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
  country: z.enum(countryCodes, { error: "Choose a country." }),
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

export type AddClientResult =
  | { ok: true; slug: string; name: string }
  | { ok: false; error: string; fieldErrors?: Partial<Record<keyof AddClientInput, string>> }

/** "King Air Duct Cleaning" -> "king-air-duct-cleaning" */
export function slugify(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "client"
  )
}
