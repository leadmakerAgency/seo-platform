import "server-only"

import { agencyToday } from "@/lib/dates"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { TaskStatus } from "@/features/tasks/constants"
import {
  parseOptions,
  type RequestDecision,
  type RequestKind,
  type RequestOptions,
  type RequestStatus,
} from "./constants"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

const nameOf = (m: { full_name: string; email: string } | null) =>
  m ? m.full_name || m.email.split("@")[0] : null

const SIGNED_URL_SECONDS = 600

export type RequestRow = {
  id: string
  number: number
  kind: RequestKind
  status: RequestStatus
  title: string
  dueOn: string | null
  createdAt: string
  updatedAt: string
  respondedAt: string | null
  reopenCount: number
  fileCount: number
  client: { id: string; slug: string; name: string }
  task: { number: number; title: string } | null
  owner: { id: string; name: string } | null
}

const ROW_SELECT = `id, number, kind, status, title, due_on, created_at, updated_at, responded_at, reopen_count,
  client:clients(id, slug, name),
  task:tasks(number, title),
  owner:team_members!client_requests_owner_id_fkey(id, full_name, email),
  client_request_files(count)`

type RawRow = {
  id: string
  number: number
  kind: RequestKind
  status: RequestStatus
  title: string
  due_on: string | null
  created_at: string
  updated_at: string
  responded_at: string | null
  reopen_count: number
  client: { id: string; slug: string; name: string } | null
  task: { number: number; title: string } | null
  owner: { id: string; full_name: string; email: string } | null
  client_request_files: { count: number }[] | null
}

function toRow(r: RawRow): RequestRow {
  return {
    id: r.id,
    number: r.number,
    kind: r.kind,
    status: r.status,
    title: r.title,
    dueOn: r.due_on,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    respondedAt: r.responded_at,
    reopenCount: r.reopen_count,
    fileCount: r.client_request_files?.[0]?.count ?? 0,
    client: r.client ?? { id: "", slug: "", name: "Unknown client" },
    task: r.task,
    owner: r.owner ? { id: r.owner.id, name: nameOf(r.owner)! } : null,
  }
}

/** Every request for one client (newest first). RLS hides clients you can't see. */
export async function getRequestsForClient(clientId: string): Promise<RequestRow[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("client_requests")
    .select(ROW_SELECT)
    .eq("client_id", clientId)
    .order("number", { ascending: false })
    .limit(500)
  if (error) throw new Error(`Could not load the client's requests: ${error.message}`)
  return (data as unknown as RawRow[]).map(toRow)
}

/** Every Open or Answered request across clients: the morning chase list. */
export async function getActiveRequests(): Promise<RequestRow[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("client_requests")
    .select(ROW_SELECT)
    .in("status", ["open", "answered"])
    .order("due_on", { ascending: true, nullsFirst: false })
    .order("number", { ascending: true })
    .limit(1000)
  if (error) throw new Error(`Could not load client requests: ${error.message}`)
  return (data as unknown as RawRow[]).map(toRow)
}

export async function countActiveRequests(): Promise<{ open: number; answered: number }> {
  const supabase = await createSupabaseServerClient()
  const [open, answered] = await Promise.all([
    supabase
      .from("client_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("client_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "answered"),
  ])
  return { open: open.count ?? 0, answered: answered.count ?? 0 }
}

export type RequestFile = {
  id: string
  name: string
  mimeType: string | null
  size: number | null
  createdAt: string
  isImage: boolean
  url: string | null
  downloadUrl: string | null
}

type RawFile = {
  id: string
  storage_path: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

/** Short-lived signed links (10 minutes) for the team to view and download uploads. */
async function signFiles(supabase: Supabase, files: RawFile[]): Promise<RequestFile[]> {
  if (files.length === 0) return []
  const { data } = await supabase.storage.from("client-uploads").createSignedUrls(
    files.map((f) => f.storage_path),
    SIGNED_URL_SECONDS,
  )
  const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]))
  return files
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((f) => {
      const url = byPath.get(f.storage_path) ?? null
      return {
        id: f.id,
        name: f.file_name,
        mimeType: f.mime_type,
        size: f.size_bytes,
        createdAt: f.created_at,
        isImage: Boolean(f.mime_type?.startsWith("image/")) && !/hei[cf]/.test(f.mime_type ?? ""),
        url,
        downloadUrl: url ? `${url}&download=${encodeURIComponent(f.file_name)}` : null,
      }
    })
}

export type RequestHistoryEntry = {
  id: number
  action: string
  meta: Record<string, unknown>
  createdAt: string
  actorName: string | null
}

export type RequestDetail = {
  id: string
  number: number
  kind: RequestKind
  status: RequestStatus
  title: string
  instructions: string | null
  internalNote: string | null
  options: RequestOptions
  autoComplete: boolean
  dueOn: string | null
  createdAt: string
  createdById: string | null
  createdBy: string | null
  owner: { id: string; name: string } | null
  responseText: string | null
  decision: RequestDecision | null
  respondedAt: string | null
  responderName: string | null
  askAgainNote: string | null
  reopenCount: number
  completedAt: string | null
  completedBy: string | null
  client: { id: string; slug: string; name: string }
  task: {
    id: string
    number: number
    title: string
    status: TaskStatus
    assigneeId: string | null
  } | null
  files: RequestFile[]
  history: RequestHistoryEntry[]
}

/** Everything the request panel shows. Null if it doesn't exist or isn't visible. */
export async function getRequestDetail(number: number): Promise<RequestDetail | null> {
  const supabase = await createSupabaseServerClient()
  const { data: r, error } = await supabase
    .from("client_requests")
    .select(
      `id, number, kind, status, title, instructions, internal_note, options, auto_complete, due_on, created_at,
       created_by, response_text, decision, responded_at, responder_name, ask_again_note, reopen_count, completed_at,
       client:clients(id, slug, name),
       task:tasks(id, number, title, status, assignee_id),
       owner:team_members!client_requests_owner_id_fkey(id, full_name, email),
       creator:team_members!client_requests_created_by_fkey(full_name, email),
       completer:team_members!client_requests_completed_by_fkey(full_name, email),
       client_request_files(id, storage_path, file_name, mime_type, size_bytes, created_at)`,
    )
    .eq("number", number)
    .maybeSingle()
  if (error) throw new Error(`Could not load the request: ${error.message}`)
  if (!r || !r.client) return null

  const [files, { data: history }] = await Promise.all([
    signFiles(supabase, r.client_request_files ?? []),
    supabase
      .from("activity_log")
      .select(
        "id, action, meta, created_at, actor:team_members!activity_log_actor_id_fkey(full_name, email)",
      )
      .eq("request_id", r.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  return {
    id: r.id,
    number: r.number,
    kind: r.kind,
    status: r.status,
    title: r.title,
    instructions: r.instructions,
    internalNote: r.internal_note,
    options: parseOptions(r.options),
    autoComplete: r.auto_complete,
    dueOn: r.due_on,
    createdAt: r.created_at,
    createdById: r.created_by,
    createdBy: nameOf(r.creator),
    owner: r.owner ? { id: r.owner.id, name: nameOf(r.owner)! } : null,
    responseText: r.response_text,
    decision: r.decision,
    respondedAt: r.responded_at,
    responderName: r.responder_name,
    askAgainNote: r.ask_again_note,
    reopenCount: r.reopen_count,
    completedAt: r.completed_at,
    completedBy: nameOf(r.completer),
    client: r.client,
    task: r.task
      ? {
          id: r.task.id,
          number: r.task.number,
          title: r.task.title,
          status: r.task.status,
          assigneeId: r.task.assignee_id,
        }
      : null,
    files,
    history: (history ?? []).map((h) => ({
      id: h.id,
      action: h.action,
      meta: (h.meta ?? {}) as Record<string, unknown>,
      createdAt: h.created_at,
      actorName: nameOf(h.actor),
    })),
  }
}

export type TaskRequest = {
  id: string
  number: number
  kind: RequestKind
  status: RequestStatus
  title: string
  dueOn: string | null
  client: { id: string; slug: string; name: string }
  responseText: string | null
  decision: RequestDecision | null
  respondedAt: string | null
  responderName: string | null
  files: RequestFile[]
}

/** The requests linked to one task, for the "Waiting on the client" block. */
export async function getRequestsForTask(taskId: string): Promise<TaskRequest[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("client_requests")
    .select(
      `id, number, kind, status, title, due_on, response_text, decision, responded_at, responder_name,
       client:clients(id, slug, name),
       client_request_files(id, storage_path, file_name, mime_type, size_bytes, created_at)`,
    )
    .eq("task_id", taskId)
    .neq("status", "cancelled")
    .order("number", { ascending: true })
  if (error) throw new Error(`Could not load the task's requests: ${error.message}`)

  return Promise.all(
    (data ?? [])
      .filter((r) => r.client)
      .map(async (r) => ({
        id: r.id,
        number: r.number,
        kind: r.kind,
        status: r.status,
        title: r.title,
        dueOn: r.due_on,
        client: r.client!,
        responseText: r.response_text,
        decision: r.decision,
        respondedAt: r.responded_at,
        responderName: r.responder_name,
        files: await signFiles(supabase, r.client_request_files ?? []),
      })),
  )
}

export type PortalLink = { token: string; createdAt: string; lastOpenedAt: string | null }

/** The client's private link, or null if there isn't one (or you can't see it). */
export async function getPortalLink(clientId: string): Promise<PortalLink | null> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("client_portal_links")
    .select("token, created_at, last_opened_at")
    .eq("client_id", clientId)
    .maybeSingle()
  return data
    ? { token: data.token, createdAt: data.created_at, lastOpenedAt: data.last_opened_at }
    : null
}

export type TaskOption = { id: string; number: number; title: string }

/** Open tasks that include this client, for "Link to a task". */
export async function getOpenTasksForClient(clientId: string): Promise<TaskOption[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("task_clients")
    .select("task:tasks(id, number, title, status)")
    .eq("client_id", clientId)
  return (data ?? [])
    .map((r) => r.task)
    .filter((t): t is NonNullable<typeof t> => Boolean(t) && t!.status !== "done")
    .map((t) => ({ id: t.id, number: t.number, title: t.title }))
    .sort((a, b) => a.number - b.number)
}

export type RequestAttention = {
  overdue: { client: { slug: string; name: string }; count: number; oldestDue: string }[]
  answered: number
}

/** Dashboard "Needs attention": overdue requests per client, and answers to review. */
export async function getRequestAttention(): Promise<RequestAttention> {
  const supabase = await createSupabaseServerClient()
  const today = agencyToday()
  const [{ data: overdue }, { count: answered }] = await Promise.all([
    supabase
      .from("client_requests")
      .select("due_on, client:clients(slug, name)")
      .eq("status", "open")
      .lt("due_on", today)
      .limit(1000),
    supabase
      .from("client_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "answered"),
  ])

  const byClient = new Map<string, RequestAttention["overdue"][number]>()
  for (const r of overdue ?? []) {
    if (!r.client || !r.due_on) continue
    const entry = byClient.get(r.client.slug)
    if (entry) {
      entry.count += 1
      if (r.due_on < entry.oldestDue) entry.oldestDue = r.due_on
    } else {
      byClient.set(r.client.slug, { client: r.client, count: 1, oldestDue: r.due_on })
    }
  }
  return {
    overdue: [...byClient.values()].sort((a, b) => a.oldestDue.localeCompare(b.oldestDue)),
    answered: answered ?? 0,
  }
}
