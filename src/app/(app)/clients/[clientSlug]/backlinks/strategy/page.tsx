import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { AccessGuard } from "@/components/layout/access-guard"
import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { defaultSiteTypes, snapshotOf, type Brief } from "@/features/backlinks/brief"
import { StrategyForm } from "@/features/backlinks/components/strategy-form"
import { guessBuyer } from "@/features/backlinks/topic-ideas"
import { getClientBySlug } from "@/features/clients/queries"
import { getCurrentMember } from "@/lib/auth"
import { clientHref, findClientSection } from "@/lib/navigation"
import { can } from "@/lib/roles"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Backlink strategy" }

type Props = PageProps<"/clients/[clientSlug]/backlinks/strategy">

export default function BacklinkStrategyPage({ params }: Props) {
  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={null}>
        <AccessGuard item={findClientSection("backlinks")!} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-[600px] w-full rounded-lg" />}>
        <Content params={params} />
      </Suspense>
    </div>
  )
}

async function Content({ params }: Pick<Props, "params">) {
  const [{ clientSlug }, member] = await Promise.all([params, getCurrentMember()])
  const client = await getClientBySlug(clientSlug)
  if (!client) notFound()

  const supabase = await createSupabaseServerClient()
  const [{ data: briefRow }, { data: profile }, { data: details }] = await Promise.all([
    supabase.from("backlink_briefs").select("*").eq("client_id", client.id).maybeSingle(),
    supabase
      .from("client_business_profiles")
      .select("services, primary_category, other_categories")
      .eq("client_id", client.id)
      .maybeSingle(),
    supabase.from("clients").select("industry").eq("id", client.id).maybeSingle(),
  ])
  const saved = snapshotOf(briefRow)
  const ideasText = [
    ...(profile?.services ?? []),
    profile?.primary_category ?? "",
    ...(profile?.other_categories ?? []),
    details?.industry ?? "",
  ].join(" ")

  // A first draft from what we know: services as core topics, a guessed buyer, local reach.
  const buyer = guessBuyer(ideasText)
  const initial: Brief = saved ?? {
    reach: ["local"],
    buyer,
    offering: ["services"],
    audience: "",
    core_topics: [...new Set((profile?.services ?? []).map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 2 && s.length <= 60 && !/[:{}"]/.test(s)))].slice(0, 5),
    adjacent_topics: [],
    trusted_sites: [],
    exclude_terms: ["jobs", "careers", "salary", "free download", "course"],
    site_types: defaultSiteTypes({ reach: ["local"], buyer, offering: ["services"] }),
    notes: "",
  }
  const canEdit = can(member.role, "backlinks.strategy")

  return (
    <>
      <PageHeader
        eyebrow={client.name}
        title="Backlink strategy"
        description={
          saved
            ? `Version ${saved.version}. Find places builds its searches from this brief and the places on the Backlinks page; the top 30 are picked against it.`
            : "Describe how this client should be found. Find places builds its searches from this brief and the places you add, and picks the top 30 against it."
        }
      />
      <StrategyForm
        clientId={client.id}
        backHref={clientHref(client.slug, "backlinks")}
        initial={initial}
        isNew={!saved}
        ideasText={ideasText}
        canEdit={canEdit}
      />
    </>
  )
}
