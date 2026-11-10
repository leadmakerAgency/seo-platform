import "server-only"

import { redirect } from "next/navigation"
import { cache } from "react"

import { initials } from "@/lib/format"
import { can, type AppRole, type Permission } from "@/lib/roles"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export type CurrentMember = {
  id: string
  email: string
  fullName: string
  displayName: string
  initials: string
  role: AppRole
}

/**
 * The signed-in team member, read once per request (Data Access Layer).
 * Redirects to /login without a session, to /welcome for invited members who
 * haven't set a password yet, and to /no-access for disabled accounts. Reads cookies: call it inside <Suspense>.
 */
export const getCurrentMember = cache(async (): Promise<CurrentMember> => {
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect("/login")

  const { data: member } = await supabase
    .from("team_members")
    .select("id, email, full_name, role, status")
    .eq("id", userId)
    .maybeSingle()

  // Invited people finish setting up their account first; disabled ones are out.
  if (member?.status === "invited") redirect("/welcome")
  if (!member || member.status !== "active") redirect("/no-access")

  const displayName = member.full_name || member.email.split("@")[0]
  return {
    id: member.id,
    email: member.email,
    fullName: member.full_name,
    displayName,
    initials: initials(member.full_name || member.email),
    role: member.role,
  }
})

export class PermissionError extends Error {
  constructor(permission: Permission) {
    super(`You don't have permission to do this (${permission}).`)
    this.name = "PermissionError"
  }
}

/** Use at the top of every Server Action that changes data. */
export async function requirePermission(permission: Permission): Promise<CurrentMember> {
  const member = await getCurrentMember()
  if (!can(member.role, permission)) throw new PermissionError(permission)
  return member
}
