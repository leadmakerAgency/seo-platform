"use client"

import { Gauge, RotateCw, Search } from "@/components/icons"
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
import { checkSiteStrength, findPlaces, previewSearchPlan, rerankPlaces, reviewPlaces, type PlanPreview } from "../actions"
import { REJECT_LABELS, REJECT_REASONS, type RejectReason } from "../constants"
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
 * Find places: pick which of the client's places to search. The server builds the exact
 * searches from the strategy brief and shows them with the cost before anything is spent.
 * The database checks the same limits (24 h per place, 60 searches a run).
 */
export function FindPlacesButton({
  clientId,
  targets,
  maxSearches,
  disabledReason,
  variant = "default",
}: {
  clientId: string
  targets: Target[]
  maxSearches: number
  disabledReason: string | null
  variant?: "default" | "outline"
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [plan, setPlan] = useState<PlanPreview | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [loading, startLoading] = useTransition()
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

  function load(ids: Set<string>) {
    setPicked(ids)
    if (ids.size === 0) {
      setPlan(null)
      return
    }
    startLoading(async () => {
      const r = await previewSearchPlan(clientId, [...ids])
      if (!r.ok) {
        setPlanError(r.error)
        setPlan(null)
      } else {
        setPlanError(null)
        setPlan(r.data)
      }
    })
  }

  function onOpenChange(next: boolean) {
    if (next) load(new Set(available.map((t) => t.id)))
    setShowAll(false)
    setOpen(next)
  }

  const count = plan?.count ?? 0
  const tooMany = (plan?.dropped ?? 0) > 0 || count > maxSearches

  function start() {
    startTransition(async () => {
      const r = await findPlaces(clientId, [...picked])
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setOpen(false)
      toast.success("Searching Google now. The top 30 appear here in a few minutes.")
    })
  }

  const GROUP_LABELS: Record<string, string> = {
    place: "place searches",
    topic: "topic searches",
    service: "service searches",
    buyer: "buyer searches",
    industry: "industry searches",
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
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Find places</DialogTitle>
            <DialogDescription>
              Google is searched from each ticked place with searches built from the strategy brief.
              The best 30 results go to Review with a reason each; the rest go to More.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-[30svh] flex-col divide-y overflow-y-auto rounded-lg border">
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
                      onCheckedChange={(v) => {
                        const next = new Set(picked)
                        if (v) next.add(t.id)
                        else next.delete(t.id)
                        load(next)
                      }}
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
                    {plan && picked.has(t.id) && (
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {plan.perPlace[t.id] ?? 0} searches
                      </span>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
          <div className={cn("flex flex-col gap-1 text-sm", tooMany ? "text-danger" : "text-muted-foreground")}>
            {picked.size === 0 ? (
              <p>Tick at least one place.</p>
            ) : loading && !plan ? (
              <p>Working out the searches…</p>
            ) : planError ? (
              <p className="text-danger">{planError}</p>
            ) : plan ? (
              <>
                <p className="tabular-nums">
                  {tooMany
                    ? `That's more than ${maxSearches} searches. Untick a place.`
                    : `${formatNumber(count)} Google searches, at most ${usd(plan.cost)}, plus about $0.03 for site strength and under $0.01 for Claude's review. Searches run lately for the same place are free.`}
                </p>
                <p className="text-xs">
                  {Object.entries(plan.groups)
                    .filter(([, n]) => n > 0)
                    .map(([g, n]) => `${n} ${GROUP_LABELS[g] ?? g}`)
                    .join(" · ")}
                  {" · "}
                  <button type="button" className="text-brand hover:underline" onClick={() => setShowAll((x) => !x)}>
                    {showAll ? "Hide the searches" : "See every search"}
                  </button>
                </p>
                {showAll && (
                  <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border bg-muted/30 px-3 py-2 text-xs text-foreground">
                    {plan.queries.map((q, i) => (
                      <li key={i} className="py-0.5">
                        &ldquo;{q.query}&rdquo; <span className="text-muted-foreground">· from {q.place}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={start} disabled={pending || loading || picked.size === 0 || !plan || count === 0 || tooMany}>
              <Search className={pending ? "animate-pulse" : undefined} />
              {pending ? "Starting…" : `Search ${picked.size === 1 ? "1 place" : `${picked.size} places`}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Redo the top 30 from the saved results with the current brief (no searches). */
export function RerankButton({ clientId, disabledReason }: { clientId: string; disabledReason: string | null }) {
  const [pending, startTransition] = useTransition()
  return (
    <WithReason reason={disabledReason}>
      <Button
        variant="outline"
        disabled={pending || Boolean(disabledReason)}
        title="Picks the top 30 again from the places already found, using the current strategy brief. No new searches."
        onClick={() =>
          startTransition(async () => {
            const r = await rerankPlaces(clientId)
            if (!r.ok) toast.error(r.error)
            else toast.success("Re-ranking with the brief. The top 30 update in a minute.")
          })
        }
      >
        <RotateCw className={pending ? "animate-spin" : undefined} />
        Re-rank
      </Button>
    </WithReason>
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
