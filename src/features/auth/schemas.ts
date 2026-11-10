import { z } from "zod"

export const signInSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
})

export const setupSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(80, "Use 80 characters or fewer."),
  email: z.email("Enter a valid email address."),
  password: z
    .string()
    .min(10, "Use at least 10 characters.")
    .max(72, "Use 72 characters or fewer."),
})

/** Result shape every auth action returns to its form. */
export type AuthFormState = {
  error?: string
  fieldErrors?: Partial<Record<string, string>>
  /** Set after sign-up when Supabase sent a confirmation email. */
  confirmEmailSentTo?: string
  /**
   * What the user typed, sent back so the form can refill itself: React resets
   * a form after its action runs. Never includes the password.
   */
  values?: { email?: string; fullName?: string }
}

/** Only allow same-site relative paths as a post-login destination. */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback
  }
  return next
}
