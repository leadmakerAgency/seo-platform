import { getAssignableMembers } from "@/features/tasks/queries"
import { getCurrentMember } from "@/lib/auth"
import { agencyToday } from "@/lib/dates"
import { requestOrigin } from "@/lib/origin"
import { can } from "@/lib/roles"
import { getOpenTasksForClient, getPortalLink, getRequestDetail } from "../queries"
import { RequestNotFoundSheet, RequestSheet } from "./request-sheet"

/** Loads one request (by its R-number) and opens the request panel. Render inside <Suspense>. */
export async function RequestSheetLoader({
  number,
  closeHref,
}: {
  number: number
  closeHref: string
}) {
  const [member, request] = await Promise.all([getCurrentMember(), getRequestDetail(number)])
  if (!request) return <RequestNotFoundSheet closeHref={closeHref} number={number} />

  const canCreate = can(member.role, "requests.create")
  const [members, taskOptions, link, origin] = await Promise.all([
    canCreate ? getAssignableMembers() : Promise.resolve([]),
    canCreate ? getOpenTasksForClient(request.client.id) : Promise.resolve([]),
    canCreate ? getPortalLink(request.client.id) : Promise.resolve(null),
    requestOrigin(),
  ])

  return (
    <RequestSheet
      request={request}
      closeHref={closeHref}
      today={agencyToday()}
      nowIso={new Date().toISOString()}
      currentMemberId={member.id}
      canManage={can(member.role, "requests.manage")}
      canCreate={canCreate}
      members={members}
      taskOptions={taskOptions}
      portalUrl={link ? `${origin}/c/${link.token}` : null}
    />
  )
}
