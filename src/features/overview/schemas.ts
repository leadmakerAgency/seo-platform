import { z } from "zod"

import { addClientSchema } from "@/features/clients/schemas"
import { DELIVERABLES, PACKAGES } from "./constants"

const deliverable = z.enum(DELIVERABLES as [string, ...string[]], {
  error: "Choose what was delivered.",
})

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .transform((v) => v || undefined)
    .optional()

/** Work logged by hand. A negative quantity corrects a count and needs a reason. */
export const logWorkSchema = z
  .object({
    clientId: z.uuid(),
    kind: deliverable,
    quantity: z
      .number({ error: "Enter a number." })
      .int("Use a whole number.")
      .min(-50, "At least −50.")
      .max(50, "At most 50.")
      .refine((n) => n !== 0, "Can't be 0."),
    deliveredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
    title: z.string().trim().min(1, "Say what was done.").max(200, "Use 200 characters or fewer."),
    url: z
      .string()
      .trim()
      .max(500)
      .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
      .refine((v) => !v || /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v), "Enter a link like yelp.com/biz/…")
      .transform((v) => v || undefined)
      .optional(),
    note: optional(500),
  })
  .refine((v) => v.quantity > 0 || (v.note?.length ?? 0) >= 3, {
    path: ["note"],
    message: "Say why the count is being corrected.",
  })

export type LogWorkInput = z.input<typeof logWorkSchema>
export type LogWorkValues = z.output<typeof logWorkSchema>

const target = (max = 500) =>
  z
    .number({ error: "Enter a number." })
    .int("Use a whole number.")
    .min(0, "Can't be negative.")
    .max(max, `At most ${max}.`)

/** Edit details on the Overview: the add-client fields plus stage, start date, package and all targets. */
export const editClientSchema = addClientSchema
  .omit({ keywords: true, backlinks: true, articles: true })
  .extend({
    clientId: z.uuid(),
    stage: z.enum(["onboarding", "active", "paused", "churned"]),
    startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the start date."),
    package: z.enum(PACKAGES.map((p) => p.value) as [string, ...string[]]),
    keywords: target(),
    backlinks: target(),
    articles: target(200),
    gbpPosts: target(),
    reviewRequests: target(),
    aiFixes: target(),
  })

export type EditClientInput = z.input<typeof editClientSchema>
export type EditClientValues = z.output<typeof editClientSchema>

export function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {}
  for (const issue of issues) out[String(issue.path[0] ?? "form")] ??= issue.message
  return out
}
