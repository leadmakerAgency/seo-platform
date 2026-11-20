import type { Metadata } from "next"
import { Suspense } from "react"

import { AccessGuard } from "@/components/layout/access-guard"
import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { CatalogTable } from "@/features/backlinks/manual/components/catalog-table"
import { getCatalog, getCatalogUsage } from "@/features/backlinks/manual/queries"
import { getCurrentMember } from "@/lib/auth"
import { findAgencyItem } from "@/lib/navigation"
import { can } from "@/lib/roles"

export const metadata: Metadata = { title: "Backlink catalog" }

export default function BacklinkCatalogPage() {
  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={null}>
        <AccessGuard item={findAgencyItem("backlink-catalog")!} />
      </Suspense>
      <PageHeader
        title="Backlink catalog"
        description="The agency's trusted sites. VAs pick from this list on each client's Backlinks page (Manual Search); it's sorted for each client from their strategy brief."
      />
      <Suspense fallback={<Skeleton className="h-[520px] w-full rounded-lg" />}>
        <Content />
      </Suspense>
    </div>
  )
}

async function Content() {
  const member = await getCurrentMember()
  const canEdit = can(member.role, "backlinks.catalog")
  const [sites, usage] = await Promise.all([getCatalog(canEdit), getCatalogUsage()])
  return <CatalogTable sites={sites} usage={usage} canEdit={canEdit} />
}
