import { CircleAlert, Search } from "@/components/icons"
import type { ReactNode } from "react"

import { ShockwaveMark } from "@/components/brand/logo"
import { OverviewRefresher } from "@/features/overview/components/overview-refresher"
import { hasAnthropicKey } from "@/lib/env.server"
import { can, type AppRole } from "@/lib/roles"
import { getAccountBalances } from "../../accounts"
import { BacklinksHeader } from "../../components/backlinks-header"
import { RunHistoryPanel } from "../../components/run-history-panel"
import { getRunHistory } from "../../run-history"
import type { BacklinkSetup } from "../../setup"
import { getAiSearchData } from "../queries"
import { AiDossierCard } from "./ai-dossier-card"
import { AiInsightsCard } from "./ai-insights-card"
import { AiProspectsView } from "./ai-prospects-view"
import { RunAiSearchButton } from "./ai-run-dialog"
import { AiRunProgress } from "./ai-run-progress"
import { CompetitorsCard } from "./competitors-card"

/**
 * The Shockwave AI Search tab (Backlinks, ?mode=ai). Plan §7. The brief and the places come from
 * the shared backlink setup (docs/plans/backlinks/12-shared-setup.md), edited in the setup sheet.
 */
export async function AiSearchTab({
  client,
  member,
  setup,
  chrome,
}: {
  client: { id: string; name: string; stage: string }
  member: { role: AppRole }
  base: string
  setup: BacklinkSetup
  /** The setup bar and the tabs, drawn under this tab's header. */
  chrome: ReactNode
}) {
  const isAdmin = can(member.role, "integrations.manage")
  const canDiscover = can(member.role, "backlinks.discover")
  const canReview = can(member.role, "backlinks.review")
  // Admins and managers can force a fresh pull of competitor link data.
  const canRefresh = can(member.role, "backlinks.library")
  const claudeReady = hasAnthropicKey()
  const nowIso = new Date().toISOString()
  const [data, history, accounts] = await Promise.all([
    getAiSearchData(client.id),
    getRunHistory(client.id),
    getAccountBalances(isAdmin),
  ])
  const { brief, targets } = setup
  const { quota } = data
  const clientId = client.id
  const clientStage = client.stage
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
          : setup.missing.length
            ? `${setup.missing.join(". ")}.`
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
          : setup.missing.length
            ? `${setup.missing.join(". ")}.`
            : (quota?.budgetProblem ?? null)
  const activeCompetitors = (quota?.competitors ?? []).filter((c) => c.active).map((c) => c.domain)
  const last = quota?.lastRun
  const hasResults = data.prospects.length > 0

  return (
    <>
      <BacklinksHeader
        clientName={client.name}
        description="Shockwave AI researches where this client should get listed, from the backlink setup"
        actions={
          canDiscover ? (
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
          ) : null
        }
      />
      {chrome}

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
        <AiDossierCard data={data.dossier} briefVersion={brief?.version ?? null} nowIso={nowIso} />
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
      {history && history.entries.length > 0 && <RunHistoryPanel history={history} accounts={accounts} nowIso={nowIso} />}
      {open && <OverviewRefresher every={5_000} />}
    </>
  )
}

function HowItWorks() {
  const steps = [
    ["Read the client", "Its website, profile and the setup's strategy brief, into a short dossier."],
    ["Where to rank", "The searches buyers make in each of the setup's places, in the local language, and who ranks for them."],
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
