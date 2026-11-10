"use client"

import { MailCheck } from "lucide-react"
import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { createFirstAdmin } from "../actions"
import type { AuthFormState } from "../schemas"

export function SetupForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(createFirstAdmin, {})

  if (state.confirmEmailSentTo) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border p-5">
        <MailCheck className="size-5 text-primary" aria-hidden />
        <p className="text-sm font-medium">Check your email</p>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to {state.confirmEmailSentTo}. Open it in this browser to
          finish setting up your admin account.
        </p>
      </div>
    )
  }

  const errors = state.fieldErrors ?? {}

  return (
    <form action={action} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(errors.fullName)}>
          <FieldLabel htmlFor="fullName">Full name</FieldLabel>
          <Input
            id="fullName"
            name="fullName"
            autoComplete="name"
            autoFocus
            required
            defaultValue={state.values?.fullName}
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={errors.fullName ? "fullName-error" : undefined}
          />
          <FieldError id="fullName-error">{errors.fullName}</FieldError>
        </Field>
        <Field data-invalid={Boolean(errors.email)}>
          <FieldLabel htmlFor="email">Work email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={state.values?.email}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
          <FieldError id="email-error">{errors.email}</FieldError>
        </Field>
        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-error" : "password-hint"}
          />
          {/* The error repeats the rule, so show one or the other. */}
          {errors.password ? (
            <FieldError id="password-error">{errors.password}</FieldError>
          ) : (
            <FieldDescription id="password-hint">At least 10 characters.</FieldDescription>
          )}
        </Field>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating account…" : "Create admin account"}
        </Button>
      </FieldGroup>
    </form>
  )
}
