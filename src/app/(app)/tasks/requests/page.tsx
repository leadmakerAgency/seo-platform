import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { AccessGuard } from "@/components/layout/access-guard"
import { PageHeader, Section } from "@/components/layout/page-header"
import { StatStripSkeleton } from "@/components/common/stat-strip"
import { Skeleton } from "@/components/ui/skeleton"
import { RequestSheetSkeleton } from "@/features/requests/components/request-sheet"
import { RequestSheetLoader } from "@/features/requests/components/request-sheet-loader"
import { RequestTiles } from "@/features/requests/components/request-tiles"
import { RequestsTable } from "@/features/requests/components/requests-table"
import { RequestsToolbar } from "@/features/requests/components/requests-toolbar"
import { countRequests, filterRequests } from "@/features/requests/filters"
import { getActiveRequests } from "@/features/requests/queries"
import { parseRequestParams, requestsHref } from "@/features/requests/search-params"
import { TasksTabsNav } from "@/features/tasks/components/tasks-tabs-nav"
import { getAssignableMembers, getTaskCounts } from "@/features/tasks/queries"
import { getCurrentMember } from "@/lib/auth"
import { agencyToday } from "@/lib/dates"
import { findAgencyItem } from "@/lib/navigation"
import { can } from "@/lib/roles"

export const metadata: Metadata = { title: "Client requests" }

const BASE = "/tasks/requests"

export default function AllRequestsPage({ searchParams }: PageProps<"/tasks/requests">) {
  return (
    <div className="flex flex-col gap-10">
      <Suspense fallback={null}>
        <AccessGuard item={findAgencyItem("tasks")!} />
      </Suspense>

      <PageHeader
        title="Client requests"
        description="Everything we're waiting on from clients, across every client. Answers to review come first. Use it as the morning chase list."
      />

      <Suspense fallback={<RequestsSkeleton />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Content({
  searchParams,
}: {
  searchParams: PageProps<"/tasks/requests">["searchParams"]
}) {
  const member = await getCurrentMember()
  if (!can(member.role, "tasks.manage")) redirect("/tasks")

  const filters = parseRequestParams(await searchParams)
  const [rows, members, taskCounts] = await Promise.all([
    getActiveRequests(),
    getAssignableMembers(),
    getTaskCounts(false),
  ])
  const today = agencyToday()
  const counts = countRequests(rows, today)
  const visible = filterRequests(rows, filters, today)
  const closeHref = requestsHref(BASE, filters, { request: undefined })

  return (
    <>
      <TasksTabsNav
        active="requests"
        counts={taskCounts}
        requestCount={counts.open + counts.answered}
      />

      <Section title="At a glance" description="Click a box to filter the list.">
        <RequestTiles counts={counts} params={filters} basePath={BASE} showDone={false} />
      </Section>

      <Section
        id="requests"
        title="Waiting on clients"
        description="Open and answered requests. Click one to open it."
      >
        <div className="flex flex-col gap-3">
          <RequestsToolbar params={filters} basePath={BASE} members={members} />
          <RequestsTable
            rows={visible}
            params={filters}
            basePath={BASE}
            today={today}
            nowIso={new Date().toISOString()}
            showClient
            emptyTitle={rows.length === 0 ? "Nothing waiting on clients" : "No requests match"}
            emptyDescription={
              rows.length === 0
                ? "Requests are created from a client's Client requests page, or with “Ask the client” on a task."
                : "Try another filter, or clear the filters."
            }
          />
        </div>
      </Section>

      {filters.request && (
        <Suspense key={filters.request} fallback={<RequestSheetSkeleton closeHref={closeHref} />}>
          <RequestSheetLoader number={filters.request} closeHref={closeHref} />
        </Suspense>
      )}
    </>
  )
}

function RequestsSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <Skeleton className="h-9 w-[420px] max-w-full" />
      <StatStripSkeleton count={3} />
      <Skeleton className="h-[280px] w-full rounded-lg" />
    </div>
  )
}
