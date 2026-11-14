import type { Metadata } from "next"
import { Suspense } from "react"

import { AccessGuard } from "@/components/layout/access-guard"
import { PageHeader, Section } from "@/components/layout/page-header"
import { StatStripSkeleton } from "@/components/common/stat-strip"
import { Skeleton } from "@/components/ui/skeleton"
import { TaskFormDialog } from "@/features/tasks/components/task-form-dialog"
import { TaskSheetSkeleton } from "@/features/tasks/components/task-sheet"
import { TaskSheetLoader } from "@/features/tasks/components/task-sheet-loader"
import { TaskTiles } from "@/features/tasks/components/task-tiles"
import { TasksView } from "@/features/tasks/components/tasks-view"
import { countActiveRequests } from "@/features/requests/queries"
import {
  getAssignableMembers,
  getClientOptions,
  getTaskCounts,
  getTasksPage,
} from "@/features/tasks/queries"
import { parseTaskParams, tasksHref } from "@/features/tasks/search-params"
import { getCurrentMember } from "@/lib/auth"
import { agencyToday } from "@/lib/dates"
import { findAgencyItem } from "@/lib/navigation"
import { can } from "@/lib/roles"

export const metadata: Metadata = { title: "Tasks" }

type SearchParams = PageProps<"/tasks">["searchParams"]

export default function TasksPage({ searchParams }: PageProps<"/tasks">) {
  return (
    <div className="flex flex-col gap-10">
      <Suspense fallback={null}>
        <AccessGuard item={findAgencyItem("tasks")!} />
      </Suspense>

      <PageHeader
        title="Tasks"
        description="All the manual work, in one list. One task can cover many clients, like “Submit Yelp listings” for 12 clients. Tick each client off as you go."
        actions={
          <Suspense fallback={<Skeleton className="h-9 w-[110px]" />}>
            <HeaderActions />
          </Suspense>
        }
      />

      <Suspense fallback={<TasksSkeleton />}>
        <TasksContent searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function HeaderActions() {
  const member = await getCurrentMember()
  if (!can(member.role, "tasks.manage")) return null
  const [members, clientOptions] = await Promise.all([getAssignableMembers(), getClientOptions()])
  return <TaskFormDialog members={members} clientOptions={clientOptions} />
}

async function TasksContent({ searchParams }: { searchParams: SearchParams }) {
  const member = await getCurrentMember()
  const canSeeTeam = can(member.role, "tasks.manage")
  const params = parseTaskParams(await searchParams, canSeeTeam)

  const [counts, page, members, requests] = await Promise.all([
    getTaskCounts(!canSeeTeam || params.view === "mine"),
    getTasksPage(params, member.id),
    canSeeTeam ? getAssignableMembers() : Promise.resolve([]),
    canSeeTeam ? countActiveRequests() : Promise.resolve(null),
  ])
  const closeHref = tasksHref(params, { task: undefined, page: params.page })

  return (
    <>
      <Section
        title={canSeeTeam && params.view !== "mine" ? "Team at a glance" : "Your week"}
        description="Open tasks by due date. Click a box to filter the list."
      >
        <TaskTiles counts={counts} params={params} />
      </Section>

      <Section
        id="tasks"
        title="Task list"
        description="Most urgent first. Click a task to open it."
      >
        <TasksView
          rows={page.rows}
          total={page.total}
          params={params}
          counts={counts}
          today={agencyToday()}
          canSeeTeam={canSeeTeam}
          members={members}
          requestCount={requests ? requests.open + requests.answered : undefined}
          emptyAction={
            canSeeTeam ? (
              <Suspense fallback={null}>
                <HeaderActions />
              </Suspense>
            ) : undefined
          }
        />
      </Section>

      {params.task && (
        <Suspense key={params.task} fallback={<TaskSheetSkeleton closeHref={closeHref} />}>
          <TaskSheetLoader number={params.task} closeHref={closeHref} />
        </Suspense>
      )}
    </>
  )
}

function TasksSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <StatStripSkeleton />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-[420px] max-w-full" />
        <Skeleton className="h-9 w-[560px] max-w-full" />
        <Skeleton className="h-[280px] w-full rounded-lg" />
      </div>
    </div>
  )
}
