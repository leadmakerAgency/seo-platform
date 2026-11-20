import { CircleAlert, Search } from "lucide-react"
import Link from "next/link"

import { ShockwaveMark } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { OverviewRefresher } from "@/features/overview/components/overview-refresher"
import { BUYER_META, BUYERS, mixLabel, OFFERING_META, OFFERINGS, REACH_META, REACHES, topicCount } from "../../brief"
import { TargetsPanel } from "../../components/targets-panel"
import type { AiSearchData } from "../queries"
import { AiDossierCard } from "./ai-dossier-card"
import { AiInsightsCard } from "./ai-insights-card"
import { AiProspectsView } from "./ai-prospects-view"
import { RunAiSearchButton } from "./ai-run-dialog"
import { AiRunProgress } from "./ai-run-progress"
import { CompetitorsCard } from "./competitors-card"

/** The Shockwave AI Search tab (Backlinks, ?mode=ai). Plan §7. */
export function AiSearchTab({
  clientId,
  clientStage,
  defaultCountry,
  suggestions,
  base,
  data,
  canDiscover,
  canReview,
  canStrategy,
  canRefresh = false,
  isAdmin,
  claudeReady,
  nowIso,
}: {
  clientId: string
  clientStage: string
  defaultCountry: string
  suggestions: string[]
  base: string
  data: AiSearchData
  canDiscover: boolean
  canReview: boolean
  canStrategy: boolean
  /** Admins and managers can force a fresh pull of competitor link data. */
  canRefresh?: boolean
  isAdmin: boolean
  claudeReady: boolean
  nowIso: string
}) {
  const { brief, quota, targets } = data
  const open = quota?.openRun ?? null
  const labels = Object.fromEntries(targets.map((t) => [t.id, t.label]))
  const blocked = !claudeReady
    ? "Claude isn't connected yet. An admin adds ANTHROPIC_API_KEY on the server."
    : clientStage === "paused" || clientStage === "churned"
      ? "This client is paused or has left."
      : open
        ? "An AI search is running now."
        : quota?.standardRunning
          ? "A Standard Search is running. Wait for it to finish."
          : data.briefMissing.length
            ? `${data.briefMissing.join(". ")}.`
            : quota?.budgetProblem
              ? quota.budgetProblem
              : quota && quota.used >= quota.limit
                ? `This client has used its ${quota.limit} AI searches this month.`
                : null
  // Competitor backlinks has its own monthly limit; everything else blocks it the same way.
  const gapBlocked = !claudeReady
    ? "Claude isn't connected yet. An admin adds ANTHROPIC_API_KEY on the server."
    : clientStage === "paused" || clientStage === "churned"
      ? "This client is paused or has left."
      : open
        ? "An AI search is running now."
        : quota?.standardRunning
          ? "A Standard Search is running. Wait for it to finish."
          : data.briefMissing.length
            ? `${data.briefMissing.join(". ")}.`
            : targets.every((t) => !t.active)
              ? "Add at least one place first."
              : (quota?.budgetProblem ?? null)
  const activeCompetitors = (quota?.competitors ?? []).filter((c) => c.active).map((c) => c.domain)
  const last = quota?.lastRun
  const hasResults = data.prospects.length > 0

  return (
    <>
      <section className="flex flex-col gap-3 rounded-lg border bg-card p-4" aria-labelledby="ai-strategy-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="ai-strategy-title" className="text-[15px] leading-[22px] font-semibold">
              Strategy brief
            </h2>
            {brief ? (
              <p className="text-sm text-muted-foreground">
                {mixLabel(brief.reach, REACHES, REACH_META)} · {mixLabel(brief.buyer, BUYERS, BUYER_META)} ·{" "}
                {mixLabel(brief.offering, OFFERINGS, OFFERING_META)} · {topicCount(brief)} topics ({brief.core_topics.join(", ")})
              </p>
            ) : (
              <p className="max-w-[72ch] text-sm text-muted-foreground">
                Shockwave AI researches from the strategy brief and the places below. Write the brief first.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}/strategy`}>{brief ? (canStrategy ? "Edit brief" : "View brief") : "Write the brief"}</Link>
            </Button>
            {canDiscover && (
              <RunAiSearchButton
                clientId={clientId}
                targets={targets}
                brief={brief}
                maxSearches={quota?.maxWebSearches ?? 80}
                searchPrice={quota?.webSearchPrice ?? 0.01}
                maxRunUsd={quota?.maxRunUsd ?? 4}
                disabledReason={blocked}
                hasRun={Boolean(last)}
                gap={
                  quota
                    ? {
                        competitors: activeCompetitors.length,
                        maxSites: quota.gapMaxSites,
                        fallback: quota.gapFallback,
                        unavailable: null,
                      }
                    : null
                }
              />
            )}
          </div>
        </div>
        {data.briefMissing.length > 0 && (
          <ul className="flex flex-col gap-1 text-[13px] text-warning">
            {data.briefMissing.map((m) => (
              <li key={m} className="flex items-center gap-1.5">
                <CircleAlert className="size-3.5 shrink-0" aria-hidden />
                {m}
              </li>
            ))}
          </ul>
        )}
      </section>

      <TargetsPanel
        clientId={clientId}
        targets={targets}
        defaultCountry={defaultCountry}
        suggestions={suggestions}
        canEdit={canDiscover}
        nowIso={nowIso}
      />

      {quota && (
        <CompetitorsCard
          key={(quota.competitors ?? []).map((c) => `${c.domain}:${c.active ? 1 : 0}`).join("|")}
          clientId={clientId}
          quota={quota}
          canEdit={canDiscover}
          canRefresh={canRefresh}
          disabledReason={gapBlocked}
        />
      )}

      {open && (
        <AiRunProgress
          run={open}
          places={open.targetIds.map((id) => labels[id]).filter(Boolean)}
          feed={data.feed}
          showCost={isAdmin}
        />
      )}
      {!open && last?.status === "failed" && (
        <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>
            The last {last.kind === "competitors" ? "competitor backlinks search" : "AI search"} didn&apos;t finish
            {last.error ? `: ${last.error}` : "."} Places found before it stopped are kept.
          </p>
        </div>
      )}
      {!open && last?.status === "done" && Boolean(last.counts.capped) && (
        <p className="-mt-4 text-[13px] text-muted-foreground">
          The last run stopped some research at its cost or search limit; the best of what it found is below.
        </p>
      )}

      {!open && last?.status === "done" && typeof last.counts.gap_note === "string" && (
        <p className="-mt-4 text-[13px] text-muted-foreground">Competitor backlinks: {last.counts.gap_note}</p>
      )}

      {data.dossier && (
        <AiDossierCard data={data.dossier} briefHref={`${base}/strategy`} briefVersion={brief?.version ?? null} nowIso={nowIso} />
      )}

      {data.insights && <AiInsightsCard insights={data.insights} />}

      {hasResults ? (
        <AiProspectsView
          prospects={data.prospects}
          placeLabels={labels}
          canReview={canReview}
          competitors={data.insights?.competitors.length ? data.insights.competitors : activeCompetitors}
        />
      ) : (
        !open && (
          <div className="relative overflow-hidden rounded-xl border border-dashed bg-card">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
            />
            <div className="relative flex flex-col items-center gap-3 px-6 py-12 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl border bg-card shadow-xs">
                <ShockwaveMark className="h-7" />
              </span>
              <div className="flex max-w-lg flex-col gap-1.5">
                <h2 className="text-[15px] leading-[22px] font-semibold">No AI research yet</h2>
                <p className="text-sm text-muted-foreground">
                  Shockwave AI reads the client, finds the searches its buyers make in each place, studies who ranks,
                  researches best-of lists, directories, associations, press, podcasts and communities, checks every
                  page, and picks the best 30, each with evidence and a reason.
                </p>
              </div>
            </div>
          </div>
        )
      )}

      <HowItWorks />
      {open && <OverviewRefresher every={5_000} />}
    </>
  )
}

function HowItWorks() {
  const steps = [
    ["Read the client", "Its website, profile and the strategy brief, into a short dossier."],
    ["Where to rank", "The searches buyers make in each place, in the local language, and who ranks for them."],
    ["Competitors", "The businesses that really compete in each place."],
    ["Research", "Best-of lists, directories, associations, press, review sites, podcasts, communities, partners, lists that feature competitors, and pages that mention the client."],
    ["Check pages", "Every page is opened: is it live, does it list businesses, is there a way in, are links followed, any red flags."],
    ["Judge", "Relevant, real, reachable and worth it, each scored 1–5 against the brief."],
    ["Top 30", "The best mix to start with lands in Top 30, the rest in More, misfits in Hidden with the reason."],
    [
      "Competitor backlinks",
      "Optional, or on its own: the sites that link to the top 5 competitors but not the client (DataForSEO link data), ranked by how many competitors share them. Each linking page is opened to check the link is still there and whether the client can get the same one.",
    ],
  ]
  return (
    <details className="group rounded-lg border bg-card px-4 py-3 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 font-medium marker:text-muted-foreground">
        <Search className="size-3.5 text-muted-foreground" aria-hidden />
        How Shockwave AI Search works
      </summary>
      <ol className="mt-3 flex max-w-[76ch] flex-col gap-2 text-muted-foreground">
        {steps.map(([t, d], i) => (
          <li key={t} className="flex gap-2">
            <span className="font-mono text-xs leading-5 text-foreground tabular-nums">{i + 1}.</span>
            <span>
              <span className="text-foreground">{t}.</span> {d}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 max-w-[76ch] text-xs text-muted-foreground">
        AI only: Claude Haiku with web search and our own page checks. Nothing is submitted anywhere; approving a place adds
        it to the client&apos;s list, shared with Standard Search.
      </p>
    </details>
  )
}
