import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { StatStripSkeleton } from "@/components/common/stat-strip"
import { AccessGuard } from "@/components/layout/access-guard"
import { Skeleton } from "@/components/ui/skeleton"
import { AiSearchTab } from "@/features/backlinks/ai-search/components/ai-search-tab"
import { BacklinksHeader } from "@/features/backlinks/components/backlinks-header"
import { isMode, MODE_META, ModeTabs, type Mode } from "@/features/backlinks/components/mode-tabs"
import { SetupBar, SetupGate } from "@/features/backlinks/components/setup-panels"
import { SetupSheet } from "@/features/backlinks/components/setup-sheet"
import { StandardSearch } from "@/features/backlinks/components/standard-search"
import { ManualSearch } from "@/features/backlinks/manual/components/manual-search"
import { getBacklinkSetup } from "@/features/backlinks/setup"
import { getClientBySlug } from "@/features/clients/queries"
import { getCurrentMember } from "@/lib/auth"
import { clientHref, findClientSection } from "@/lib/navigation"

export const metadata: Metadata = { title: "Backlinks" }

type Props = PageProps<"/clients/[clientSlug]/backlinks">

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default function BacklinksPage({ params, searchParams }: Props) {
  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={null}>
        <AccessGuard item={findClientSection("backlinks")!} />
      </Suspense>
      <Suspense fallback={<PageSkeleton />}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

/**
 * The Backlinks page frame (docs/plans/backlinks/12-shared-setup.md): one header, the shared
 * backlink setup (strategy brief + places) and the three tabs. Every tab reads the setup; until it
 * is complete the tabs are locked and no tab data is loaded.
 */
async function Content({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ clientSlug }, search, member] = await Promise.all([params, searchParams, getCurrentMember()])
  const client = await getClientBySlug(clientSlug)
  if (!client) notFound()

  const rawMode = one(search.mode)
  const mode: Mode = isMode(rawMode) ? rawMode : "standard"
  const base = clientHref(client.slug, "backlinks")
  const setup = await getBacklinkSetup(client, member.role)
  const nowIso = new Date().toISOString()

  const sheet = (
    <SetupSheet
      clientId={client.id}
      clientName={client.name}
      nowIso={nowIso}
      data={{
        brief: setup.brief,
        draft: setup.draft,
        ideasText: setup.ideasText,
        targets: setup.targets,
        suggestions: setup.suggestions,
        missing: setup.missing,
        canEditBrief: setup.canEditBrief,
        canEditPlaces: setup.canEditPlaces,
        defaultCountry: setup.defaultCountry,
      }}
    />
  )

  if (!setup.complete) {
    return (
      <>
        <BacklinksHeader clientName={client.name} description="Set up how this client should be found, then pick a way to find backlinks" />
        <SetupGate setup={setup} clientName={client.name} />
        <ModeTabs base={base} mode={mode} locked />
        {sheet}
      </>
    )
  }

  const chrome = (
    <>
      <SetupBar setup={setup} />
      <ModeTabs base={base} mode={mode} />
      {sheet}
    </>
  )

  if (mode === "ai") {
    return <AiSearchTab client={client} member={member} base={base} setup={setup} chrome={chrome} />
  }
  if (mode === "manual") {
    return (
      <ManualSearch
        client={{ id: client.id, slug: client.slug, name: client.name }}
        member={{ id: member.id, role: member.role }}
        search={search}
        setup={setup}
        chrome={chrome}
        description={MODE_META.manual.caption}
      />
    )
  }
  return (
    <StandardSearch
      client={{ id: client.id, name: client.name, stage: client.stage }}
      member={{ role: member.role }}
      search={search}
      setup={setup}
      base={base}
      chrome={chrome}
    />
  )
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-16 w-[420px] max-w-full" />
      <Skeleton className="h-16 w-full rounded-lg" />
      <StatStripSkeleton count={4} />
      <Skeleton className="h-[420px] w-full rounded-lg" />
    </div>
  )
}
