import type { Tone } from "@/components/common/status"
import type { Database } from "@/lib/supabase/database.types"

export type ClientHealth = Database["public"]["Enums"]["client_health"]
export type ClientStage = Database["public"]["Enums"]["client_stage"]

export const HEALTH_ORDER: ClientHealth[] = ["action_needed", "needs_look", "on_track"]

export const HEALTH_META: Record<ClientHealth, { label: string; description: string; tone: Tone }> =
  {
    on_track: {
      label: "On track",
      description: "Everything on schedule",
      tone: "success",
    },
    needs_look: {
      label: "Needs a look",
      description: "Behind, or something expires soon",
      tone: "warning",
    },
    action_needed: {
      label: "Action needed",
      description: "Something is broken and work has stopped",
      tone: "danger",
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
