import { redirect } from "next/navigation"
import { Suspense } from "react"

import { clientHref } from "@/lib/navigation"

type Props = PageProps<"/clients/[clientSlug]/backlinks/strategy">

/** The brief now lives in the backlink setup sheet on the Backlinks page (12-shared-setup.md). */
export default function BacklinkStrategyPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <Redirect params={params} />
    </Suspense>
  )
}

async function Redirect({ params }: Pick<Props, "params">): Promise<null> {
  const { clientSlug } = await params
  redirect(`${clientHref(clientSlug, "backlinks")}?setup=brief`)
}
