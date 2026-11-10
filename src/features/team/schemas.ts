import { z } from "zod"

import { ROLES } from "@/lib/roles"

const role = z.enum(ROLES as [string, ...string[]], { error: "Choose a role." })

export const inviteMemberSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter their full name.")
    .max(80, "Use 80 characters or fewer."),
  email: z.email("Enter a valid email address.").transform((v) => v.toLowerCase()),
  role,
})

export type InviteMemberInput = z.input<typeof inviteMemberSchema>

export const memberIdSchema = z.uuid()

export const changeRoleSchema = z.object({ memberId: z.uuid(), role })

export const welcomeSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Enter your full name.")
      .max(80, "Use 80 characters or fewer."),
    password: z
      .string()
      .min(10, "Use at least 10 characters.")
      .max(72, "Use 72 characters or fewer."),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords don't match.",
  })

export type TeamActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>> }

export type WelcomeFormState = {
  error?: string
  fieldErrors?: Partial<Record<string, string>>
  values?: { fullName?: string }
}
