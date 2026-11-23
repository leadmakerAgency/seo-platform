"use client"

import { Check, LoaderCircle, MapPin } from "@/components/icons"
import { useEffect, useId, useRef, useState } from "react"

import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

type Props = {
  kind: "search" | "rerank"
  status: string
  /** backlink_runs.step: < 4 searching (0–1 starting), 4–5 picking the top 30, 6 done. */
  step: number
  done: number
  total: number
  /** Labels of the places this run searches from. */
  places: string[]
  /** When the run was queued, if known. */
  startedAt: string | null
}

type Phase = "starting" | "searching" | "reading" | "shortlist"

const STAGES = {
  search: {
    label: "Search Google",
    explain: "Google searches built from the brief, run from each place you ticked.",
  },
  shortlist: {
    label: "Pick the top 30",
    explain: "Site strength for the best candidates, then Claude reviews them against the brief.",
  },
  ready: {
    label: "Ready to review",
    explain: "The best 30 land in Review with a reason each; the rest go to More.",
  },
} as const

const MAX_CHIPS = 8

/**
 * The "run in progress" panel on the Backlinks page. The page re-renders every
 * few seconds while a run is open; the bar and the percentage glide to each new
 * value instead of jumping.
 */
export function RunProgress({ kind, status, step, done, total, places, startedAt }: Props) {
  const titleId = useId()
  const phase: Phase =
    kind === "rerank" || step >= 4
      ? "shortlist"
      : status === "queued" || total === 0
        ? "starting"
        : done >= total
          ? "reading"
          : "searching"

  const determinate = phase === "searching" || phase === "reading"
  const pct = determinate ? Math.min(100, Math.max(0, (done / total) * 100)) : null
  const shownPct = useGlide(pct ?? 0)

  const stages =
    kind === "rerank"
      ? (["shortlist", "ready"] as const)
      : (["search", "shortlist", "ready"] as const)
  const current = phase === "shortlist" ? stages.indexOf("shortlist") : 0

  const title =
    phase === "starting"
      ? "Getting the searches ready"
      : phase === "searching"
        ? "Searching Google"
        : phase === "reading"
          ? "Reading the results"
          : kind === "rerank"
            ? "Picking the top 30 again with the brief"
            : "Picking the top 30"
  const detail =
    phase === "shortlist"
      ? "Checking site strength, then Claude reviews the best candidates against the brief."
      : phase === "reading"
        ? "All searches are back; sorting what they found."
        : null

  const elapsed = useElapsed(startedAt)

  return (
    <section
      aria-labelledby={titleId}
      className="@container flex flex-col gap-4 rounded-lg border bg-card p-4"
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2.5">
        <LoaderCircle
          aria-hidden
          className="mt-0.5 size-6 text-brand animate-spin [animation-duration:1.6s] motion-reduce:animate-none"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={titleId} className="text-[15px] leading-[22px] font-semibold">
            {title}
          </h2>
          {detail && <p className="text-[13px] text-muted-foreground">{detail}</p>}
        </div>

        <div className="flex flex-col items-end gap-0.5 pl-1 text-right @xl:row-span-2">
          {pct !== null ? (
            <>
              <span className="font-heading text-[26px] leading-[30px] font-semibold tabular-nums">
                {Math.round(shownPct)}%
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatNumber(done)} of {formatNumber(total)} searches
              </span>
            </>
          ) : (
            <>
              <span className="font-heading text-[15px] leading-[30px] font-semibold text-muted-foreground">
                {phase === "starting" ? "Starting" : "Working"}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                Step {current + 1} of {stages.length}
              </span>
            </>
          )}
        </div>

        {places.length > 0 && (
          <div className="col-span-3 @xl:col-span-1 @xl:col-start-2 @xl:-mt-1">
            <PlaceChips places={places} />
          </div>
        )}
      </div>

      <Bar value={pct} label={title} />

      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-center @2xl:justify-between">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="Stages">
          {stages.map((key, i) => {
            const state = i < current ? "done" : i === current ? "current" : "next"
            return (
              <li key={key} className="flex items-center gap-2">
                {i > 0 && (
                  <span
                    className={cn(
                      "hidden h-px w-6 transition-colors @md:block",
                      i <= current ? "bg-primary" : "bg-border",
                    )}
                    aria-hidden
                  />
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={0}
                      className="flex items-center gap-1.5 rounded-sm text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                      aria-current={state === "current" ? "step" : undefined}
                    >
                      <StageMark state={state} />
                      <span
                        className={cn(
                          "transition-colors",
                          state === "current"
                            ? "font-medium text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {STAGES[key].label}
                        <span className="sr-only">
                          {state === "done"
                            ? " (done)"
                            : state === "current"
                              ? " (in progress)"
                              : ""}
                        </span>
                      </span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{STAGES[key].explain}</TooltipContent>
                </Tooltip>
              </li>
            )
          })}
        </ol>

        <p className="text-xs text-muted-foreground tabular-nums">
          Usually a few minutes; this page updates by itself.
          {elapsed && <span> · {elapsed}</span>}
        </p>
      </div>

      <p role="status" className="sr-only">
        {title}
      </p>
    </section>
  )
}

/** A full-width bar: glides to each new value, sweeps softly when there's no count. */
function Bar({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="relative">
      <Progress
        value={value}
        aria-label={label}
        className="h-1.5 *:duration-700 *:ease-out motion-reduce:*:transition-none"
      />
      {value === null && (
        <span
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
          aria-hidden
        >
          <span className="absolute inset-y-0 left-0 hidden w-1/3 rounded-full bg-primary/70 motion-safe:block motion-safe:animate-progress-sweep" />
          <span className="absolute inset-0 hidden bg-primary/25 motion-reduce:block" />
        </span>
      )}
    </div>
  )
}

function StageMark({ state }: { state: "done" | "current" | "next" }) {
  if (state === "done")
    return (
      <span
        className="flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground"
        aria-hidden
      >
        <Check className="size-2.5" strokeWidth={3} />
      </span>
    )
  return (
    <span
      className={cn(
        "flex size-4 items-center justify-center rounded-full border transition-colors",
        state === "current" ? "border-primary bg-brand-soft" : "border-input bg-card",
      )}
      aria-hidden
    >
      {state === "current" && <span className="size-1.5 rounded-full bg-primary" />}
    </span>
  )
}

function PlaceChips({ places }: { places: string[] }) {
  const shown = places.slice(0, MAX_CHIPS)
  const rest = places.slice(MAX_CHIPS)
  return (
    <ul className="flex flex-wrap items-center gap-1" aria-label="Places searched">
      <li aria-hidden className="mr-0.5 text-muted-foreground">
        <MapPin className="size-3.5" />
      </li>
      {shown.map((p) => (
        <li
          key={p}
          className="flex h-5 items-center rounded-sm bg-muted px-1.5 text-xs text-muted-foreground"
        >
          {p}
        </li>
      ))}
      {rest.length > 0 && (
        <li>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex h-5 items-center rounded-sm border border-dashed px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:outline-none"
              >
                +{rest.length} more
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{rest.join(", ")}</TooltipContent>
          </Tooltip>
        </li>
      )}
    </ul>
  )
}

/** Eases a number to its new value over ~600 ms (instantly with reduced motion). */
function useGlide(target: number) {
  const [value, setValue] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    const start = from.current
    if (start === target) return
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600
    const t0 = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = duration ? Math.min(1, (now - t0) / duration) : 1
      const v = start + (target - start) * (1 - (1 - t) ** 3)
      from.current = v
      setValue(v)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target])
  return value
}

/** "Running 3 min", refreshed every 15 s; only on the client so the server render stays static. */
function useElapsed(startedAt: string | null) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    if (!startedAt) return
    const update = () => setNow(Date.now())
    update()
    const timer = window.setInterval(update, 15_000)
    return () => window.clearInterval(timer)
  }, [startedAt])
  if (!startedAt || now === null) return null
  const mins = Math.floor((now - new Date(startedAt).getTime()) / 60_000)
  if (mins < 1) return "Started just now"
  if (mins < 60) return `Running ${mins} min`
  return `Running ${Math.floor(mins / 60)} h ${mins % 60} min`
}
