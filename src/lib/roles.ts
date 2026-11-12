import type { Database } from "@/lib/supabase/database.types"

export type AppRole = Database["public"]["Enums"]["app_role"]
export type MemberStatus = Database["public"]["Enums"]["member_status"]

export const ROLES: AppRole[] = ["admin", "manager", "va", "writer", "viewer"]

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Account manager",
  va: "VA",
  writer: "Writer",
  viewer: "Read only",
}

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  admin: "Everything, including the team, roles and client deletion.",
  manager: "Runs a book of clients. Creates and assigns tasks, edits clients.",
  va: "Works through assigned tasks. Only sees the clients in their tasks.",
  writer: "Writes and edits articles. Only sees the clients in their tasks.",
  viewer: "Can look at clients and reports. Can't change anything.",
}

export const STATUS_LABELS: Record<MemberStatus, string> = {
  active: "Active",
  invited: "Invited",
  disabled: "Disabled",
}

/**
 * What each role may do in the UI. RLS in the database is the real gate;
 * this only decides what to show. Keep the two in sync.
 */
const PERMISSIONS = {
  "clients.create": ["admin", "manager"],
  "clients.update": ["admin", "manager"],
  "clients.delete": ["admin"],
  "clients.see_all": ["admin", "manager", "viewer"],
  "tasks.manage": ["admin", "manager"],
  "tasks.work": ["admin", "manager", "va", "writer"],
  "requests.create": ["admin", "manager", "va", "writer"],
  "requests.manage": ["admin", "manager"],
  "connections.manage": ["admin", "manager"],
  "integrations.manage": ["admin"],
  "team.manage": ["admin"],
} as const satisfies Record<string, readonly AppRole[]>

export type Permission = keyof typeof PERMISSIONS

/** Plain-language labels for the Team page's permission matrix. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  "clients.see_all": "See every client (others see only clients in their tasks)",
  "clients.create": "Add clients",
  "clients.update": "Edit clients",
  "clients.delete": "Delete clients",
  "tasks.manage": "Create, assign and delete tasks",
  "tasks.work": "Work on their tasks and tick clients off",
  "requests.create": "Ask clients for codes, files and approvals (VAs: clients in their tasks)",
  "requests.manage": "Turn on or replace a client's private link",
  "connections.manage": "Connect and disconnect a client's Google and social accounts",
  "integrations.manage": "Set up Zernio webhooks and hourly account checks",
  "team.manage": "Invite people and change roles",
}

export function can(role: AppRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly AppRole[]).includes(role)
}
