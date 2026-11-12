import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { AccessGuard } from "@/components/layout/access-guard"
import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { getClientBySlug } from "@/features/clients/queries"
import { OnboardingView } from "@/features/onboarding/components/onboarding-view"
import { getOnboardingOverview } from "@/features/onboarding/queries"
import { getCurrentMember } from "@/lib/auth"
import { getGoogleReportingEmail, onboardingLinkUrl } from "@/lib/env.server"
import { findClientSection } from "@/lib/navigation"
import { requestOrigin } from "@/lib/origin"
import { can } from "@/lib/roles"

export const metadata: Metadata = { title: "Onboarding" }

type Props = PageProps<"/clients/[clientSlug]/onboarding">

export default function OnboardingPage({ params }: Props) {
  return (
    <div className="flex flex-col gap-10">
      <Suspense fallback={null}>
        <AccessGuard item={findClientSection("onboarding")!} />
      </Suspense>
      <Suspense fallback={<PageSkeleton />}>
        <Content params={params} />
      </Suspense>
    </div>
  )
}

async function Content({ params }: Pick<Props, "params">) {
  const [{ clientSlug }, member] = await Promise.all([params, getCurrentMember()])
  const client = await getClientBySlug(clientSlug)
  if (!client) notFound()

  const [overview, origin] = await Promise.all([getOnboardingOverview(client.id), requestOrigin()])
  const link = overview.link
  const linkUrl =
    link && link.status === "active" ? onboardingLinkUrl(origin, client.slug, link.token) : null

  return (
    <>
      <PageHeader
        eyebrow={client.name}
        title="Onboarding"
        description={`Send ${client.name} their onboarding link. They fill in their business details, connect Google and their social accounts, give reporting and website access and share logins. Everything is saved the moment they enter it.`}
      />
      <OnboardingView
        clientId={client.id}
        clientSlug={client.slug}
        clientName={client.name}
        overview={overview}
        linkUrl={linkUrl}
        nowIso={new Date().toISOString()}
        canManage={can(member.role, "onboarding.manage")}
        canReveal={can(member.role, "vault.reveal")}
        reportingEmailSet={Boolean(getGoogleReportingEmail())}
        senderName={member.displayName.split(" ")[0]}
      />
    </>
  )
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <Skeleton className="h-16 w-[420px] max-w-full" />
      <Skeleton className="h-[120px] w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-[320px] w-full rounded-lg" />
    </div>
  )
}
