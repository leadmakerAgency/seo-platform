import {
  ArrowUpRight,
  CalendarDays,
  CalendarMinus,
  ChevronRight,
  Database,
  Gauge,
  History,
  ListOrdered,
  MapPin,
  ReceiptText,
  Search,
  Sparkles,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import { StatusTag } from "@/components/common/status"
import { formatNumber, formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { AccountBalances } from "../accounts"
import type { RunEntry, RunHistory } from "../run-history"
import { AnthropicCreditEditor } from "./anthropic-credit-editor"

/**
 * "Runs and costs" at the bottom of the Backlinks page, laid out like a ledger: credit left on
 * the paid accounts (admins), the month and all-time totals, then every Find places, Re-rank
 * and strength check on a timeline, grouped by month in agency time. Rows open to an itemised
 * receipt. Only the Anthropic balance editor is a client component.
 *
 * The four cost parts keep one fixed colour each (--cost-* in globals.css, validated for
 * colour-blind separation in light and dark) and are always named next to their colour.
 */

const TZ = "America/Phoenix"
const monthFmt = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: TZ })
const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ })
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })
const shortDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: TZ })

const VISIBLE = 8

/** Money for API costs: cents normally, a tenth of a cent when the amount is tiny. */
export function cost(v: number) {
  if (v === 0) return "$0.00"
  const digits = Math.abs(v) < 0.01 ? 3 : 2
  return `$${v.toFixed(digits)}`
}
const money = (v: number) => `$${v.toFixed(2)}`

type Part = "google" | "maps" | "strength" | "ai"

/** Fixed order, colour and icon per cost part. */
const PARTS: { key: Part; label: string; short: string; icon: LucideIcon; bg: string; text: string }[] = [
  { key: "google", label: "Google searches", short: "Google", icon: Search, bg: "bg-cost-google", text: "text-cost-google" },
  { key: "maps", label: "Google Maps", short: "Maps", icon: MapPin, bg: "bg-cost-maps", text: "text-cost-maps" },
  { key: "strength", label: "Site strength", short: "Strength", icon: Gauge, bg: "bg-cost-strength", text: "text-cost-strength" },
  { key: "ai", label: "Claude review", short: "Claude", icon: Sparkles, bg: "bg-cost-ai", text: "text-cost-ai" },
]
const PART = Object.fromEntries(PARTS.map((p) => [p.key, p])) as Record<Part, (typeof PARTS)[number]>

const KIND: Record<RunEntry["kind"], { label: string; icon: LucideIcon; node: string }> = {
  search: { label: "Find places", icon: Search, node: "border-brand/30 text-brand" },
  rerank: { label: "Re-rank with the brief", icon: ListOrdered, node: "border-info/30 text-info" },
  strength: { label: "Strength check", icon: Gauge, node: "border-border text-muted-foreground" },
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

/** What the run produced, as short facts. */
function outcome(e: RunEntry): string[] {
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
    parts.push(`${formatNumber(sl.review ?? 0)} to Review, ${formatNumber(sl.more ?? 0)} to More, ${formatNumber(sl.hidden ?? 0)} hidden`)
    if (sl.ai && sl.ai !== "used") parts.push(`Claude's review skipped${sl.aiNote ? `: ${sl.aiNote}` : ""}`)
  }
  if (c.no_services) parts.push("no services in the business profile")
  return parts
}

/** Thin segmented bar of each part's share. Every segment names itself on hover. */
function ShareBar({ values, total, label }: { values: Record<Part, number>; total: number; label: string }) {
  if (total <= 0) return <div className="h-1.5 rounded-full bg-muted" aria-hidden />
  const shown = PARTS.filter((p) => values[p.key] > 0)
  return (
    <div
      className="flex h-1.5 gap-0.5"
      role="img"
      aria-label={`${label}: ${shown.map((p) => `${p.label} ${pct(values[p.key], total)}%`).join(", ")}`}
    >
      {shown.map((p) => (
        <span
          key={p.key}
          title={`${p.label}: ${cost(values[p.key])} (${pct(values[p.key], total)}%)`}
          className={cn("min-w-1 rounded-[2px] first:rounded-l-full last:rounded-r-full", p.bg)}
          style={{ flex: `${values[p.key] / total} 1 0%` }}
        />
      ))}
    </div>
  )
}

/** "Google searches · 113 calls ......... $0.28" */
function LedgerLine({ part, detail, value }: { part: Part; detail: string; value: number }) {
  const p = PART[part]
  const Icon = p.icon
  return (
    <li className="flex items-baseline gap-2 text-[13px]">
      <Icon className={cn("size-3.5 shrink-0 translate-y-0.5", p.text)} aria-hidden />
      <span className="min-w-0 shrink">
        <span className="text-foreground">{p.label}</span>
        <span className="text-muted-foreground"> · {detail}</span>
      </span>
      <span aria-hidden className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-muted-foreground/40" />
      <span className="shrink-0 font-mono text-muted-foreground tabular-nums">{cost(value)}</span>
    </li>
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
  const lines: { key: Part; detail: string; value: number; show: boolean }[] = [
    {
      key: "google",
      detail: `${formatNumber(e.googleCalls)} ${e.googleCalls === 1 ? "call" : "calls"}${e.searches && e.googleCalls > e.searches ? " incl. retries" : ""}`,
      value: e.google,
      show: e.kind === "search" || e.google > 0,
    },
    {
      key: "maps",
      detail: `${formatNumber(e.mapsCalls)} competitor ${e.mapsCalls === 1 ? "check" : "checks"}`,
      value: e.maps,
      show: e.kind === "search" || e.maps > 0,
    },
    {
      key: "strength",
      detail: e.strengthDomains ? `${formatNumber(e.strengthDomains)} sites` : "not needed",
      value: e.strength,
      show: true,
    },
    {
      key: "ai",
      detail: e.aiCalls
        ? `Haiku 5.5, ${formatNumber(e.aiInputTokens ?? 0)} in / ${formatNumber(e.aiOutputTokens ?? 0)} out tokens`
        : "not used",
      value: e.ai,
      show: e.kind !== "strength",
    },
  ]
  const took = duration(e.createdAt, e.finishedAt)
  const facts = [...outcome(e), took ? `took ${took}` : null, e.by ? `started by ${e.by}` : null].filter(
    (x): x is string => Boolean(x),
  )

  return (
    <li className="relative pl-9">
      {/* Timeline node */}
      <span
        aria-hidden
        className={cn(
          "absolute top-2.5 left-0 z-10 flex size-[26px] items-center justify-center rounded-full border bg-card shadow-xs",
          kind.node,
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <details className="group/run rounded-lg transition-colors open:bg-muted/40">
        <summary
          className={cn(
            "flex cursor-pointer list-none items-start gap-3 rounded-lg px-3 py-2.5 outline-none",
            "hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/35 [&::-webkit-details-marker]:hidden",
          )}
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <span className="truncate font-medium">{kind.label}</span>
              <StatusOf e={e} />
            </span>
            <span className="truncate text-xs text-muted-foreground">
              <time dateTime={e.createdAt} className="tabular-nums">
                {dayFmt.format(d)}, {timeFmt.format(d)}
              </time>
              {e.places.length > 0 && <> · {e.places.join(", ")}</>}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
            <span className="font-mono text-sm font-semibold tabular-nums">{cost(e.total)}</span>
            <ChevronRight
              className="size-4 text-muted-foreground transition-transform duration-150 group-open/run:rotate-90 motion-reduce:transition-none"
              aria-hidden
            />
          </span>
        </summary>

        <div className="flex flex-col gap-3 px-3 pt-0.5 pb-3.5">
          <ShareBar
            values={{ google: e.google, maps: e.maps, strength: e.strength, ai: e.ai }}
            total={e.total}
            label="Where this run's cost went"
          />
          <ul className="flex flex-col gap-1.5">
            {lines
              .filter((l) => l.show)
              .map((l) => (
                <LedgerLine key={l.key} part={l.key} detail={l.detail} value={l.value} />
              ))}
          </ul>
          <div className="flex items-baseline justify-between gap-3 border-t border-dashed pt-2 text-[13px]">
            <span className="font-medium">Total</span>
            <span className="font-mono font-semibold tabular-nums">{cost(e.total)}</span>
          </div>
          {facts.length > 0 && (
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {facts.map((f) => (
                <li key={f} className="flex items-center gap-1.5 before:size-1 before:rounded-full before:bg-muted-foreground/40">
                  {f}
                </li>
              ))}
            </ul>
          )}
          {e.error && (
            <p className="flex items-start gap-1.5 text-xs text-danger">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              {e.error}
            </p>
          )}
        </div>
      </details>
    </li>
  )
}

function MonthGroup({ month, entries }: { month: string; entries: RunEntry[] }) {
  const total = entries.reduce((s, e) => s + e.total, 0)
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-3 pl-9 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        <span>{month}</span>
        <span aria-hidden className="h-px flex-1 bg-border" />
        <span className="font-mono tracking-normal normal-case tabular-nums">
          {formatNumber(entries.length)} {entries.length === 1 ? "run" : "runs"} · {cost(total)}
        </span>
      </div>
      <ol className="relative flex flex-col gap-0.5 before:absolute before:top-3 before:bottom-3 before:left-[12.5px] before:w-px before:bg-border">
        {entries.map((e) => (
          <Row key={e.id} e={e} />
        ))}
      </ol>
    </li>
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

/** One paid account: what's left, and how it's measured. */
function AccountTile({
  icon: Icon,
  name,
  left,
  approx,
  warn,
  lines,
  action,
}: {
  icon: LucideIcon
  name: string
  left: number | null
  approx?: boolean
  warn?: string | null
  lines: React.ReactNode[]
  action?: React.ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border bg-card p-3.5", warn && "border-warning/40")}>
      <div className="flex h-7 items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {name}
        </span>
        {action}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-2xl leading-8 font-semibold tracking-tight tabular-nums">
          {left === null ? "—" : `${approx ? "≈ " : ""}${money(left)}`}
        </span>
        <span className="text-xs text-muted-foreground">{left === null ? "not known yet" : "left"}</span>
        {warn && (
          <StatusTag tone="warning" className="ml-auto">
            {warn}
          </StatusTag>
        )}
      </div>
      <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  )
}

function Accounts({ accounts, now }: { accounts: AccountBalances; now: Date }) {
  const d = accounts.dataforseo
  const a = accounts.anthropic
  const dfsLow = d.balance !== null && d.balance < d.low
  const aiLow = a.left !== null && a.left < 5
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Wallet className="size-3.5" aria-hidden />
        Credit left on the accounts
        <span className="font-normal">· admins only</span>
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <AccountTile
          icon={Database}
          name="DataForSEO"
          left={d.balance}
          warn={dfsLow ? "Low, top up" : null}
          lines={[
            d.checkedAt ? `Checked ${formatRelative(d.checkedAt, now)} from the account` : "Checked once an hour",
            `${money(d.monthSpend)} spent this month, all clients (budget ${money(d.monthBudget)})`,
          ]}
          action={
            <a
              href="https://app.dataforseo.com/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:outline-none"
            >
              Top up
              <ArrowUpRight className="size-3" aria-hidden />
            </a>
          }
        />
        <AccountTile
          icon={Sparkles}
          name="Anthropic (Claude)"
          left={a.left}
          approx
          warn={aiLow ? "Low, top up" : null}
          lines={[
            a.credit !== null && a.creditAt
              ? `${money(a.credit)} entered ${shortDay.format(new Date(a.creditAt))}, minus ${cost(a.spentSince)} used since`
              : "Anthropic doesn't share the balance through its API. Enter it once and the app counts down.",
            `${cost(a.monthSpend)} spent this month (AI budget ${money(a.monthBudget)})`,
          ]}
          action={<AnthropicCreditEditor current={a.credit} />}
        />
      </div>
    </div>
  )
}

export function RunHistoryPanel({
  history,
  accounts,
  nowIso,
}: {
  history: RunHistory
  accounts: AccountBalances | null
  nowIso: string
}) {
  const { totals, entries } = history
  const recent = entries.slice(0, VISIBLE)
  const older = entries.slice(VISIBLE)
  const byPart: Record<Part, number> = { google: totals.google, maps: totals.maps, strength: totals.strength, ai: totals.ai }
  const now = new Date(nowIso)

  const figures: { icon: LucideIcon; label: string; value: number; note?: string }[] = [
    {
      icon: CalendarDays,
      label: "This month",
      value: totals.thisMonth,
      note: `${formatNumber(totals.runsThisMonth)} ${totals.runsThisMonth === 1 ? "run" : "runs"}`,
    },
    { icon: CalendarMinus, label: "Last month", value: totals.lastMonth },
    {
      icon: History,
      label: "All time",
      value: totals.allTime,
      note: `${formatNumber(totals.runs)} ${totals.runs === 1 ? "run" : "runs"}`,
    },
  ]

  return (
    <section className="w-full min-w-0 overflow-hidden rounded-xl border bg-card" aria-labelledby="runs-costs-title">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-dashed bg-muted/30 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="runs-costs-title" className="flex items-center gap-2 text-[15px] leading-[22px] font-semibold">
            <ReceiptText className="size-4 text-muted-foreground" aria-hidden />
            Runs and costs
          </h2>
          <p className="text-sm text-muted-foreground">
            What every search, re-rank and strength check cost, down to the cent.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">Arizona time · months start on the 1st</span>
      </header>

      <div className="flex flex-col gap-5 px-4 py-4 sm:px-5">
        {accounts && <Accounts accounts={accounts} now={now} />}

        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-3 divide-x divide-dashed rounded-lg border">
            {figures.map((f) => {
              const Icon = f.icon
              return (
                <div key={f.label} className="flex flex-col gap-0.5 px-3 py-2.5 sm:px-4">
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon className="size-3.5 shrink-0" aria-hidden />
                    {f.label}
                  </dt>
                  <dd className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="font-mono text-lg font-semibold tabular-nums">{money(f.value)}</span>
                    {f.note && <span className="text-xs text-muted-foreground">{f.note}</span>}
                  </dd>
                </div>
              )
            })}
          </dl>
          <div className="flex flex-col gap-2">
            <ShareBar values={byPart} total={totals.allTime} label="Where all the cost went" />
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
              {PARTS.map((p) => {
                const Icon = p.icon
                return (
                  <li key={p.key} className="flex items-center gap-1.5">
                    <Icon className={cn("size-3.5", p.text)} aria-hidden />
                    <span className="text-muted-foreground">{p.short}</span>
                    <span className="font-mono tabular-nums">{cost(byPart[p.key])}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        {entries.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No runs yet. Find places, Re-rank and strength checks show up here with what they cost.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <ol className="flex flex-col gap-3">
              {groupByMonth(recent).map((g) => (
                <MonthGroup key={g.month} month={g.month} entries={g.entries} />
              ))}
            </ol>
            {older.length > 0 && (
              <details className="group/older">
                <summary className="ml-9 flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    className="size-3.5 transition-transform group-open/older:rotate-90 motion-reduce:transition-none"
                    aria-hidden
                  />
                  {formatNumber(older.length)} older {older.length === 1 ? "run" : "runs"}
                </summary>
                <ol className="mt-3 flex flex-col gap-3">
                  {groupByMonth(older).map((g) => (
                    <MonthGroup key={g.month} month={g.month} entries={g.entries} />
                  ))}
                </ol>
              </details>
            )}
          </div>
        )}
      </div>

      <footer className="border-t border-dashed px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
        Searches DataForSEO couldn&apos;t answer aren&apos;t charged. Claude is billed per token by Anthropic.
      </footer>
    </section>
  )
}
