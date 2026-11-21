import { CircleAlert, Link2, Plug } from "lucide-react"
import type { ReactNode } from "react"

import { StatStrip, type StatItem } from "@/components/common/stat-strip"
import { hasDataForSeo } from "@/lib/env.server"
import { formatNumber } from "@/lib/format"
import { can, type AppRole } from "@/lib/roles"
import { getAccountBalances } from "../accounts"
import { REVIEW_CAP, TAB_LABELS, TABS, tabOf, type Tab } from "../constants"
import { getBacklinksData } from "../queries"
import { getRunHistory } from "../run-history"
import type { BacklinkSetup } from "../setup"
import { OverviewRefresher } from "@/features/overview/components/overview-refresher"
import { BacklinksHeader } from "./backlinks-header"
import { CheckStrengthButton, FindPlacesButton, RerankButton } from "./backlink-dialogs"
import { BacklinksView } from "./backlinks-view"
import { RunHistoryPanel } from "./run-history-panel"
import { RunProgress } from "./run-progress"

/**
 * The Standard Search tab: Google searches built from the shared backlink setup (brief × places),
 * a rule score, site strength and Claude's top 30. The brief and places come from `setup`
 * (docs/plans/backlinks/12-shared-setup.md); the page only renders this once the setup is complete.
 */

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export async function StandardSearch({
  client,
  member,
  search,
  setup,
  base,
  chrome,
}: {
  client: { id: string; name: string; stage: string }
  member: { role: AppRole }
  search: Record<string, string | string[] | undefined>
  setup: BacklinkSetup
  base: string
  /** The setup bar and the tabs, drawn under this tab's header. */
  chrome: ReactNode
}) {
  const configured = hasDataForSeo()
  const canDiscover = can(member.role, "backlinks.discover")
  const canReview = can(member.role, "backlinks.review")
  const canStrength = can(member.role, "backlinks.strength")
  const canLibrary = can(member.role, "backlinks.library")
  const isAdmin = can(member.role, "integrations.manage")

  const rawTab = one(search.tab) as Tab | undefined
  const tab: Tab = rawTab && TABS.includes(rawTab) ? rawTab : "review"
  const [data, history, accounts] = await Promise.all([
    getBacklinksData(client.id),
    getRunHistory(client.id),
    getAccountBalances(isAdmin),
  ])
  const { quota, lastRun, places } = data

  const count = (t: Tab) => places.filter((p) => tabOf(p) === t).length
  const workable = places.filter((p) => p.status === "pending_review" || p.status === "approved")
  const brief = setup.brief
  const unchecked = workable.filter((p) => !p.checkedAt).length
  const openRun = quota?.openRun ?? null
  const targets = setup.targets
  const activeTargets = targets.filter((t) => t.active)
  const labels = Object.fromEntries(targets.map((t) => [t.id, t.label]))
  const listOf = (names: string[]) =>
    names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`

  const findBlocked = !configured
    ? "DataForSEO isn't connected yet."
    : client.stage === "paused" || client.stage === "churned"
      ? "This client is paused or has left."
      : openRun
        ? "A search is running now."
        : setup.missing.length
          ? `${setup.missing.join(". ")}.`
          : quota?.budgetProblem
            ? quota.budgetProblem
            : quota && quota.used >= quota.limit
              ? `This client has used its ${quota.limit} searches this month.`
              : null
  const rerankBlocked = !brief
    ? "Fill in the strategy brief first."
    : openRun
      ? "A search is running now."
      : !places.some((p) => p.source === "search" && (p.status === "pending_review" || p.status === "reserve"))
        ? "Nothing found yet to rank."
        : null
  const strengthBlocked = !configured
    ? "DataForSEO isn't connected yet."
    : quota?.access === "denied"
      ? "Backlinks API access isn't active on the DataForSEO account. An admin can turn it on in DataForSEO."
      : quota?.strengthRunning
        ? "A strength check is running now."
        : quota?.budgetProblem
          ? quota.budgetProblem
          : null

  // Runs, dates and costs live in "Runs and costs" at the bottom of the page.
  const describe = activeTargets.length
    ? `Places to get listed, found by Google searches in ${listOf(activeTargets.map((t) => t.label))}`
    : "Places to get listed, found by Google searches in the places you choose"

  const stats: StatItem[] = TABS.map((t) => ({
    key: t,
    label: TAB_LABELS[t],
    count: count(t),
    href: `${base}?tab=${t}`,
    selected: tab === t,
    tone: t === "review" ? "warning" : t === "approved" ? "success" : undefined,
    note:
      t === "review"
        ? `At most ${REVIEW_CAP}, best first${unchecked > 0 ? ` · ${formatNumber(unchecked)} not checked for strength` : ""}`
        : t === "more"
          ? "Kept, outside the top 30"
          : t === "basics"
            ? "Listings every client like this needs"
            : t === "approved"
              ? `Plan: ${formatNumber(data.target)} a month`
              : t === "hidden"
                ? "Filtered out, with the reason"
                : undefined,
  }))

  const findButton = (variant: "default" | "outline" = "default") =>
    canDiscover && quota ? (
      <FindPlacesButton
        clientId={client.id}
        targets={targets}
        maxSearches={quota.maxSearches}
        disabledReason={findBlocked}
        variant={variant}
      />
    ) : null
  const runPlaces = (openRun?.target_ids ?? []).map((id) => labels[id]).filter(Boolean)

  return (
    <>
      <BacklinksHeader
        clientName={client.name}
        description={describe}
        actions={
          <>
            {canStrength && workable.length > 0 && (
              <CheckStrengthButton clientId={client.id} ids={null} disabledReason={strengthBlocked} />
            )}
            {canDiscover && brief && <RerankButton clientId={client.id} disabledReason={rerankBlocked} />}
            {findButton()}
          </>
        }
      />
      {chrome}

      {!configured && <SetupNotice isAdmin={isAdmin} />}

      {openRun && (
        <RunProgress
          kind={openRun.kind}
          status={openRun.status}
          step={openRun.step}
          done={openRun.queries_done}
          total={openRun.queries_total}
          places={runPlaces}
          startedAt={lastRun?.id === openRun.id ? lastRun.createdAt : null}
        />
      )}
      {!openRun && lastRun?.status === "failed" && (
        <Notice>The last search didn&apos;t finish{lastRun.error ? `: ${lastRun.error}` : "."}</Notice>
      )}

      {places.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-5 text-sm">
          <Link2 className="size-4 text-muted-foreground" aria-hidden />
          <div className="flex flex-col gap-1">
            <p className="font-medium">No places yet</p>
            <p className="max-w-[68ch] text-muted-foreground">
              Find places searches Google from the setup&apos;s places with searches built from the brief (
              {quota?.maxSearches ?? 60} at most; the dialog shows the exact list and its estimate first). The best{" "}
              {REVIEW_CAP} land in Review with a reason each; the rest go to More.
            </p>
          </div>
          {findButton()}
        </div>
      ) : (
        <>
          <StatStrip items={stats} label="Backlink places by status" />
          <BacklinksView
            key={tab}
            places={places}
            tab={tab}
            clientId={client.id}
            target={data.target}
            canReview={canReview}
            canStrength={canStrength}
            canForce={canLibrary}
            canLibrary={canLibrary}
            strengthBlocked={strengthBlocked}
            placeLabels={labels}
            initialPlace={one(search.place) ?? null}
          />
          <HowScoresWork />
        </>
      )}

      {history && (history.entries.length > 0 || places.length > 0) && (
        <RunHistoryPanel history={history} accounts={accounts} nowIso={new Date().toISOString()} />
      )}

      {openRun && <OverviewRefresher every={5_000} />}
    </>
  )
}

function HowScoresWork() {
  return (
    <details className="group rounded-lg border bg-card px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium marker:text-muted-foreground">How the top 30 is picked</summary>
      <div className="mt-3 flex max-w-[72ch] flex-col gap-2 text-muted-foreground">
        <p>
          <span className="text-foreground">1. Searches from the setup.</span> Each search is built from the strategy
          brief (reach, buyer, what the client sells, topics, kinds of sites) and run from one of the setup&apos;s places.
        </p>
        <p>
          <span className="text-foreground">2. Rule score.</span> Every site found gets a score from the brief: how well
          it matches the core or adjacent topics, how much that kind of site is worth for this client (local clients:
          chambers, local news, directories; national B2B: review platforms, marketplaces, niche publications), whether
          it mentions the place (local clients only), how many searches found it and how high. Competitors, the
          brief&apos;s exclude terms and blocked sites are hidden with the reason.
        </p>
        <p>
          <span className="text-foreground">3. Site strength.</span> The best ~80 are checked with DataForSEO&apos;s
          Domain Rank (0–100, not Ahrefs DR) and spam score; strength counts for 25% of the score and spam 60+ halves it.
          A check is kept 30 days and shared by every client.
        </p>
        <p>
          <span className="text-foreground">4. Claude&apos;s review.</span> Claude reads the brief and those ~80 sites,
          drops competitors, link sellers, spam and misfits (they go to Hidden with its reason), and picks up to{" "}
          {REVIEW_CAP} with one line on why each matters to the client&apos;s buyers. Without Claude the score picks them.
        </p>
        <p>
          Review never holds more than {REVIEW_CAP} places. Approving or rejecting makes room; &ldquo;Move to the top
          30&rdquo; brings one up from More. Re-rank redoes steps 2–4 with the current brief, without new searches.
        </p>
      </div>
    </details>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <p>{children}</p>
    </div>
  )
}

function SetupNotice({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex gap-3 rounded-lg border border-dashed p-4">
      <Plug className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex flex-col gap-1 text-sm">
        <p className="font-medium">DataForSEO isn&apos;t connected yet</p>
        <p className="text-muted-foreground">
          {isAdmin
            ? "Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD on the server (see Rankings), then come back here. Places already found can still be reviewed."
            : "Ask an admin to connect DataForSEO. Places already found can still be reviewed."}
        </p>
      </div>
    </div>
  )
}
