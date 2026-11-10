import { redirect } from "next/navigation"

import { getCurrentMember } from "@/lib/auth"
import { canAccess, homeHref, type NavItem } from "@/lib/navigation"

/**
 * Sends users whose role can't open this page to their home page.
 * Reads the session, so render it inside <Suspense>. Renders nothing.
 */
export async function AccessGuard({ item }: { item: NavItem }) {
  const member = await getCurrentMember()
  if (!canAccess(item, member.role)) redirect(homeHref(member.role))
  return null
}
