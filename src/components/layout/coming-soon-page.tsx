import { Suspense } from "react"

import type { NavItem } from "@/lib/navigation"
import { AccessGuard } from "./access-guard"
import { ComingSoon } from "./coming-soon"

/** A full "Coming soon" page with the role check, for pages not built yet. */
export function ComingSoonPage({ item }: { item: NavItem }) {
  return (
    <>
      <Suspense fallback={null}>
        <AccessGuard item={item} />
      </Suspense>
      <ComingSoon item={item} />
    </>
  )
}
