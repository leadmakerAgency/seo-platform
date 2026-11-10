"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { acceptInvite } from "../actions"
import type { WelcomeFormState } from "../schemas"

export function WelcomeForm({ email, defaultName }: { email: string; defaultName: string }) {
  const [state, action, pending] = useActionState<WelcomeFormState, FormData>(acceptInvite, {})
  const errors = state.fieldErrors ?? {}

  return (
    <form action={action} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" value={email} readOnly disabled />
        </Field>
        <Field data-invalid={Boolean(errors.fullName)}>
          <FieldLabel htmlFor="fullName">Full name</FieldLabel>
          <Input
            id="fullName"
            name="fullName"
            autoComplete="name"
            required
            defaultValue={state.values?.fullName ?? defaultName}
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={errors.fullName ? "fullName-error" : undefined}
          />
          <FieldError id="fullName-error">{errors.fullName}</FieldError>
        </Field>
        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="password">Choose a password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            autoFocus
            required
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-error" : "password-hint"}
          />
          {errors.password ? (
            <FieldError id="password-error">{errors.password}</FieldError>
          ) : (
            <FieldDescription id="password-hint">At least 10 characters.</FieldDescription>
          )}
        </Field>
        <Field data-invalid={Boolean(errors.confirmPassword)}>
          <FieldLabel htmlFor="confirmPassword">Type it again</FieldLabel>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={Boolean(errors.confirmPassword)}
            aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined}
          />
          <FieldError id="confirmPassword-error">{errors.confirmPassword}</FieldError>
        </Field>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Setting up…" : "Finish setting up"}
        </Button>
      </FieldGroup>
    </form>
  )
}
