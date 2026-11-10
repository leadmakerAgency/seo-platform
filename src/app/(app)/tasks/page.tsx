import type { Metadata } from "next"

import { ComingSoonPage } from "@/components/layout/coming-soon-page"
import { findAgencyItem } from "@/lib/navigation"

export const metadata: Metadata = { title: "Tasks" }

export default function TasksPage() {
  return <ComingSoonPage item={findAgencyItem("tasks")!} />
}
