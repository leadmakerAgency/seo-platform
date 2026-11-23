import { CircleAlert, Plug, Search } from "@/components/icons"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { after } from "next/server"
import { Suspense } from "react"

import { StatStripSkeleton } from "@/components/common/stat-strip"
import { AccessGuard } from "@/components/layout/access-guard"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { getClientBySlug } from "@/features/clients/queries"
import { OverviewRefresher } from "@/features/overview/components/overview-refresher"
import { formatCheckDay } from "@/features/rankings/components/bits"
import { AddKeywordsDialog, CheckNowButton } from "@/features/rankings/components/keyword-dialogs"
import { KeywordsView, type KeywordFilter } from "@/features/rankings/components/keywords-view"
import { ResearchView, type Swap, type TrackedLite } from "@/features/rankings/components/research-view"
import { SettingsView } from "@/features/rankings/components/settings-view"
import { ENGINES } from "@/features/rankings/constants"
import {
  getBudgetStatus,
  getDismissed,
  getRankingsData,
  getResearchData,
} from "@/features/rankings/queries"
import { suggestSwaps } from "@/features/rankings/scoring"
import { ensureRankSettings, syncAndResolve } from "@/features/rankings/setup"
import { getCurrentMember } from "@/lib/auth"
import type { Db } from "@/lib/dataforseo/client"
import { hasDataForSeo } from "@/lib/env.server"
import { formatNumber } from "@/lib/format"
import { clientHref, findClientSection } from "@/lib/navigation"
import { can } from "@/lib/roles"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Rankings" }

type Props = PageProps<"/clients/[clientSlug]/rankings">
type Tab = "keywords" | "research" | "settings"

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const FILTERS: KeywordFilter[] = ["all", "top3", "top10", "missing", "maps3", "weak"]

export default function RankingsPage({ params, searchParams }: Props) {
  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={null}>
        <AccessGuard item={findClientSection("rankings")!} />
      </Suspense>
      <Suspense fallback={<PageSkeleton />}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Content({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ clientSlug }, search, member] = await Promise.all([params, searchParams, getCurrentMember()])
  const client = await getClientBySlug(clientSlug)
  if (!client) notFound()

  const canManage = can(member.role, "rankings.manage")
  const isAdmin = can(member.role, "integrations.manage")
  const configured = hasDataForSeo()

  // Create the client's rank settings on first visit (service role: the viewer can already
  // see this client, checked by getClientBySlug through RLS). Downloading the country's
  // location list is free but slow, so it runs after the response.
  if (hasSupabaseSecretKey()) {
    try {
      const admin = createSupabaseAdminClient() as Db
      const ctx = await ensureRankSettings(admin, client.id)
      if (ctx.needsLocationSync && configured) {
        after(async () => {
          try {
            await syncAndResolve(createSupabaseAdminClient() as Db, client.id, ctx.countryIso)
          } catch (e) {
            console.error("[rankings] location sync failed", e)
          }
        })
      }
    } catch (e) {
      console.error("[rankings] could not prepare settings", e)
    }
  }

  const rawTab = one(search.tab)
  const tab: Tab = rawTab === "research" ? "research" : rawTab === "settings" && canManage ? "settings" : "keywords"
  const rawFilter = one(search.show) as KeywordFilter | undefined
  const filter: KeywordFilter = rawFilter && FILTERS.includes(rawFilter) ? rawFilter : "all"
  const showDismissed = tab === "research" && one(search.dismissed) === "1"

  const [data, research, budget, dismissed] = await Promise.all([
    getRankingsData(client.id, client.city),
    getResearchData(client.id),
    tab === "settings" && isAdmin ? getBudgetStatus() : Promise.resolve(null),
    showDismissed ? getDismissed(client.id) : Promise.resolve(null),
  ])

  const base = clientHref(client.slug, "rankings")
  const settings = data.settings
  const engines = settings ? ENGINES.filter((e) => settings.engines.includes(e)) : ENGINES
  const weak = data.keywords.filter((k) => k.weak.length > 0)
  const now = new Date()
  const researchRunning = research.lastRun?.status === "queued" || research.lastRun?.status === "running"

  const tracked: TrackedLite[] = data.keywords.map((k) => ({
    id: k.id,
    phrase: k.phrase,
    topic: k.topic,
    score: k.score,
    weak: k.weak,
    localVolume: k.localVolume,
    nationalVolume: k.nationalVolume,
    intent: k.intent,
  }))
  const trackedSet = new Set(data.keywords.map((k) => k.phrase))
  const swapMap = suggestSwaps(weak, research.candidates, trackedSet)
  const swaps: Swap[] = weak
    .filter((k) => swapMap.has(k.id))
    .map((k) => ({ keyword: tracked.find((t) => t.id === k.id)!, candidate: swapMap.get(k.id)! }))
  const toOption = (c: (typeof research.candidates)[number]) => ({
    keyword_norm: c.keyword_norm,
    phrase: c.phrase,
    score: c.score,
    local_volume: c.local_volume,
    national_volume: c.national_volume,
    topic: c.topic,
  })
  const replaceOptions = research.candidates
    .filter((c) => c.status === "new" && !trackedSet.has(c.keyword_norm))
    .slice(0, 40)
    .map(toOption)
  const suggested = Object.fromEntries([...swapMap].map(([id, c]) => [id, toOption(c)]))

  const where = settings?.location_name?.split(",")[0] ?? null
  const describe = [
    settings?.paused
      ? "Weekly checks are paused"
      : `Checked weekly on mobile${where ? ` from ${settings!.location_name!.split(",").slice(0, 2).join(", ")}` : ""}`,
    data.lastCheckAt ? `last check ${formatCheckDay(data.lastCheckAt)}` : null,
    !settings?.paused && settings?.next_run_at && data.keywords.length ? `next ${formatCheckDay(settings.next_run_at)}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  const checkBlocked = !configured
    ? "DataForSEO isn't connected yet."
    : !settings?.location_code
      ? "Pick the client's location in Settings first."
      : data.keywords.length === 0
        ? "Add keywords first."
        : data.openRun
          ? "A check is running now."
          : null

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "keywords", label: "Keywords", count: data.keywords.length },
    { id: "research", label: "Find better keywords", count: swaps.length || undefined },
    ...(canManage ? [{ id: "settings" as const, label: "Settings" }] : []),
  ]

  return (
    <>
      <PageHeader
        eyebrow={client.name}
        title="Rankings"
        description={describe}
        actions={
          canManage ? (
            <>
              {weak.length > 0 && (
                <Button asChild variant="ghost">
                  <Link href={`${base}?tab=keywords&show=weak`} scroll={false}>
                    <CircleAlert className="text-warning" />
                    {weak.length} weak
                  </Link>
                </Button>
              )}
              <CheckNowButton clientId={client.id} disabledReason={checkBlocked} />
              <AddKeywordsDialog clientId={client.id} used={data.keywords.length} limit={data.limit} />
            </>
          ) : undefined
        }
      />

      {!configured && <SetupNotice isAdmin={isAdmin} />}
      {configured && settings && !settings.location_code && (
        <Notice tone="warning">
          We couldn&apos;t match {client.location || "the client's city"} to a search location, so
          checks are waiting.{" "}
          {canManage ? (
            <Link href={`${base}?tab=settings`} className="font-medium text-brand hover:underline">
              Pick the location in Settings
            </Link>
          ) : (
            "An account manager can pick it in Settings."
          )}
        </Notice>
      )}
      {data.openRun && (
        <div className="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
          <p>
            <span className="font-medium">
              {data.openRun.scope === "partial" ? "Checking the new keywords" : "Checking every keyword"}
            </span>
            <span className="text-muted-foreground">
              {data.openRun.total > 0
                ? ` · ${formatNumber(data.openRun.done)} of ${formatNumber(data.openRun.total)} results in`
                : " · starting"}
              . Usually a few minutes; this page updates by itself.
            </span>
          </p>
          {data.openRun.total > 0 && (
            <Progress value={(data.openRun.done / data.openRun.total) * 100} aria-label="Check progress" className="max-w-md" />
          )}
        </div>
      )}
      {!data.openRun && data.lastRun && (data.lastRun.status === "partial" || data.lastRun.status === "failed") && (
        <Notice tone="warning">
          {data.lastRun.status === "failed"
            ? "The last check didn't finish"
            : "Some results from the last check didn't come back"}
          {data.lastRun.error ? `: ${data.lastRun.error}` : "."} The next weekly check tries again.
        </Notice>
      )}

      <nav aria-label="Rankings sections" className="flex w-fit max-w-full overflow-x-auto rounded-lg border bg-card p-0.5">
        {tabs.map((t) => {
          const active = t.id === tab
          return (
            <Link
              key={t.id}
              href={`${base}?tab=${t.id}`}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-3 text-sm whitespace-nowrap transition-colors",
                active
                  ? "bg-foreground text-background dark:bg-muted dark:text-foreground dark:ring-1 dark:ring-input"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span className={cn("rounded-sm px-1.5 text-xs tabular-nums", active ? "bg-background/20 dark:bg-background" : "bg-muted")}>
                  {formatNumber(t.count)}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {tab === "keywords" &&
        (data.keywords.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-5 text-sm">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <div className="flex flex-col gap-1">
              <p className="font-medium">No keywords tracked yet</p>
              <p className="max-w-[64ch] text-muted-foreground">
                Run keyword research to find the {formatNumber(data.limit)} best keywords for this
                client, or add the ones you already know. Each one is checked on Google, Maps and Bing
                every week.
              </p>
            </div>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href={`${base}?tab=research`}>Find keywords</Link>
                </Button>
                <AddKeywordsDialog
                  clientId={client.id}
                  used={0}
                  limit={data.limit}
                  trigger={<Button variant="outline">Add keywords</Button>}
                />
              </div>
            )}
          </div>
        ) : (
          <KeywordsView
            keywords={data.keywords}
            engines={engines}
            filter={filter}
            baseHref={base}
            canManage={canManage}
            replaceOptions={replaceOptions}
            suggested={suggested}
          />
        ))}

      {tab === "research" && (
        <ResearchView
          clientId={client.id}
          city={client.city}
          research={research}
          tracked={tracked}
          limit={data.limit}
          swaps={swaps}
          canManage={canManage}
          configured={configured}
          baseHref={base}
          nowIso={now.toISOString()}
          dismissedList={dismissed}
        />
      )}

      {tab === "settings" &&
        (settings ? (
          <SettingsView
            clientId={client.id}
            settings={settings}
            countryIso={client.country_code}
            budget={budget}
            nowIso={now.toISOString()}
          />
        ) : (
          <Notice tone="warning">The settings couldn&apos;t be created. Reload the page to try again.</Notice>
        ))}

      {(data.openRun || researchRunning) && <OverviewRefresher every={15_000} />}
    </>
  )
}

function Notice({ tone, children }: { tone: "warning"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-3 text-sm",
        tone === "warning" && "border-warning/30 bg-warning-soft",
      )}
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
        {isAdmin ? (
          <p className="text-muted-foreground">
            Add <code>DATAFORSEO_LOGIN</code> and <code>DATAFORSEO_PASSWORD</code> (the API login from
            the DataForSEO dashboard, not the website password) in <code>.env.local</code> and in
            DigitalOcean as Encrypted, Run Time variables. Restart the app, then come back here.
            Keywords can be added now; they&apos;re checked once it&apos;s connected.
          </p>
        ) : (
          <p className="text-muted-foreground">
            Ask an admin to connect DataForSEO. Keywords can be added now and are checked once
            it&apos;s connected.
          </p>
        )}
      </div>
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-16 w-[420px] max-w-full" />
      <Skeleton className="h-9 w-80 rounded-lg" />
      <StatStripSkeleton count={4} />
      <Skeleton className="h-[420px] w-full rounded-lg" />
    </div>
  )
}
