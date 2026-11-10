import "server-only"

import type { AppRole, MemberStatus } from "@/lib/roles"
import { createSupabaseAdminClient, hasSupabaseSecretKey } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export type TeamMemberRow = {
  id: string
  name: string
  email: string
  role: AppRole
  status: MemberStatus
  joinedAt: string
  lastSignInAt: string | null
  openTasks: number
  taskClients: number
}

/** Everyone on the team, with last sign-in (from auth) and task load. */
export async function getTeamMembersForAdmin(): Promise<TeamMemberRow[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("team_members")
    .select("id, full_name, email, role, status, created_at")
    .order("status")
    .order("full_name")
  if (error) throw new Error(`Could not load the team: ${error.message}`)

  const lastSignIn = new Map<string, string | null>()
  if (hasSupabaseSecretKey()) {
    const { data: users } = await createSupabaseAdminClient().auth.admin.listUsers({
      perPage: 1000,
    })
    for (const u of users?.users ?? []) lastSignIn.set(u.id, u.last_sign_in_at ?? null)
  }

  const load = await getTaskLoad()

  return (data ?? []).map((m) => ({
    id: m.id,
    name: m.full_name || m.email.split("@")[0],
    email: m.email,
    role: m.role,
    status: m.status,
    joinedAt: m.created_at,
    lastSignInAt: lastSignIn.get(m.id) ?? null,
    openTasks: load.get(m.id)?.openTasks ?? 0,
    taskClients: load.get(m.id)?.clients ?? 0,
  }))
}

/** Open tasks and distinct clients (the clients they can see) per assignee. */
async function getTaskLoad(): Promise<Map<string, { openTasks: number; clients: number }>> {
  const supabase = await createSupabaseServerClient()
  const [{ data: tasks }, { data: taskClients }] = await Promise.all([
    supabase
      .from("tasks")
      .select("assignee_id")
      .neq("status", "done")
      .not("assignee_id", "is", null),
    supabase.from("task_clients").select("client_id, task:tasks!inner(assignee_id)"),
  ])

  const load = new Map<string, { openTasks: number; clients: Set<string> }>()
  const entry = (id: string) => {
    let e = load.get(id)
    if (!e) load.set(id, (e = { openTasks: 0, clients: new Set() }))
    return e
  }
  for (const t of tasks ?? []) if (t.assignee_id) entry(t.assignee_id).openTasks++
  for (const tc of taskClients ?? []) {
    if (tc.task?.assignee_id) entry(tc.task.assignee_id).clients.add(tc.client_id)
  }
  return new Map(
    [...load].map(([id, e]) => [id, { openTasks: e.openTasks, clients: e.clients.size }]),
  )
}

export type ActivityEntry = {
  id: number
  action: string
  meta: Record<string, unknown>
  createdAt: string
  actorName: string | null
  clientName: string | null
}

export async function getRecentActivity(limit = 25): Promise<ActivityEntry[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("activity_log")
    .select(
      "id, action, meta, created_at, actor:team_members!activity_log_actor_id_fkey(full_name, email), client:clients(name)",
    )
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Could not load activity: ${error.message}`)

  return (data ?? []).map((a) => ({
    id: a.id,
    action: a.action,
    meta: (a.meta ?? {}) as Record<string, unknown>,
    createdAt: a.created_at,
    actorName: a.actor ? a.actor.full_name || a.actor.email.split("@")[0] : null,
    clientName: a.client?.name ?? null,
  }))
}
