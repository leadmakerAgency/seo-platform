import type { Database } from "@/lib/supabase/database.types"

export type ClientHealth = Database["public"]["Enums"]["client_health"]
export type ClientStage = Database["public"]["Enums"]["client_stage"]

export const HEALTH_ORDER: ClientHealth[] = ["action_needed", "needs_look", "on_track"]

export const HEALTH_META: Record<
  ClientHealth,
  { label: string; description: string; dot: string; badge: string }
> = {
  on_track: {
    label: "On track",
    description: "Everything on schedule",
    dot: "bg-success",
    badge: "bg-success-soft text-success",
  },
  needs_look: {
    label: "Needs a look",
    description: "Behind, or something expires soon",
    dot: "bg-warning",
    badge: "bg-warning-soft text-warning",
  },
  action_needed: {
    label: "Action needed",
    description: "Something is broken and work has stopped",
    dot: "bg-danger",
    badge: "bg-danger-soft text-danger",
  },
}

export const STAGE_LABELS: Record<ClientStage, string> = {
  onboarding: "Onboarding",
  active: "Active",
  paused: "Paused",
  churned: "Churned",
}

/** Default monthly plan for a new client (from the product plan). */
export const DEFAULT_PLAN = { keywords: 20, backlinks: 20, articles: 8 } as const
