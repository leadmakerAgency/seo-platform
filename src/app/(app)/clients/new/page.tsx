import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { NewClientForm } from "@/features/clients/components/new-client-form"
import { getTeamMembers } from "@/features/clients/queries"
import { getCurrentMember } from "@/lib/auth"
import { agencyToday } from "@/lib/dates"
import { homeHref } from "@/lib/navigation"
import { can } from "@/lib/roles"

export const metadata: Metadata = { title: "Add client" }

/** The Add client page (admins and account managers). */
export default function NewClientPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Add client"
        description="Fill in what you know from the sales call. Everything marked optional can be left for the client: they confirm it all in their onboarding link."
      />
      <Suspense fallback={<FormSkeleton />}>
        <Content />
      </Suspense>
    </div>
  )
}

async function Content() {
  const member = await getCurrentMember()
  if (!can(member.role, "clients.create")) redirect(homeHref(member.role))
  const owners = await getTeamMembers()
  return (
    <NewClientForm
      owners={owners.map((o) => ({ id: o.id, name: o.name }))}
      defaultOwnerId={member.id}
      today={agencyToday()}
    />
  )
}

function FormSkeleton() {
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="flex flex-col gap-10">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex flex-col gap-4">
            <Skeleton className="h-10 w-72" />
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="hidden h-64 xl:block" />
    </div>
  )
}
