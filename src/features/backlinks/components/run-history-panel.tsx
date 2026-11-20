import { ChevronRight, Gauge, ListOrdered, Receipt, Search, type LucideIcon } from "lucide-react"

import { StatusTag } from "@/components/common/status"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { RunEntry, RunHistory } from "../run-history"

/**
 * "Runs and costs" at the bottom of the Backlinks page: every Find places, Re-rank and
 * strength check with what it cost (Google searches, Google Maps, site strength, Claude),
 * grouped by month in agency time. Rows open to show the breakdown. No client JS.
 *
 * Its own tinted zone (info blue) so it reads apart from the purple work areas above.
 * The four cost parts keep one fixed colour each (--cost-* in globals.css, checked for
 * colour-blind separation in light and dark) and are always named next to their colour.
 */

const TZ = "America/Phoenix"
const monthFmt = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: TZ })
const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ })
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })

const VISIBLE = 8

/** Money for API costs: cents normally, a tenth of a cent when the amount is tiny. */
export function cost(v: number) {
  if (v === 0) return "$0.00"
  const digits = Math.abs(v) < 0.01 ? 3 : 2
  return `$${v.toFixed(digits)}`
}

type Part = "google" | "maps" | "strength" | "ai"

/** Fixed order and colour per cost part. */
const PARTS: { key: Part; label: string; short: string; dot: string }[] = [
  { key: "google", label: "Google searches", short: "Google", dot: "bg-cost-google" },
  { key: "maps", label: "Google Maps", short: "Maps", dot: "bg-cost-maps" },
  { key: "strength", label: "Site strength", short: "Strength", dot: "bg-cost-strength" },
  { key: "ai", label: "Claude review", short: "Claude", dot: "bg-cost-ai" },
]
const DOT = Object.fromEntries(PARTS.map((p) => [p.key, p.dot])) as Record<Part, string>

const KIND: Record<RunEntry["kind"], { label: string; icon: LucideIcon; tint: string }> = {
  search: { label: "Find places", icon: Search, tint: "bg-brand-soft text-brand" },
  rerank: { label: "Re-rank with the brief", icon: ListOrdered, tint: "bg-info-soft text-info" },
  strength: { label: "Strength check", icon: Gauge, tint: "bg-muted text-muted-foreground" },
}

function duration(from: string, to: string | null) {
  if (!to) return null
  const min = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000)
  if (min < 1) return "under a minute"
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return `${h} h ${min % 60} min`
}

const n = (v: unknown) => Number(v ?? 0)
const pct = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 100) : 0)

/** One line on what the run produced. */
function outcome(e: RunEntry): string | null {
  const c = e.counts
  const sl = c.shortlist as
    | { review?: number; more?: number; hidden?: number; ai?: string; aiNote?: string | null }
    | undefined
  const parts: string[] = []
  if (e.kind === "search") {
    if (e.searches) {
      const failed = n(c.failed)
      parts.push(
        `${formatNumber(e.searches - failed)} of ${formatNumber(e.searches)} searches answered${failed ? ` (${formatNumber(failed)} failed, not charged)` : ""}`,
      )
    }
    if (c.new !== undefined) parts.push(`${formatNumber(n(c.new))} new places${n(c.known) ? `, ${formatNumber(n(c.known))} known` : ""}`)
  }
  if (e.kind === "strength" && e.strengthDomains) parts.push(`${formatNumber(e.strengthDomains)} sites checked`)
  if (sl) {
    parts.push(`${formatNumber(sl.review ?? 0)} to Review · ${formatNumber(sl.more ?? 0)} to More · ${formatNumber(sl.hidden ?? 0)} hidden`)
    if (sl.ai && sl.ai !== "used") parts.push(`Claude's review skipped${sl.aiNote ? `: ${sl.aiNote}` : ""}`)
  }
  if (c.no_services) parts.push("no services in the business profile")
  return parts.length ? parts.join(" · ") : null
}

/**
 * The share of each cost part as one thin segmented bar. Each segment names itself on hover;
 * the list next to it carries the same names and amounts, so colour is never the only cue.
 */
function ShareBar({ values, total, label }: { values: Record<Part, number>; total: number; label: string }) {
  if (total <= 0) return <div className="h-2 rounded-full bg-muted" aria-hidden />
  const shown = PARTS.filter((p) => values[p.key] > 0)
  return (
    <div className="flex h-2 gap-0.5" role="img" aria-label={`${label}: ${shown.map((p) => `${p.label} ${pct(values[p.key], total)}%`).join(", ")}`}>
      {shown.map((p) => (
        <span
          key={p.key}
          title={`${p.label}: ${cost(values[p.key])} (${pct(values[p.key], total)}%)`}
          className={cn("min-w-1 rounded-[2px] first:rounded-l-full last:rounded-r-full", p.dot)}
          style={{ flex: `${values[p.key] / total} 1 0%` }}
        />
      ))}
    </div>
  )
}

function StatusOf({ e }: { e: RunEntry }) {
  if (e.status === "running" || e.status === "queued") return <StatusTag tone="info">Running</StatusTag>
  if (e.status === "failed") return <StatusTag tone="danger">Failed</StatusTag>
  return null
}

function Row({ e }: { e: RunEntry }) {
  const d = new Date(e.createdAt)
  const kind = KIND[e.kind]
  const Icon = kind.icon
  const lines: { key: Part; label: string; detail: string; value: number; show: boolean }[] = [
    {
      key: "google",
      label: "Google searches",
      detail: `${formatNumber(e.googleCalls)} ${e.googleCalls === 1 ? "call" : "calls"}${e.searches && e.googleCalls > e.searches ? " (includes retries)" : ""}`,
      value: e.google,
      show: e.kind === "search" || e.google > 0,
    },
    {
      key: "maps",
      label: "Google Maps",
      detail: `${formatNumber(e.mapsCalls)} competitor ${e.mapsCalls === 1 ? "check" : "checks"}`,
      value: e.maps,
      show: e.kind === "search" || e.maps > 0,
    },
    {
      key: "strength",
      label: "Site strength",
      detail: e.strengthDomains ? `${formatNumber(e.strengthDomains)} sites, Domain Rank and spam score` : "not needed",
      value: e.strength,
      show: true,
    },
    {
      key: "ai",
      label: "Claude review",
      detail: e.aiCalls
        ? `Haiku 5.5 · ${formatNumber(e.aiInputTokens ?? 0)} tokens in, ${formatNumber(e.aiOutputTokens ?? 0)} out`
        : "not used (picked by the rules)",
      value: e.ai,
      show: e.kind !== "strength",
    },
  ]
  const took = duration(e.createdAt, e.finishedAt)
  const what = outcome(e)

  return (
    <details className="group/run border-b last:border-b-0 open:bg-muted/20">
      <summary
        className={cn(
          "grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm outline-none",
          "transition-colors hover:bg-info-soft/40 focus-visible:bg-info-soft/40 sm:grid-cols-[11.5rem_1fr_auto] [&::-webkit-details-marker]:hidden",
        )}
      >
        <span className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground tabular-nums">
          <ChevronRight
            className="size-3.5 shrink-0 transition-transform duration-150 group-open/run:rotate-90 group-open/run:text-info motion-reduce:transition-none"
            aria-hidden
          />
          <time dateTime={e.createdAt}>
            {dayFmt.format(d)}
            <span className="text-muted-foreground/70"> · {timeFmt.format(d)}</span>
          </time>
        </span>
        <span className="col-span-2 row-start-2 flex min-w-0 items-center gap-2 pl-5 sm:col-span-1 sm:row-start-auto sm:pl-0">
          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", kind.tint)} aria-hidden>
            <Icon className="size-3.5" />
          </span>
          <span className="truncate">
            <span className="font-medium">{kind.label}</span>
            {e.places.length > 0 && <span className="text-muted-foreground"> · {e.places.join(", ")}</span>}
          </span>
          <StatusOf e={e} />
        </span>
        <span className="text-right font-semibold tabular-nums">{cost(e.total)}</span>
      </summary>

      <div className="flex flex-col gap-3 px-4 pt-1 pb-4 sm:pl-[calc(11.5rem+2rem)]">
        <div className="flex max-w-xl flex-col gap-2.5">
          <ShareBar
            values={{ google: e.google, maps: e.maps, strength: e.strength, ai: e.ai }}
            total={e.total}
            label="Where this run's cost went"
          />
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-[13px]">
            {lines
              .filter((l) => l.show)
              .map((l) => (
                <div key={l.label} className="contents">
                  <dt className="flex min-w-0 items-baseline gap-2">
                    <span aria-hidden className={cn("size-2 shrink-0 translate-y-[-1px] rounded-full", DOT[l.key])} />
                    <span>
                      <span className="text-foreground">{l.label}</span>
                      <span className="text-muted-foreground"> · {l.detail}</span>
                    </span>
                  </dt>
                  <dd className="text-right text-muted-foreground tabular-nums">{cost(l.value)}</dd>
                </div>
              ))}
            <div className="contents">
              <dt className="border-t pt-1.5 pl-4 font-medium">Total</dt>
              <dd className="border-t pt-1.5 text-right font-semibold tabular-nums">{cost(e.total)}</dd>
            </div>
          </dl>
        </div>
        {(what || took || e.by) && (
          <p className="text-[13px] text-muted-foreground">
            {[what, took ? `took ${took}` : null, e.by ? `started by ${e.by}` : null].filter(Boolean).join(" · ")}
          </p>
        )}
        {e.error && <p className="text-[13px] text-danger">{e.error}</p>}
      </div>
    </details>
  )
}

function MonthGroup({ month, entries }: { month: string; entries: RunEntry[] }) {
  const total = entries.reduce((s, e) => s + e.total, 0)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 border-b border-info/15 bg-info-soft/60 px-4 py-1.5 text-xs font-medium text-info">
        <span>{month}</span>
        <span className="tabular-nums">
          {formatNumber(entries.length)} {entries.length === 1 ? "run" : "runs"} · {cost(total)}
        </span>
      </div>
      {entries.map((e) => (
        <Row key={e.id} e={e} />
      ))}
    </div>
  )
}

function groupByMonth(entries: RunEntry[]) {
  const groups: { month: string; entries: RunEntry[] }[] = []
  for (const e of entries) {
    const month = monthFmt.format(new Date(e.createdAt))
    const last = groups.at(-1)
    if (last?.month === month) last.entries.push(e)
    else groups.push({ month, entries: [e] })
  }
  return groups
}

export function RunHistoryPanel({ history }: { history: RunHistory }) {
  const { totals, entries } = history
  const recent = entries.slice(0, VISIBLE)
  const older = entries.slice(VISIBLE)
  const byPart: Record<Part, number> = { google: totals.google, maps: totals.maps, strength: totals.strength, ai: totals.ai }

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border border-info/20 bg-info-soft/45 p-4 sm:p-5"
      aria-labelledby="runs-costs-title"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-card text-info shadow-xs ring-1 ring-info/20" aria-hidden>
          <Receipt className="size-4.5" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="runs-costs-title" className="text-[15px] leading-[22px] font-semibold">
            Runs and costs
          </h2>
          <p className="text-sm text-muted-foreground">
            Every search, re-rank and strength check for this client, with everything it cost: DataForSEO (Google,
            Maps, site strength) and Claude.
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        <Figure
          label="This month"
          value={cost(totals.thisMonth)}
          note={`${formatNumber(totals.runsThisMonth)} ${totals.runsThisMonth === 1 ? "run" : "runs"}`}
          accent
        />
        <Figure label="Last month" value={cost(totals.lastMonth)} />
        <Figure
          label="All time"
          value={cost(totals.allTime)}
          note={`${formatNumber(totals.runs)} ${totals.runs === 1 ? "run" : "runs"}`}
        />
        <div className="col-span-3 flex flex-col gap-2 rounded-lg border bg-card px-4 py-3">
          <dt className="text-xs text-muted-foreground">All time, by part</dt>
          <dd className="flex flex-col gap-2">
            <ShareBar values={byPart} total={totals.allTime} label="Where all the cost went" />
            <ul className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs whitespace-nowrap sm:grid-cols-4">
              {PARTS.map((p) => (
                <li key={p.key} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span aria-hidden className={cn("size-2 shrink-0 rounded-full", p.dot)} />
                    <span className="truncate text-muted-foreground">{p.short}</span>
                  </span>
                  <span className="tabular-nums">{cost(byPart[p.key])}</span>
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>

      <div className="overflow-hidden rounded-lg border bg-card">
        {entries.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No runs yet. Find places, Re-rank and strength checks show here with their cost.
          </p>
        ) : (
          <>
            {groupByMonth(recent).map((g) => (
              <MonthGroup key={g.month} month={g.month} entries={g.entries} />
            ))}
            {older.length > 0 && (
              <details className="group/older border-t">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 text-sm text-muted-foreground hover:bg-info-soft/40 [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    className="size-3.5 transition-transform group-open/older:rotate-90 motion-reduce:transition-none"
                    aria-hidden
                  />
                  {formatNumber(older.length)} older {older.length === 1 ? "run" : "runs"}
                </summary>
                {groupByMonth(older).map((g) => (
                  <MonthGroup key={g.month} month={g.month} entries={g.entries} />
                ))}
              </details>
            )}
          </>
        )}
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">
        Searches that DataForSEO couldn&apos;t answer aren&apos;t charged. Agency time (Arizona); months start on the 1st.
      </p>
    </section>
  )
}

function Figure({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-lg border bg-card px-4 py-3",
        accent && "border-info/30 shadow-[inset_3px_0_0_var(--color-info)]",
      )}
    >
      <dt className={cn("text-xs", accent ? "font-medium text-info" : "text-muted-foreground")}>{label}</dt>
      <dd className="flex flex-col">
        <span className="text-lg leading-7 font-semibold tabular-nums">{value}</span>
        <span className="text-xs text-muted-foreground">{note ?? " "}</span>
      </dd>
    </div>
  )
}
