"use client"

import { Check, LoaderCircle } from "lucide-react"
import { useEffect, useState } from "react"

import { ShockwaveMark } from "@/components/brand/logo"
import { cn } from "@/lib/utils"
import type { AiOpenRun } from "../queries"
import { CategoryChip } from "./ai-ui"

/**
 * The live panel while a Shockwave AI Search runs. The page refreshes every few seconds; the bar
 * glides to each new value. Steps follow the pipeline (7, site strength, isn't used).
 */

const STEPS: { stage: number; label: string; detail: string; weight: number }[] = [
  { stage: 1, label: "Read the client", detail: "Website, profile and brief", weight: 5 },
  { stage: 2, label: "Where to rank", detail: "Buyer searches in each place", weight: 12 },
  { stage: 3, label: "Competitors", detail: "Who ranks today", weight: 3 },
  { stage: 4, label: "Research", detail: "Lists, directories, press, communities…", weight: 45 },
  { stage: 5, label: "Merge", detail: "One entry per site", weight: 2 },
  { stage: 6, label: "Check pages", detail: "Live, a way in, red flags", weight: 20 },
  { stage: 8, label: "Judge", detail: "Relevant, real, reachable, worth it", weight: 9 },
  { stage: 9, label: "Top 30", detail: "The best mix to start with", weight: 4 },
]

function percentOf(run: AiOpenRun) {
  if (run.stage === 0) return 0
  let done = 0
  for (const s of STEPS) {
    if (s.stage < run.stage) done += s.weight
    else if (s.stage === run.stage) {
      const t = run.tasks[String(s.stage)]
      done += t && t.total > 0 ? (s.weight * t.done) / t.total : 0
    }
  }
  return Math.min(99, Math.round(done))
}

function useGlide(target: number) {
  const [v, setV] = useState(target)
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    let raf = 0
    if (reduce) {
      raf = requestAnimationFrame(() => setV(target))
      return () => cancelAnimationFrame(raf)
    }
    const from = v
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 600)
      setV(Math.round(from + (target - from) * (1 - (1 - k) ** 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])
  return v
}

function elapsed(fromIso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(fromIso).getTime()) / 60000))
  return min < 1 ? "just started" : `running ${min} min`
}

export function AiRunProgress({
  run,
  places,
  feed,
  showCost,
}: {
  run: AiOpenRun
  places: string[]
  feed: { id: string; site: string; title: string | null; category: string }[]
  showCost: boolean
}) {
  const pct = percentOf(run)
  const shown = useGlide(pct)
  const current = STEPS.find((s) => s.stage === run.stage) ?? (run.stage === 0 ? null : STEPS[STEPS.length - 1])
  const t = current ? run.tasks[String(current.stage)] : null
  const [, force] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <section
      className="relative overflow-hidden rounded-xl border border-primary/20 bg-card"
      aria-live="polite"
      aria-label="Shockwave AI Search progress"
    >
      <div className="flex flex-wrap items-start gap-4 p-4 sm:p-5">
        <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br from-brand-soft to-info-soft">
          <ShockwaveMark className="h-6" />
          <span aria-hidden className="absolute inset-0 animate-ping rounded-xl border border-primary/30 motion-reduce:hidden" style={{ animationDuration: "2.4s" }} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-[15px] leading-[22px] font-semibold">
            {run.stage === 0 ? "Starting Shockwave AI Search" : current?.label ?? "Working"}
          </p>
          <p className="text-sm text-muted-foreground">
            {run.stage === 0
              ? "Waiting for a worker; usually a few seconds."
              : `${current?.detail ?? ""}${t && t.total > 1 ? ` · ${t.done} of ${t.total}` : ""}`}
            {places.length ? ` · ${places.join(", ")}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className="font-mono text-2xl leading-8 font-semibold tabular-nums">{shown}%</span>
          <span className="text-xs text-muted-foreground">
            {elapsed(run.createdAt)}
            {showCost ? ` · $${run.costUsd.toFixed(2)} · ${run.webSearches} searches` : ""}
          </span>
        </div>
      </div>

      <div className="px-4 sm:px-5">
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Overall progress"
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${Math.max(2, shown)}%` }} />
        </div>
      </div>

      <ol className="flex flex-wrap gap-x-4 gap-y-2 px-4 pt-3 pb-4 text-xs sm:px-5">
        {STEPS.map((s) => {
          const done = run.stage > s.stage
          const now = run.stage === s.stage
          return (
            <li key={s.stage} className={cn("flex items-center gap-1.5", done ? "text-foreground" : now ? "font-medium text-foreground" : "text-muted-foreground")}>
              <span
                aria-hidden
                className={cn(
                  "flex size-4 items-center justify-center rounded-full border",
                  done ? "border-primary bg-primary text-primary-foreground" : now ? "border-primary text-primary" : "border-border",
                )}
              >
                {done ? <Check className="size-2.5" strokeWidth={3} /> : now ? <LoaderCircle className="size-2.5 animate-spin motion-reduce:animate-none" /> : null}
              </span>
              {s.label}
            </li>
          )
        })}
      </ol>

      {feed.length > 0 && (
        <div className="border-t border-dashed bg-muted/30 px-4 py-3 sm:px-5">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Latest finds</p>
          <ul className="flex flex-col gap-1.5">
            {feed.map((f) => (
              <li key={f.id} className="flex min-w-0 animate-in items-center gap-2 text-sm fade-in-0 slide-in-from-left-1 motion-reduce:animate-none">
                <CategoryChip category={f.category} className="shrink-0" />
                <span className="truncate">
                  <span className="font-medium">{f.site}</span>
                  {f.title ? <span className="text-muted-foreground"> · {f.title}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
