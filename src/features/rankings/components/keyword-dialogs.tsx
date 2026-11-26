"use client"

import { Plus, RefreshCw, TriangleAlert } from "@/components/icons"
import { useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatNumber } from "@/lib/format"
import { addKeywords, checkNow, replaceKeyword, stopTracking } from "../actions"
import { formatVolume } from "./bits"

export type ReplaceOption = {
  keyword_norm: string
  phrase: string
  score: number
  local_volume: number | null
  national_volume: number | null
  topic: string | null
}

export function AddKeywordsDialog({
  clientId,
  used,
  limit,
  trigger,
}: {
  clientId: string
  used: number
  limit: number
  trigger?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const left = Math.max(0, limit - used)
  const typed = new Set(
    text
      .split(/[\n,;]+/)
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean),
  ).size

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setText("")
      setError(null)
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const r = await addKeywords(clientId, text)
      if (!r.ok) return setError(r.error)
      onOpenChange(false)
      const { added, skipped } = r.data!
      toast.success(
        added === 0
          ? "Nothing new to add"
          : `${added} keyword${added === 1 ? "" : "s"} added. The first check starts now.`,
        skipped.length ? { description: `Already tracked: ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? "…" : ""}` } : undefined,
      )
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus />
            Add keywords
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add keywords</DialogTitle>
          <DialogDescription>
            One per line, or separated by commas. Each new keyword is checked on Google, Maps and
            Bing within a few minutes, then every week with the rest.
          </DialogDescription>
        </DialogHeader>
        <form id="add-keywords" onSubmit={submit} className="flex flex-col gap-2">
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="ak-text">Keywords</FieldLabel>
            <Textarea
              id="ak-text"
              autoFocus
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"air duct cleaning phoenix\ndryer vent cleaning near me"}
            />
            <FieldDescription>
              {formatNumber(used)} of {formatNumber(limit)} used, {formatNumber(left)} left.
              {typed > left && left >= 0 ? ` That's ${typed}; remove some or raise the limit in Edit details.` : ""}
            </FieldDescription>
            {error && <FieldError>{error}</FieldError>}
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="add-keywords" disabled={pending || typed === 0}>
            {pending ? "Adding…" : typed > 1 ? `Add ${typed} keywords` : "Add keyword"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CheckNowButton({
  clientId,
  disabledReason,
}: {
  clientId: string
  /** Why the check can't run now (shown as a tooltip), or null. */
  disabledReason: string | null
}) {
  const [pending, startTransition] = useTransition()
  const button = (
    <Button
      variant="outline"
      disabled={pending || Boolean(disabledReason)}
      onClick={() =>
        startTransition(async () => {
          const r = await checkNow(clientId)
          if (!r.ok) toast.error(r.error)
          else toast.success("Check started. Results come in over the next few minutes.")
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : undefined} />
      Check now
    </Button>
  )
  if (!disabledReason) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex outline-none">
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{disabledReason}</TooltipContent>
    </Tooltip>
  )
}

export function ReplaceKeywordDialog({
  keywordId,
  phrase,
  options,
  initial = "",
  trigger,
  onDone,
  warning = null,
}: {
  keywordId: string
  phrase: string
  /** Better keywords to pick from (best first). */
  options: ReplaceOption[]
  initial?: string
  trigger: ReactNode
  onDone?: () => void
  /** Shown first when the latest ranking scan says this keyword ranks well. */
  warning?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onOpenChange(next: boolean) {
    setOpen(next)
    setError(null)
    if (next) setValue(initial)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const r = await replaceKeyword(keywordId, value)
      if (!r.ok) return setError(r.error)
      setOpen(false)
      toast.success(`Replaced with “${value.trim().toLowerCase()}”. Its first check starts now.`)
      onDone?.()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Replace “{phrase}”</DialogTitle>
          <DialogDescription>
            We stop tracking it (its history is kept) and start tracking the new keyword in its
            place.
          </DialogDescription>
        </DialogHeader>
        {warning && <KeepWarning text={warning} />}
        <form id={`replace-${keywordId}`} onSubmit={submit} className="flex flex-col gap-4">
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor={`rk-${keywordId}`}>New keyword</FieldLabel>
            <Input
              id={`rk-${keywordId}`}
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={80}
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          {options.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">Better keywords from research</p>
              <ul className="flex flex-col divide-y rounded-lg border">
                {options.slice(0, 6).map((o) => (
                  <li key={o.keyword_norm}>
                    <button
                      type="button"
                      onClick={() => setValue(o.phrase)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60"
                      aria-pressed={value === o.phrase}
                    >
                      <span className="min-w-0 truncate">{o.phrase}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatVolume(o.local_volume ?? o.national_volume)}/mo · score {o.score}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form={`replace-${keywordId}`} disabled={pending || !value.trim()}>
            {pending ? "Replacing…" : "Replace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function KeepWarning({ text }: { text: string }) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <p>{text}</p>
    </div>
  )
}

export function StopTrackingDialog({
  keywordId,
  phrase,
  trigger,
  onDone,
  warning = null,
}: {
  keywordId: string
  phrase: string
  trigger: ReactNode
  onDone?: () => void
  /** Shown first when the latest ranking scan says this keyword ranks well. */
  warning?: string | null
}) {
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()
  return (
    <AlertDialog onOpenChange={(o) => !o && setReason("")}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop tracking “{phrase}”?</AlertDialogTitle>
          <AlertDialogDescription>
            It won&apos;t be checked any more. Its history is kept, and adding it again later
            picks up where it left off.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {warning && <KeepWarning text={warning} />}
        <Field>
          <FieldLabel htmlFor={`st-${keywordId}`}>Why (optional)</FieldLabel>
          <Input
            id={`st-${keywordId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder="Client no longer offers this"
          />
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault()
              startTransition(async () => {
                const r = await stopTracking(keywordId, reason)
                if (!r.ok) return void toast.error(r.error)
                toast.success(`Stopped tracking “${phrase}”`)
                onDone?.()
              })
            }}
          >
            Stop tracking
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
