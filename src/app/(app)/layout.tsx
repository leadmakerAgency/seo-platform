import { Suspense } from "react"

import { Logo } from "@/components/brand/logo"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { ClientSwitcher } from "@/components/layout/client-switcher"
import { ShellProvider } from "@/components/layout/shell-context"
import { SiteHeader } from "@/components/layout/site-header"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { getCurrentMember } from "@/lib/auth"
import { ROLE_LABELS } from "@/lib/roles"

/**
 * The signed-in app shell. The frame renders immediately; the sidebar's
 * user-specific parts stream in behind <Suspense> (Cache Components rule:
 * session reads never sit at the top of a layout).
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <ShellProvider>
      <SidebarProvider>
        <Suspense fallback={<SidebarFallback />}>
          <SidebarWithMember />
        </Suspense>
        <SidebarInset className="min-w-0">
          <SiteHeader />
          <div className="flex-1 px-4 py-6 md:px-8 md:py-8">
            <div className="mx-auto w-full max-w-[1280px]">{children}</div>
          </div>
        </SidebarInset>
        <ClientSwitcher />
      </SidebarProvider>
    </ShellProvider>
  )
}

async function SidebarWithMember() {
  const member = await getCurrentMember()
  return (
    <AppSidebar
      member={{
        displayName: member.displayName,
        email: member.email,
        initials: member.initials,
        role: member.role,
        roleLabel: ROLE_LABELS[member.role],
      }}
    />
  )
}

function SidebarFallback() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 pt-4 pb-2">
        <Logo />
      </SidebarHeader>
      <SidebarContent className="gap-1 px-2 pt-6">
        {["w-3/4", "w-1/2", "w-2/3", "w-3/5", "w-1/2"].map((width, i) => (
          <div key={i} className="flex h-8 items-center gap-2 px-2">
            <Skeleton className="size-4 rounded-md" />
            <Skeleton className={`h-4 ${width}`} />
          </div>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
