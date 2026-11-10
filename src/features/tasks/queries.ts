import "server-only"

import { addDays, agencyToday, endOfWeek } from "@/lib/dates"
import { formatLocation } from "@/lib/format"
import { ilikePattern } from "@/lib/search"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { ClientHealth } from "@/features/clients/constants"
import type { TaskPriority, TaskRepeat, TaskStatus, TaskType } from "./constants"
import { TASKS_PAGE_SIZE, type TaskParams } from "./search-params"

const nameOf = (m: { full_name: string; email: string } | null) =>
  m ? m.full_name || m.email.split("@")[0] : null

export type TaskCounts = {
  mineOpen: number
  teamOpen: number
  waiting: number
  done: number
  overdue: number
  dueToday: number
  dueThisWeek: number
  myAttention: number
}

export async function getTaskCounts(mine: boolean): Promise<TaskCounts> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("task_counts", { p_mine: mine })
  if (error) throw new Error(`Could not load task counts: ${error.message}`)
  const row = data?.[0]
  return {
    mineOpen: row?.mine_open ?? 0,
    teamOpen: row?.team_open ?? 0,
    waiting: row?.waiting ?? 0,
    done: row?.done ?? 0,
    overdue: row?.overdue ?? 0,
    dueToday: row?.due_today ?? 0,
    dueThisWeek: row?.due_this_week ?? 0,
    myAttention: row?.my_attention ?? 0,
  }
}

export type TaskRow = {
  id: string
  number: number
  title: string
  type: TaskType
  status: TaskStatus
  priority: TaskPriority
  repeat: TaskRepeat
  dueOn: string | null
  completedAt: string | null
  assignee: { id: string; name: string } | null
  clientsTotal: number
  clientsDone: number
  clientPreview: string[]
}

/** One page of tasks for the current view and filters (RLS limits VAs to their own). */
export async function getTasksPage(
  params: TaskParams,
  memberId: string,
): Promise<{ rows: TaskRow[]; total: number }> {
  const supabase = await createSupabaseServerClient()
  const today = agencyToday()
  let query = supabase.from("task_list").select("*", { count: "exact" })

  if (params.view === "mine") query = query.eq("assignee_id", memberId).neq("status", "done")
  if (params.view === "team") query = query.neq("status", "done")
  if (params.view === "waiting") query = query.eq("status", "waiting_on_client")
  if (params.view === "done") query = query.eq("status", "done")

  if (params.q) {
    const number = params.q.match(/^(?:t-?)?(\d{1,9})$/i)
    if (number) {
      query = query.eq("number", Number(number[1]))
    } else {
      const pattern = ilikePattern(params.q)
      if (pattern) query = query.or(`title.ilike.${pattern},client_search.ilike.${pattern}`)
    }
  }
  if (params.assignee === "none") query = query.is("assignee_id", null)
  else if (params.assignee) query = query.eq("assignee_id", params.assignee)
  if (params.type) query = query.eq("type", params.type as TaskType)
  if (params.priority) query = query.eq("priority", params.priority as TaskPriority)
  if (params.due === "overdue") query = query.lt("due_on", today).neq("status", "done")
  if (params.due === "today") query = query.eq("due_on", today).neq("status", "done")
  if (params.due === "week") {
    query = query.gt("due_on", today).lte("due_on", endOfWeek(today)).neq("status", "done")
  }

  if (params.view === "done") {
    query = query.order("completed_at", { ascending: false, nullsFirst: false })
  } else {
    // Most urgent first: earliest due date (overdue first), then high priority.
    query = query
      .order("due_on", { ascending: true, nullsFirst: false })
      .order("priority", { ascending: false })
      .order("number", { ascending: true })
  }

  const from = (params.page - 1) * TASKS_PAGE_SIZE
  const { data, count, error } = await query.range(from, from + TASKS_PAGE_SIZE - 1)
  if (error) throw new Error(`Could not load tasks: ${error.message}`)

  return {
    total: count ?? 0,
    rows: (data ?? []).map((t) => ({
      id: t.id!,
      number: t.number!,
      title: t.title!,
      type: t.type!,
      status: t.status!,
      priority: t.priority!,
      repeat: t.repeat!,
      dueOn: t.due_on,
      completedAt: t.completed_at,
      assignee: t.assignee_id ? { id: t.assignee_id, name: t.assignee_name ?? "Unknown" } : null,
      clientsTotal: t.clients_total ?? 0,
      clientsDone: t.clients_done ?? 0,
      clientPreview: t.client_preview ?? [],
    })),
  }
}

export type TaskClient = {
  id: string
  slug: string
  name: string
  location: string
  health: ClientHealth
  doneAt: string | null
  doneBy: string | null
}

export type TaskComment = {
  id: string
  body: string
  createdAt: string
  authorId: string | null
  authorName: string | null
}

export type TaskHistoryEntry = {
  id: number
  action: string
  meta: Record<string, unknown>
  createdAt: string
  actorName: string | null
  clientName: string | null
}

export type TaskDetail = {
  id: string
  number: number
  title: string
  description: string | null
  steps: string[]
  type: TaskType
  status: TaskStatus
  priority: TaskPriority
  repeat: TaskRepeat
  dueOn: string | null
  completedAt: string | null
  createdAt: string
  assignee: { id: string; name: string } | null
  createdBy: string | null
  isRepeatCopy: boolean
  clients: TaskClient[]
  comments: TaskComment[]
  history: TaskHistoryEntry[]
}

/** Everything the task panel shows. Null if the task doesn't exist or isn't visible. */
export async function getTaskDetail(number: number): Promise<TaskDetail | null> {
  const supabase = await createSupabaseServerClient()
  const { data: t, error } = await supabase
    .from("tasks")
    .select(
      `id, number, title, description, steps, type, status, priority, repeat, due_on, completed_at, created_at, previous_task_id,
       assignee:team_members!tasks_assignee_id_fkey(id, full_name, email),
       creator:team_members!tasks_created_by_fkey(full_name, email),
       task_clients(done_at, done_by,
         client:clients(id, slug, name, city, region, country_code, health),
         doer:team_members!task_clients_done_by_fkey(full_name, email))`,
    )
    .eq("number", number)
    .maybeSingle()
  if (error) throw new Error(`Could not load the task: ${error.message}`)
  if (!t) return null

  const [{ data: comments }, { data: history }] = await Promise.all([
    supabase
      .from("task_comments")
      .select(
        "id, body, created_at, author_id, author:team_members!task_comments_author_id_fkey(full_name, email)",
      )
      .eq("task_id", t.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("activity_log")
      .select(
        "id, action, meta, created_at, actor:team_members!activity_log_actor_id_fkey(full_name, email), client:clients(name)",
      )
      .eq("task_id", t.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  const clients: TaskClient[] = (t.task_clients ?? [])
    .filter((tc) => tc.client)
    .map((tc) => ({
      id: tc.client!.id,
      slug: tc.client!.slug,
      name: tc.client!.name,
      location: formatLocation(tc.client!.city, tc.client!.region, tc.client!.country_code),
      health: tc.client!.health,
      doneAt: tc.done_at,
      doneBy: nameOf(tc.doer),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    id: t.id,
    number: t.number,
    title: t.title,
    description: t.description,
    steps: t.steps,
    type: t.type,
    status: t.status,
    priority: t.priority,
    repeat: t.repeat,
    dueOn: t.due_on,
    completedAt: t.completed_at,
    createdAt: t.created_at,
    assignee: t.assignee ? { id: t.assignee.id, name: nameOf(t.assignee)! } : null,
    createdBy: nameOf(t.creator),
    isRepeatCopy: Boolean(t.previous_task_id),
    clients,
    comments: (comments ?? []).map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.created_at,
      authorId: c.author_id,
      authorName: nameOf(c.author),
    })),
    history: (history ?? []).map((h) => ({
      id: h.id,
      action: h.action,
      meta: (h.meta ?? {}) as Record<string, unknown>,
      createdAt: h.created_at,
      actorName: nameOf(h.actor),
      clientName: h.client?.name ?? null,
    })),
  }
}

export type MemberOption = { id: string; name: string; role: string }

/** People tasks can be assigned to and mentioned (active, not read-only). */
export async function getAssignableMembers(): Promise<MemberOption[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("team_members")
    .select("id, full_name, email, role")
    .eq("status", "active")
    .neq("role", "viewer")
    .order("full_name")
  return (data ?? []).map((m) => ({ id: m.id, name: nameOf(m)!, role: m.role }))
}

export type ClientOption = {
  id: string
  name: string
  location: string
  country: string
  industry: string | null
  ownerId: string | null
  ownerName: string | null
  health: ClientHealth
}

/** Clients for the task client picker (managers see all). */
export async function getClientOptions(): Promise<ClientOption[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("clients")
    .select(
      "id, name, city, region, country_code, industry, health, owner_id, owner:team_members!clients_owner_id_fkey(full_name, email)",
    )
    .order("name")
    .limit(2000)
  if (error) throw new Error(`Could not load clients: ${error.message}`)
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    location: formatLocation(c.city, c.region, c.country_code),
    country: c.country_code,
    industry: c.industry,
    ownerId: c.owner_id,
    ownerName: nameOf(c.owner),
    health: c.health,
  }))
}

export type ClientTaskRow = TaskRow & { doneForClient: boolean }

/** Every task that includes one client, open ones first. */
export async function getTasksForClient(clientId: string): Promise<ClientTaskRow[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("task_clients")
    .select("done_at, task:task_list(*)")
    .eq("client_id", clientId)
  if (error) throw new Error(`Could not load the client's tasks: ${error.message}`)

  const today = agencyToday()
  return (data ?? [])
    .filter((r) => r.task?.id)
    .map((r) => {
      const t = r.task!
      return {
        id: t.id!,
        number: t.number!,
        title: t.title!,
        type: t.type!,
        status: t.status!,
        priority: t.priority!,
        repeat: t.repeat!,
        dueOn: t.due_on,
        completedAt: t.completed_at,
        assignee: t.assignee_id ? { id: t.assignee_id, name: t.assignee_name ?? "Unknown" } : null,
        clientsTotal: t.clients_total ?? 0,
        clientsDone: t.clients_done ?? 0,
        clientPreview: t.client_preview ?? [],
        doneForClient: Boolean(r.done_at),
      }
    })
    .sort((a, b) => {
      const aDone = a.status === "done" ? 1 : 0
      const bDone = b.status === "done" ? 1 : 0
      if (aDone !== bDone) return aDone - bDone
      return (a.dueOn ?? addDays(today, 3650)).localeCompare(b.dueOn ?? addDays(today, 3650))
    })
}

export type NotificationItem = {
  id: string
  kind: "task_assigned" | "task_mentioned" | "task_commented"
  readAt: string | null
  createdAt: string
  actorName: string | null
  task: { number: number; title: string; clients: number } | null
}

export async function getNotifications(limit = 20): Promise<NotificationItem[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, kind, read_at, created_at, actor:team_members!notifications_actor_id_fkey(full_name, email), task:tasks(number, title, task_clients(count))",
    )
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Could not load notifications: ${error.message}`)
  return (data ?? []).map((n) => ({
    id: n.id,
    kind: n.kind,
    readAt: n.read_at,
    createdAt: n.created_at,
    actorName: nameOf(n.actor),
    task: n.task
      ? {
          number: n.task.number,
          title: n.task.title,
          clients: n.task.task_clients?.[0]?.count ?? 0,
        }
      : null,
  }))
}
