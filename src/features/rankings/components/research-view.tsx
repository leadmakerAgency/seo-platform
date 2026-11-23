"use client"

import { ArrowRight, ChevronDown, Search } from "@/components/icons"
import Link from "next/link"
import { useMemo, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { StatusTag } from "@/components/common/status"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatNumber, formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import { replaceKeyword, runResearch, setCandidateDismissed, trackCandidate } from "../actions"
import {
  INTENT_META,
  intentOf,
  RESEARCH_ESTIMATE_USD,
  RESEARCH_STATUS_META,
  type Intent,
} from "../constants"
import type { Candidate, ResearchData } from "../queries"
import { Difficulty, formatUsd, formatVolume, IntentTag, SourceTags } from "./bits"

export type TrackedLite = { id: string; phrase: string; topic: string | null; score: number; weak: string[]; localVolume: number | null; nationalVolume: number | null; intent: Intent | null }
export type Swap = { keyword: TrackedLite; candidate: Candidate }

const STEPS = 8
const PAGE = 50

/** The "Find better keywords" tab: run research, suggested swaps, every candidate. */
export function ResearchView({
  clientId,
  city,
  research,
  tracked,
  limit,
  swaps,
  canManage,
  configured,
  baseHref,
  nowIso,
  dismissedList,
}: {
  clientId: string
  city: string | null
  research: ResearchData
  tracked: TrackedLite[]
  limit: number
  swaps: Swap[]
  canManage: boolean
  configured: boolean
  baseHref: string
  nowIso: string
  /** Set when the dismissed list is open (?dismissed=1). */
  dismissedList: Candidate[] | null
}) {
  const now = new Date(nowIso)
  const run = research.lastRun
  const running = run?.status === "queued" || run?.status === "running"
  const left = Math.max(0, research.runLimit - research.runsThisMonth)
  const [pending, startTransition] = useTransition()

  const disabledReason = !configured
    ? "DataForSEO isn't connected yet."
    : running
      ? "Research is already running."
      : research.overBudget
        ? "This month's DataForSEO budget is used up. An admin can raise it in Settings."
        : left === 0
          ? `All ${research.runLimit} research runs for this month are used.`
          : null

  const counts = (run?.counts ?? {}) as Record<string, number>

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-[15px] font-semibold">Keyword research</h2>
            <p className="max-w-[70ch] text-sm text-muted-foreground">
              Looks at what the website already ranks for, ideas from the client&apos;s services and
              what local competitors rank for. Every keyword gets searches a month
              {city ? ` in ${city}` : " in the client's city"}, a difficulty and a score, so we can
              swap weak keywords for better ones.
            </p>
          </div>
          {canManage && (
            <div className="flex flex-col items-end gap-1">
              <WithReason reason={disabledReason}>
                <Button
                  disabled={pending || Boolean(disabledReason)}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await runResearch(clientId)
                      if (!r.ok) toast.error(r.error)
                      else toast.success("Research started. It takes a few minutes.")
                    })
                  }
                >
                  {run ? "Run research again" : "Run research"}
                </Button>
              </WithReason>
              <span className="text-xs text-muted-foreground tabular-nums">
                About {formatUsd(RESEARCH_ESTIMATE_USD)} · {left} of {research.runLimit} runs left this month
              </span>
            </div>
          )}
        </div>

        {run && (
          <div className="flex flex-col gap-2 border-t pt-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StatusTag tone={RESEARCH_STATUS_META[run.status].tone}>{RESEARCH_STATUS_META[run.status].label}</StatusTag>
              <span className="text-muted-foreground">
                {running
                  ? `Started ${formatRelative(run.started_at ?? run.created_at, now)}`
                  : run.finished_at
                    ? `Finished ${formatRelative(run.finished_at, now)}`
                    : `Started ${formatRelative(run.created_at, now)}`}
                {run.status === "done" && Number(run.cost_usd) > 0 && ` · cost ${formatUsd(Number(run.cost_usd))}`}
              </span>
            </div>
            {running && (
              <div className="flex max-w-md flex-col gap-1">
                <Progress value={(Math.min(run.step, STEPS) / STEPS) * 100} aria-label="Research progress" />
                <span className="text-xs text-muted-foreground">
                  Step {Math.min(run.step + 1, STEPS)} of {STEPS}. This page updates by itself.
                </span>
              </div>
            )}
            {run.status === "failed" && run.error && <p className="text-[13px] text-danger">{run.error}</p>}
            {run.status === "done" && (
              <p className="text-[13px] text-muted-foreground tabular-nums">
                {[
                  counts.ranked !== undefined && `${formatNumber(counts.ranked)} already ranking`,
                  counts.ideas !== undefined && `${formatNumber(counts.ideas)} ideas`,
                  counts.competitor_keywords !== undefined &&
                    `${formatNumber(counts.competitor_keywords)} from competitors`,
                  counts.kept !== undefined && `${formatNumber(counts.kept)} relevant`,
                  counts.new !== undefined && `${formatNumber(counts.new)} new since last time`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
        )}
      </section>

      {swaps.length > 0 && <Swaps swaps={swaps} canManage={canManage} />}

      {dismissedList ? (
        <Dismissed clientId={clientId} list={dismissedList} baseHref={baseHref} canManage={canManage} />
      ) : (
        <Candidates
          clientId={clientId}
          candidates={research.candidates}
          tracked={tracked}
          limit={limit}
          canManage={canManage}
          dismissedCount={research.dismissed}
          baseHref={baseHref}
          hasRun={Boolean(run)}
        />
      )}
    </div>
  )
}

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

function Swaps({ swaps, canManage }: { swaps: Swap[]; canManage: boolean }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const shown = swaps.filter((s) => !hidden.has(s.keyword.id))
  if (shown.length === 0) return null
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[15px] font-semibold">Suggested swaps</h2>
        <p className="text-sm text-muted-foreground">
          Weak tracked keywords, each with a better keyword on the same service. Nothing changes
          until someone presses Replace.
        </p>
      </div>
      <ul className="flex flex-col divide-y rounded-lg border bg-card">
        {shown.map(({ keyword: k, candidate: c }) => (
          <li key={k.id} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_auto_1fr_auto] md:items-center">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{k.phrase}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatVolume(k.localVolume ?? k.nationalVolume)}/mo
                {k.intent ? ` · ${INTENT_META[k.intent].label}` : ""} · score {k.score}
              </span>
              <span className="text-xs text-warning">{k.weak[0]}</span>
            </div>
            <ArrowRight className="hidden size-4 text-muted-foreground md:block" aria-hidden />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{c.phrase}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatVolume(c.local_volume ?? c.national_volume)}/mo
                {intentOf(c.intent) ? ` · ${INTENT_META[intentOf(c.intent)!].label}` : ""} · score {c.score}
                {c.difficulty !== null ? ` · difficulty ${c.difficulty}` : ""}
              </span>
            </div>
            {canManage && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await replaceKeyword(k.id, c.phrase)
                      if (!r.ok) toast.error(r.error)
                      else toast.success(`Now tracking “${c.phrase}” instead of “${k.phrase}”`)
                    })
                  }
                >
                  Replace
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setHidden((h) => new Set(h).add(k.id))}>
                  Not now
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

type Filters = { q: string; min: string; intent: string; topic: string; source: string }

function Candidates({
  clientId,
  candidates,
  tracked,
  limit,
  canManage,
  dismissedCount,
  baseHref,
  hasRun,
}: {
  clientId: string
  candidates: Candidate[]
  tracked: TrackedLite[]
  limit: number
  canManage: boolean
  dismissedCount: number
  baseHref: string
  hasRun: boolean
}) {
  const [f, setF] = useState<Filters>({ q: "", min: "0", intent: "any", topic: "any", source: "any" })
  const [shown, setShown] = useState(PAGE)
  const [pending, startTransition] = useTransition()
  const trackedNorms = new Set(tracked.map((t) => t.phrase))
  const atLimit = tracked.length >= limit

  const topics = useMemo(
    () => [...new Set(candidates.map((c) => c.topic).filter((t): t is string => Boolean(t)))].sort(),
    [candidates],
  )

  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase()
    const min = Number(f.min)
    return candidates.filter((c) => {
      if (q && !c.phrase.includes(q)) return false
      if (min > 0 && (c.local_volume ?? c.national_volume ?? 0) < min) return false
      if (f.intent !== "any" && c.intent !== f.intent) return false
      if (f.topic !== "any" && c.topic !== f.topic) return false
      if (f.source !== "any") {
        const s = f.source === "ideas" ? ["ideas", "suggestions", "related"] : [f.source]
        if (!c.sources.some((x) => s.includes(x))) return false
      }
      return true
    })
  }, [candidates, f])

  function track(c: Candidate) {
    startTransition(async () => {
      const r = await trackCandidate(clientId, c.keyword_norm)
      if (!r.ok) toast.error(r.error)
      else toast.success(`Now tracking “${c.phrase}”. Its first check starts now.`)
    })
  }

  function dismiss(c: Candidate) {
    startTransition(async () => {
      const r = await setCandidateDismissed(clientId, c.keyword_norm, true)
      if (!r.ok) return void toast.error(r.error)
      toast(`Dismissed “${c.phrase}”`, {
        action: {
          label: "Undo",
          onClick: () => void setCandidateDismissed(clientId, c.keyword_norm, false),
        },
      })
    })
  }

  if (candidates.length === 0) {
    return (
      <section className="flex flex-col gap-1 rounded-lg border border-dashed p-4 text-sm">
        <p className="font-medium">No keyword ideas yet</p>
        <p className="text-muted-foreground">
          {hasRun
            ? "The last research run didn't find relevant keywords. Check the topic terms in Settings, then run it again."
            : "Run keyword research to find keywords worth tracking."}
        </p>
        {dismissedCount > 0 && (
          <Link href={`${baseHref}?tab=research&dismissed=1`} className="text-[13px] text-brand hover:underline">
            Show {formatNumber(dismissedCount)} dismissed
          </Link>
        )}
      </section>
    )
  }

  const set = (patch: Partial<Filters>) => {
    setF((v) => ({ ...v, ...patch }))
    setShown(PAGE)
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold">All keyword ideas</h2>
          <p className="text-sm text-muted-foreground">
            Best first. {formatNumber(tracked.length)} of {formatNumber(limit)} tracked
            {atLimit ? ", so new ones replace a tracked keyword." : "."}
          </p>
        </div>
        {dismissedCount > 0 && (
          <Link href={`${baseHref}?tab=research&dismissed=1`} className="text-[13px] text-brand hover:underline">
            Show {formatNumber(dismissedCount)} dismissed
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full max-w-60">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={f.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Find a keyword"
            aria-label="Find a keyword"
            className="h-8 w-full rounded-lg border border-input bg-card pr-3 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35"
          />
        </div>
        <FilterSelect label="Searches" value={f.min} onChange={(min) => set({ min })} options={[["0", "Any searches"], ["10", "10+ a month"], ["50", "50+ a month"], ["100", "100+ a month"], ["500", "500+ a month"]]} />
        <FilterSelect
          label="Intent"
          value={f.intent}
          onChange={(intent) => set({ intent })}
          options={[["any", "Any intent"], ...(Object.keys(INTENT_META) as Intent[]).map((i) => [i, INTENT_META[i].label] as [string, string])]}
        />
        {topics.length > 1 && (
          <FilterSelect label="Service" value={f.topic} onChange={(topic) => set({ topic })} options={[["any", "Any service"], ...topics.map((t) => [t, t] as [string, string])]} />
        )}
        <FilterSelect
          label="Found in"
          value={f.source}
          onChange={(source) => set({ source })}
          options={[["any", "Any source"], ["ranked", "Already ranking"], ["ideas", "Ideas"], ["competitor", "Competitors"]]}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-right font-medium">Score</th>
              <th className="px-3 py-2 text-left font-medium">Keyword</th>
              <th className="px-3 py-2 text-right font-medium">{"City searches"}</th>
              <th className="px-3 py-2 text-right font-medium">US searches</th>
              <th className="px-3 py-2 text-right font-medium">Difficulty</th>
              <th className="px-3 py-2 text-left font-medium">Intent</th>
              <th className="px-3 py-2 text-right font-medium">CPC</th>
              <th className="px-3 py-2 text-right font-medium">Google now</th>
              {canManage && <th className="px-3 py-2"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.slice(0, shown).map((c) => {
              const isTracked = c.status === "tracked" || trackedNorms.has(c.keyword_norm)
              return (
                <tr key={c.keyword_norm} className="hover:bg-muted/60">
                  <td className="px-3 py-2 text-right align-top font-medium tabular-nums">{c.score}</td>
                  <td className="max-w-[300px] px-3 py-2 align-top">
                    <div className="flex flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{c.phrase}</span>
                        {isTracked && <StatusTag tone="success">Tracked</StatusTag>}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <SourceTags sources={c.sources} />
                        {c.topic && <span className="text-xs text-muted-foreground">{c.topic}</span>}
                      </span>
                      {c.competitor_domains.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          Competitors ranking: {c.competitor_domains.slice(0, 3).join(", ")}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right align-top tabular-nums">{formatVolume(c.local_volume)}</td>
                  <td className="px-3 py-2 text-right align-top text-muted-foreground tabular-nums">{formatVolume(c.national_volume)}</td>
                  <td className="px-3 py-2 text-right align-top">
                    <Difficulty value={c.difficulty} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <IntentTag intent={intentOf(c.intent)} />
                  </td>
                  <td className="px-3 py-2 text-right align-top tabular-nums">
                    {c.cpc !== null ? formatUsd(Number(c.cpc)) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right align-top tabular-nums">
                    {c.ranked_position ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  {canManage && (
                    <td className="px-3 py-2 text-right align-top whitespace-nowrap">
                      {!isTracked && (
                        <div className="flex justify-end gap-1">
                          {atLimit ? (
                            <ReplaceTrackedDialog candidate={c} tracked={tracked} />
                          ) : (
                            <Button size="sm" variant="outline" disabled={pending} onClick={() => track(c)}>
                              Track
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => dismiss(c)}>
                            Dismiss
                          </Button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-sm text-muted-foreground">
                  No keywords match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > shown && (
        <Button variant="outline" className="self-start" onClick={() => setShown((n) => n + PAGE)}>
          Show more ({formatNumber(rows.length - shown)} left)
        </Button>
      )}

      <HowScoresWork />
    </section>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={cn("h-8 w-auto min-w-36 bg-card", value !== options[0][0] && "border-primary")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** At the keyword limit: pick which tracked keyword this candidate replaces (weak ones first). */
function ReplaceTrackedDialog({ candidate, tracked }: { candidate: Candidate; tracked: TrackedLite[] }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const ordered = [...tracked].sort((a, b) => b.weak.length - a.weak.length || a.score - b.score)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Replace…
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Track “{candidate.phrase}” instead of…</DialogTitle>
          <DialogDescription>
            The client is at their keyword limit. Pick the keyword to stop tracking; its history is
            kept.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-[50svh] flex-col divide-y overflow-y-auto rounded-lg border">
          {ordered.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await replaceKeyword(t.id, candidate.phrase)
                    if (!r.ok) return void toast.error(r.error)
                    setOpen(false)
                    toast.success(`Now tracking “${candidate.phrase}” instead of “${t.phrase}”`)
                  })
                }
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60 disabled:opacity-50"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{t.phrase}</span>
                  {t.weak[0] && <span className="truncate text-xs text-warning">{t.weak[0]}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatVolume(t.localVolume ?? t.nationalVolume)}/mo · score {t.score}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

function Dismissed({
  clientId,
  list,
  baseHref,
  canManage,
}: {
  clientId: string
  list: Candidate[]
  baseHref: string
  canManage: boolean
}) {
  const [pending, startTransition] = useTransition()
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Dismissed keywords</h2>
        <Link href={`${baseHref}?tab=research`} className="text-[13px] text-brand hover:underline">
          Back to all ideas
        </Link>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing dismissed.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-card">
          {list.map((c) => (
            <li key={c.keyword_norm} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{c.phrase}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatVolume(c.local_volume ?? c.national_volume)}/mo · score {c.score}
                  {c.dismiss_reason ? ` · ${c.dismiss_reason}` : ""}
                </span>
              </span>
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await setCandidateDismissed(clientId, c.keyword_norm, false)
                      if (!r.ok) toast.error(r.error)
                      else toast.success(`“${c.phrase}” is back in the ideas`)
                    })
                  }
                >
                  Restore
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function HowScoresWork() {
  return (
    <Collapsible className="rounded-lg border bg-card">
      <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium">
        How scores work
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-4 py-3 text-[13px] text-muted-foreground">
        <p className="mb-2">Each keyword gets a score from 0 to 100:</p>
        <ul className="flex list-disc flex-col gap-1 pl-4">
          <li>
            <span className="text-foreground">Searches (40%)</span>: searches a month in the client&apos;s
            city; 1,000 or more gets full marks. With no city figure, the national figure counts for
            half.
          </li>
          <li>
            <span className="text-foreground">Intent (20%)</span>: buying 100%, comparing 90%,
            researching 30%, looking for a brand 20%.
          </li>
          <li>
            <span className="text-foreground">Ease (20%)</span>: the lower the difficulty, the higher.
          </li>
          <li>
            <span className="text-foreground">Value (10%)</span>: what advertisers pay per click, up to
            $20.
          </li>
          <li>
            <span className="text-foreground">Quick win (10%)</span>: the website already ranks 4–20
            (full) or 21–50 (half), so a small push gets it onto page one.
          </li>
        </ul>
        <p className="mt-2">
          A tracked keyword is weak when it gets fewer than 10 searches a month in the city, people
          searching it want information rather than a business, it hasn&apos;t reached the top 100
          after 8 weeks and is hard, it duplicates a stronger tracked keyword, or it scores under 35.
          Swaps suggest a keyword on the same service that scores at least 15 points more.
        </p>
      </CollapsibleContent>
    </Collapsible>
  )
}
