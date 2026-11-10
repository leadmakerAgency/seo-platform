import type { Metadata } from "next"

import { ComingSoonPage } from "@/components/layout/coming-soon-page"
import { findAgencyItem } from "@/lib/navigation"

export const metadata: Metadata = { title: "Team" }

export default function TeamPage() {
  return <ComingSoonPage item={findAgencyItem("team")!} />
}
