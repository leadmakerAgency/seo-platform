import { CircleAlert, Loader2 } from "@/components/icons"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { StatStripSkeleton } from "@/components/common/stat-strip"
import { AccessGuard } from "@/components/layout/access-guard"
import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { ActionsTab } from "@/features/ai-visibility/components/actions-tab"
import { SectionCard } from "@/features/ai-visibility/components/bits"
import { BrandsTab } from "@/features/ai-visibility/components/brands-tab"
import { ChatsTab } from "@/features/ai-visibility/components/chats-tab"
import { PromptPanel } from "@/features/ai-visibility/components/detail-panels"
import { FilterBar } from "@/features/ai-visibility/components/filter-bar"
import { ExportMenu, RunNowButton } from "@/features/ai-visibility/components/header-actions"
import { OverviewTab } from "@/features/ai-visibility/components/overview-tab"
import { PromptsTab } from "@/features/ai-visibility/components/prompts-tab"
import { BudgetForm, SettingsForm } from "@/features/ai-visibility/components/settings-tab"
import { SetupGate } from "@/features/ai-visibility/components/setup-gate"
import { SourcesTab } from "@/features/ai-visibility/components/sources-tab"
import { STAGES, TAB_LABEL, TABS, type AivTab } from "@/features/ai-visibility/config"
import { getActions, getAivBase, getPromptStats, getRunHistory } from "@/features/ai-visibility/queries"
import { aivHref, filterOf, parseAivParams } from "@/features/ai-visibility/search-params"
import { TopicsEditor } from "@/features/ai-visibility/components/topics-editor"
import { getAccountBalances } from "@/features/backlinks/accounts"
import { AIV_PART_LABELS, RunHistoryPanel } from "@/features/backlinks/components/run-history-panel"
import type { RunEntry, RunHistory } from "@/features/backlinks/run-history"
import { getClientBySlug } from "@/features/clients/queries"
import { OverviewRefresher } from "@/features/overview/components/overview-refresher"
import { getCurrentMember } from "@/lib/auth"
import { agencyMonth, agencyToday } from "@/lib/dates"
import { hasDataForSeo } from "@/lib/env.server"
import { formatNumber, formatRelative } from "@/lib/format"
import { clientHref, findClientSection } from "@/lib/navigation"
import { can } from "@/lib/roles"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "AI visibility" }

type Props = PageProps<"/clients/[clientSlug]/ai-visibility">

export default function AiVisibilityPage({ params, searchParams }: Props) {
  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={null}>
        <AccessGuard item={findClientSection("ai-visibility")!} />
      </Suspense>
      <Suspense fallback={<PageSkeleton />}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

/** Tabs that need answers; Questions, Brands and Settings stay open during setup. */
const DATA_TABS: AivTab[] = ["overview", "chats", "sources", "actions"]

async function Content({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ clientSlug }, search, member] = await Promise.all([params, searchParams, getCurrentMember()])
  const client = await getClientBySlug(clientSlug)
  if (!client) notFound()

  const base = clientHref(client.slug, "ai-visibility")
  const p = parseAivParams(search, agencyToday())
  const filter = filterOf(p)
  const data = await getAivBase(client.id)
  const { quota, project, brands } = data
  const canManage = can(member.role, "ai_visibility.manage")
  const canWork = can(member.role, "ai_visibility.work")
  const isAdmin = can(member.role, "ai_visibility.frequency")
  const setupDone = quota.setupMissing.length === 0
  const tab: AivTab = !setupDone && DATA_TABS.includes(p.tab) ? (project ? "prompts" : "overview") : p.tab
  const active = data.prompts.filter((x) => x.status === "active")
  const open = quota.openRun
  const nowIso = new Date().toISOString()

  const runBlocked = !hasDataForSeo()
    ? "DataForSEO isn't connected yet."
    : client.stage === "paused" || client.stage === "churned"
      ? "This client is paused or has left."
      : !setupDone
        ? "Finish the setup first."
        : open
          ? "A check is running now."
          : quota.budgetProblem
            ? quota.budgetProblem
            : quota.manualUsed >= quota.manualLimit
              ? `This client has used its ${quota.manualLimit} manual checks this month.`
              : null

  const description = quota.lastDoneAt
    ? `Last check ${formatRelative(quota.lastDoneAt, new Date(nowIso))}${project?.nextRunAt && !project.paused ? ` · next ${formatRelative(project.nextRunAt, new Date(nowIso))}` : ""}`
    : "How ChatGPT, Gemini, Google AI, Claude and Perplexity talk about this business and its competitors"

  const tagList = [...new Set(data.prompts.flatMap((x) => x.tags))].sort()
  const tabCount: Partial<Record<AivTab, number>> = {
    prompts: active.length,
    actions: (data.actionCounts.new ?? 0) + (data.actionCounts.in_progress ?? 0),
  }

  return (
    <>
      <PageHeader
        eyebrow={client.name}
        title="AI visibility"
        description={description}
        actions={
          setupDone ? (
            <>
              <ExportMenu clientId={client.id} clientSlug={client.slug} filter={filter} />
              {canManage && project && (
                <RunNowButton clientId={client.id} prompts={active.length} models={project.models} disabledReason={runBlocked} manualLeft={Math.max(0, quota.manualLimit - quota.manualUsed)} />
              )}
            </>
          ) : null
        }
      />

      {quota.access === "denied" && (
        <Notice>AI Optimization isn&apos;t active on the DataForSEO account, so checks can&apos;t run. An admin can turn it on in DataForSEO.</Notice>
      )}
      {!open && quota.lastRun?.status === "failed" && <Notice>The last check didn&apos;t finish{quota.lastRun.error ? `: ${quota.lastRun.error}` : "."}</Notice>}
      {open && <RunProgress run={open} />}

      {!setupDone && (
        <SetupGate
          clientId={client.id}
          clientName={client.name}
          hasProject={quota.hasProject}
          prompts={active.length}
          settingsHref={aivHref(base, p, { tab: "settings" })}
          promptsHref={aivHref(base, p, { tab: "prompts" })}
          canManage={canManage}
        />
      )}

      {(setupDone || project) && (
        <nav aria-label="AI visibility sections" className="flex w-fit max-w-full overflow-x-auto rounded-lg border bg-card p-0.5">
          {TABS.map((t) => {
            const locked = !setupDone && DATA_TABS.includes(t)
            const isActive = t === tab
            const cls = cn(
              "flex h-8 items-center gap-2 rounded-md px-3 text-sm whitespace-nowrap transition-colors",
              isActive ? "bg-foreground text-background dark:bg-muted dark:text-foreground dark:ring-1 dark:ring-input" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              locked && "pointer-events-none opacity-50",
            )
            return locked ? (
              <span key={t} className={cls} aria-disabled="true" title="Finish the setup first">{TAB_LABEL[t]}</span>
            ) : (
              <Link key={t} href={aivHref(base, p, { tab: t, sheet: null, view: null, q: null })} scroll={false} aria-current={isActive ? "page" : undefined} className={cls}>
                {TAB_LABEL[t]}
                {tabCount[t] !== undefined && <span className={cn("rounded-sm px-1.5 text-xs tabular-nums", isActive ? "bg-background/20 dark:bg-background" : "bg-muted")}>{formatNumber(tabCount[t]!)}</span>}
              </Link>
            )
          })}
        </nav>
      )}

      {setupDone && ["overview", "chats", "sources", "brands"].includes(tab) && project && (
        <FilterBar params={p} models={project.models} countries={project.countries} tags={tagList} topics={data.topics} />
      )}

      {tab === "overview" && setupDone && <OverviewTab clientId={client.id} base={base} params={p} filter={filter} brands={brands} />}
      {tab === "prompts" && project && (
        <PromptPanel
          clientId={client.id}
          base={base}
          params={p}
          filter={filter}
          prompt={data.prompts.find((x) => x.id === p.sheet) ?? null}
          brands={brands}
        />
      )}
      {tab === "prompts" && project && (
        <PromptsTab
          clientId={client.id}
          prompts={data.prompts}
          topics={data.topics}
          stats={await getPromptStats(client.id, filter)}
          suggestions={data.suggestions}
          countries={project.countries}
          cap={quota.promptCap}
          canManage={canManage}
        />
      )}
      {tab === "chats" && setupDone && <ChatsTab clientId={client.id} base={base} params={p} filter={filter} brands={brands} />}
      {tab === "brands" && project && (
        <BrandsTab clientId={client.id} base={base} params={p} filter={filter} brands={brands} topics={data.topics} suggestions={data.suggestions} canManage={canManage} />
      )}
      {tab === "sources" && setupDone && <SourcesTab clientId={client.id} base={base} params={p} filter={filter} canWork={canWork} />}
      {tab === "actions" && setupDone && <ActionsTab clientId={client.id} actions={await getActions(client.id)} canWork={canWork} />}
      {tab === "settings" && project && (
        <SettingsBody clientId={client.id} project={project} data={data} canManage={canManage} isAdmin={isAdmin} nowIso={nowIso} />
      )}

      {open && <OverviewRefresher every={15_000} />}
    </>
  )
}

async function SettingsBody({
  clientId,
  project,
  data,
  canManage,
  isAdmin,
  nowIso,
}: {
  clientId: string
  project: NonNullable<Awaited<ReturnType<typeof getAivBase>>["project"]>
  data: Awaited<ReturnType<typeof getAivBase>>
  canManage: boolean
  isAdmin: boolean
  nowIso: string
}) {
  const db = await createSupabaseServerClient()
  const [{ data: places }, runs, accounts] = await Promise.all([
    db.from("backlink_targets").select("country_iso").eq("client_id", clientId).eq("active", true),
    getRunHistory(clientId),
    getAccountBalances(isAdmin),
  ])
  const history = runHistoryOf(runs, nowIso)
  const topicCounts: Record<string, number> = {}
  for (const q of data.prompts) if (q.topicId) topicCounts[q.topicId] = (topicCounts[q.topicId] ?? 0) + 1
  const placeCountries = [...new Set((places ?? []).map((x) => x.country_iso.toUpperCase()))]
  const own = data.brands.find((b) => b.isOwn) ?? null
  return (
    <div className="flex flex-col gap-8">
      <SettingsForm
        clientId={clientId}
        project={project}
        own={own}
        prompts={data.prompts.filter((x) => x.status === "active").length}
        placeCountries={placeCountries}
        canManage={canManage}
        canFrequency={isAdmin}
      />
      {isAdmin && (
        <SectionCard title="Budgets" description="For AI visibility across all clients. Checks stop dispatching when a limit is reached.">
          <BudgetForm monthlyBudget={data.quota.monthlyBudget} maxRun={data.quota.maxRunUsd} manualRuns={data.quota.manualLimit} monthSpend={data.quota.monthSpend} />
        </SectionCard>
      )}
      <SectionCard title="Topics" description="Group questions for the filters. One topic per question.">
        <TopicsEditor clientId={clientId} topics={data.topics} counts={topicCounts} canManage={canManage} />
      </SectionCard>
      <RunHistoryPanel
        history={history}
        accounts={accounts}
        nowIso={nowIso}
        labels={AIV_PART_LABELS}
        description="What every AI visibility check for this client cost, down to the cent."
        empty="No checks yet. Every scheduled and manual check shows up here with what it cost."
      />
    </div>
  )
}

/** AI Visibility runs in the shared "Runs and costs" shape: Google AI, AI platform answers, Claude. */
function runHistoryOf(runs: Awaited<ReturnType<typeof getRunHistory>>, nowIso: string): RunHistory {
  const month = agencyMonth(new Date(nowIso)).slice(0, 7)
  const [y, m] = month.split("-").map(Number)
  const last = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`
  const monthOf = (iso: string) => agencyMonth(new Date(iso)).slice(0, 7)
  const entries: RunEntry[] = runs.map((r) => ({
    id: r.id,
    kind: "ai_visibility",
    status: r.status,
    createdAt: r.createdAt,
    finishedAt: r.finishedAt,
    searches: null,
    counts: r.counts,
    error: r.error,
    places: [r.trigger === "schedule" ? "Scheduled" : r.trigger === "new_prompts" ? "Chosen questions" : "Manual"],
    by: r.createdBy || null,
    google: r.serpUsd,
    googleCalls: r.serpCalls,
    maps: r.llmUsd,
    mapsCalls: r.llmCalls,
    strength: 0,
    strengthDomains: 0,
    ai: r.aiUsd,
    aiCalls: r.aiCalls,
    aiInputTokens: r.aiIn,
    aiOutputTokens: r.aiOut,
    webSearches: 0,
    total: r.dfsUsd + r.aiUsd,
  }))
  const sum = (list: RunEntry[], k: "total" | "google" | "maps" | "ai") => list.reduce((s, e) => s + e[k], 0)
  const thisMonth = entries.filter((e) => monthOf(e.createdAt) === month)
  return {
    totals: {
      allTime: sum(entries, "total"),
      thisMonth: sum(thisMonth, "total"),
      lastMonth: sum(entries.filter((e) => monthOf(e.createdAt) === last), "total"),
      runs: entries.length,
      runsThisMonth: thisMonth.length,
      google: sum(entries, "google"),
      maps: sum(entries, "maps"),
      strength: 0,
      ai: sum(entries, "ai"),
    },
    entries,
  }
}

function RunProgress({ run }: { run: NonNullable<Awaited<ReturnType<typeof getAivBase>>["quota"]["openRun"]> }) {
  const t = run.tasks
  const total = Object.values(t).reduce((s, n) => s + n, 0)
  const done = (t.collected ?? 0) + (t.failed ?? 0) + (t.skipped ?? 0)
  const pctDone = total ? Math.round((100 * done) / total) : 0
  return (
    <section aria-live="polite" className="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <Loader2 className="size-4 animate-spin text-brand" aria-hidden />
          {STAGES[Math.min(run.stage, STAGES.length - 1)]}
        </span>
        <span className="text-muted-foreground tabular-nums">{total ? `${done} of ${total} answers` : "Starting"}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pctDone} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${run.stage >= 3 ? 100 : pctDone}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">ChatGPT and Gemini answers can take up to 45 minutes to come back. This page updates by itself.</p>
    </section>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <p>{children}</p>
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-16 w-[420px] max-w-full" />
      <StatStripSkeleton count={4} />
      <Skeleton className="h-[320px] w-full rounded-lg" />
    </div>
  )
}
