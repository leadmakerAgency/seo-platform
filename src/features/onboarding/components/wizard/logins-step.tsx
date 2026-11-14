"use client"

import { Eye, EyeOff, Loader2, Lock, Plus, Trash2 } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { SUGGESTED_LOGIN_SITES, type StepStatuses } from "../../constants"
import type { OnboardingData } from "../../public"
import { addLogin, removeLogin, skipLogins } from "../../public-actions"
import { Field, inputClass } from "./fields"

const EMPTY = { site_name: "", site_url: "", username: "", password: "", has_2fa: false, notes: "" }

export function LoginsStep({
  token,
  logins: initialLogins,
  skipped: initialSkipped,
  readOnly,
  onSteps,
}: {
  token: string
  logins: OnboardingData["logins"]
  skipped: boolean
  readOnly: boolean
  onSteps: (s: StepStatuses) => void
}) {
  const [logins, setLogins] = useState(initialLogins)
  const [skipped, setSkipped] = useState(initialSkipped)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})
  const [showPassword, setShowPassword] = useState(false)
  const [pending, startTransition] = useTransition()
  const [removing, setRemoving] = useState<string | null>(null)

  function add() {
    setErrors({})
    startTransition(async () => {
      const r = await addLogin(token, form)
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {})
        toast.error(r.error)
        return
      }
      setLogins((l) => [
        ...l,
        {
          id: r.data.id,
          site_name: form.site_name.trim(),
          site_url: form.site_url.trim() || null,
          username: form.username.trim(),
          has_2fa: form.has_2fa,
        },
      ])
      setForm(EMPTY)
      setShowPassword(false)
      setSkipped(false)
      onSteps(r.data.steps)
      toast.success("Saved securely")
    })
  }

  function remove(id: string) {
    setRemoving(id)
    startTransition(async () => {
      const r = await removeLogin(token, id)
      setRemoving(null)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setLogins((l) => l.filter((x) => x.id !== id))
      onSteps(r.data.steps)
    })
  }

  function toggleSkip(next: boolean) {
    startTransition(async () => {
      const r = await skipLogins(token, next)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setSkipped(next)
      onSteps(r.data.steps)
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="text-[15px] text-muted-foreground">
        Some sites (like Yelp or Bing Places) have no way to give us access, so we need a login to
        keep your listing up to date. Passwords are encrypted, only your account team can open them,
        and every time someone does it&apos;s recorded.
      </p>

      {logins.length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border bg-card">
          {logins.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-3">
              <Lock className="size-4 shrink-0 text-success" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-medium">{l.site_name}</span>
                <span className="truncate text-sm text-muted-foreground">
                  {l.username} · saved securely{l.has_2fa ? " · uses 2-step codes" : ""}
                </span>
              </div>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${l.site_name}`}
                  disabled={pending}
                  onClick={() => remove(l.id)}
                >
                  {removing === l.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <section className="flex flex-col gap-5 rounded-lg border bg-card p-4">
          <h3 className="text-lg font-semibold tracking-tight">Add a login</h3>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="l-site" label="Site" error={errors.site_name}>
              <Input
                id="l-site"
                list="login-site-suggestions"
                value={form.site_name}
                onChange={(e) => setForm((f) => ({ ...f, site_name: e.target.value }))}
                placeholder="Yelp for Business"
                className={inputClass}
              />
              <datalist id="login-site-suggestions">
                {SUGGESTED_LOGIN_SITES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field id="l-url" label="Login page" optional error={errors.site_url}>
              <Input
                id="l-url"
                inputMode="url"
                value={form.site_url}
                onChange={(e) => setForm((f) => ({ ...f, site_url: e.target.value }))}
                placeholder="biz.yelp.com"
                className={inputClass}
              />
            </Field>
            <Field id="l-user" label="Username or email" error={errors.username}>
              <Input
                id="l-user"
                autoComplete="off"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field id="l-pass" label="Password" error={errors.password}>
              <div className="flex gap-2">
                <Input
                  id="l-pass"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className={inputClass}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11 shrink-0"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </Field>
          </div>
          <label className="flex items-start gap-3 text-[15px]">
            <Checkbox
              checked={form.has_2fa}
              onCheckedChange={(c) => setForm((f) => ({ ...f, has_2fa: c === true }))}
              className="mt-0.5"
            />
            <span>
              This account asks for a code (2-step verification).
              <span className="block text-sm text-muted-foreground">
                We&apos;ll send you a request when we need the code.
              </span>
            </span>
          </label>
          <Field id="l-notes" label="Notes" optional error={errors.notes}>
            <Input
              id="l-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <Button
            size="lg"
            className="h-11 w-full sm:w-fit"
            disabled={pending || !form.site_name.trim() || !form.username.trim() || !form.password}
            onClick={add}
          >
            {pending && !removing ? <Loader2 className="animate-spin" /> : <Plus />}
            Save login securely
          </Button>
        </section>
      )}

      {!readOnly && logins.length === 0 && (
        <label className="flex items-start gap-3 text-[15px]">
          <Checkbox
            checked={skipped}
            onCheckedChange={(c) => toggleSkip(c === true)}
            className="mt-0.5"
          />
          <span>We don&apos;t have other logins to share.</span>
        </label>
      )}
    </div>
  )
}
