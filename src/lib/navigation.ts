import {
  ChartNoAxesColumn,
  FileText,
  House,
  LayoutDashboard,
  Link2,
  ListChecks,
  type LucideIcon,
  NotebookPen,
  Plug,
  Sparkles,
  Star,
  Users,
} from "lucide-react"

import type { AppRole } from "@/lib/roles"

/**
 * One place that defines every page: its route, icon, who can open it and
 * whether it is built yet. Shipping a page = set `comingSoon: false`.
 */
export type NavItem = {
  id: string
  title: string
  icon: LucideIcon
  roles: readonly AppRole[]
  comingSoon: boolean
  /** One line shown on the Coming soon page: what this page will do. */
  summary: string
}

export type AgencyNavItem = NavItem & { href: string }
export type ClientSection = NavItem & { segment: string }

const ALL: readonly AppRole[] = ["admin", "manager", "va", "writer", "viewer"]

export const AGENCY_NAV: AgencyNavItem[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "manager", "viewer"],
    comingSoon: false,
    summary: "Every SEO client on one page, with what needs attention first.",
  },
  {
    id: "tasks",
    title: "Tasks",
    href: "/tasks",
    icon: ListChecks,
    roles: ["admin", "manager", "va", "writer"],
    comingSoon: false,
    summary:
      "All manual work in one list. One task can cover many clients, ticked off one client at a time.",
  },
  {
    id: "team",
    title: "Team",
    href: "/team",
    icon: Users,
    roles: ["admin"],
    comingSoon: false,
    summary: "Invite team members, set their roles and see the activity log.",
  },
]

/** Pages inside a client: /clients/[clientSlug]/[segment]. "" is the overview. */
export const CLIENT_SECTIONS: ClientSection[] = [
  {
    id: "overview",
    segment: "",
    title: "Overview",
    icon: House,
    roles: ALL,
    comingSoon: true,
    summary:
      "Who the client is, where they show up (website, map pack, AI answers) and this month's work.",
  },
  {
    id: "client-tasks",
    segment: "tasks",
    title: "Client tasks",
    icon: ListChecks,
    roles: ["admin", "manager", "va", "writer"],
    comingSoon: false,
    summary: "Every task that includes this client, including tasks shared with other clients.",
  },
  {
    id: "rankings",
    segment: "rankings",
    title: "Rankings",
    icon: ChartNoAxesColumn,
    roles: ALL,
    comingSoon: true,
    summary:
      "Positions for the 20 target keywords on Google, Bing, the map pack and AI answers, checked weekly.",
  },
  {
    id: "ai-visibility",
    segment: "ai-visibility",
    title: "AI visibility",
    icon: Sparkles,
    roles: ["admin", "manager", "viewer"],
    comingSoon: true,
    summary:
      "How easily ChatGPT, Gemini and others can read and recommend this business, and what to fix.",
  },
  {
    id: "backlinks",
    segment: "backlinks",
    title: "Backlinks",
    icon: Link2,
    roles: ["admin", "manager", "va", "viewer"],
    comingSoon: true,
    summary: "The directory listings and links built each month, and where each one is up to.",
  },
  {
    id: "content",
    segment: "content",
    title: "Content",
    icon: NotebookPen,
    roles: ["admin", "manager", "writer", "viewer"],
    comingSoon: true,
    summary:
      "AI-drafted articles for the client's keywords, reviewed by the team and published to the site and socials.",
  },
  {
    id: "reviews",
    segment: "reviews",
    title: "Reviews",
    icon: Star,
    roles: ["admin", "manager", "va", "viewer"],
    comingSoon: true,
    summary: "Review requests after each job, private feedback alerts and AI-drafted replies.",
  },
  {
    id: "connections",
    segment: "connections",
    title: "Connections",
    icon: Plug,
    roles: ["admin", "manager"],
    comingSoon: true,
    summary:
      "The accounts this client connected: Google, socials through Zernio or Ayrshare, and the website plugin.",
  },
  {
    id: "report",
    segment: "report",
    title: "Monthly report",
    icon: FileText,
    roles: ["admin", "manager", "viewer"],
    comingSoon: true,
    summary: "The report the client receives each month, checked here and sent as a PDF.",
  },
]

export function canAccess(item: NavItem, role: AppRole) {
  return item.roles.includes(role)
}

export function clientHref(slug: string, segment = "") {
  return segment ? `/clients/${slug}/${segment}` : `/clients/${slug}`
}

export function findClientSection(segment: string) {
  return CLIENT_SECTIONS.find((s) => s.segment === segment)
}

export function findAgencyItem(id: string) {
  return AGENCY_NAV.find((item) => item.id === id)
}

/** Where a role lands after sign-in: the first agency page it can open. */
export function homeHref(role: AppRole) {
  return AGENCY_NAV.find((item) => canAccess(item, role))?.href ?? "/no-access"
}
