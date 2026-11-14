"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { Logo } from "@/components/brand/logo"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { AGENCY_NAV, CLIENT_SECTIONS, canAccess, clientHref, type NavItem } from "@/lib/navigation"
import type { AppRole } from "@/lib/roles"
import { ClientSearch, useOpenClientSearch } from "./client-search"
import { NavUser, type NavUserProps } from "./nav-user"
import { useShell } from "./shell-context"

export function AppSidebar({
  member,
  taskAttention = 0,
}: {
  member: NavUserProps & { role: AppRole }
  /** Your open tasks that are overdue or due today (red badge on Tasks). */
  taskAttention?: number
}) {
  const pathname = usePathname()
  const { currentClient } = useShell()
  const openSearch = useOpenClientSearch()

  const agencyItems = AGENCY_NAV.filter((item) => canAccess(item, member.role))
  const clientItems = CLIENT_SECTIONS.filter((item) => canAccess(item, member.role))

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 pt-4 pb-2">
        <Link
          href="/dashboard"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo className="group-data-[collapsible=icon]:hidden" />
          <Logo compact className="hidden group-data-[collapsible=icon]:flex" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Agency</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {agencyItems.map((item) => (
                <NavLink
                  key={item.id}
                  item={item}
                  href={item.href}
                  active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                  count={item.id === "tasks" ? taskAttention : undefined}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Client</SidebarGroupLabel>
          <SidebarGroupContent className="flex flex-col gap-1.5">
            <ClientSearch />

            {currentClient ? (
              <SidebarMenu>
                {clientItems.map((item) => {
                  const href = clientHref(currentClient.slug, item.segment)
                  return (
                    <NavLink key={item.id} item={item} href={href} active={pathname === href} />
                  )
                })}
              </SidebarMenu>
            ) : (
              // No client chosen yet: show which pages exist, and let a click
              // focus the client search instead of hiding the whole section.
              <SidebarMenu aria-label="Client pages (choose a client first)">
                <p className="px-2 pt-1 pb-0.5 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                  Choose a client to open these pages.
                </p>
                {clientItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        tooltip={`${item.title}: choose a client first`}
                        onClick={openSearch}
                        className="text-muted-foreground"
                      >
                        <Icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                      {item.comingSoon && (
                        <SidebarMenuBadge className="text-[10px] font-normal text-muted-foreground">
                          Soon
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser {...member} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function NavLink({
  item,
  href,
  active,
  count,
}: {
  item: NavItem
  href: string
  active: boolean
  count?: number
}) {
  const Icon = item.icon
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={item.comingSoon ? `${item.title} (coming soon)` : item.title}
        className="relative text-sidebar-foreground data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[active=true]:before:absolute data-[active=true]:before:inset-y-1.5 data-[active=true]:before:left-0 data-[active=true]:before:w-0.5 data-[active=true]:before:rounded-full data-[active=true]:before:bg-primary [&>svg]:text-muted-foreground data-[active=true]:[&>svg]:text-primary"
      >
        <Link href={href}>
          <Icon />
          <span className={item.comingSoon ? "text-muted-foreground" : undefined}>
            {item.title}
          </span>
        </Link>
      </SidebarMenuButton>
      {!item.comingSoon && count !== undefined && count > 0 && (
        <SidebarMenuBadge
          className="rounded-sm bg-danger text-[11px] font-semibold text-danger-foreground tabular-nums peer-hover/menu-button:text-danger-foreground peer-data-active/menu-button:text-danger-foreground"
          aria-label={`${count} overdue or due today`}
        >
          {count > 99 ? "99+" : count}
        </SidebarMenuBadge>
      )}
      {item.comingSoon && (
        <SidebarMenuBadge className="text-[10px] font-normal text-muted-foreground">
          Soon
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  )
}
