"use client"

import { Gauge, Search } from "lucide-react"
import { useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatNumber } from "@/lib/format"
import { checkSiteStrength, findPlaces, reviewPlaces } from "../actions"
import { REJECT_LABELS, REJECT_REASONS, type RejectReason } from "../constants"
import { usd } from "./bits"

function WithReason({ reason, children }: { reason: string | null; children: ReactNode }) {
  if (!reason) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex outline-none">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{reason}</TooltipContent>
    </Tooltip>
  )
}

export function FindPlacesButton({
  clientId,
  disabledReason,
  hint,
  variant = "default",
}: {
  clientId: string
  disabledReason: string | null
  /** Shown in the tooltip when enabled ("About 25 searches, about $0.15"). */
  hint?: string
  variant?: "default" | "outline"
}) {
  const [pending, startTransition] = useTransition()
  const button = (
    <Button
      variant={variant}
      disabled={pending || Boolean(disabledReason)}
      title={!disabledReason ? hint : undefined}
      onClick={() =>
        startTransition(async () => {
          const r = await findPlaces(clientId)
          if (!r.ok) toast.error(r.error)
          else toast.success("Searching Google now. Places appear here in a minute or two.")
        })
      }
    >
      <Search className={pending ? "animate-pulse" : undefined} />
      Find places
    </Button>
  )
  return <WithReason reason={disabledReason}>{button}</WithReason>
}

export function CheckStrengthButton({
  clientId,
  ids,
  disabledReason,
  force = false,
  label = "Check site strength",
  variant = "outline",
  onDone,
}: {
  clientId: string
  /** Only these places; null = every waiting and approved place. */
  ids: string[] | null
  disabledReason: string | null
  force?: boolean
  label?: string
  variant?: "default" | "outline" | "ghost"
  onDone?: () => void
}) {
  const [pending, startTransition] = useTransition()
  const button = (
    <Button
      variant={variant}
      disabled={pending || Boolean(disabledReason)}
      onClick={() =>
        startTransition(async () => {
          const r = await checkSiteStrength(clientId, ids, force)
          if (!r.ok) {
            toast.error(r.error)
            return
          }
          if (r.data.checked === 0)
            toast.success("All of these sites were checked in the last 30 days.")
          else
            toast.success(
              `Checked ${formatNumber(r.data.checked)} ${r.data.checked === 1 ? "site" : "sites"} (${usd(r.data.cost)}).`,
            )
          onDone?.()
        })
      }
    >
      <Gauge className={pending ? "animate-pulse" : undefined} />
      {pending ? "Checking…" : label}
    </Button>
  )
  return <WithReason reason={disabledReason}>{button}</WithReason>
}

export function RejectDialog({
  ids,
  open,
  onOpenChange,
  onDone,
}: {
  ids: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone?: () => void
}) {
  const [reason, setReason] = useState<RejectReason | "">("")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    if (!reason) {
      setError("Pick a reason.")
      return
    }
    startTransition(async () => {
      const r = await reviewPlaces(ids, "reject", reason, note)
      if (!r.ok) {
        setError(r.error)
        return
      }
      toast.success(
        `Rejected ${formatNumber(r.data.changed)} ${r.data.changed === 1 ? "place" : "places"}.`,
      )
      setReason("")
      setNote("")
      setError(null)
      onOpenChange(false)
      onDone?.()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Reject {ids.length === 1 ? "this place" : `${formatNumber(ids.length)} places`}
          </DialogTitle>
          <DialogDescription>
            Rejected places stay rejected: new searches won&apos;t bring them back. You can restore
            them from the Rejected tab.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="reject-reason">Reason</FieldLabel>
            <Select value={reason} onValueChange={(v) => setReason(v as RejectReason)}>
              <SelectTrigger id="reject-reason" className="w-full">
                <SelectValue placeholder="Pick a reason" />
              </SelectTrigger>
              <SelectContent>
                {REJECT_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {REJECT_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="reject-note">Note (optional)</FieldLabel>
            <Textarea
              id="reject-note"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the next person should know"
            />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
