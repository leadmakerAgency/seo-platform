"use client"

import { ArrowDownUp, ArrowUpRight, ChevronDown, ChevronUp, Search, TriangleAlert } from "@/components/icons"
import Link from "next/link"
import { useMemo, useState } from "react"

import { StatStrip, type StatItem } from "@/components/common/stat-strip"
import { StatusTag } from "@/components/common/status"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { displayUrl, formatDate, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { ENGINE_META, type Engine } from "../constants"
import type { TrackedKeyword } from "../queries"
import { Difficulty, formatUsd, formatVolume, IntentTag, Position } from "./bits"
import { ReplaceKeywordDialog, StopTrackingDialog, type ReplaceOption } from "./keyword-dialogs"
import { PositionChart } from "./position-chart"

export type KeywordFilter = "all" | "top3" | "top10" | "missing" | "maps3" | "weak"

type SortKey = "phrase" | Engine | "volume" | "difficulty" | "score"

const KEYWORD_SOURCE: Record<string, string> = {
  manual: "Added by hand",
  research: "From keyword research",
  onboarding: "From onboarding",
  ranked: "Already ranking for it",
}

const FEATURE_LABELS: Record<string, string> = {
  local_pack: "Map pack",
  featured_snippet: "Featured snippet",
  ai_overview: "AI overview",
  people_also_ask: "People also ask",
  images: "Images",
  video: "Videos",
  top_stories: "Top stories",
  knowledge_graph: "Knowledge panel",
  paid: "Ads",
  local_services: "Local services ads",
  related_searches: "Related searches",
  shopping: "Shopping",
}

/** The Keywords tab: counts that filter, the sortable table and the per-keyword sheet. */
export function KeywordsView({
  keywords,
  engines,
  filter,
  baseHref,
  canManage,
  replaceOptions,
  suggested,
}: {
  keywords: TrackedKeyword[]
  engines: Engine[]
  filter: KeywordFilter
  baseHref: string
  canManage: boolean
  /** Untracked research candidates, best first (for Replace). */
  replaceOptions: ReplaceOption[]
  /** Suggested replacement per weak keyword id. */
  suggested: Record<string, ReplaceOption>
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "google", dir: 1 })
  const [query, setQuery] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)

  const g = (k: TrackedKeyword) => k.engines.google
  const inRange = (p: number | null | undefined, max: number) => typeof p === "number" && p <= max
  const count = (pick: (k: TrackedKeyword) => number | null | undefined, max: number) =>
    keywords.filter((k) => inRange(pick(k), max)).length
  const countBefore = (engine: Engine, max: number) => {
    // Like for like: only keywords checked at least twice on this engine.
    const compared = keywords.filter((k) => (k.engines[engine]?.history.length ?? 0) > 1)
    return {
      now: compared.filter((k) => inRange(k.engines[engine]!.position, max)).length,
      before: compared.filter((k) => inRange(k.engines[engine]!.previous, max)).length,
    }
  }
  const note = (engine: Engine, max: number) => {
    const checkedTwice = keywords.some((k) => (k.engines[engine]?.history.length ?? 0) > 1)
    if (!checkedTwice) return undefined
    const { now, before } = countBefore(engine, max)
    const d = now - before
    return d === 0 ? "Same as last check" : `${d > 0 ? "+" : ""}${d} since last check`
  }
  const checked = keywords.filter((k) => g(k))
  const href = (f: KeywordFilter) =>
    f === "all" || f === filter ? `${baseHref}?tab=keywords` : `${baseHref}?tab=keywords&show=${f}`

  const stats: StatItem[] = [
    { key: "top3", label: "Google top 3", count: count((k) => g(k)?.position, 3), href: href("top3"), selected: filter === "top3", note: note("google", 3) },
    { key: "top10", label: "Google top 10", count: count((k) => g(k)?.position, 10), href: href("top10"), selected: filter === "top10", note: note("google", 10) },
    {
      key: "missing",
      label: "Not in the top 100",
      count: checked.filter((k) => g(k)!.position === null).length,
      href: href("missing"),
      selected: filter === "missing",
    },
    ...(engines.includes("google_maps")
      ? [
          {
            key: "maps3",
            label: "Maps top 3",
            count: count((k) => k.engines.google_maps?.position, 3),
            href: href("maps3"),
            selected: filter === "maps3",
            note: note("google_maps", 3),
          },
        ]
      : []),
  ]

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = keywords.filter((k) => {
      if (q && !k.phrase.includes(q)) return false
      switch (filter) {
        case "top3":
          return inRange(k.engines.google?.position, 3)
        case "top10":
          return inRange(k.engines.google?.position, 10)
        case "missing":
          return Boolean(k.engines.google) && k.engines.google!.position === null
        case "maps3":
          return inRange(k.engines.google_maps?.position, 3)
        case "weak":
          return k.weak.length > 0
        default:
          return true
      }
    })
    const value = (k: TrackedKeyword): number | string | null => {
      switch (sort.key) {
        case "phrase":
          return k.phrase
        case "volume":
          return k.localVolume ?? k.nationalVolume
        case "difficulty":
          return k.difficulty
        case "score":
          return k.score
        default:
          return k.engines[sort.key]?.position ?? null
      }
    }
    return [...filtered].sort((a, b) => {
      const va = value(a)
      const vb = value(b)
      if (va === vb) return a.phrase.localeCompare(b.phrase)
      if (va === null) return 1 // not found / unknown always last
      if (vb === null) return -1
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * sort.dir
      return ((va as number) - (vb as number)) * sort.dir
    })
  }, [keywords, filter, query, sort])

  const open = keywords.find((k) => k.id === openId) ?? null

  function header(key: SortKey, label: string, align: "left" | "right" = "right") {
    const active = sort.key === key
    return (
      <th className={cn("px-3 py-2 font-medium", align === "right" ? "text-right" : "text-left")} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
        <button
          type="button"
          onClick={() =>
            setSort((s) =>
              s.key === key
                ? { key, dir: (s.dir * -1) as 1 | -1 }
                : { key, dir: key === "volume" || key === "score" ? -1 : 1 },
            )
          }
          className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
        >
          {label}
          {active ? (
            sort.dir === 1 ? (
              <ChevronUp className="size-3" aria-hidden />
            ) : (
              <ChevronDown className="size-3" aria-hidden />
            )
          ) : (
            <ArrowDownUp className="size-3 opacity-50" aria-hidden />
          )}
        </button>
      </th>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {keywords.length > 0 && <StatStrip items={stats} label="Filter keywords by position" />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a keyword"
            aria-label="Find a keyword"
            className="h-8 w-full rounded-lg border border-input bg-card pr-3 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35"
          />
        </div>
        <p className="text-[13px] text-muted-foreground">
          {filter !== "all" && (
            <>
              Showing {formatNumber(rows.length)} of {formatNumber(keywords.length)} ·{" "}
              <Link href={`${baseHref}?tab=keywords`} scroll={false} className="text-brand hover:underline">
                Show all
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              {header("phrase", "Keyword", "left")}
              {engines.map((e) => header(e, ENGINE_META[e].short))}
              {header("volume", "Searches/mo")}
              {header("difficulty", "Difficulty")}
              <th className="px-3 py-2 text-left font-medium">Ranking page</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((k) => (
              <tr key={k.id} className={cn("hover:bg-muted/60", openId === k.id && "bg-brand-soft hover:bg-brand-soft")}>
                <td className="max-w-[320px] px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setOpenId(k.id)}
                    className="flex flex-col items-start gap-1 text-left outline-none focus-visible:underline"
                  >
                    <span className="font-medium">{k.phrase}</span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <IntentTag intent={k.intent} />
                      {k.weak.length > 0 && (
                        <StatusTag tone="warning">Weak</StatusTag>
                      )}
                      {k.topic && <span className="text-xs text-muted-foreground">{k.topic}</span>}
                    </span>
                  </button>
                </td>
                {engines.map((e) => {
                  const r = k.engines[e]
                  return (
                    <td key={e} className="px-3 py-2 text-right align-top">
                      <div className="flex flex-col items-end gap-0.5">
                        <Position engine={e} position={r?.position ?? null} previous={r?.previous ?? null} checked={Boolean(r)} />
                        {r && r.start !== null && r.start !== r.position && (r.history.length ?? 0) > 1 && (
                          <span className="text-xs text-muted-foreground tabular-nums">started {r.start}</span>
                        )}
                        {e === "google" && r?.localPack && (
                          <span className="text-xs text-muted-foreground tabular-nums">map pack #{r.localPack}</span>
                        )}
                      </div>
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-right align-top tabular-nums">
                  {k.localVolume !== null ? (
                    formatNumber(k.localVolume)
                  ) : k.nationalVolume !== null ? (
                    <span className="text-muted-foreground" title="National estimate (no figure for the city yet)">
                      {formatNumber(k.nationalVolume)} US
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right align-top">
                  <Difficulty value={k.difficulty} />
                </td>
                <td className="max-w-[220px] px-3 py-2 align-top">
                  {k.engines.google?.url ? (
                    <a
                      href={k.engines.google.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-[13px] text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {displayUrl(k.engines.google.url).replace(/^[^/]+/, "") || "/"}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={engines.length + 4} className="px-3 py-6 text-sm text-muted-foreground">
                  No keywords match. <Link href={`${baseHref}?tab=keywords`} scroll={false} className="text-brand hover:underline">Show all</Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={Boolean(open)} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-[560px]">
          {open && (
            <KeywordDetails
              k={open}
              engines={engines}
              baseHref={baseHref}
              canManage={canManage}
              options={replaceOptions.filter((o) => !open.topic || !o.topic || o.topic === open.topic)}
              suggested={suggested[open.id] ?? null}
              onClose={() => setOpenId(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function KeywordDetails({
  k,
  engines,
  baseHref,
  canManage,
  options,
  suggested,
  onClose,
}: {
  k: TrackedKeyword
  engines: Engine[]
  baseHref: string
  canManage: boolean
  options: ReplaceOption[]
  suggested: ReplaceOption | null
  onClose: () => void
}) {
  const google = k.engines.google
  const features = google?.features.filter((f) => f !== "organic") ?? []
  const lastChecked = engines
    .map((e) => k.engines[e]?.checkedAt)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1)

  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle className="pr-8">{k.phrase}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-1.5">
          <IntentTag intent={k.intent} />
          {k.topic && <span>{k.topic}</span>}
          <span>· {KEYWORD_SOURCE[k.source] ?? "Added by hand"}</span>
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-6 px-4 pb-6">
        {k.weak.length > 0 && (
          <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <div className="flex flex-col gap-1">
              <p className="font-medium">Weak keyword</p>
              <ul className="list-disc pl-4 text-[13px]">
                {k.weak.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              {suggested && (
                <p className="text-[13px]">
                  Better: <span className="font-medium">{suggested.phrase}</span> (
                  {formatVolume(suggested.local_volume ?? suggested.national_volume)}/mo, score {suggested.score})
                </p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border">
          {engines.map((e) => {
            const r = k.engines[e]
            return (
              <div key={e} className="flex flex-col gap-1 bg-card px-3 py-2.5">
                <span className="text-xs text-muted-foreground">{ENGINE_META[e].label}</span>
                <span className="font-heading text-xl font-semibold tabular-nums">
                  <Position engine={e} position={r?.position ?? null} previous={r?.previous ?? null} checked={Boolean(r)} className="text-xl" />
                </span>
                {r && r.start !== null && (
                  <span className="text-xs text-muted-foreground tabular-nums">First check: {r.start}</span>
                )}
                {e === "google_maps" && r?.mapsRating !== null && r?.mapsRating !== undefined && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {r.mapsRating.toFixed(1)}★ · {formatNumber(r.mapsReviews ?? 0)} reviews
                  </span>
                )}
              </div>
            )
          })}
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Position by week</h3>
          <PositionChart engines={Object.fromEntries(engines.map((e) => [e, k.engines[e]]))} />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Searches and difficulty</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Fact label="Searches a month in the city" value={formatVolume(k.localVolume)} />
            <Fact label="Searches a month, whole country" value={formatVolume(k.nationalVolume)} />
            <Fact label="Difficulty (0–100)" value={<Difficulty value={k.difficulty} />} />
            <Fact label="Cost per click on Google Ads" value={k.cpc !== null ? formatUsd(k.cpc) : "—"} />
            <Fact label="Score" value={`${k.score} of 100`} />
            <Fact label="Last checked" value={lastChecked ? formatDate(lastChecked) : "Not yet"} />
          </dl>
          <MonthlySearches monthly={k.monthly} />
        </section>

        {google && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">On the Google results page</h3>
            <ul className="flex flex-col gap-1.5 text-sm">
              <li>
                {google.url ? (
                  <>
                    Ranking page:{" "}
                    <a href={google.url} target="_blank" rel="noreferrer" className="break-all text-brand hover:underline">
                      {displayUrl(google.url)}
                    </a>
                  </>
                ) : (
                  <span className="text-muted-foreground">The website isn&apos;t in the top 100.</span>
                )}
              </li>
              <li>
                {google.localPack
                  ? `In the map pack at #${google.localPack}.`
                  : features.includes("local_pack")
                    ? "There is a map pack, and the business isn't in it."
                    : "No map pack on this search."}
              </li>
              <li>
                {google.inAiOverview
                  ? "The AI overview cites the website."
                  : features.includes("ai_overview")
                    ? "There is an AI overview, and it doesn't cite the website."
                    : "No AI overview on this search."}
              </li>
              {features.length > 0 && (
                <li className="flex flex-wrap gap-1 pt-1">
                  {features.map((f) => (
                    <span key={f} className="rounded-sm bg-muted px-1.5 py-px text-xs text-muted-foreground">
                      {FEATURE_LABELS[f] ?? f.replace(/_/g, " ")}
                    </span>
                  ))}
                </li>
              )}
              {google.checkUrl && (
                <li>
                  <a href={google.checkUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-brand hover:underline">
                    See these results on Google
                    <ArrowUpRight className="size-3.5" aria-hidden />
                  </a>
                </li>
              )}
            </ul>
          </section>
        )}

        <p className="text-xs text-muted-foreground">
          Tracked since {formatDate(k.addedAt)}
          {k.firstCheckedAt ? ` · first checked ${formatDate(k.firstCheckedAt)}` : ""}
        </p>

        {canManage && (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <ReplaceKeywordDialog
              keywordId={k.id}
              phrase={k.phrase}
              options={options}
              initial={suggested?.phrase ?? ""}
              onDone={onClose}
              trigger={<Button>Replace…</Button>}
            />
            <StopTrackingDialog
              keywordId={k.id}
              phrase={k.phrase}
              onDone={onClose}
              trigger={<Button variant="outline">Stop tracking</Button>}
            />
            {k.weak.length > 0 && (
              <Button asChild variant="ghost">
                <Link href={`${baseHref}?tab=research`}>See better keywords</Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** Searches per month (last 12), one series: bars with the value on hover and as text. */
function MonthlySearches({ monthly }: { monthly: TrackedKeyword["monthly"] }) {
  const [hover, setHover] = useState<number | null>(null)
  const last = [...monthly]
    .filter((m) => m.year && m.month)
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .slice(-12)
  if (last.length < 2) return null
  const max = Math.max(1, ...last.map((m) => m.search_volume ?? 0))
  const h = hover !== null ? last[hover] : null
  return (
    <div className="flex flex-col gap-1.5 pt-2">
      <p className="text-xs text-muted-foreground">
        {h
          ? `${MONTHS[h.month - 1]} ${h.year}: ${formatVolume(h.search_volume)} searches`
          : `Searches by month (highest ${formatNumber(max)})`}
      </p>
      <div className="flex h-16 items-end gap-0.5" onPointerLeave={() => setHover(null)}>
        {last.map((m, i) => (
          <div
            key={`${m.year}-${m.month}`}
            className="flex h-full flex-1 items-end"
            onPointerEnter={() => setHover(i)}
          >
            <div
              className={cn("w-full rounded-t-[3px] bg-chart-1", hover !== null && hover !== i && "opacity-50")}
              style={{ height: `${Math.max(2, ((m.search_volume ?? 0) / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-0.5 text-[10px] text-muted-foreground">
        {last.map((m) => (
          <span key={`${m.year}-${m.month}`} className="flex-1 text-center">
            {MONTHS[m.month - 1][0]}
          </span>
        ))}
      </div>
      <ul className="sr-only">
        {last.map((m) => (
          <li key={`${m.year}-${m.month}`}>
            {MONTHS[m.month - 1]} {m.year}: {formatVolume(m.search_volume)}
          </li>
        ))}
      </ul>
    </div>
  )
}
