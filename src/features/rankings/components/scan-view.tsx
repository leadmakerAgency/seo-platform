"use client"

import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  Database,
  Download,
  ExternalLink,
  Loader2,
  Plus,
  Radar,
  Search,
  Sparkles,
  X,
} from "@/components/icons"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { PlatformLogo } from "@/components/brand/platform-icons"
import { StatStrip, type StatItem } from "@/components/common/stat-strip"
import { StatusTag } from "@/components/common/status"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { displayUrl, formatNumber, formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import { exportScanCsv, requestRankScan, scanKeywordHistory, trackScanKeywords } from "../actions"
import type { LostRow, ScanFilter, ScanOverview, ScanPageRow, ScanSummary } from "../scan-queries"
import type { ScanSource } from "../scan-sources"
import { VERDICT_META, type Verdict } from "../scan-verdicts"

const VERDICTS: Verdict[] = ["keep", "quick_win", "brand", "watch", "skip"]
const SOURCES: ScanSource[] = ["dataforseo", "search_console", "google_business"]
const SOURCE_META: Record<ScanSource, { label: string; short: string }> = {
  dataforseo: { label: "DataForSEO", short: "DataForSEO" },
  search_console: { label: "Search Console", short: "Search Console" },
  google_business: { label: "Business Profile", short: "Business Profile" },
}
const STEPS = ["Starting", "Reading DataForSEO", "Reading Search Console", "Reading Business Profile", "Judging keywords", "Finishing"]
export const SCAN_ESTIMATE_USD = 0.15

function SourceIcon({ source, className }: { source: ScanSource; className?: string }) {
  if (source === "search_console") return <PlatformLogo platform="googlesearchconsole" className={cn("size-3.5", className)} />
  if (source === "google_business") return <PlatformLogo platform="googlebusiness" className={cn("size-3.5", className)} />
  return <Database className={cn("size-3.5 text-muted-foreground", className)} aria-hidden />
}

export function SourceBadges({ sources }: { sources: ScanSource[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {sources.map((s) => (
        <span key={s} className="inline-flex h-[22px] items-center gap-1 rounded-sm border bg-background px-1.5 text-xs whitespace-nowrap">
          <SourceIcon source={s} className="size-3" />
          {SOURCE_META[s].short}
        </span>
      ))}
    </span>
  )
}

const pos = (n: number | null | undefined) => (n === null || n === undefined ? "–" : Number.isInteger(n) ? String(n) : n.toFixed(1))

function Change({ now, before, isNew }: { now: number | null; before: number | null; isNew: boolean }) {
  if (isNew) return <StatusTag tone="info" dot={false}>New</StatusTag>
  if (now === null || before === null) return <span className="text-muted-foreground">–</span>
  const d = Math.round((before - now) * 10) / 10
  if (Math.abs(d) < 0.5) return <span className="text-muted-foreground">=</span>
  return d > 0 ? (
    <span className="inline-flex items-center gap-0.5 text-success tabular-nums">
      <ArrowUp className="size-3" aria-label="Up" />
      {Math.abs(d)}
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-danger tabular-nums">
      <ArrowDown className="size-3" aria-label="Down" />
      {Math.abs(d)}
    </span>
  )
}

export function ScanView({
  clientId,
  baseHref,
  connectionsHref,
  overview,
  page,
  lost,
  filter,
  showLost,
  canManage,
  keywordsUsed,
  keywordLimit,
  nowIso,
}: {
  clientId: string
  baseHref: string
  connectionsHref: string
  overview: ScanOverview
  page: { total: number; rows: ScanPageRow[] } | null
  lost: LostRow[]
  filter: ScanFilter
  showLost: boolean
  canManage: boolean
  keywordsUsed: number
  keywordLimit: number
  nowIso: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<ScanPageRow | null>(null)
  const latest = overview.latest
  const counts = latest?.counts ?? {}
  const now = new Date(nowIso)
  const rows = useMemo(() => page?.rows ?? [], [page])
  const room = Math.max(0, keywordLimit - keywordsUsed)

  const href = (patch: Partial<Record<"v" | "src" | "q" | "untracked", string | null>>) => {
    const sp = new URLSearchParams({ tab: "now" })
    const cur = { v: showLost ? "lost" : filter.verdict, src: filter.source, q: filter.q, untracked: filter.untracked ? "1" : null }
    for (const [k, v] of Object.entries({ ...cur, ...patch })) if (v) sp.set(k, v)
    return `${baseHref}?${sp}`
  }

  const scanBlocked = overview.open
    ? "A scan is running now."
    : !overview.hasWebsite && !overview.gscAccounts.some((a) => a.status === "connected") && !overview.hasGbp
      ? "Add the website, or connect Search Console or Business Profile first."
      : overview.manualUsed >= overview.manualLimit
        ? `This client has used its ${overview.manualLimit} scans this month. The monthly scan still runs.`
        : null

  const track = (phrases: string[]) =>
    start(async () => {
      if (!phrases.length) return
      if (phrases.length > room) {
        toast.error(`Only ${room} more ${room === 1 ? "keyword fits" : "keywords fit"} (the client tracks ${keywordLimit}). Stop tracking some first, or raise the limit on the Overview.`)
        return
      }
      const r = await trackScanKeywords(clientId, phrases)
      if (!r.ok) toast.error(r.error)
      else {
        toast.success(`Tracking ${r.data.added} ${r.data.added === 1 ? "keyword" : "keywords"}${r.data.skipped ? ` (${r.data.skipped} already tracked)` : ""}. Checked on Google, Maps and Bing every week.`)
        setSelected(new Set())
      }
    })

  const exportCsv = () =>
    start(async () => {
      if (!latest) return
      const r = await exportScanCsv(clientId, latest.id)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      const url = URL.createObjectURL(new Blob([r.data.csv], { type: "text/csv;charset=utf-8" }))
      const a = document.createElement("a")
      a.href = url
      a.download = `ranking-scan-${latest.created_at.slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    })

  const strip: StatItem[] = [
    { key: "all", label: "Everything", count: counts.total ?? 0, href: href({ v: null }), selected: !filter.verdict && !showLost },
    ...VERDICTS.map((v) => ({
      key: v,
      label: VERDICT_META[v].label,
      count: counts[v] ?? 0,
      href: href({ v }),
      selected: filter.verdict === v,
      dot: VERDICT_META[v].tone === "brand" ? ("brand" as const) : VERDICT_META[v].tone,
    })),
    ...(counts.lost !== null && counts.lost !== undefined
      ? [{ key: "lost", label: "Lost since last scan", count: counts.lost ?? 0, href: href({ v: "lost" }), selected: showLost, tone: "danger" as const }]
      : []),
  ]
  const untrackedKeep = rows.filter((r) => r.verdict === "keep" && !r.tracked_id)

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <Radar className="size-4 text-brand" aria-hidden />
              What this client already ranks for
            </h2>
            <p className="max-w-[78ch] text-sm text-muted-foreground">
              Every search the website and the Maps listing show up for, from DataForSEO, Google Search Console and the
              Business Profile. Good ones are marked Keep, so they&apos;re never swapped out as weak.
            </p>
            <p className="text-xs text-muted-foreground">
              {latest?.finished_at ? `Last scan ${formatRelative(latest.finished_at, now)}` : "Not scanned yet"}
              {overview.settings?.scanAuto && overview.settings.scanNextAt
                ? ` · next automatic scan ${formatRelative(overview.settings.scanNextAt, now)}`
                : overview.settings && !overview.settings.scanAuto
                  ? " · monthly scans are off"
                  : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {latest && (
              <Button variant="outline" size="sm" disabled={pending} onClick={exportCsv}>
                <Download />
                Export CSV
              </Button>
            )}
            {canManage && (
              <Button
                size="sm"
                disabled={pending || Boolean(scanBlocked)}
                title={scanBlocked ?? undefined}
                onClick={() =>
                  start(async () => {
                    const r = await requestRankScan(clientId)
                    if (r.ok) toast.success("Scan started. It usually takes a minute or two.")
                    else toast.error(r.error)
                  })
                }
              >
                {overview.open ? <Loader2 className="animate-spin" /> : <Radar />}
                {overview.open ? "Scanning…" : "Scan now"}
              </Button>
            )}
          </div>
        </div>
        {canManage && !overview.open && (
          <p className="text-xs text-muted-foreground">
            About ${SCAN_ESTIMATE_USD.toFixed(2)} in DataForSEO · {Math.max(0, overview.manualLimit - overview.manualUsed)} of{" "}
            {overview.manualLimit} manual scans left this month. Search Console and Business Profile are free.
          </p>
        )}
        <SourceChips overview={overview} connectionsHref={connectionsHref} />
        {overview.open && (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm">
              <span className="font-medium">{STEPS[overview.open.step] ?? "Scanning"}</span>
              <span className="text-muted-foreground"> · this page updates by itself.</span>
            </p>
            <Progress value={((overview.open.step + 1) / STEPS.length) * 100} aria-label="Scan progress" className="max-w-md" />
          </div>
        )}
        {latest?.status === "failed" && !overview.open && (
          <p className="flex items-start gap-2 text-sm text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            The last scan didn&apos;t finish{latest.error ? `: ${latest.error}` : "."}
          </p>
        )}
      </div>

      {!latest || latest.status === "failed" ? (
        !overview.open && (
          <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-5 text-sm">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <p className="font-medium">No scan yet</p>
            <p className="max-w-[70ch] text-muted-foreground">
              A scan lists the searches the client already shows up for and judges each one. Connect Search Console
              for the most complete picture: small sites are often missing from DataForSEO.
            </p>
          </div>
        )
      ) : (
        <>
          <StatStrip items={strip} label="Scan verdicts" />
          {(counts.low_ctr ?? 0) > 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="size-4 text-warning" aria-hidden />
              {formatNumber(counts.low_ctr ?? 0)} {counts.low_ctr === 1 ? "keyword is" : "keywords are"} seen often but
              rarely clicked: a better page title and description could bring visits without ranking higher.
            </p>
          )}

          {showLost ? (
            <LostList rows={lost} />
          ) : (
            <>
              <Filters key={filter.q ?? ""} filter={filter} href={href} />
              {canManage && (selected.size > 0 || untrackedKeep.length > 0) && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  {selected.size > 0 ? (
                    <>
                      <span className="font-medium">{selected.size} selected</span>
                      <Button size="sm" disabled={pending} onClick={() => track([...selected])}>
                        <Plus />
                        Track
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                        <X />
                        Clear
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => track(untrackedKeep.map((r) => r.keyword_norm))}>
                      <Plus />
                      Track all {untrackedKeep.length} Keep
                    </Button>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {room} of {keywordLimit} tracked keyword slots free
                  </span>
                </div>
              )}
              <ScanTable rows={rows} total={page?.total ?? 0} canManage={canManage} selected={selected} setSelected={setSelected} onOpen={setOpen} />
            </>
          )}
        </>
      )}

      <KeywordSheet
        row={open}
        clientId={clientId}
        canManage={canManage}
        onClose={() => setOpen(null)}
        onTrack={(p) => track([p])}
        onOpenHref={() => router.refresh()}
      />
    </div>
  )
}

function SourceChips({ overview, connectionsHref }: { overview: ScanOverview; connectionsHref: string }) {
  const src = overview.latest?.sources ?? {}
  const gscConnected = overview.gscAccounts.some((a) => a.status === "connected")
  const chip = (s: ScanSource) => {
    const st = src[s]
    const connectedNow = s === "search_console" ? gscConnected : s === "google_business" ? overview.hasGbp : overview.hasWebsite
    let text: string
    let tone: "ok" | "muted" | "warn" = "muted"
    let link: string | null = null
    if (!st) {
      if (!connectedNow && s !== "dataforseo") {
        text = "Not connected"
        link = connectionsHref
      } else text = connectedNow ? "Ready for the next scan" : "No website on the client"
    } else if (st.state === "done") {
      tone = "ok"
      text =
        s === "dataforseo"
          ? `${formatNumber(st.count ?? 0)} keywords${st.data_date ? ` · data from ${new Date(st.data_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}`
          : s === "search_console"
            ? `${formatNumber(st.count ?? 0)} searches · 3 months`
            : `${formatNumber(st.count ?? 0)} searches · 3 months`
    } else if (st.state === "no_data") {
      text = s === "dataforseo" ? "No data for this site yet" : "Nothing found"
    } else if (st.state === "not_connected") {
      text = "Not connected"
      link = connectionsHref
    } else {
      tone = st.state === "failed" ? "warn" : "muted"
      text = st.error ?? (st.state === "failed" ? "Didn't work this time" : "Skipped")
    }
    return (
      <li key={s} className={cn("flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs", tone === "warn" && "border-warning/40 bg-warning-soft")}>
        <SourceIcon source={s} />
        <span className="font-medium">{SOURCE_META[s].label}</span>
        <span className={cn("min-w-0 truncate", tone === "ok" ? "text-foreground" : "text-muted-foreground")} title={text}>
          {text}
        </span>
        {link && (
          <Link href={link} className="shrink-0 font-medium text-brand hover:underline">
            Connect
          </Link>
        )}
      </li>
    )
  }
  return <ul className="flex flex-wrap gap-2">{SOURCES.map(chip)}</ul>
}

function Filters({ filter, href }: { filter: ScanFilter; href: (p: Partial<Record<"v" | "src" | "q" | "untracked", string | null>>) => string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [q, setQ] = useState(filter.q ?? "")
  const srcOptions: { value: ScanSource | "several" | null; label: string }[] = [
    { value: null, label: "Any source" },
    ...SOURCES.map((s) => ({ value: s, label: SOURCE_META[s].label })),
    { value: "several", label: "Found by several" },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault()
          const sp = new URLSearchParams(params.toString())
          if (q.trim()) sp.set("q", q.trim())
          else sp.delete("q")
          router.push(`${pathname}?${sp}`, { scroll: false })
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a keyword" className="h-8 w-[220px] pl-8" aria-label="Find a keyword" />
      </form>
      <nav aria-label="Source" className="flex max-w-full overflow-x-auto rounded-lg border bg-card p-0.5">
        {srcOptions.map((o) => (
          <Link
            key={o.label}
            href={href({ src: o.value })}
            scroll={false}
            aria-current={filter.source === o.value ? "page" : undefined}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs whitespace-nowrap",
              filter.source === o.value ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.value && o.value !== "several" && <SourceIcon source={o.value} className="size-3" />}
            {o.label}
          </Link>
        ))}
      </nav>
      <Link
        href={href({ untracked: filter.untracked ? null : "1" })}
        scroll={false}
        aria-pressed={filter.untracked}
        className={cn(
          "flex h-8 items-center rounded-lg border px-2.5 text-xs",
          filter.untracked ? "border-foreground/40 bg-muted font-medium" : "bg-card text-muted-foreground hover:text-foreground",
        )}
      >
        Not tracked yet
      </Link>
    </div>
  )
}

function ScanTable({
  rows,
  total,
  canManage,
  selected,
  setSelected,
  onOpen,
}: {
  rows: ScanPageRow[]
  total: number
  canManage: boolean
  selected: Set<string>
  setSelected: (s: Set<string>) => void
  onOpen: (r: ScanPageRow) => void
}) {
  if (!rows.length) {
    return <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No keywords match these filters.</p>
  }
  const selectable = rows.filter((r) => !r.tracked_id)
  const allOn = selectable.length > 0 && selectable.every((r) => selected.has(r.keyword_norm))
  const toggle = (norm: string) => {
    const next = new Set(selected)
    if (next.has(norm)) next.delete(norm)
    else next.add(norm)
    setSelected(next)
  }
  return (
    <div className="flex flex-col gap-2">
      {/* Phones: cards */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => (
          <li key={r.keyword_norm}>
            <button type="button" onClick={() => onOpen(r)} className="flex w-full flex-col gap-2 rounded-lg border bg-card p-3 text-left">
              <span className="flex items-start justify-between gap-2">
                <span className="font-medium break-words">{r.phrase}</span>
                {r.verdict && <StatusTag tone={VERDICT_META[r.verdict].tone}>{VERDICT_META[r.verdict].short}</StatusTag>}
              </span>
              <SourceBadges sources={r.sources} />
              <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
                <span>Position {pos(r.position)}</span>
                {r.gsc_clicks !== null && r.gsc_clicks !== undefined && <span>{formatNumber(r.gsc_clicks ?? 0)} clicks</span>}
                {(r.city_volume ?? r.national_volume) !== null && <span>{formatNumber((r.city_volume ?? r.national_volume)!)} searches/mo</span>}
                {r.tracked_id && <span className="text-foreground">Tracked</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              {canManage && (
                <th className="w-9 px-3 py-2">
                  <Checkbox
                    checked={allOn}
                    onCheckedChange={(v) => setSelected(v ? new Set(selectable.map((r) => r.keyword_norm)) : new Set())}
                    aria-label="Select all untracked"
                  />
                </th>
              )}
              <th className="px-3 py-2 font-medium">Keyword</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 text-right font-medium">Position</th>
              <th className="px-3 py-2 font-medium">Change</th>
              <th className="px-3 py-2 text-right font-medium">Searches/mo</th>
              <th className="px-3 py-2 text-right font-medium">Clicks · Impr.</th>
              <th className="px-3 py-2 text-right font-medium">CTR</th>
              <th className="px-3 py-2 font-medium">Page</th>
              <th className="px-3 py-2 font-medium">Verdict</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const volume = r.city_volume ?? r.national_volume
              const page = r.gsc_page ?? r.dfs_url
              return (
                <tr key={r.keyword_norm} className="cursor-pointer hover:bg-muted/40" onClick={() => onOpen(r)}>
                  {canManage && (
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      {r.tracked_id ? (
                        <span className="sr-only">Tracked</span>
                      ) : (
                        <Checkbox checked={selected.has(r.keyword_norm)} onCheckedChange={() => toggle(r.keyword_norm)} aria-label={`Select ${r.phrase}`} />
                      )}
                    </td>
                  )}
                  <td className="max-w-[260px] px-3 py-2">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-medium">{r.phrase}</span>
                      {r.is_brand && <StatusTag tone="brand" dot={false}>Brand</StatusTag>}
                      {r.tracked_id && <StatusTag tone="neutral" dot={false}>Tracked</StatusTag>}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <SourceBadges sources={r.sources} />
                  </td>
                  <td
                    className="px-3 py-2 text-right tabular-nums"
                    title={[
                      r.gsc_position !== null ? `Search Console: ${pos(r.gsc_position)} (3-month average)` : null,
                      r.dfs_position !== null && r.dfs_position !== undefined ? `DataForSEO: #${r.dfs_position}` : null,
                      r.city_position !== null ? `Our city check: #${r.city_position}` : null,
                    ]
                      .filter(Boolean)
                      .join("\n")}
                  >
                    {pos(r.position)}
                  </td>
                  <td className="px-3 py-2">
                    <Change now={r.position ?? null} before={r.prev_position} isNew={r.is_new} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {volume === null || volume === undefined ? "–" : formatNumber(volume)}
                    {r.city_volume === null && r.national_volume !== null && <span className="text-xs text-muted-foreground"> nat.</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    {r.gsc_clicks === null ? (r.gbp_reach !== null && r.gbp_reach !== undefined ? `${r.gbp_below_threshold ? "<15" : formatNumber(r.gbp_reach)} on Maps` : "–") : `${formatNumber(r.gsc_clicks ?? 0)} · ${formatNumber(r.gsc_impressions ?? 0)}`}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", r.low_ctr && "text-warning")} title={r.low_ctr ? "Seen but rarely clicked" : undefined}>
                    {r.gsc_ctr === null || r.gsc_ctr === undefined ? "–" : `${Math.round(r.gsc_ctr * 1000) / 10}%`}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-muted-foreground">{page ? displayUrl(page) : "–"}</td>
                  <td className="px-3 py-2" title={(r.reasons ?? []).join("\n")}>
                    {r.verdict && <StatusTag tone={VERDICT_META[r.verdict].tone}>{VERDICT_META[r.verdict].short}</StatusTag>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {total > rows.length && (
        <p className="text-xs text-muted-foreground">
          Showing the best {formatNumber(rows.length)} of {formatNumber(total)}. Narrow the filters, or export the CSV for all of them.
        </p>
      )}
    </div>
  )
}

function LostList({ rows }: { rows: LostRow[] }) {
  if (!rows.length) return <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">Nothing good was lost since the last scan.</p>
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">Keywords judged Keep or Quick win last time that the site no longer shows up for.</p>
      <ul className="divide-y rounded-lg border bg-card">
        {rows.map((r) => (
          <li key={r.keyword_norm} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium">{r.phrase}</span>
            <SourceBadges sources={r.sources} />
            <span className="text-muted-foreground tabular-nums">was {pos(r.position)}</span>
            <StatusTag tone={VERDICT_META[r.verdict].tone}>{VERDICT_META[r.verdict].short}</StatusTag>
          </li>
        ))}
      </ul>
    </div>
  )
}

function KeywordSheet({
  row,
  clientId,
  canManage,
  onClose,
  onTrack,
}: {
  row: ScanPageRow | null
  clientId: string
  canManage: boolean
  onClose: () => void
  onTrack: (phrase: string) => void
  onOpenHref: () => void
}) {
  const [history, setHistory] = useState<{ at: string; position: number | null; clicks: number | null; verdict: Verdict | null }[]>([])
  useEffect(() => {
    let live = true
    if (row) scanKeywordHistory(clientId, row.keyword_norm).then((h) => live && setHistory(h))
    return () => {
      live = false
    }
  }, [row, clientId])
  return (
    <Sheet open={Boolean(row)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {row && (
          <>
            <SheetHeader className="border-b px-5 py-4">
              <SheetTitle className="flex flex-wrap items-center gap-2 break-words">
                {row.phrase}
                {row.verdict && <StatusTag tone={VERDICT_META[row.verdict].tone}>{VERDICT_META[row.verdict].label}</StatusTag>}
              </SheetTitle>
              <SheetDescription>{row.verdict ? VERDICT_META[row.verdict].explain : "Not judged yet."}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-5 px-5 py-4 text-sm">
              <section className="flex flex-col gap-1.5">
                <h3 className="font-semibold">Why</h3>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
                  {(row.reasons ?? []).map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </section>
              <section className="grid grid-cols-2 gap-3">
                <Fact label="DataForSEO position" value={row.dfs_position !== null && row.dfs_position !== undefined ? `#${row.dfs_position}${row.dfs_type && row.dfs_type !== "organic" ? ` (${row.dfs_type.replace("_", " ")})` : ""}` : "–"} />
                <Fact label="Search Console position" value={pos(row.gsc_position)} />
                <Fact label="Clicks · impressions (3 mo)" value={row.gsc_clicks === null ? "–" : `${formatNumber(row.gsc_clicks ?? 0)} · ${formatNumber(row.gsc_impressions ?? 0)}`} />
                <Fact label="Maps listing reach" value={row.gbp_below_threshold ? "Under 15 a month" : row.gbp_reach !== null && row.gbp_reach !== undefined ? `${formatNumber(row.gbp_reach)} a month` : "–"} />
                <Fact label="Searches a month (city)" value={row.city_volume === null || row.city_volume === undefined ? "–" : formatNumber(row.city_volume)} />
                <Fact label="Searches a month (national)" value={row.national_volume === null || row.national_volume === undefined ? "–" : formatNumber(row.national_volume)} />
                <Fact label="Our weekly city check" value={row.city_position !== null ? `#${row.city_position}` : row.tracked_id ? "Not in the top 100" : "Not tracked"} />
                <Fact label="Previous scan" value={row.is_new ? "New this scan" : pos(row.prev_position)} />
              </section>
              {history.length > 1 && (
                <section className="flex flex-col gap-1.5">
                  <h3 className="font-semibold">Across recent scans</h3>
                  <ol className="flex flex-wrap gap-2">
                    {history.map((h) => (
                      <li key={h.at} className="rounded-md border px-2 py-1 text-xs tabular-nums">
                        {new Date(h.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: {pos(h.position)}
                      </li>
                    ))}
                  </ol>
                </section>
              )}
              <section className="flex flex-col gap-1.5">
                {(row.gsc_page ?? row.dfs_url) && (
                  <a href={(row.gsc_page ?? row.dfs_url)!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-brand hover:underline">
                    <ExternalLink className="size-3.5" />
                    {displayUrl((row.gsc_page ?? row.dfs_url)!)}
                  </a>
                )}
                {row.dfs_check_url && (
                  <a href={row.dfs_check_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                    <ExternalLink className="size-3.5" />
                    See the Google results DataForSEO saw
                  </a>
                )}
              </section>
              {canManage && !row.tracked_id && (
                <Button className="w-fit" onClick={() => onTrack(row.keyword_norm)}>
                  <Plus />
                  Track this keyword
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border bg-background px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

export type { ScanSummary }
