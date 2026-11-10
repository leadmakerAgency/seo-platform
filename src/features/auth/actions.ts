"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { safeNextPath, setupSchema, signInSchema, type AuthFormState } from "./schemas"

/** The non-secret fields to send back so a failed form keeps what the user typed. */
function echo(formData: FormData) {
  const text = (key: string) => {
    const value = formData.get(key)
    return typeof value === "string" ? value.slice(0, 200) : undefined
  }
  return { email: text("email"), fullName: text("fullName") }
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {}
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form")
    out[key] ??= issue.message
  }
  return out
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = echo(formData)
  const parsed = signInSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { values, fieldErrors: fieldErrors(parsed.error.issues) }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { values, error: "Confirm your email first. Check your inbox for the link." }
    }
    return { values, error: "That email and password don't match an account." }
  }

  redirect(safeNextPath(parsed.data.next))
}

/** Creates the very first account, which the database makes the admin. */
export async function createFirstAdmin(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = echo(formData)
  const parsed = setupSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { values, fieldErrors: fieldErrors(parsed.error.issues) }

  const supabase = await createSupabaseServerClient()
  const { data: setupRequired } = await supabase.rpc("setup_required")
  if (!setupRequired) {
    return { values, error: "Setup is already done. Sign in instead." }
  }

  const requestHeaders = await headers()
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http"
  const origin = `${protocol}://${host}`

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${origin}/auth/confirm?next=/dashboard`,
    },
  })

  if (error) return { values, error: error.message }

  // Email confirmation off: Supabase signs the user in straight away.
  if (data.session) redirect("/dashboard")

  return { confirmEmailSentTo: parsed.data.email }
}

export async function signOut() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect("/login")
}
