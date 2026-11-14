"use client"

import { Check, Copy, Eye, EyeOff, Loader2, Lock, Plus, Trash2 } from "lucide-react"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { formatRelative } from "@/lib/format"
import { addTeamLogin, removeTeamLogin, revealLogin } from "../actions"
import type { StoredLogin } from "../queries"

const HIDE_AFTER_MS = 30_000

/** Logins for sites with no API. Passwords stay in Supabase Vault until someone reveals one (logged). */
export function LoginsVault({
  clientId,
  logins,
  canManage,
  canReveal,
  now,
}: {
  clientId: string
  logins: StoredLogin[]
  canManage: boolean
  canReveal: boolean
  now: Date
}) {
  const [adding, setAdding] = useState(false)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold tracking-tight">Logins vault</h2>
          <p className="text-sm text-muted-foreground">
            Encrypted in Supabase Vault. Every reveal is recorded in the history.
          </p>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus />
            Add login
          </Button>
        )}
      </div>
      {logins.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No logins stored for this client.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {logins.map((l) => (
            <LoginRow key={l.id} login={l} canManage={canManage} canReveal={canReveal} now={now} />
          ))}
        </ul>
      )}
      {canManage && <AddLoginDialog clientId={clientId} open={adding} onOpenChange={setAdding} />}
    </section>
  )
}

function LoginRow({
  login: l,
  canManage,
  canReveal,
  now,
}: {
  login: StoredLogin
  canManage: boolean
  canReveal: boolean
  now: Date
}) {
  const [password, setPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  // Hide a revealed password again after 30 seconds.
  useEffect(() => {
    if (password === null) return
    const t = window.setTimeout(() => setPassword(null), HIDE_AFTER_MS)
    return () => window.clearTimeout(t)
  }, [password])

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">
          {l.siteUrl ? (
            <a
              href={l.siteUrl}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:underline"
            >
              {l.siteName}
            </a>
          ) : (
            l.siteName
          )}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {l.username}
          {l.has2fa ? " · 2-step codes" : ""}
          {` · added by ${l.source === "onboarding" ? "the client" : "the team"}`}
          {l.lastViewedAt
            ? ` · last opened ${formatRelative(l.lastViewedAt, now)}${l.lastViewedBy ? ` by ${l.lastViewedBy}` : ""}`
            : ""}
        </span>
        {l.notes && <span className="text-xs text-muted-foreground">{l.notes}</span>}
      </div>
      {password !== null && (
        <code className="rounded-md border bg-muted/40 px-2 py-1 font-mono text-sm break-all">
          {password}
        </code>
      )}
      <div className="flex items-center gap-1">
        {canReveal && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              password !== null
                ? setPassword(null)
                : startTransition(async () => {
                    const r = await revealLogin(l.id)
                    if (!r.ok) toast.error(r.error)
                    else setPassword(r.data.password)
                  })
            }
          >
            {pending ? (
              <Loader2 className="animate-spin" />
            ) : password !== null ? (
              <EyeOff />
            ) : (
              <Eye />
            )}
            {password !== null ? "Hide" : "Reveal"}
          </Button>
        )}
        {password !== null && (
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(password)
                setCopied(true)
                window.setTimeout(() => setCopied(false), 2000)
              } catch {
                toast.error("Couldn't copy.")
              }
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
        )}
        {canManage && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${l.siteName}`}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await removeTeamLogin(l.id)
                if (!r.ok) toast.error(r.error)
                else toast.success(`${l.siteName} removed`)
              })
            }
          >
            <Trash2 />
          </Button>
        )}
      </div>
    </li>
  )
}

const EMPTY = { site_name: "", site_url: "", username: "", password: "", has_2fa: false, notes: "" }

function AddLoginDialog({
  clientId,
  open,
  onOpenChange,
}: {
  clientId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})
  const [pending, startTransition] = useTransition()

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) {
          setForm(EMPTY)
          setErrors({})
        }
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add a login</DialogTitle>
          <DialogDescription>
            The password is stored encrypted and only shown when someone reveals it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {(
            [
              ["site_name", "Site", "text"],
              ["site_url", "Login page (optional)", "text"],
              ["username", "Username or email", "text"],
              ["password", "Password", "password"],
              ["notes", "Notes (optional)", "text"],
            ] as const
          ).map(([key, label, type]) => (
            <label key={key} className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">{label}</span>
              <Input
                type={type}
                autoComplete={type === "password" ? "new-password" : "off"}
                value={form[key]}
                aria-invalid={Boolean(errors[key])}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
              {errors[key] && <span className="text-xs text-destructive">{errors[key]}</span>}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.has_2fa}
              onCheckedChange={(c) => setForm((f) => ({ ...f, has_2fa: c === true }))}
            />
            Uses 2-step verification codes
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await addTeamLogin(clientId, form)
                if (!r.ok) {
                  setErrors(r.fieldErrors ?? {})
                  toast.error(r.error)
                  return
                }
                toast.success("Login saved")
                setForm(EMPTY)
                onOpenChange(false)
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            Save login
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
