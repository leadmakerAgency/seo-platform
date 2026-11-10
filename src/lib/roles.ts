import type { Database } from "@/lib/supabase/database.types"

export type AppRole = Database["public"]["Enums"]["app_role"]

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Account manager",
  va: "VA",
  writer: "Writer",
  viewer: "Read only",
}

/**
 * What each role may do in the UI. RLS in the database is the real gate;
 * this only decides what to show. Keep the two in sync.
 */
const PERMISSIONS = {
  "clients.create": ["admin", "manager"],
  "clients.update": ["admin", "manager"],
  "clients.delete": ["admin"],
  "team.manage": ["admin"],
} as const satisfies Record<string, readonly AppRole[]>

export type Permission = keyof typeof PERMISSIONS

export function can(role: AppRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly AppRole[]).includes(role)
}
