import { CircleAlert, Link2, Plug } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { StatStrip, StatStripSkeleton, type StatItem } from "@/components/common/stat-strip"
import { AccessGuard } from "@/components/layout/access-guard"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import {
  CheckStrengthButton,
  FindPlacesButton,
  RerankButton,
} from "@/features/backlinks/components/backlink-dialogs"
import {
  BUYER_META,
  BUYERS,
  mixLabel,
  OFFERING_META,
  OFFERINGS,
  REACH_META,
  REACHES,
  topicCount,
} from "@/features/backlinks/brief"
import { BacklinksView } from "@/features/backlinks/components/backlinks-view"
import { formatDay, usd } from "@/features/backlinks/components/bits"
import { TargetsPanel } from "@/features/backlinks/components/targets-panel"
import { REVIEW_CAP, TAB_LABELS, TABS, tabOf, type Tab } from "@/features/backlinks/constants"
import { getBacklinksData } from "@/features/backlinks/queries"
import { getClientBySlug } from "@/features/clients/queries"
import { OverviewRefresher } from "@/features/overview/components/overview-refresher"
import { getCurrentMember } from "@/lib/auth"
import { hasDataForSeo } from "@/lib/env.server"
import { formatNumber } from "@/lib/format"
import { clientHref, findClientSection } from "@/lib/navigation"
import { can } from "@/lib/roles"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Backlinks" }

type Props = PageProps<"/clients/[clientSlug]/backlinks">

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default function BacklinksPage({ params, searchParams }: Props) {
  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={null}>
        <AccessGuard item={findClientSection("backlinks")!} />
      </Suspense>
      <Suspense fallback={<PageSkeleton />}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Content({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ clientSlug }, search, member] = await Promise.all([
    params,
    searchParams,
    getCurrentMember(),
  ])
  const client = await getClientBySlug(clientSlug)
  if (!client) notFound()

  const configured = hasDataForSeo()
  const canDiscover = can(member.role, "backlinks.discover")
  const canReview = can(member.role, "backlinks.review")
  const canStrength = can(member.role, "backlinks.strength")
  const canLibrary = can(member.role, "backlinks.library")
  const isAdmin = can(member.role, "integrations.manage")

  const rawTab = one(search.tab) as Tab | undefined
  const tab: Tab = rawTab && TABS.includes(rawTab) ? rawTab : "review"
  const data = await getBacklinksData(client.id)
  const { quota, lastRun, places } = data
  const base = clientHref(client.slug, "backlinks")

  const count = (t: Tab) => places.filter((p) => tabOf(p) === t).length
  const workable = places.filter((p) => p.status === "pending_review" || p.status === "approved")
  const brief = data.brief
  const canStrategy = can(member.role, "backlinks.strategy")
  const briefMissing = quota?.briefMissing ?? []
  const unchecked = workable.filter((p) => !p.checkedAt).length
  const openRun = quota?.openRun ?? null
  const targets = quota?.targets ?? []
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
        : briefMissing.length
          ? `${briefMissing.join(". ")}.`
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

  // Suggestions for the first place: the client's city and the areas they serve.
  const supabase = await createSupabaseServerClient()
  const { data: profile } = await supabase
    .from("client_business_profiles")
    .select("service_areas")
    .eq("client_id", client.id)
    .maybeSingle()
  const suggestions = [...new Set([client.city ?? "", ...(profile?.service_areas ?? [])].map((s) => s.trim()).filter(Boolean))].slice(0, 6)
  const strengthBlocked = !configured
    ? "DataForSEO isn't connected yet."
    : quota?.access === "denied"
      ? "Backlinks API access isn't active on the DataForSEO account. An admin can turn it on in DataForSEO."
      : quota?.strengthRunning
        ? "A strength check is running now."
        : quota?.budgetProblem
          ? quota.budgetProblem
          : null

  const describe = [
    activeTargets.length
      ? `Places to get listed, found by Google searches in ${listOf(activeTargets.map((t) => t.label))}`
      : "Places to get listed, found by Google searches in the places you choose",
    lastRun?.finishedAt
      ? `last search ${formatDay(lastRun.createdAt)} (${formatNumber(Number(lastRun.counts.searches ?? lastRun.queriesTotal))} searches, ${usd(lastRun.cost)})`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

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

  const counts = lastRun?.counts ?? {}
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
      <PageHeader
        eyebrow={client.name}
        title="Backlinks"
        description={describe}
        actions={
          <>
            {canStrength && workable.length > 0 && (
              <CheckStrengthButton
                clientId={client.id}
                ids={null}
                disabledReason={strengthBlocked}
              />
            )}
            {canDiscover && brief && <RerankButton clientId={client.id} disabledReason={rerankBlocked} />}
            {findButton()}
          </>
        }
      />

      {!configured && <SetupNotice isAdmin={isAdmin} />}

      <section className="flex flex-col gap-3 rounded-lg border bg-card p-4" aria-labelledby="strategy-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="strategy-title" className="text-[15px] leading-[22px] font-semibold">
              Strategy brief
            </h2>
            {brief ? (
              <p className="text-sm text-muted-foreground">
                {mixLabel(brief.reach, REACHES, REACH_META)} · {mixLabel(brief.buyer, BUYERS, BUYER_META)} ·{" "}
                {mixLabel(brief.offering, OFFERINGS, OFFERING_META)} ·{" "}
                {topicCount(brief)} topics ({brief.core_topics.join(", ")}
                {brief.adjacent_topics.length ? `, plus ${brief.adjacent_topics.slice(0, 4).join(", ")}${brief.adjacent_topics.length > 4 ? "…" : ""}` : ""})
              </p>
            ) : (
              <p className="max-w-[72ch] text-sm text-muted-foreground">
                Before searching, describe how this client should be found: local or national, who buys, and
                10–15 topics including neighbouring ones the buyers read about. Searches and the top 30 are
                built from it.
              </p>
            )}
          </div>
          <Button asChild variant={brief ? "outline" : "default"} size="sm">
            <Link href={`${base}/strategy`}>{brief ? (canStrategy ? "Edit brief" : "View brief") : canStrategy ? "Write the brief" : "View brief"}</Link>
          </Button>
        </div>
        {briefMissing.length > 0 && (
          <ul className="flex flex-col gap-1 text-[13px] text-warning">
            {briefMissing.map((m) => (
              <li key={m} className="flex items-center gap-1.5">
                <CircleAlert className="size-3.5 shrink-0" aria-hidden />
                {m}
              </li>
            ))}
          </ul>
        )}
      </section>

      <TargetsPanel
        clientId={client.id}
        targets={targets}
        defaultCountry={client.country_code}
        suggestions={suggestions}
        canEdit={canDiscover}
        nowIso={new Date().toISOString()}
      />

      {openRun && (
        <div className="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
          <p>
            <span className="font-medium">
              {openRun.kind === "rerank"
                ? "Picking the top 30 again with the brief"
                : openRun.step >= 4
                  ? "Picking the top 30 (site strength and Claude's review)"
                  : `Searching Google${runPlaces.length ? ` for ${listOf(runPlaces)}` : ""}`}
            </span>
            <span className="text-muted-foreground">
              {openRun.kind === "search" && openRun.step < 4
                ? openRun.queries_total > 0
                  ? ` · ${formatNumber(openRun.queries_done)} of ${formatNumber(openRun.queries_total)} searches done`
                  : " · starting"
                : ""}
              . Usually a few minutes; this page updates by itself.
            </span>
          </p>
          {openRun.kind === "search" && openRun.step < 4 && openRun.queries_total > 0 && (
            <Progress
              value={(openRun.queries_done / openRun.queries_total) * 100}
              aria-label="Search progress"
              className="max-w-md"
            />
          )}
        </div>
      )}
      {!openRun && lastRun?.status === "failed" && (
        <Notice>
          The last search didn&apos;t finish{lastRun.error ? `: ${lastRun.error}` : "."}
        </Notice>
      )}
      {!openRun && lastRun?.status === "done" && (
        <p className="-mt-4 text-[13px] text-muted-foreground">
          Last search found {formatNumber(Number(counts.new ?? 0))} new{" "}
          {Number(counts.new ?? 0) === 1 ? "place" : "places"}
          {Number(counts.known ?? 0) > 0
            ? `, ${formatNumber(Number(counts.known))} already known`
            : ""}
          {Number(counts.cached ?? 0) > 0
            ? ` · ${formatNumber(Number(counts.cached))} searches reused from recent searches for the same place`
            : ""}
          {Number(counts.failed ?? 0) > 0
            ? ` · ${formatNumber(Number(counts.failed))} searches failed`
            : ""}
          {counts.no_services
            ? " · no services in the business profile, so only place searches ran"
            : ""}
          .{" "}
          <ShortlistNote counts={counts} />
        </p>
      )}

      {places.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-5 text-sm">
          <Link2 className="size-4 text-muted-foreground" aria-hidden />
          <div className="flex flex-col gap-1">
            <p className="font-medium">No places yet</p>
            <p className="max-w-[68ch] text-muted-foreground">
              {!brief
                ? "First write the strategy brief, then add the places where the client wants to be found. Find places then searches Google with searches built from both, and picks the best 30."
                : activeTargets.length === 0
                  ? "Add the places where the client wants to be found (above). Find places then searches Google from each of them with searches built from the brief."
                  : `Find places searches Google from the places above with searches built from the brief (${quota?.maxSearches ?? 60} at most, about $0.006 each; the dialog shows the exact list and cost first). The best ${REVIEW_CAP} land in Review with a reason each; the rest go to More.`}
            </p>
          </div>
          {brief && activeTargets.length > 0 && findButton()}
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

      {openRun && <OverviewRefresher every={5_000} />}
    </>
  )
}

function ShortlistNote({ counts }: { counts: Record<string, unknown> }) {
  const sl = counts.shortlist as
    | { review?: number; more?: number; hidden?: number; ai?: string; aiNote?: string | null; strengthChecked?: number }
    | undefined
  if (!sl) return null
  return (
    <>
      Top {formatNumber(sl.review ?? 0)} in Review, {formatNumber(sl.more ?? 0)} in More
      {sl.ai === "used" ? ", picked with Claude's review" : `, picked by the rules${sl.aiNote ? ` (Claude's review skipped: ${sl.aiNote})` : ""}`}
      {sl.strengthChecked ? ` · ${formatNumber(sl.strengthChecked)} sites checked for strength` : ""}.
    </>
  )
}

function HowScoresWork() {
  return (
    <details className="group rounded-lg border bg-card px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium marker:text-muted-foreground">
        How the top 30 is picked
      </summary>
      <div className="mt-3 flex max-w-[72ch] flex-col gap-2 text-muted-foreground">
        <p>
          <span className="text-foreground">1. Searches from the brief.</span> Each search is built from the
          strategy brief (reach, buyer, what the client sells, topics, kinds of sites) and run from one of the
          places you chose.
        </p>
        <p>
          <span className="text-foreground">2. Rule score.</span> Every site found gets a score from the brief:
          how well it matches the core or adjacent topics, how much that kind of site is worth for this client
          (local clients: chambers, local news, directories; national B2B: review platforms, marketplaces, niche
          publications), whether it mentions the place (local clients only), how many searches found it and how
          high. Competitors, the brief&apos;s exclude terms and blocked sites are hidden with the reason.
        </p>
        <p>
          <span className="text-foreground">3. Site strength.</span> The best ~80 are checked with DataForSEO&apos;s
          Domain Rank (0–100, not Ahrefs DR) and spam score; strength counts for 25% of the score and spam 60+
          halves it. A check is kept 30 days and shared by every client.
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

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn("flex gap-3 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm")}
    >
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

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-16 w-[420px] max-w-full" />
      <StatStripSkeleton count={4} />
      <Skeleton className="h-[420px] w-full rounded-lg" />
    </div>
  )
}
