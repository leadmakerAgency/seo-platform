"use client"

import { useSearchParams } from "next/navigation"
import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { signIn } from "../actions"
import type { AuthFormState } from "../schemas"

export function LoginForm() {
  const searchParams = useSearchParams()
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signIn, {})
  const linkError = searchParams.get("error") === "link"

  return (
    <form action={action} noValidate>
      <input type="hidden" name="next" value={searchParams.get("next") ?? ""} />
      <FieldGroup>
        <Field data-invalid={Boolean(state.fieldErrors?.email)}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            defaultValue={state.values?.email}
            aria-invalid={Boolean(state.fieldErrors?.email)}
            aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
          />
          <FieldError id="email-error">{state.fieldErrors?.email}</FieldError>
        </Field>
        <Field data-invalid={Boolean(state.fieldErrors?.password)}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(state.fieldErrors?.password)}
            aria-describedby={state.fieldErrors?.password ? "password-error" : undefined}
          />
          <FieldError id="password-error">{state.fieldErrors?.password}</FieldError>
        </Field>
        {(state.error || linkError) && (
          <p role="alert" className="text-sm text-destructive">
            {state.error ?? "That link has expired or was already used. Sign in instead."}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </FieldGroup>
    </form>
  )
}
