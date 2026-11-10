import { z } from "zod"

import { TASK_PRIORITIES, TASK_TYPES } from "./constants"

/**
 * Tasks filters live in the URL:
 * ?view=mine|team|waiting|done&q=&assignee=&type=&priority=&due=&page=&task=1051
 * `task` opens the task panel, so a task can be linked to directly.
 */
export const TASKS_PAGE_SIZE = 25

export const TASK_VIEWS = ["mine", "team", "waiting", "done"] as const
export type TaskView = (typeof TASK_VIEWS)[number]

export const DUE_FILTERS = ["overdue", "today", "week"] as const
export type DueFilter = (typeof DUE_FILTERS)[number]

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v)

const schema = z.object({
  view: z.preprocess(one, z.enum(TASK_VIEWS).optional()).catch(undefined),
  q: z.preprocess(one, z.string().trim().max(80).optional()).catch(undefined),
  assignee: z.preprocess(one, z.union([z.uuid(), z.literal("none")]).optional()).catch(undefined),
  type: z.preprocess(one, z.enum(TASK_TYPES as [string, ...string[]]).optional()).catch(undefined),
  priority: z
    .preprocess(one, z.enum(TASK_PRIORITIES as [string, ...string[]]).optional())
    .catch(undefined),
  due: z.preprocess(one, z.enum(DUE_FILTERS).optional()).catch(undefined),
  page: z.preprocess(one, z.coerce.number().int().min(1).max(10_000).default(1)).catch(1),
  task: z.preprocess(one, z.coerce.number().int().min(1).optional()).catch(undefined),
})

export type TaskParams = Omit<z.infer<typeof schema>, "view"> & { view: TaskView }

/** Managers land on the whole team; VAs and writers on their own tasks. */
export function parseTaskParams(
  raw: Record<string, string | string[] | undefined>,
  canSeeTeam: boolean,
): TaskParams {
  const parsed = schema.parse(raw)
  let view = parsed.view ?? (canSeeTeam ? "team" : "mine")
  if (view === "team" && !canSeeTeam) view = "mine"
  return { ...parsed, view, q: parsed.q || undefined }
}

export function hasTaskFilters(p: TaskParams) {
  return Boolean(p.q || p.assignee || p.type || p.priority || p.due)
}

/** Builds a /tasks URL from the current params plus a change (resets to page 1). */
export function tasksHref(params: TaskParams, patch: Partial<TaskParams>, base = "/tasks") {
  const next = { ...params, ...patch }
  if (!("page" in patch)) next.page = 1
  if (!("task" in patch)) next.task = params.task

  const search = new URLSearchParams()
  if (base === "/tasks") search.set("view", next.view)
  if (next.q) search.set("q", next.q)
  if (next.assignee) search.set("assignee", next.assignee)
  if (next.type) search.set("type", next.type)
  if (next.priority) search.set("priority", next.priority)
  if (next.due) search.set("due", next.due)
  if (next.page && next.page > 1) search.set("page", String(next.page))
  if (next.task) search.set("task", String(next.task))
  const query = search.toString()
  return query ? `${base}?${query}` : base
}
