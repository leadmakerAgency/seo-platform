import { ComingSoonPage } from "@/components/layout/coming-soon-page"
import { findClientSection } from "@/lib/navigation"

export default function ClientOverviewPage() {
  return <ComingSoonPage item={findClientSection("")!} />
}
