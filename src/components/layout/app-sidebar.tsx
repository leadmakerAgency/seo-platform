"use client"

import { ChevronsUpDown } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Logo } from "@/components/brand/logo"
import { Kbd } from "@/components/ui/kbd"
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
import { HealthDot } from "@/features/clients/components/health-badge"
import { AGENCY_NAV, CLIENT_SECTIONS, canAccess, clientHref, type NavItem } from "@/lib/navigation"
import type { AppRole } from "@/lib/roles"
import { NavUser, type NavUserProps } from "./nav-user"
import { useShell } from "./shell-context"

export function AppSidebar({ member }: { member: NavUserProps & { role: AppRole } }) {
  const pathname = usePathname()
  const { currentClient, setSwitcherOpen } = useShell()

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
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Client</SidebarGroupLabel>
          <SidebarGroupContent className="flex flex-col gap-1">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="lg"
                  tooltip="Switch client"
                  onClick={() => setSwitcherOpen(true)}
                  className="border border-sidebar-border"
                >
                  {currentClient ? (
                    <>
                      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-[10px] font-semibold">
                        {currentClient.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span className="flex items-center gap-1.5 truncate text-[13px] font-medium">
                          <HealthDot health={currentClient.health} />
                          <span className="truncate">{currentClient.name}</span>
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {currentClient.location}
                        </span>
                      </span>
                    </>
                  ) : (
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate text-[13px] font-medium">Choose a client</span>
                      <span className="truncate text-xs text-muted-foreground">
                        Search by name or city
                      </span>
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1 text-muted-foreground">
                    <Kbd className="hidden md:inline-flex">⌘K</Kbd>
                    <ChevronsUpDown className="size-4" />
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>

            {currentClient && (
              <SidebarMenu>
                {clientItems.map((item) => {
                  const href = clientHref(currentClient.slug, item.segment)
                  return (
                    <NavLink key={item.id} item={item} href={href} active={pathname === href} />
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

function NavLink({ item, href, active }: { item: NavItem; href: string; active: boolean }) {
  const Icon = item.icon
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={item.comingSoon ? `${item.title} (coming soon)` : item.title}
        className="data-[active=true]:font-medium data-[active=true]:text-foreground data-[active=true]:[&>svg]:text-primary"
      >
        <Link href={href}>
          <Icon />
          <span className={item.comingSoon ? "text-muted-foreground" : undefined}>
            {item.title}
          </span>
        </Link>
      </SidebarMenuButton>
      {item.comingSoon && (
        <SidebarMenuBadge className="text-[10px] font-normal text-muted-foreground">
          Soon
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  )
}
