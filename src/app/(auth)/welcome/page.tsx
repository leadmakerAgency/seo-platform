import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { WelcomeForm } from "@/features/team/components/welcome-form"
import { homeHref } from "@/lib/navigation"
import { ROLE_LABELS } from "@/lib/roles"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Welcome" }

/** Where an invite link lands: the new member sets their name and password. */
export default function WelcomePage() {
  return (
    <Suspense fallback={<Skeleton className="h-[420px] w-full" />}>
      <Welcome />
    </Suspense>
  )
}

async function Welcome() {
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect("/login?error=link")

  const { data: member } = await supabase
    .from("team_members")
    .select("email, full_name, role, status")
    .eq("id", userId)
    .maybeSingle()
  if (!member) redirect("/no-access")
  if (member.status === "active") redirect(homeHref(member.role))
  if (member.status !== "invited") redirect("/no-access")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Welcome to LeadMaker</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;ve been added as {ROLE_LABELS[member.role]}. Set a password to finish.
        </p>
      </div>
      <WelcomeForm email={member.email} defaultName={member.full_name} />
    </div>
  )
}
