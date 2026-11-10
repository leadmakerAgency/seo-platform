"use client"

import { ChevronsUpDown, LogOut } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { signOut } from "@/features/auth/actions"

export type NavUserProps = {
  displayName: string
  email: string
  initials: string
  roleLabel: string
}

export function NavUser({ displayName, email, initials, roleLabel }: NavUserProps) {
  const { isMobile } = useSidebar()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8 rounded-md">
                <AvatarFallback className="rounded-md bg-muted text-xs font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-[13px] font-medium">{displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{roleLabel}</span>
              </span>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={8}
            className="w-56"
          >
            <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
              <span className="text-sm font-medium">{displayName}</span>
              <span className="truncate text-xs text-muted-foreground">{email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <form action={signOut}>
                <DropdownMenuItem asChild>
                  <button type="submit" className="w-full">
                    <LogOut />
                    Sign out
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
