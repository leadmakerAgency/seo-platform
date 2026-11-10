"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { UserPlus } from "lucide-react"
import { useState, useTransition } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type AppRole } from "@/lib/roles"
import { inviteMember } from "../actions"
import { inviteMemberSchema, type InviteMemberInput } from "../schemas"
import { CopyLink } from "./copy-link"

const empty: InviteMemberInput = { fullName: "", email: "", role: "va" }

export function InviteMemberDialog() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const [result, setResult] = useState<{ link: string; email: string } | null>(null)

  const form = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: empty,
  })
  const { errors } = form.formState
  const role = useWatch({ control: form.control, name: "role" }) as AppRole

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      form.reset(empty)
      setFormError(null)
      setResult(null)
    }
  }

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      const res = await inviteMember(values)
      if (!res.ok) {
        setFormError(res.error)
        for (const [field, message] of Object.entries(res.fieldErrors ?? {})) {
          form.setError(field as keyof InviteMemberInput, { message })
        }
        return
      }
      setResult(res.data)
    })
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus />
          Invite member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Send them this link</DialogTitle>
              <DialogDescription>
                {result.email} is on the team as invited. Send this link by email, Slack or
                WhatsApp. It works once, and they set their own password.
              </DialogDescription>
            </DialogHeader>
            <CopyLink link={result.link} />
            <p className="text-xs text-muted-foreground">
              Lost or expired? Use “Copy new invite link” on their row.
            </p>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Invite a team member</DialogTitle>
              <DialogDescription>
                You&apos;ll get a sign-up link to send them. No email is sent automatically.
              </DialogDescription>
            </DialogHeader>
            <form id="invite-form" onSubmit={onSubmit} noValidate>
              <FieldGroup className="gap-4">
                <Field data-invalid={Boolean(errors.fullName)}>
                  <FieldLabel htmlFor="invite-name">Full name</FieldLabel>
                  <Input
                    id="invite-name"
                    autoFocus
                    aria-invalid={Boolean(errors.fullName)}
                    {...form.register("fullName")}
                  />
                  <FieldError errors={[errors.fullName]} />
                </Field>
                <Field data-invalid={Boolean(errors.email)}>
                  <FieldLabel htmlFor="invite-email">Email</FieldLabel>
                  <Input
                    id="invite-email"
                    type="email"
                    aria-invalid={Boolean(errors.email)}
                    {...form.register("email")}
                  />
                  <FieldError errors={[errors.email]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="invite-role">Role</FieldLabel>
                  <Controller
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="invite-role" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldDescription>{ROLE_DESCRIPTIONS[role]}</FieldDescription>
                </Field>
                {formError && (
                  <p role="alert" className="text-sm text-destructive">
                    {formError}
                  </p>
                )}
              </FieldGroup>
            </form>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" form="invite-form" disabled={pending}>
                {pending ? "Creating invite…" : "Create invite"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
