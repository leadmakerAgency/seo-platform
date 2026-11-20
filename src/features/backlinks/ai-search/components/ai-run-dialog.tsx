"use client"

import { Check, Clock, Globe2, MapPin, Network, Search, Wallet } from "lucide-react"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { ShockwaveMark } from "@/components/brand/logo"
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
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { Brief } from "../../brief"
import type { Target } from "../../queries"
import { startAiSearch } from "../actions"
import { MAX_COMPETITORS } from "../competitors"
import { CATEGORIES, categoriesFor, MAX_MARKETS, planAiSearch, planGap, type CategoryKey } from "../config"
import { CATEGORY_ICON } from "./ai-ui"

/**
 * Start a Shockwave AI Search: pick the places (markets) and, for this run, the kinds of sites.
 * The estimate is computed here and again on the server; the database refuses runs over the cap.
 */
export function RunAiSearchButton({
  clientId,
  targets,
  brief,
  maxSearches,
  searchPrice,
  maxRunUsd,
  disabledReason,
  hasRun,
  gap,
}: {
  clientId: string
  targets: Target[]
  brief: Pick<Brief, "reach" | "site_types"> | null
  maxSearches: number
  searchPrice: number
  maxRunUsd: number
  disabledReason: string | null
  hasRun: boolean
  /** Competitor backlinks switch: null hides it. */
  gap: { competitors: number; maxSites: number; fallback: string | null; unavailable: string | null } | null
}) {
  const active = targets.filter((t) => t.active)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(() => new Set(active.slice(0, MAX_MARKETS).map((t) => t.id)))
  const [off, setOff] = useState<Set<CategoryKey>>(new Set())
  const [gapOn, setGapOn] = useState(false)
  const [pending, startTransition] = useTransition()

  const markets = active.filter((t) => picked.has(t.id)).map((t) => ({ id: t.id, kind: t.kind }))
  const available = useMemo(() => {
    if (!brief) return [] as CategoryKey[]
    const set = new Set<CategoryKey>()
    for (const m of markets) for (const c of categoriesFor(m, brief)) set.add(c)
    return CATEGORIES.map((c) => c.key).filter((k) => set.has(k))
  }, [brief, markets])
  const plan = brief
    ? planAiSearch({ markets, brief, disabled: [...off], maxSearches, searchPrice })
    : null
  const gapPlan =
    gap && gapOn && !gap.unavailable
      ? planGap({
          competitors: gap.competitors || MAX_COMPETITORS,
          maxSites: gap.maxSites,
          mode: gap.fallback ? "ai_only" : "dataforseo",
          searchPrice,
        })
      : null
  const total = plan ? Math.round((plan.estimateUsd + (gapPlan?.estimateUsd ?? 0)) * 1000) / 1000 : 0
  const searches = (plan?.searches ?? 0) + (gapPlan?.searches ?? 0)
  const overCap = plan ? total > maxRunUsd : false
  const reason =
    disabledReason ?? (active.length === 0 ? "Add at least one place first." : null)

  function start() {
    startTransition(async () => {
      const r = await startAiSearch(clientId, [...picked], [...off], { gap: Boolean(gapPlan) })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success("Shockwave AI is researching. Results appear here in a few minutes.")
      setOpen(false)
    })
  }

  const button = (
    <Button onClick={() => setOpen(true)} disabled={Boolean(reason)} className="gap-2">
      <ShockwaveMark className="h-4 brightness-0 invert" />
      {hasRun ? "Run again" : "Run Shockwave AI Search"}
    </Button>
  )

  return (
    <>
      {reason ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex outline-none">
              {button}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-72">{reason}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShockwaveMark className="h-5" />
              Shockwave AI Search
            </DialogTitle>
            <DialogDescription>
              Claude reads the client, finds where it needs to rank, researches link sources in each place, checks every
              page and picks the best 30. Nothing is submitted anywhere.
            </DialogDescription>
          </DialogHeader>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Places to research</h3>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {active.map((t) => {
                const Icon = t.kind === "country" ? Globe2 : MapPin
                const checked = picked.has(t.id)
                const full = !checked && picked.size >= MAX_MARKETS
                return (
                  <Label
                    key={t.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 font-normal",
                      checked ? "border-primary/40 bg-brand-soft/50" : "hover:bg-muted/50",
                      full && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={full}
                      onCheckedChange={(c) =>
                        setPicked((prev) => {
                          const next = new Set(prev)
                          if (c) next.add(t.id)
                          else next.delete(t.id)
                          return next
                        })
                      }
                    />
                    <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                    <span className="truncate text-sm">{t.label}</span>
                  </Label>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">Up to {MAX_MARKETS} places per run. Each place is searched in its own language.</p>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Kinds of sites to research</h3>
            {available.length === 0 ? (
              <p className="text-xs text-muted-foreground">Pick a place to see the kinds of sites from the brief.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {available.map((k) => {
                  const Icon = CATEGORY_ICON[k] ?? Search
                  const on = !off.has(k)
                  const label = CATEGORIES.find((c) => c.key === k)?.label ?? k
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setOff((prev) => {
                          const next = new Set(prev)
                          if (on) next.add(k)
                          else next.delete(k)
                          return next
                        })
                      }
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
                        on ? "border-primary/30 bg-brand-soft text-foreground" : "bg-card text-muted-foreground line-through decoration-muted-foreground/50",
                      )}
                    >
                      {on ? <Check className="size-3 text-brand" aria-hidden /> : <Icon className="size-3" aria-hidden />}
                      {label}
                    </button>
                  )
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Always included: where the client needs to rank, competitors&apos; lists, sites that answer buyer questions,
              and pages that mention the client.
            </p>
          </section>

          {gap && (
            <section className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
              <Network className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span id="ai-gap-switch-label" className="text-sm font-medium">
                  Find the competitors&apos; backlinks
                </span>
                <span className="text-xs text-muted-foreground">
                  {gap.unavailable
                    ? gap.unavailable
                    : gap.fallback
                      ? `${gap.fallback}: estimated from AI searches of their names.`
                      : `Sites linking to ${gap.competitors >= 2 ? `the ${gap.competitors}` : "the top 5"} competitors but not the client, from DataForSEO link data.`}
                  {gapPlan ? ` About $${gapPlan.estimateUsd.toFixed(2)} more.` : ""}
                </span>
              </div>
              <Switch
                checked={gapOn && !gap.unavailable}
                disabled={Boolean(gap.unavailable)}
                onChange={setGapOn}
                labelledBy="ai-gap-switch-label"
              />
            </section>
          )}

          {plan && (
            <section
              className={cn(
                "grid grid-cols-3 divide-x divide-dashed rounded-lg border text-sm",
                overCap && "border-warning/50",
              )}
            >
              <div className="flex flex-col gap-0.5 px-3 py-2.5">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Search className="size-3.5" aria-hidden />
                  Web searches
                </span>
                <span className="font-mono font-semibold tabular-nums">
                  {searches}
                  <span className="text-xs font-normal text-muted-foreground"> / {maxSearches}</span>
                </span>
              </div>
              <div className="flex flex-col gap-0.5 px-3 py-2.5">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Wallet className="size-3.5" aria-hidden />
                  Estimated cost
                </span>
                <span className={cn("font-mono font-semibold tabular-nums", overCap && "text-warning")}>
                  ≈ ${total.toFixed(2)}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 px-3 py-2.5">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="size-3.5" aria-hidden />
                  Takes about
                </span>
                <span className="font-mono font-semibold tabular-nums">
                  {plan.minutes[0]}–{plan.minutes[1]} min
                </span>
              </div>
            </section>
          )}
          {plan && (
            <p className={cn("-mt-2 text-xs", overCap ? "text-warning" : "text-muted-foreground")}>
              {overCap
                ? `Over the $${maxRunUsd.toFixed(2)} limit for one run. Untick some places or kinds of sites.`
                : `Claude Haiku with web search. The run stops by itself at $${maxRunUsd.toFixed(2)}.${plan.dropped.length ? ` ${plan.dropped.length} lower-priority searches left out to stay under ${maxSearches} web searches.` : ""}`}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={start} disabled={pending || picked.size === 0 || overCap || !plan}>
              {pending ? "Starting…" : "Start research"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** A small accessible on/off switch. */
function Switch({
  checked,
  disabled,
  onChange,
  labelledBy,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
  labelledBy: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-primary bg-primary" : "border-border bg-muted",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-3.5 rounded-full bg-background shadow-sm transition-transform motion-reduce:transition-none",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  )
}
