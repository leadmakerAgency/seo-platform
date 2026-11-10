"use server"

import { refresh } from "next/cache"

import { PermissionError, requirePermission, type CurrentMember } from "@/lib/auth"
import type { Permission } from "@/lib/roles"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { TaskPriority, TaskRepeat, TaskStatus, TaskType } from "./constants"
import {
  commentSchema,
  prioritySchema,
  statusSchema,
  taskFormSchema,
  type ActionResult,
  type TaskFormInput,
} from "./schemas"

type Guard = { member: CurrentMember } | { error: string }

async function guard(permission: Permission): Promise<Guard> {
  try {
    return { member: await requirePermission(permission) }
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.message }
    throw error
  }
}

/** Database errors raised by our triggers are written for people; pass those through. */
function dbError(error: { message?: string; code?: string } | null, fallback: string) {
  if (error?.code === "42501" && error.message && !error.message.includes("row-level security")) {
    return error.message
  }
  return fallback
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {}
  for (const issue of issues) out[String(issue.path[0] ?? "form")] ??= issue.message
  return out
}

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v)

export async function createTask(input: TaskFormInput): Promise<ActionResult<{ number: number }>> {
  const g = await guard("tasks.manage")
  if ("error" in g) return { ok: false, error: g.error }

  const parsed = taskFormSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    }
  }
  const v = parsed.data
  const supabase = await createSupabaseServerClient()

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      title: v.title,
      description: v.description,
      steps: v.steps,
      type: v.type as TaskType,
      priority: v.priority as TaskPriority,
      repeat: v.repeat as TaskRepeat,
      assignee_id: v.assigneeId,
      due_on: v.dueOn,
      created_by: g.member.id,
    })
    .select("id, number")
    .single()
  if (error) return { ok: false, error: dbError(error, "Couldn't create the task. Try again.") }

  if (v.clientIds.length > 0) {
    const { error: clientsError } = await supabase
      .from("task_clients")
      .insert(v.clientIds.map((client_id) => ({ task_id: task.id, client_id })))
    if (clientsError) {
      await supabase.from("tasks").delete().eq("id", task.id)
      return { ok: false, error: "Couldn't add the clients. The task wasn't created." }
    }
  }

  refresh()
  return { ok: true, data: { number: task.number } }
}

export async function updateTask(
  taskId: string,
  input: TaskFormInput,
): Promise<ActionResult<{ number: number }>> {
  const g = await guard("tasks.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(taskId)) return { ok: false, error: "Unknown task." }

  const parsed = taskFormSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error.issues),
    }
  }
  const v = parsed.data
  const supabase = await createSupabaseServerClient()

  const { data: task, error } = await supabase
    .from("tasks")
    .update({
      title: v.title,
      description: v.description,
      steps: v.steps,
      type: v.type as TaskType,
      priority: v.priority as TaskPriority,
      repeat: v.repeat as TaskRepeat,
      assignee_id: v.assigneeId,
      due_on: v.dueOn,
    })
    .eq("id", taskId)
    .select("id, number")
    .maybeSingle()
  if (error || !task)
    return { ok: false, error: dbError(error, "Couldn't save the task. Try again.") }

  // Sync the client list: remove the ones taken out, add the new ones.
  const { data: current } = await supabase
    .from("task_clients")
    .select("client_id")
    .eq("task_id", taskId)
  const before = new Set((current ?? []).map((r) => r.client_id))
  const after = new Set(v.clientIds)
  const removed = [...before].filter((id) => !after.has(id))
  const added = [...after].filter((id) => !before.has(id))
  if (removed.length) {
    await supabase.from("task_clients").delete().eq("task_id", taskId).in("client_id", removed)
  }
  if (added.length) {
    await supabase
      .from("task_clients")
      .insert(added.map((client_id) => ({ task_id: taskId, client_id })))
  }

  refresh()
  return { ok: true, data: { number: task.number } }
}

export async function setTaskStatus(taskId: string, status: TaskStatus): Promise<ActionResult> {
  const g = await guard("tasks.work")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(taskId) || !statusSchema.safeParse(status).success) {
    return { ok: false, error: "Unknown status." }
  }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("tasks")
    .update({ status })
    .eq("id", taskId)
    .select("id")
    .maybeSingle()
  if (error || !data) return { ok: false, error: dbError(error, "Couldn't change the status.") }
  refresh()
  return { ok: true }
}

/** Quick edits from the task panel (managers): assignee, due date, priority. */
export async function updateTaskDetails(
  taskId: string,
  patch: { assigneeId?: string | null; dueOn?: string | null; priority?: TaskPriority },
): Promise<ActionResult> {
  const g = await guard("tasks.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(taskId)) return { ok: false, error: "Unknown task." }

  const update: { assignee_id?: string | null; due_on?: string | null; priority?: TaskPriority } =
    {}
  if ("assigneeId" in patch) {
    if (patch.assigneeId !== null && !isUuid(patch.assigneeId ?? "")) {
      return { ok: false, error: "Unknown person." }
    }
    update.assignee_id = patch.assigneeId ?? null
  }
  if ("dueOn" in patch) {
    if (patch.dueOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(patch.dueOn ?? "")) {
      return { ok: false, error: "Choose a valid date." }
    }
    update.due_on = patch.dueOn ?? null
  }
  if ("priority" in patch) {
    if (!prioritySchema.safeParse(patch.priority).success)
      return { ok: false, error: "Unknown priority." }
    update.priority = patch.priority
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("tasks")
    .update(update)
    .eq("id", taskId)
    .select("id")
    .maybeSingle()
  if (error || !data) return { ok: false, error: dbError(error, "Couldn't save the change.") }
  refresh()
  return { ok: true }
}

/** Tick a client off (or back on). The database moves the task's status. */
export async function toggleTaskClient(
  taskId: string,
  clientId: string,
  done: boolean,
): Promise<ActionResult> {
  const g = await guard("tasks.work")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(taskId) || !isUuid(clientId)) return { ok: false, error: "Unknown client." }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("task_clients")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("task_id", taskId)
    .eq("client_id", clientId)
    .select("task_id")
    .maybeSingle()
  if (error || !data) {
    return { ok: false, error: dbError(error, "You can only tick off clients on your own tasks.") }
  }
  refresh()
  return { ok: true }
}

export async function removeTaskClient(taskId: string, clientId: string): Promise<ActionResult> {
  const g = await guard("tasks.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(taskId) || !isUuid(clientId)) return { ok: false, error: "Unknown client." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from("task_clients")
    .delete()
    .eq("task_id", taskId)
    .eq("client_id", clientId)
  if (error) return { ok: false, error: "Couldn't remove the client." }
  refresh()
  return { ok: true }
}

export async function addComment(
  taskId: string,
  input: { body: string; mentions: string[] },
): Promise<ActionResult> {
  const g = await guard("tasks.work")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(taskId)) return { ok: false, error: "Unknown task." }
  const parsed = commentSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the comment." }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from("task_comments").insert({
    task_id: taskId,
    author_id: g.member.id,
    body: parsed.data.body,
    mentions: [...new Set(parsed.data.mentions)],
  })
  if (error) return { ok: false, error: dbError(error, "Couldn't post the comment.") }
  refresh()
  return { ok: true }
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  const g = await guard("tasks.work")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(commentId)) return { ok: false, error: "Unknown comment." }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("task_comments")
    .delete()
    .eq("id", commentId)
    .select("id")
  if (error || !data?.length) return { ok: false, error: "You can only delete your own comments." }
  refresh()
  return { ok: true }
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  const g = await guard("tasks.manage")
  if ("error" in g) return { ok: false, error: g.error }
  if (!isUuid(taskId)) return { ok: false, error: "Unknown task." }

  const supabase = await createSupabaseServerClient()
  const { data: task } = await supabase
    .from("tasks")
    .select("number, title")
    .eq("id", taskId)
    .maybeSingle()
  if (!task) return { ok: false, error: "Unknown task." }

  const { error } = await supabase.from("tasks").delete().eq("id", taskId)
  if (error) return { ok: false, error: "Couldn't delete the task." }

  await supabase.from("activity_log").insert({
    actor_id: g.member.id,
    action: "task.deleted",
    meta: { number: task.number, title: task.title },
  })
  refresh()
  return { ok: true }
}

export async function markNotificationsRead(): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) return { ok: false, error: "Not signed in." }
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", auth.claims.sub)
    .is("read_at", null)
  return { ok: true }
}
