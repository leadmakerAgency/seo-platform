import { z } from "zod"

import {
  AUTO_COMPLETE_KINDS,
  MAX_FILES,
  REQUEST_KINDS,
  type RequestKind,
  type RequestOptions,
} from "./constants"

export type { ActionResult } from "@/features/tasks/schemas"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.")
const optionalUuid = z
  .string()
  .transform((v) => v || null)
  .pipe(z.uuid().nullable())
const optionalUrl = (message: string) =>
  z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.url({ protocol: /^https?$/, error: message }).nullable())
const fileCount = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(
    z
      .number({ error: "Use a whole number." })
      .int("Use a whole number.")
      .min(1, "At least 1.")
      .max(MAX_FILES, `${MAX_FILES} at most.`)
      .nullable(),
  )

/** The New / Edit request form. Every field is a string so inputs stay controlled. */
export const requestFormSchema = z
  .object({
    clientId: z.uuid("Choose a client."),
    taskId: optionalUuid,
    kind: z.enum(REQUEST_KINDS as [RequestKind, ...RequestKind[]]),
    title: z
      .string()
      .trim()
      .min(3, "Say what you need in a few words.")
      .max(160, "Use 160 characters or fewer."),
    instructions: z
      .string()
      .trim()
      .max(4000, "Use 4,000 characters or fewer.")
      .transform((v) => v || null),
    internalNote: z
      .string()
      .trim()
      .max(2000, "Use 2,000 characters or fewer.")
      .transform((v) => v || null),
    dueOn: z
      .string()
      .transform((v) => v || null)
      .pipe(isoDate.nullable()),
    ownerId: optionalUuid,
    autoComplete: z.boolean(),
    answer: z.enum(["short", "long"]),
    accept: z.enum(["images", "pdf", "any"]),
    minFiles: fileCount,
    maxFiles: fileCount,
    amount: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : Number(v.replace(/[$,\s]/g, ""))))
      .pipe(
        z
          .number({ error: "Use a number, like 250." })
          .min(0, "Use a number, like 250.")
          .max(1_000_000, "That amount looks too big.")
          .nullable(),
      ),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Use a 3-letter code, like USD."),
    linkUrl: optionalUrl("Paste a full link starting with https://"),
    helpUrl: optionalUrl("Paste a full link starting with https://"),
    steps: z
      .array(z.object({ text: z.string().trim().max(300, "Keep each step under 300 characters.") }))
      .max(15, "Use 15 steps or fewer.")
      .transform((steps) => steps.map((s) => s.text).filter(Boolean)),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "files" && v.minFiles && v.maxFiles && v.minFiles > v.maxFiles) {
      ctx.addIssue({
        code: "custom",
        path: ["maxFiles"],
        message: "Must be at least the minimum.",
      })
    }
  })

export type RequestFormInput = z.input<typeof requestFormSchema>
export type RequestFormValues = z.output<typeof requestFormSchema>

/** Only the options that belong to the chosen kind are stored. */
export function buildOptions(v: RequestFormValues): RequestOptions {
  switch (v.kind) {
    case "question":
      return { answer: v.answer }
    case "files":
      return {
        accept: v.accept,
        min_files: v.minFiles ?? 1,
        ...(v.maxFiles ? { max_files: v.maxFiles } : {}),
      }
    case "approval":
      return {
        ...(v.linkUrl ? { link_url: v.linkUrl } : {}),
        ...(v.amount !== null ? { amount: v.amount, currency: v.currency } : {}),
      }
    case "action":
      return {
        ...(v.steps.length ? { steps: v.steps } : {}),
        ...(v.helpUrl ? { help_url: v.helpUrl } : {}),
      }
    default:
      return {}
  }
}

export function canAutoComplete(kind: RequestKind) {
  return AUTO_COMPLETE_KINDS.includes(kind)
}

export const askAgainSchema = z
  .string()
  .trim()
  .min(3, "Tell the client what's needed this time.")
  .max(1000, "Use 1,000 characters or fewer.")

// ---------------------------------------------------------------------------
// Portal (the client's side)
// ---------------------------------------------------------------------------
export const portalTokenSchema = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/)

export const portalRespondSchema = z.object({
  token: portalTokenSchema,
  requestId: z.uuid(),
  text: z.string().max(4000, "Keep it under 4,000 characters.").default(""),
  decision: z.enum(["approved", "changes_requested"]).nullable(),
  name: z.string().trim().max(80, "Keep your name under 80 characters.").default(""),
})

export type PortalRespondInput = z.input<typeof portalRespondSchema>

export const portalAttachSchema = z.object({
  token: portalTokenSchema,
  requestId: z.uuid(),
  path: z.string().min(40).max(400),
  name: z.string().min(1).max(200),
  mime: z.string().max(100),
  size: z.number().int().min(1),
})
