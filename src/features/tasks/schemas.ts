import { z } from "zod"

import { TASK_PRIORITIES, TASK_REPEATS, TASK_STATUSES, TASK_TYPES } from "./constants"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.")

export const taskFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Describe the task in a few words.")
    .max(160, "Use 160 characters or fewer."),
  description: z
    .string()
    .trim()
    .max(4000, "Use 4,000 characters or fewer.")
    .transform((v) => v || null),
  type: z.enum(TASK_TYPES as [string, ...string[]]),
  priority: z.enum(TASK_PRIORITIES as [string, ...string[]]),
  repeat: z.enum(TASK_REPEATS as [string, ...string[]]),
  assigneeId: z
    .string()
    .transform((v) => v || null)
    .pipe(z.uuid().nullable()),
  dueOn: z
    .string()
    .transform((v) => v || null)
    .pipe(isoDate.nullable()),
  steps: z
    .array(z.object({ text: z.string().trim().max(300, "Keep each step under 300 characters.") }))
    .max(30, "Use 30 steps or fewer.")
    .transform((steps) => steps.map((s) => s.text).filter(Boolean)),
  clientIds: z.array(z.uuid()).max(500, "Pick 500 clients or fewer."),
})

export type TaskFormInput = z.input<typeof taskFormSchema>
export type TaskFormValues = z.output<typeof taskFormSchema>

export const statusSchema = z.enum(TASK_STATUSES as [string, ...string[]])
export const prioritySchema = z.enum(TASK_PRIORITIES as [string, ...string[]])

export const commentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write a comment first.")
    .max(4000, "Keep it under 4,000 characters."),
  mentions: z.array(z.uuid()).max(20),
})

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>> }
