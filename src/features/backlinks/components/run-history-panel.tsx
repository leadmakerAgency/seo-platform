import { ChevronRight, Receipt } from "lucide-react"

import { StatusTag } from "@/components/common/status"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { RunEntry, RunHistory } from "../run-history"

/**
 * "Runs and costs" at the bottom of the Backlinks page: every Find places, Re-rank and
 * strength check with what it cost (Google searches, Google Maps, site strength, Claude),
 * grouped by month in agency time. Rows open to show the breakdown. No client JS.
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

const KIND_LABEL: Record<RunEntry["kind"], string> = {
  search: "Find places",
  rerank: "Re-rank with the brief",
  strength: "Strength check",
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

function StatusOf({ e }: { e: RunEntry }) {
  if (e.status === "running" || e.status === "queued") return <StatusTag tone="info">Running</StatusTag>
  if (e.status === "failed") return <StatusTag tone="danger">Failed</StatusTag>
  return null
}

function Row({ e }: { e: RunEntry }) {
  const d = new Date(e.createdAt)
  const lines: { label: string; detail: string; value: number; show: boolean }[] = [
    {
      label: "Google searches",
      detail: `${formatNumber(e.googleCalls)} ${e.googleCalls === 1 ? "call" : "calls"}${e.searches && e.googleCalls > e.searches ? " (includes retries)" : ""}`,
      value: e.google,
      show: e.kind === "search" || e.google > 0,
    },
    {
      label: "Google Maps",
      detail: `${formatNumber(e.mapsCalls)} competitor ${e.mapsCalls === 1 ? "check" : "checks"}`,
      value: e.maps,
      show: e.kind === "search" || e.maps > 0,
    },
    {
      label: "Site strength",
      detail: e.strengthDomains ? `${formatNumber(e.strengthDomains)} sites, Domain Rank and spam score` : "not needed",
      value: e.strength,
      show: true,
    },
    {
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
    <details className="group/run border-b last:border-b-0">
      <summary
        className={cn(
          "grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-4 py-2.5 text-sm outline-none",
          "hover:bg-muted/40 focus-visible:bg-muted/40 sm:grid-cols-[11.5rem_1fr_auto] [&::-webkit-details-marker]:hidden",
        )}
      >
        <span className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground tabular-nums">
          <ChevronRight
            className="size-3.5 shrink-0 transition-transform duration-150 group-open/run:rotate-90 motion-reduce:transition-none"
            aria-hidden
          />
          <time dateTime={e.createdAt}>
            {dayFmt.format(d)}
            <span className="text-muted-foreground/70"> · {timeFmt.format(d)}</span>
          </time>
        </span>
        <span className="col-span-2 row-start-2 flex min-w-0 items-center gap-2 pl-5 sm:col-span-1 sm:row-start-auto sm:pl-0">
          <span className="truncate">
            <span className="font-medium">{KIND_LABEL[e.kind]}</span>
            {e.places.length > 0 && <span className="text-muted-foreground"> · {e.places.join(", ")}</span>}
          </span>
          <StatusOf e={e} />
        </span>
        <span className="text-right font-medium tabular-nums">{cost(e.total)}</span>
      </summary>

      <div className="flex flex-col gap-3 px-4 pt-1 pb-4 sm:pl-[calc(11.5rem+2rem)]">
        <dl className="grid max-w-xl grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-[13px]">
          {lines
            .filter((l) => l.show)
            .map((l) => (
              <div key={l.label} className="contents">
                <dt className="min-w-0">
                  <span className="text-foreground">{l.label}</span>
                  <span className="text-muted-foreground"> · {l.detail}</span>
                </dt>
                <dd className="text-right text-muted-foreground tabular-nums">{cost(l.value)}</dd>
              </div>
            ))}
          <div className="contents">
            <dt className="border-t pt-1.5 font-medium">Total</dt>
            <dd className="border-t pt-1.5 text-right font-medium tabular-nums">{cost(e.total)}</dd>
          </div>
        </dl>
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
      <div className="flex items-baseline justify-between gap-3 border-b bg-muted/30 px-4 py-1.5 text-xs font-medium text-muted-foreground">
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
  const split = [
    { label: "Google", value: totals.google },
    { label: "Maps", value: totals.maps },
    { label: "Site strength", value: totals.strength },
    { label: "Claude", value: totals.ai },
  ]

  return (
    <section className="flex flex-col gap-3" aria-labelledby="runs-costs-title">
      <div className="flex flex-col gap-0.5">
        <h2 id="runs-costs-title" className="flex items-center gap-2 text-[15px] leading-[22px] font-semibold">
          <Receipt className="size-4 text-muted-foreground" aria-hidden />
          Runs and costs
        </h2>
        <p className="text-sm text-muted-foreground">
          Every search, re-rank and strength check for this client, with everything it cost: DataForSEO (Google, Maps,
          site strength) and Claude.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <dl className="grid grid-cols-2 border-b sm:grid-cols-4">
          <Figure label="This month" value={cost(totals.thisMonth)} note={`${formatNumber(totals.runsThisMonth)} ${totals.runsThisMonth === 1 ? "run" : "runs"}`} />
          <Figure label="Last month" value={cost(totals.lastMonth)} />
          <Figure label="All time" value={cost(totals.allTime)} note={`${formatNumber(totals.runs)} ${totals.runs === 1 ? "run" : "runs"}`} />
          <div className="flex flex-col gap-1 border-t border-l px-4 py-3 sm:border-t-0">
            <dt className="text-xs text-muted-foreground">All time, by part</dt>
            <dd className="flex flex-col gap-0.5 text-xs">
              {split.map((s) => (
                <span key={s.label} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="tabular-nums">{cost(s.value)}</span>
                </span>
              ))}
            </dd>
          </div>
        </dl>

        {entries.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No runs yet. Find places, Re-rank and strength checks show here with their cost.</p>
        ) : (
          <>
            {groupByMonth(recent).map((g) => (
              <MonthGroup key={g.month} month={g.month} entries={g.entries} />
            ))}
            {older.length > 0 && (
              <details className="group/older border-t">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-3.5 transition-transform group-open/older:rotate-90 motion-reduce:transition-none" aria-hidden />
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
      <p className="text-xs text-muted-foreground">
        Searches that DataForSEO couldn&apos;t answer aren&apos;t charged. Agency time (Arizona); months start on the 1st.
      </p>
    </section>
  )
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 [&:nth-child(2)]:border-l [&:nth-child(3)]:border-t sm:[&:nth-child(3)]:border-t-0 sm:[&:not(:first-child)]:border-l">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <span className="text-lg font-semibold tabular-nums">{value}</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </dd>
    </div>
  )
}
