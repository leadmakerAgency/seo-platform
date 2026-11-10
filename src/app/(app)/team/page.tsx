import { KeyRound } from "lucide-react"
import type { Metadata } from "next"
import { Suspense } from "react"

import { AccessGuard } from "@/components/layout/access-guard"
import { PageHeader, Section } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { ActivityFeed } from "@/features/team/components/activity-feed"
import { InviteMemberDialog } from "@/features/team/components/invite-member-dialog"
import { RoleMatrix } from "@/features/team/components/role-matrix"
import { TeamMembersTable } from "@/features/team/components/team-members-table"
import { getRecentActivity, getTeamMembersForAdmin } from "@/features/team/queries"
import { getCurrentMember } from "@/lib/auth"
import { findAgencyItem } from "@/lib/navigation"
import { hasSupabaseSecretKey } from "@/lib/supabase/admin"

export const metadata: Metadata = { title: "Team" }

export default function TeamPage() {
  return (
    <div className="flex flex-col gap-10">
      <Suspense fallback={null}>
        <AccessGuard item={findAgencyItem("team")!} />
      </Suspense>

      <PageHeader
        title="Team"
        description="Who can sign in and what each person can do. Each person has one role, and the role decides what they see and change."
        actions={
          <Suspense fallback={<Skeleton className="h-9 w-[140px]" />}>
            <HeaderActions />
          </Suspense>
        }
      />

      <Suspense fallback={null}>
        <SecretKeyNotice />
      </Suspense>

      <Section
        title="Team members"
        description="Change a role from the dropdown. You can't change your own."
      >
        <Suspense fallback={<Skeleton className="h-[220px] w-full rounded-lg" />}>
          <Members />
        </Suspense>
      </Section>

      <Section title="What each role can do" description="Taken straight from the app's rules.">
        <RoleMatrix />
      </Section>

      <Section title="Activity log" description="The latest changes across the team and clients.">
        <Suspense fallback={<Skeleton className="h-[200px] w-full rounded-lg" />}>
          <Activity />
        </Suspense>
      </Section>
    </div>
  )
}

async function HeaderActions() {
  await getCurrentMember()
  return hasSupabaseSecretKey() ? <InviteMemberDialog /> : null
}

async function SecretKeyNotice() {
  await getCurrentMember()
  if (hasSupabaseSecretKey()) return null
  return (
    <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm">
      <KeyRound className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <p>
        <span className="font-medium">Inviting and removing people needs one more setting.</span>{" "}
        <span className="text-muted-foreground">
          Add <code className="font-mono text-xs">SUPABASE_SECRET_KEY</code> (Supabase → Project
          Settings → API keys) to the server&apos;s environment. See docs/deploy.md.
        </span>
      </p>
    </div>
  )
}

async function Members() {
  const [member, members] = await Promise.all([getCurrentMember(), getTeamMembersForAdmin()])
  return <TeamMembersTable members={members} currentMemberId={member.id} />
}

async function Activity() {
  const entries = await getRecentActivity(25)
  return <ActivityFeed entries={entries} now={new Date()} />
}
