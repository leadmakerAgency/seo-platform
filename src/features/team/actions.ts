"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"

import { PermissionError, requirePermission, type CurrentMember } from "@/lib/auth"
import { homeHref } from "@/lib/navigation"
import { requestOrigin } from "@/lib/origin"
import type { AppRole } from "@/lib/roles"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  changeRoleSchema,
  inviteMemberSchema,
  memberIdSchema,
  welcomeSchema,
  type InviteMemberInput,
  type TeamActionResult,
  type WelcomeFormState,
} from "./schemas"

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {}
  for (const issue of issues) out[String(issue.path[0] ?? "form")] ??= issue.message
  return out
}

/** Admin-only guard that turns a missing permission or key into a readable error. */
async function asAdmin(): Promise<{ member: CurrentMember } | { error: string }> {
  try {
    const member = await requirePermission("team.manage")
    if (!hasSupabaseSecretKey()) {
      return {
        error: "Team management needs SUPABASE_SECRET_KEY on the server. See docs/deploy.md.",
      }
    }
    return { member }
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message }
    throw error
  }
}

/** Turns database errors (like the last-admin rule) into a message for the user. */
function dbMessage(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? ""
  if (message.includes("at least one active admin") || message.includes("your own role")) {
    return message
  }
  return fallback
}

async function logActivity(member: CurrentMember, action: string, meta: Record<string, unknown>) {
  const supabase = await createSupabaseServerClient()
  await supabase.from("activity_log").insert({ actor_id: member.id, action, meta: meta as never })
}

/** Builds a one-time sign-in link that lands on /welcome. */
async function buildInviteLink(email: string, kind: "invite" | "magiclink", fullName?: string) {
  const admin = createSupabaseAdminClient()
  const origin = await requestOrigin()
  const { data, error } = await admin.auth.admin.generateLink({
    type: kind,
    email,
    options: {
      redirectTo: `${origin}/welcome`,
      ...(kind === "invite" && fullName ? { data: { full_name: fullName } } : {}),
    },
  })
  if (error || !data.properties?.hashed_token) return { error, link: null, userId: null }
  const link = `${origin}/auth/confirm?token_hash=${data.properties.hashed_token}&type=${data.properties.verification_type}&next=/welcome`
  return { error: null, link, userId: data.user.id }
}

export async function inviteMember(
  input: InviteMemberInput,
): Promise<TeamActionResult<{ link: string; email: string }>> {
  const guard = await asAdmin()
  if ("error" in guard) return { ok: false, error: guard.error }

  const parsed = inviteMemberSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    }
  }
  const { fullName, email, role } = parsed.data

  const { error, link, userId } = await buildInviteLink(email, "invite", fullName)
  if (error || !link || !userId) {
    const exists = error?.message?.toLowerCase().includes("already")
    return {
      ok: false,
      error: exists
        ? "Someone with this email already has an account. Find them in the list below."
        : "Couldn't create the invite. Try again.",
      fieldErrors: exists ? { email: "This email already has an account." } : undefined,
    }
  }

  // The sign-up trigger created an invited viewer; set the chosen role and name.
  const admin = createSupabaseAdminClient()
  await admin
    .from("team_members")
    .update({ role: role as AppRole, full_name: fullName, status: "invited" })
    .eq("id", userId)

  await logActivity(guard.member, "team.invited", { email, role, name: fullName })
  refresh()
  return { ok: true, data: { link, email } }
}

/** A fresh sign-in link for someone who hasn't finished setting up. */
export async function newInviteLink(memberId: string): Promise<TeamActionResult<{ link: string }>> {
  const guard = await asAdmin()
  if ("error" in guard) return { ok: false, error: guard.error }
  if (!memberIdSchema.safeParse(memberId).success) return { ok: false, error: "Unknown member." }

  const admin = createSupabaseAdminClient()
  const { data: member } = await admin
    .from("team_members")
    .select("email, status")
    .eq("id", memberId)
    .maybeSingle()
  if (!member) return { ok: false, error: "Unknown member." }
  if (member.status !== "invited")
    return { ok: false, error: "They've already set up their account." }

  const { link } = await buildInviteLink(member.email, "magiclink")
  if (!link) return { ok: false, error: "Couldn't create a new link. Try again." }
  return { ok: true, data: { link } }
}

export async function changeRole(memberId: string, role: AppRole): Promise<TeamActionResult> {
  const guard = await asAdmin()
  if ("error" in guard) return { ok: false, error: guard.error }
  const parsed = changeRoleSchema.safeParse({ memberId, role })
  if (!parsed.success) return { ok: false, error: "Choose a valid role." }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("team_members")
    .update({ role: parsed.data.role as AppRole })
    .eq("id", memberId)
    .select("email")
    .maybeSingle()
  if (error || !data) return { ok: false, error: dbMessage(error, "Couldn't change the role.") }

  await logActivity(guard.member, "team.role_changed", { email: data.email, role })
  refresh()
  return { ok: true }
}

export async function setMemberAccess(
  memberId: string,
  access: "active" | "disabled",
): Promise<TeamActionResult> {
  const guard = await asAdmin()
  if ("error" in guard) return { ok: false, error: guard.error }
  if (!memberIdSchema.safeParse(memberId).success) return { ok: false, error: "Unknown member." }

  const supabase = await createSupabaseServerClient()
  const { data: current } = await supabase
    .from("team_members")
    .select("status")
    .eq("id", memberId)
    .maybeSingle()
  if (!current) return { ok: false, error: "Unknown member." }
  if (access === "active" && current.status === "invited") {
    return { ok: false, error: "They're still invited. Send them a new invite link instead." }
  }

  const { data, error } = await supabase
    .from("team_members")
    .update({ status: access })
    .eq("id", memberId)
    .select("email")
    .maybeSingle()
  if (error || !data) return { ok: false, error: dbMessage(error, "Couldn't change their access.") }

  await logActivity(guard.member, access === "active" ? "team.enabled" : "team.disabled", {
    email: data.email,
  })
  refresh()
  return { ok: true }
}

export async function removeMember(memberId: string): Promise<TeamActionResult> {
  const guard = await asAdmin()
  if ("error" in guard) return { ok: false, error: guard.error }
  if (!memberIdSchema.safeParse(memberId).success) return { ok: false, error: "Unknown member." }
  if (memberId === guard.member.id) return { ok: false, error: "You can't remove yourself." }

  const admin = createSupabaseAdminClient()
  const { data: member } = await admin
    .from("team_members")
    .select("email, role, status")
    .eq("id", memberId)
    .maybeSingle()
  if (!member) return { ok: false, error: "Unknown member." }

  // Deleting the auth user cascades to team_members (the last-admin rule still applies).
  const { error } = await admin.auth.admin.deleteUser(memberId)
  if (error) return { ok: false, error: dbMessage(error, "Couldn't remove them. Try again.") }

  await logActivity(guard.member, "team.removed", { email: member.email, role: member.role })
  refresh()
  return { ok: true }
}

/** /welcome: an invited member sets their name and password, then becomes active. */
export async function acceptInvite(
  _prev: WelcomeFormState,
  formData: FormData,
): Promise<WelcomeFormState> {
  const values = { fullName: String(formData.get("fullName") ?? "").slice(0, 200) }
  const parsed = welcomeSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { values, fieldErrors: fieldErrors(parsed.error.issues) }

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect("/login")

  const { data: member } = await supabase
    .from("team_members")
    .select("role, status")
    .eq("id", userId)
    .maybeSingle()
  if (!member) redirect("/no-access")
  if (member.status === "active") redirect(homeHref(member.role))
  if (member.status !== "invited") redirect("/no-access")

  const { error: passwordError } = await supabase.auth.updateUser({
    password: parsed.data.password,
    data: { full_name: parsed.data.fullName },
  })
  if (passwordError) {
    return {
      values,
      error: passwordError.message.toLowerCase().includes("weak")
        ? "Choose a stronger password."
        : "Couldn't save your password. Try again.",
    }
  }

  if (!hasSupabaseSecretKey()) {
    return { values, error: "Account setup isn't configured on the server yet. Tell your admin." }
  }
  // Activation needs the service role: invited members can't change their own row.
  const admin = createSupabaseAdminClient()
  const { error } = await admin
    .from("team_members")
    .update({ status: "active", full_name: parsed.data.fullName })
    .eq("id", userId)
    .eq("status", "invited")
  if (error) return { values, error: "Couldn't finish setting up your account. Try again." }

  await supabase.from("activity_log").insert({ actor_id: userId, action: "team.joined", meta: {} })
  redirect(homeHref(member.role))
}
