import { CircleAlert, Link2, Plug } from "lucide-react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { StatStrip, StatStripSkeleton, type StatItem } from "@/components/common/stat-strip"
import { AccessGuard } from "@/components/layout/access-guard"
import { PageHeader } from "@/components/layout/page-header"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import {
  CheckStrengthButton,
  FindPlacesButton,
} from "@/features/backlinks/components/backlink-dialogs"
import { BacklinksView } from "@/features/backlinks/components/backlinks-view"
import { formatDay, formatDayTime, usd } from "@/features/backlinks/components/bits"
import {
  MAX_QUERIES,
  SEARCH_COST_USD,
  TAB_LABELS,
  TAB_STATUS,
  TABS,
  type Tab,
} from "@/features/backlinks/constants"
import { getBacklinksData } from "@/features/backlinks/queries"
import { CORE_FLOOR, UNKNOWN_STRENGTH } from "@/features/backlinks/scoring"
import { getClientBySlug } from "@/features/clients/queries"
import { OverviewRefresher } from "@/features/overview/components/overview-refresher"
import { getCurrentMember } from "@/lib/auth"
import { hasDataForSeo } from "@/lib/env.server"
import { formatNumber } from "@/lib/format"
import { clientHref, findClientSection } from "@/lib/navigation"
import { can } from "@/lib/roles"
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

  const count = (t: Tab) => places.filter((p) => p.status === TAB_STATUS[t]).length
  const workable = places.filter((p) => p.status === "pending_review" || p.status === "approved")
  const unchecked = workable.filter((p) => !p.checkedAt).length
  const openRun = quota?.openRun ?? null
  const where =
    lastRun?.params.location_name?.split(",").slice(0, 2).join(", ") ||
    client.location ||
    "the client's city"

  const findBlocked = !configured
    ? "DataForSEO isn't connected yet."
    : !client.city
      ? "Add the client's city in Edit details first."
      : client.stage === "paused" || client.stage === "churned"
        ? "This client is paused or has left."
        : openRun
          ? "A search is running now."
          : quota?.budgetProblem
            ? quota.budgetProblem
            : quota && quota.used >= quota.limit
              ? `This client has used its ${quota.limit} searches this month.`
              : quota?.nextSearchAt
                ? `Searched in the last 24 hours. Next search after ${formatDayTime(quota.nextSearchAt)}.`
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

  const describe = [
    `Places to get listed, found by Google searches from ${where}`,
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
        ? unchecked > 0
          ? `${formatNumber(unchecked)} not checked for strength`
          : undefined
        : t === "approved"
          ? `Plan: ${formatNumber(data.target)} a month`
          : t === "hidden"
            ? "Filtered out by the search"
            : undefined,
  }))

  const hint = `Up to ${MAX_QUERIES} Google searches, about ${usd(MAX_QUERIES * SEARCH_COST_USD * 0.8)}`
  const counts = lastRun?.counts ?? {}

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
            {canDiscover && (
              <FindPlacesButton clientId={client.id} disabledReason={findBlocked} hint={hint} />
            )}
          </>
        }
      />

      {!configured && <SetupNotice isAdmin={isAdmin} />}

      {openRun && (
        <div className="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
          <p>
            <span className="font-medium">Searching Google</span>
            <span className="text-muted-foreground">
              {openRun.queries_total > 0
                ? ` · ${formatNumber(openRun.queries_done)} of ${formatNumber(openRun.queries_total)} searches done`
                : " · starting"}
              . Usually a minute or two; this page updates by itself.
            </span>
          </p>
          {openRun.queries_total > 0 && (
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
            ? ` · ${formatNumber(Number(counts.cached))} searches reused from another client in the same city`
            : ""}
          {Number(counts.failed ?? 0) > 0
            ? ` · ${formatNumber(Number(counts.failed))} searches failed`
            : ""}
          {counts.no_services
            ? " · no services in the business profile, so only city searches ran"
            : ""}
          .
        </p>
      )}

      {places.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-5 text-sm">
          <Link2 className="size-4 text-muted-foreground" aria-hidden />
          <div className="flex flex-col gap-1">
            <p className="font-medium">No places yet</p>
            <p className="max-w-[68ch] text-muted-foreground">
              {!client.city
                ? "Add the client's city in Edit details on the Overview, then search."
                : `Find places runs up to ${MAX_QUERIES} Google searches from ${where} for directories, the chamber of commerce, associations, best-of lists and local blogs (about ${usd(MAX_QUERIES * SEARCH_COST_USD * 0.8)}), and adds the core listings every business needs. They land here for review.`}
            </p>
          </div>
          {canDiscover && (
            <FindPlacesButton clientId={client.id} disabledReason={findBlocked} hint={hint} />
          )}
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
          />
          <HowScoresWork />
        </>
      )}

      {openRun && <OverviewRefresher every={5_000} />}
    </>
  )
}

function HowScoresWork() {
  return (
    <details className="group rounded-lg border bg-card px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium marker:text-muted-foreground">
        How scores work
      </summary>
      <div className="mt-3 flex max-w-[72ch] flex-col gap-2 text-muted-foreground">
        <p>
          <span className="text-foreground">Score (0–100)</span> = 75% relevance + 25% site
          strength. A spam score of 60 or more halves it.
        </p>
        <p>
          <span className="text-foreground">Relevance</span> is set by the search: the kind of site
          (chambers and local directories first, then associations, best-of lists, blogs), whether
          it mentions the client&apos;s city, how many different searches found it and how high it
          ranked. Core listings never go below {Math.round(CORE_FLOOR * 100)}%.
        </p>
        <p>
          <span className="text-foreground">Site strength</span> is DataForSEO&apos;s Domain Rank on
          a 0–100 scale (its own conversion of 0–1000; it is not Ahrefs DR). Until a site is checked
          it counts as {Math.round(UNKNOWN_STRENGTH * 100)}. Strong is 60+, Good 35–59, Fair 15–34,
          Weak under 15. A check is kept for 30 days and shared by every client.
        </p>
        <p>
          The search hides results that are the client&apos;s own site, another client&apos;s site,
          a competitor from the map results, a business rather than a directory, a different state,
          or an article with nothing local. They are in Hidden with the reason, and each can be
          brought back.
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
