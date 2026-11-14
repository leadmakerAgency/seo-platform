import { Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { AccessGuard } from "@/components/layout/access-guard"
import { PageHeader, Section } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { StatStripSkeleton } from "@/components/common/stat-strip"
import { Skeleton } from "@/components/ui/skeleton"
import { getClientBySlug } from "@/features/clients/queries"
import { PortalLinkCard } from "@/features/requests/components/portal-link-card"
import { RequestFormDialog } from "@/features/requests/components/request-form-dialog"
import { RequestSheetSkeleton } from "@/features/requests/components/request-sheet"
import { RequestSheetLoader } from "@/features/requests/components/request-sheet-loader"
import { RequestTiles } from "@/features/requests/components/request-tiles"
import { RequestsTable } from "@/features/requests/components/requests-table"
import { countRequests, filterRequests } from "@/features/requests/filters"
import {
  getOpenTasksForClient,
  getPortalLink,
  getRequestsForClient,
} from "@/features/requests/queries"
import { parseRequestParams, requestsHref } from "@/features/requests/search-params"
import { getAssignableMembers } from "@/features/tasks/queries"
import { getCurrentMember } from "@/lib/auth"
import { agencyToday } from "@/lib/dates"
import { clientHref, findClientSection } from "@/lib/navigation"
import { requestOrigin } from "@/lib/origin"
import { can } from "@/lib/roles"

export const metadata: Metadata = { title: "Client requests" }

type Props = PageProps<"/clients/[clientSlug]/requests">

export default function ClientRequestsPage({ params, searchParams }: Props) {
  return (
    <div className="flex flex-col gap-10">
      <Suspense fallback={null}>
        <AccessGuard item={findClientSection("requests")!} />
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

  const canCreate = can(member.role, "requests.create")
  const filters = parseRequestParams(search)
  const [rows, link, members, taskOptions, origin] = await Promise.all([
    getRequestsForClient(client.id),
    canCreate ? getPortalLink(client.id) : Promise.resolve(null),
    canCreate ? getAssignableMembers() : Promise.resolve([]),
    canCreate ? getOpenTasksForClient(client.id) : Promise.resolve([]),
    requestOrigin(),
  ])

  const today = agencyToday()
  const nowIso = new Date().toISOString()
  const basePath = clientHref(client.slug, "requests")
  const counts = countRequests(rows, today)
  const visible = filterRequests(rows, filters, today)
  const cancelled = rows.filter((r) => r.status === "cancelled").length
  const closeHref = requestsHref(basePath, filters, { request: undefined })

  const newRequest = canCreate ? (
    <RequestFormDialog
      clients={[{ id: client.id, name: client.name }]}
      taskOptions={taskOptions}
      members={members}
      currentMemberId={member.id}
      trigger={
        <Button>
          <Plus />
          New request
        </Button>
      }
    />
  ) : null

  return (
    <>
      <PageHeader
        eyebrow={client.name}
        title="Client requests"
        description={`Things we need from ${client.name}: codes, files, approvals and answers. They respond through their private link, and linked tasks pick up again by themselves.`}
        actions={newRequest}
      />

      {canCreate && (
        <PortalLinkCard
          clientId={client.id}
          clientName={client.name}
          portalUrl={link ? `${origin}/c/${link.token}` : null}
          lastOpenedAt={link?.lastOpenedAt ?? null}
          nowIso={nowIso}
          canReplace={can(member.role, "requests.manage")}
          openTitles={rows.filter((r) => r.status === "open").map((r) => r.title)}
          senderName={member.displayName.split(" ")[0]}
        />
      )}

      <Section title="At a glance" description="Click a box to filter the list.">
        <RequestTiles counts={counts} params={filters} basePath={basePath} />
      </Section>

      <Section
        id="requests"
        title="Requests"
        description="Answers waiting for review come first, then the oldest due date."
      >
        <div className="flex flex-col gap-3">
          {(filters.show || cancelled > 0) && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {filters.show && (
                <Link
                  href={`${requestsHref(basePath, filters, { show: undefined, request: undefined })}#requests`}
                  scroll={false}
                  className="text-brand underline-offset-4 hover:underline"
                >
                  Show all requests
                </Link>
              )}
              {cancelled > 0 && filters.show !== "cancelled" && (
                <Link
                  href={`${requestsHref(basePath, filters, { show: "cancelled", request: undefined })}#requests`}
                  scroll={false}
                  className="text-muted-foreground underline-offset-4 hover:underline"
                >
                  {cancelled} cancelled
                </Link>
              )}
            </div>
          )}
          <RequestsTable
            rows={visible}
            params={filters}
            basePath={basePath}
            today={today}
            nowIso={nowIso}
            emptyTitle={
              rows.length === 0 ? `Nothing asked of ${client.name} yet` : "No requests match"
            }
            emptyDescription={
              rows.length === 0
                ? "Ask for a verification code, photos, an approval or access. The client answers through their link."
                : "Try another box, or show all requests."
            }
            emptyAction={rows.length === 0 ? newRequest : undefined}
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

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <Skeleton className="h-16 w-[420px] max-w-full" />
      <Skeleton className="h-[120px] w-full rounded-lg" />
      <StatStripSkeleton />
      <Skeleton className="h-[260px] w-full rounded-lg" />
    </div>
  )
}
