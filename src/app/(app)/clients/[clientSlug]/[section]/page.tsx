import { notFound } from "next/navigation"
import { Suspense } from "react"

import { ComingSoonPage } from "@/components/layout/coming-soon-page"
import { Skeleton } from "@/components/ui/skeleton"
import { findClientSection } from "@/lib/navigation"

/** Every client section that isn't built yet. Built sections get their own folder. */
export default function ClientSectionPage({
  params,
}: PageProps<"/clients/[clientSlug]/[section]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[420px] w-full" />}>
      <Section params={params} />
    </Suspense>
  )
}

async function Section({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  const item = findClientSection(section)
  if (!item || item.segment === "") notFound()
  return <ComingSoonPage item={item} />
}
