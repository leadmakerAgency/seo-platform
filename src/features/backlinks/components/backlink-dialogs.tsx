"use client"

import { Gauge, Search } from "lucide-react"
import { useState, useTransition, type ReactNode } from "react"
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
import { cn } from "@/lib/utils"
import { checkSiteStrength, findPlaces, reviewPlaces } from "../actions"
import { REJECT_LABELS, REJECT_REASONS, SEARCH_COST_USD, type RejectReason } from "../constants"
import type { Target } from "../queries"
import { formatDayTime, usd } from "./bits"

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

/**
 * Find places: pick which of the client's places to search, see the number of searches and
 * the cost first. The database checks the same limits (24 h per place, 60 searches a run).
 */
export function FindPlacesButton({
  clientId,
  targets,
  perPlace,
  fixed,
  maxSearches,
  disabledReason,
  variant = "default",
}: {
  clientId: string
  targets: Target[]
  perPlace: number
  fixed: number
  maxSearches: number
  disabledReason: string | null
  variant?: "default" | "outline"
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const active = targets.filter((t) => t.active)
  const available = active.filter((t) => !t.searchableAt)
  const reason =
    disabledReason ??
    (active.length === 0
      ? "Add a place first."
      : available.length === 0
        ? "Every place was searched in the last 24 hours."
        : null)

  const estimate = (n: number) => (n === 0 ? 0 : n * perPlace + fixed)
  const searches = estimate(picked.size)
  const tooMany = searches > maxSearches

  function onOpenChange(next: boolean) {
    if (next) {
      // Pre-tick every place that can be searched, as many as fit in one search.
      const ids = new Set<string>()
      for (const t of available) {
        if (estimate(ids.size + 1) > maxSearches) break
        ids.add(t.id)
      }
      setPicked(ids)
    }
    setOpen(next)
  }

  function start() {
    startTransition(async () => {
      const r = await findPlaces(clientId, [...picked])
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setOpen(false)
      toast.success("Searching Google now. Places appear here in a minute or two.")
    })
  }

  return (
    <>
      <WithReason reason={reason}>
        <Button variant={variant} disabled={Boolean(reason)} onClick={() => onOpenChange(true)}>
          <Search />
          Find places
        </Button>
      </WithReason>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Find places</DialogTitle>
            <DialogDescription>
              Google is searched from each ticked place for directories, chambers, associations,
              best-of lists and local sites. The core listings are added too.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-[45svh] flex-col divide-y overflow-y-auto rounded-lg border">
            {active.map((t) => {
              const blocked = Boolean(t.searchableAt)
              return (
                <li key={t.id}>
                  <label
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 text-sm",
                      blocked ? "opacity-60" : "cursor-pointer hover:bg-muted/60",
                    )}
                  >
                    <Checkbox
                      checked={picked.has(t.id)}
                      disabled={blocked || pending}
                      onCheckedChange={(v) =>
                        setPicked((s) => {
                          const next = new Set(s)
                          if (v) next.add(t.id)
                          else next.delete(t.id)
                          return next
                        })
                      }
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{t.label}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {blocked
                          ? `Searched lately. Again from ${formatDayTime(t.searchableAt!)}`
                          : t.lastSearchedAt
                            ? `“${t.searchName}” · searched before`
                            : `“${t.searchName}” · not searched yet`}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      ~{perPlace} searches
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <p className={cn("text-sm tabular-nums", tooMany ? "text-danger" : "text-muted-foreground")}>
            {picked.size === 0
              ? "Tick at least one place."
              : tooMany
                ? `That's about ${formatNumber(searches)} searches; one search can do ${maxSearches}. Untick a place.`
                : `About ${formatNumber(searches)} Google searches, at most ${usd(searches * SEARCH_COST_USD)}. Searches run lately for the same place are reused for free.`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={start} disabled={pending || picked.size === 0 || tooMany}>
              <Search className={pending ? "animate-pulse" : undefined} />
              {pending ? "Starting…" : `Search ${picked.size === 1 ? "1 place" : `${picked.size} places`}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
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
