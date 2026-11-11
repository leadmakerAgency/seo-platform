import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { PortalView } from "@/features/requests/components/portal/portal-view"
import { getPortal } from "@/features/requests/portal"
import { agencyToday } from "@/lib/dates"

export const metadata: Metadata = {
  title: { absolute: "Things we need from you · LeadMaker" },
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
}

/** The client portal: a private link, no sign-in. The token is checked in the database. */
export default function PortalPage({ params }: PageProps<"/c/[token]">) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[560px] flex-col px-4 pt-6 pb-16 sm:pt-10">
      <header className="flex items-center gap-2.5 pb-8">
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-md bg-primary text-[13px] font-semibold tracking-tight text-primary-foreground"
        >
          LM
        </span>
        <span className="text-[15px] font-semibold tracking-tight">LeadMaker</span>
      </header>
      <Suspense fallback={<PortalSkeleton />}>
        <Portal params={params} />
      </Suspense>
    </div>
  )
}

async function Portal({ params }: { params: PageProps<"/c/[token]">["params"] }) {
  const { token } = await params
  const data = await getPortal(token)

  if (!data) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border p-6">
        <h1 className="text-xl font-semibold tracking-tight">This link isn&apos;t active</h1>
        <p className="text-[15px] text-muted-foreground">
          Ask your LeadMaker contact to send you a new one.
        </p>
      </div>
    )
  }

  return <PortalView token={token} data={data} today={agencyToday()} />
}

function PortalSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="mt-4 h-44 w-full rounded-xl" />
      <Skeleton className="h-44 w-full rounded-xl" />
    </div>
  )
}
