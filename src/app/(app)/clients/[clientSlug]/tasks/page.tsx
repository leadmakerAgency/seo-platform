import { Plus } from "lucide-react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { AccessGuard } from "@/components/layout/access-guard"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getClientBySlug } from "@/features/clients/queries"
import { ClientTasksView } from "@/features/tasks/components/client-tasks-view"
import { TaskFormDialog } from "@/features/tasks/components/task-form-dialog"
import { TaskSheetSkeleton } from "@/features/tasks/components/task-sheet"
import { TaskSheetLoader } from "@/features/tasks/components/task-sheet-loader"
import { getAssignableMembers, getClientOptions, getTasksForClient } from "@/features/tasks/queries"
import { getCurrentMember } from "@/lib/auth"
import { agencyToday } from "@/lib/dates"
import { clientHref, findClientSection } from "@/lib/navigation"
import { can } from "@/lib/roles"

export const metadata: Metadata = { title: "Client tasks" }

type Props = PageProps<"/clients/[clientSlug]/tasks">

export default function ClientTasksPage({ params, searchParams }: Props) {
  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={null}>
        <AccessGuard item={findClientSection("tasks")!} />
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

  const canManage = can(member.role, "tasks.manage")
  const [rows, members, clientOptions] = await Promise.all([
    getTasksForClient(client.id),
    canManage ? getAssignableMembers() : Promise.resolve([]),
    canManage ? getClientOptions() : Promise.resolve([]),
  ])

  const rawTask = Array.isArray(search.task) ? search.task[0] : search.task
  const taskNumber = rawTask && /^\d+$/.test(rawTask) ? Number(rawTask) : null
  const basePath = clientHref(client.slug, "tasks")
  const openCount = rows.filter((r) => r.status !== "done").length

  const newTask = canManage ? (
    <TaskFormDialog
      members={members}
      clientOptions={clientOptions}
      defaultClientIds={[client.id]}
      trigger={
        <Button>
          <Plus />
          New task for this client
        </Button>
      }
    />
  ) : null

  return (
    <>
      <PageHeader
        eyebrow={client.name}
        title="Client tasks"
        description={`Every task that includes ${client.name}. Some tasks cover many clients; tick this client off when its part is done. ${openCount} open.`}
        actions={newTask}
      />
      <ClientTasksView
        clientId={client.id}
        clientName={client.name}
        rows={rows}
        today={agencyToday()}
        currentMemberId={member.id}
        canManage={canManage}
        emptyAction={newTask}
      />
      {taskNumber && (
        <Suspense key={taskNumber} fallback={<TaskSheetSkeleton closeHref={basePath} />}>
          <TaskSheetLoader number={taskNumber} closeHref={basePath} />
        </Suspense>
      )}
    </>
  )
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-16 w-[420px] max-w-full" />
      <Skeleton className="h-[260px] w-full rounded-lg" />
    </div>
  )
}
