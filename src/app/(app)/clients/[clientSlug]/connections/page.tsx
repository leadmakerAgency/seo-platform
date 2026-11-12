import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { after } from "next/server"
import { Suspense } from "react"

import { AccessGuard } from "@/components/layout/access-guard"
import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { getClientBySlug } from "@/features/clients/queries"
import {
  ConnectionsView,
  ZernioSetupNotice,
} from "@/features/connections/components/connections-view"
import { IntegrationCard } from "@/features/connections/components/integration-card"
import { getConnectionsData, getIntegrationStatus } from "@/features/connections/queries"
import { syncClient, type Db } from "@/features/connections/sync"
import { getCurrentMember } from "@/lib/auth"
import { hasZernioApiKey } from "@/lib/env.server"
import { findClientSection } from "@/lib/navigation"
import { can } from "@/lib/roles"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Connections" }

type Props = PageProps<"/clients/[clientSlug]/connections">

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default function ConnectionsPage({ params, searchParams }: Props) {
  return (
    <div className="flex flex-col gap-10">
      <Suspense fallback={null}>
        <AccessGuard item={findClientSection("connections")!} />
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

  const canManage = can(member.role, "connections.manage")
  const isAdmin = can(member.role, "integrations.manage")
  const zernioReady = hasZernioApiKey()
  const data = await getConnectionsData(client.id)

  // Quietly refresh from Zernio after the page is sent when the mirror is old.
  const stale = data.stale
  if (zernioReady && canManage && data.hasProfile && stale) {
    const supabase = (await createSupabaseServerClient()) as unknown as Db
    after(async () => {
      try {
        await syncClient(supabase, client.id, member.id)
      } catch (error) {
        console.error("[zernio] background sync failed", error)
      }
    })
  }

  return (
    <>
      <PageHeader
        eyebrow={client.name}
        title="Connections"
        description={`The accounts LeadMaker posts to and reads from for ${client.name}. People sign in on Google or Facebook themselves, so we never see or store their passwords.`}
      />

      {!zernioReady ? (
        <ZernioSetupNotice isAdmin={isAdmin} />
      ) : (
        <ConnectionsView
          clientId={client.id}
          clientName={client.name}
          data={data}
          nowIso={new Date().toISOString()}
          canManage={canManage}
          zernioReady={zernioReady}
          result={{
            result: one(search.result),
            platform: one(search.platform),
            code: one(search.code),
            message: one(search.message)?.slice(0, 300),
          }}
        />
      )}

      {isAdmin && (
        <Suspense fallback={<Skeleton className="h-[220px] w-full rounded-lg" />}>
          <AdminCard />
        </Suspense>
      )}
    </>
  )
}

async function AdminCard() {
  const status = await getIntegrationStatus()
  return <IntegrationCard status={status} nowIso={new Date().toISOString()} />
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <Skeleton className="h-16 w-[420px] max-w-full" />
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[150px] rounded-lg lg:col-span-2" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[150px] rounded-lg" />
        ))}
      </div>
    </div>
  )
}
