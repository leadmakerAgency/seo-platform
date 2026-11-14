import { Plus } from "lucide-react"
import type { Metadata } from "next"
import { Suspense } from "react"

import { AccessGuard } from "@/components/layout/access-guard"
import { FindClientButton } from "@/components/layout/find-client-button"
import { PageHeader, Section } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { StatStripSkeleton } from "@/components/common/stat-strip"
import { Skeleton } from "@/components/ui/skeleton"
import { AddClientDialog } from "@/features/clients/components/add-client-dialog"
import { getTeamMembers } from "@/features/clients/queries"
import { AttentionList, type AttentionItem } from "@/features/dashboard/components/attention-list"
import { ClientsView } from "@/features/dashboard/components/clients-view"
import { HealthTiles } from "@/features/dashboard/components/health-tiles"
import { getClientsPage, getHealthCounts, getOpenAlerts } from "@/features/dashboard/queries"
import { parseDashboardParams } from "@/features/dashboard/search-params"
import { getRequestAttention } from "@/features/requests/queries"
import { getCurrentMember } from "@/lib/auth"
import { agencyToday, formatDay } from "@/lib/dates"
import { clientHref, findAgencyItem } from "@/lib/navigation"
import { can } from "@/lib/roles"

export const metadata: Metadata = { title: "Dashboard" }

type SearchParams = PageProps<"/dashboard">["searchParams"]

/**
 * The static frame (title, section headings) renders instantly; each data
 * section streams in behind its own <Suspense> with a matching skeleton.
 */
export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <div className="flex flex-col gap-10">
      <Suspense fallback={null}>
        <AccessGuard item={findAgencyItem("dashboard")!} />
      </Suspense>

      <PageHeader
        title="Dashboard"
        description="Every SEO client on one page. Start with what needs attention, then find any client in the list."
        actions={
          <Suspense fallback={<HeaderActionsSkeleton />}>
            <HeaderActions />
          </Suspense>
        }
      />

      <Section
        title="Client health"
        description="Click a box to show only those clients in the list."
      >
        <Suspense fallback={<TilesSkeleton />}>
          <HealthSection searchParams={searchParams} />
        </Suspense>
      </Section>

      <Section
        title="Needs attention"
        description="The most urgent problems across all clients, including overdue client requests."
      >
        <Suspense fallback={<ListSkeleton rows={2} />}>
          <AttentionSection />
        </Suspense>
      </Section>

      <Section
        id="clients"
        title="Client list"
        description="Search, filter and sort to find any client."
      >
        <Suspense fallback={<TableSkeleton />}>
          <ClientListSection searchParams={searchParams} />
        </Suspense>
      </Section>
    </div>
  )
}

async function HeaderActions() {
  const member = await getCurrentMember()
  const canCreate = can(member.role, "clients.create")
  const owners = canCreate ? await getTeamMembers() : []
  return (
    <>
      <FindClientButton />
      {canCreate && <AddClientDialog owners={owners} defaultOwnerId={member.id} />}
    </>
  )
}

async function HealthSection({ searchParams }: { searchParams: SearchParams }) {
  const [counts, params] = await Promise.all([
    getHealthCounts(),
    searchParams.then(parseDashboardParams),
  ])
  return <HealthTiles counts={counts} params={params} />
}

async function AttentionSection() {
  const [member, { alerts }, requests] = await Promise.all([
    getCurrentMember(),
    getOpenAlerts(5),
    getRequestAttention(),
  ])
  const today = agencyToday()
  const items: AttentionItem[] = requests.overdue.slice(0, 5).map((o) => {
    const days = Math.round((Date.parse(today) - Date.parse(o.oldestDue)) / 86_400_000)
    return {
      key: `requests-overdue-${o.client.slug}`,
      urgent: true,
      client: o.client,
      title:
        o.count === 1 ? "1 client request is overdue" : `${o.count} client requests are overdue`,
      detail: `The oldest was due ${formatDay(o.oldestDue)}, ${days === 1 ? "1 day" : `${days} days`} ago.`,
      href: `${clientHref(o.client.slug, "requests")}?show=overdue`,
      actionLabel: "Open requests",
    }
  })
  if (requests.answered > 0) {
    items.push({
      key: "requests-answered",
      urgent: false,
      client: null,
      title:
        requests.answered === 1
          ? "1 client answer is waiting for review"
          : `${requests.answered} client answers are waiting for review`,
      href: can(member.role, "tasks.manage") ? "/tasks/requests?show=answered" : null,
      actionLabel: "Review",
    })
  }
  return <AttentionList alerts={alerts} items={items} now={new Date()} />
}

async function ClientListSection({ searchParams }: { searchParams: SearchParams }) {
  const [member, params] = await Promise.all([
    getCurrentMember(),
    searchParams.then(parseDashboardParams),
  ])
  const { rows, total } = await getClientsPage(params, member.id)
  const canCreate = can(member.role, "clients.create")
  const owners = canCreate && total === 0 ? await getTeamMembers() : []

  return (
    <ClientsView
      rows={rows}
      total={total}
      params={params}
      emptyAction={
        canCreate ? (
          <AddClientDialog
            owners={owners}
            defaultOwnerId={member.id}
            trigger={
              <Button>
                <Plus />
                Add your first client
              </Button>
            }
          />
        ) : undefined
      }
    />
  )
}

function HeaderActionsSkeleton() {
  return (
    <>
      <Skeleton className="h-9 w-[132px]" />
      <Skeleton className="h-9 w-[112px]" />
    </>
  )
}

function TilesSkeleton() {
  return <StatStripSkeleton />
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-px overflow-hidden rounded-lg border bg-card">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 rounded-none" />
      ))}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Skeleton className="h-9 w-[320px]" />
        <Skeleton className="h-9 w-[170px]" />
        <Skeleton className="h-9 w-[180px]" />
      </div>
      <ListSkeleton rows={6} />
    </div>
  )
}
