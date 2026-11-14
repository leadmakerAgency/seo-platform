import { FileText } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { AccessGuard } from "@/components/layout/access-guard"
import { PageHeader, Section } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getClientBySlug, getTeamMembers } from "@/features/clients/queries"
import { ActivityFeed } from "@/features/overview/components/activity-feed"
import { AttentionList } from "@/features/overview/components/attention-list"
import { DetailsGrid } from "@/features/overview/components/details-grid"
import { EditClientDialog } from "@/features/overview/components/edit-client-dialog"
import { MonthWork } from "@/features/overview/components/month-work"
import { OpenTasks } from "@/features/overview/components/open-tasks"
import { OverviewRefresher } from "@/features/overview/components/overview-refresher"
import { VisibilityPanel } from "@/features/overview/components/visibility-panel"
import {
  getClientActivity,
  getClientAlerts,
  getMonthWork,
  getOverviewDetails,
  getVisibility,
  type OverviewDetails,
} from "@/features/overview/queries"
import { getTasksForClient } from "@/features/tasks/queries"
import { getCurrentMember } from "@/lib/auth"
import { addMonths, agencyMonth, agencyToday, daysLeftInMonth, parseMonth } from "@/lib/dates"
import { clientHref, findClientSection } from "@/lib/navigation"
import { can } from "@/lib/roles"

export const metadata: Metadata = { title: "Overview" }

type Props = PageProps<"/clients/[clientSlug]">

export default function ClientOverviewPage({ params, searchParams }: Props) {
  return (
    <div className="flex flex-col gap-10">
      <Suspense fallback={null}>
        <AccessGuard item={findClientSection("")!} />
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

  const canEdit = can(member.role, "clients.update")
  const [details, owners] = await Promise.all([
    getOverviewDetails(client.id),
    canEdit ? getTeamMembers() : Promise.resolve([]),
  ])
  if (!details) notFound()

  const today = agencyToday()
  const currentMonth = agencyMonth()
  const rawMonth = Array.isArray(search.month) ? search.month[0] : search.month
  const month = parseMonth(rawMonth, currentMonth) ?? currentMonth
  const now = new Date()

  return (
    <>
      <PageHeader
        title="Overview"
        description="Everything about this client on one page: who they are, where they show up, and how this month's work is going."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={clientHref(details.slug, "report")}>
                <FileText />
                Monthly report
              </Link>
            </Button>
            {canEdit && <EditClientDialog details={details} owners={owners} />}
          </>
        }
      />

      <Suspense fallback={null}>
        <Attention details={details} now={now} />
      </Suspense>

      <Section title="Client details">
        <DetailsGrid details={details} today={today} />
      </Section>

      <Section
        title="Where they show up"
        description="A business can appear in three separate places. Each one is ranked on its own, so we track all three."
      >
        <Suspense fallback={<Skeleton className="h-[228px] w-full rounded-lg" />}>
          <Visibility clientId={details.id} slug={details.slug} now={now} />
        </Suspense>
      </Section>

      <Suspense fallback={<WorkSkeleton />}>
        <Work
          details={details}
          month={month}
          currentMonth={currentMonth}
          today={today}
          memberId={member.id}
          canLog={can(member.role, "work.log")}
          canManage={can(member.role, "tasks.manage")}
        />
      </Suspense>

      <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-6">
        <Suspense fallback={<ListSkeleton />}>
          <Tasks clientId={details.id} slug={details.slug} today={today} />
        </Suspense>
        <Suspense fallback={<ListSkeleton />}>
          <Activity clientId={details.id} clientName={details.name} today={today} />
        </Suspense>
      </div>

      <OverviewRefresher />
    </>
  )
}

async function Attention({ details, now }: { details: OverviewDetails; now: Date }) {
  const alerts = await getClientAlerts(details.id)
  return <AttentionList alerts={alerts} details={details} now={now} />
}

async function Visibility({ clientId, slug, now }: { clientId: string; slug: string; now: Date }) {
  const visibility = await getVisibility(clientId)
  return <VisibilityPanel visibility={visibility} slug={slug} now={now} />
}

async function Work({
  details,
  month,
  currentMonth,
  today,
  memberId,
  canLog,
  canManage,
}: {
  details: OverviewDetails
  month: string
  currentMonth: string
  today: string
  memberId: string
  canLog: boolean
  canManage: boolean
}) {
  const rows = await getMonthWork(details.id, month)
  const base = clientHref(details.slug)
  const firstMonth = `${details.startedOn.slice(0, 7)}-01`
  const prev = addMonths(month, -1)
  const next = addMonths(month, 1)
  const hrefFor = (m: string) => (m === currentMonth ? base : `${base}?month=${m.slice(0, 7)}`)

  return (
    <MonthWork
      clientId={details.id}
      slug={details.slug}
      stage={details.stage}
      startedOn={details.startedOn}
      month={month}
      currentMonth={currentMonth}
      today={today}
      daysLeft={daysLeftInMonth(today)}
      rows={rows}
      prevHref={prev >= firstMonth ? hrefFor(prev) : null}
      nextHref={next <= currentMonth ? hrefFor(next) : null}
      canLog={canLog}
      canManage={canManage}
      memberId={memberId}
      earliestLogMonth={addMonths(currentMonth, -1)}
    />
  )
}

async function Tasks({ clientId, slug, today }: { clientId: string; slug: string; today: string }) {
  const tasks = await getTasksForClient(clientId)
  return <OpenTasks tasks={tasks} slug={slug} today={today} />
}

async function Activity({
  clientId,
  clientName,
  today,
}: {
  clientId: string
  clientName: string
  today: string
}) {
  const { entries, hasMore } = await getClientActivity(clientId, clientName)
  return (
    <ActivityFeed
      clientId={clientId}
      clientName={clientName}
      initial={entries}
      initialHasMore={hasMore}
      today={today}
    />
  )
}

function WorkSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-[260px] w-full rounded-lg" />
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-[280px] w-full rounded-lg" />
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <Skeleton className="h-16 w-[420px] max-w-full" />
      <Skeleton className="h-[220px] w-full rounded-lg" />
      <Skeleton className="h-[228px] w-full rounded-lg" />
      <WorkSkeleton />
    </div>
  )
}
