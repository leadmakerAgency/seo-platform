import { getCurrentMember } from "@/lib/auth"
import { agencyToday } from "@/lib/dates"
import { can } from "@/lib/roles"
import { getAssignableMembers, getClientOptions, getTaskDetail } from "../queries"
import { TaskNotFoundSheet, TaskSheet } from "./task-sheet"

/** Loads one task (by its T-number) and opens the task panel. Render inside <Suspense>. */
export async function TaskSheetLoader({
  number,
  closeHref,
}: {
  number: number
  closeHref: string
}) {
  const member = await getCurrentMember()
  const canManage = can(member.role, "tasks.manage")
  const canWork = can(member.role, "tasks.work")

  const [task, members, clientOptions] = await Promise.all([
    getTaskDetail(number),
    canWork ? getAssignableMembers() : Promise.resolve([]),
    canManage ? getClientOptions() : Promise.resolve([]),
  ])
  if (!task) return <TaskNotFoundSheet closeHref={closeHref} number={number} />

  return (
    <TaskSheet
      task={task}
      closeHref={closeHref}
      today={agencyToday()}
      currentMemberId={member.id}
      canManage={canManage}
      canWork={canWork}
      members={members}
      clientOptions={clientOptions}
    />
  )
}
