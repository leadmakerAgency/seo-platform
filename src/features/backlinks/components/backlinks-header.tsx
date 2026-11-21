import type { ReactNode } from "react"

import { PageHeader } from "@/components/layout/page-header"

/** The one Backlinks page header, shared by every tab; each tab passes its own description and buttons. */
export function BacklinksHeader({
  clientName,
  description,
  actions,
}: {
  clientName: string
  description: string
  actions?: ReactNode
}) {
  return <PageHeader eyebrow={clientName} title="Backlinks" description={description} actions={actions} />
}
