import type { Tone } from "@/components/common/status"
import type { Database } from "@/lib/supabase/database.types"

export type TaskStatus = Database["public"]["Enums"]["task_status"]
export type TaskPriority = Database["public"]["Enums"]["task_priority"]
export type TaskType = Database["public"]["Enums"]["task_type"]
export type TaskRepeat = Database["public"]["Enums"]["task_repeat"]

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "waiting_on_client", "done"]
export const TASK_PRIORITIES: TaskPriority[] = ["high", "normal", "low"]
export const TASK_REPEATS: TaskRepeat[] = ["none", "weekdays", "weekly", "monthly"]
export const TASK_TYPES: TaskType[] = [
  "backlinks",
  "google_profile",
  "content",
  "reviews",
  "connections",
  "reports",
  "client_follow_up",
  "other",
]

export const STATUS_META: Record<TaskStatus, { label: string; tone: Tone }> = {
  todo: { label: "To do", tone: "neutral" },
  in_progress: { label: "In progress", tone: "brand" },
  waiting_on_client: { label: "Waiting on client", tone: "warning" },
  done: { label: "Done", tone: "success" },
}

export const PRIORITY_META: Record<TaskPriority, { label: string; dot: string }> = {
  high: { label: "High", dot: "bg-danger-dot" },
  normal: { label: "Normal", dot: "bg-muted-foreground/60" },
  low: { label: "Low", dot: "bg-neutral-dot/60" },
}

export const TYPE_LABELS: Record<TaskType, string> = {
  backlinks: "Backlinks",
  google_profile: "Google profile",
  content: "Content",
  reviews: "Reviews",
  connections: "Connections",
  reports: "Reports",
  client_follow_up: "Client follow-up",
  other: "Other",
}

export const REPEAT_LABELS: Record<TaskRepeat, string> = {
  none: "Does not repeat",
  weekdays: "Every weekday",
  weekly: "Every week",
  monthly: "Every month",
}

export function taskNumber(n: number) {
  return `T-${n}`
}
