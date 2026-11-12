import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { OnboardingWizard } from "@/features/onboarding/components/wizard/wizard"
import { getOnboarding } from "@/features/onboarding/public"
import { getAgencyAccessEmail, getGoogleReportingEmail, hasZernioApiKey } from "@/lib/env.server"
import { hasSupabaseSecretKey } from "@/lib/supabase/admin"
import { InactiveLink } from "@/features/onboarding/components/wizard/inactive-link"

type Props = PageProps<"/onboard/[link]">

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/** The client's onboarding wizard. The token in the link is checked in the database. */
export default function OnboardingPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<WizardSkeleton />}>
      <Wizard params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function Wizard({ params, searchParams }: Props) {
  const [{ link }, search] = await Promise.all([params, searchParams])
  const data = await getOnboarding(link)
  if (!data) return <InactiveLink />

  return (
    <OnboardingWizard
      data={data}
      reportingEmail={getGoogleReportingEmail()}
      agencyEmail={getAgencyAccessEmail()}
      connectReady={hasZernioApiKey() && hasSupabaseSecretKey()}
      search={{
        step: one(search.step),
        result: one(search.result),
        platform: one(search.platform),
        code: one(search.code)?.slice(0, 100),
      }}
    />
  )
}

function WizardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-10 w-full rounded-full" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}
