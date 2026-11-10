import { notFound } from "next/navigation"
import { Suspense } from "react"

import { SetCurrentClient } from "@/components/layout/shell-context"
import { getClientBySlug } from "@/features/clients/queries"

/** Loads the client once and tells the shell which client is open. */
export default function ClientLayout({ children, params }: LayoutProps<"/clients/[clientSlug]">) {
  return (
    <>
      <Suspense fallback={null}>
        <CurrentClient params={params} />
      </Suspense>
      {children}
    </>
  )
}

async function CurrentClient({ params }: { params: Promise<{ clientSlug: string }> }) {
  const { clientSlug } = await params
  const client = await getClientBySlug(clientSlug)
  if (!client) notFound()
  return (
    <SetCurrentClient
      client={{
        id: client.id,
        slug: client.slug,
        name: client.name,
        location: client.location,
        health: client.health,
      }}
    />
  )
}
