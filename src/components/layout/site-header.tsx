"use client"

import { Search } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Fragment, Suspense } from "react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { ThemeToggle } from "@/components/common/theme-toggle"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { AGENCY_NAV, clientHref, findClientSection } from "@/lib/navigation"
import { ClientSearchShortcut, useOpenClientSearch } from "./client-search"
import { NotificationsBell } from "./notifications-bell"
import { useActiveClient } from "./shell-context"

/** `label: null` is a name that is still loading (shown as a placeholder). */
type Crumb = { label: string | null; href?: string }

function useCrumbs(): Crumb[] {
  const pathname = usePathname()
  const activeClient = useActiveClient()
  const [, first, slug, segment = ""] = pathname.split("/")

  if (first === "clients" && slug) {
    const section = findClientSection(segment)
    return [
      { label: "Clients", href: "/dashboard" },
      { label: activeClient?.client?.name ?? null, href: segment ? clientHref(slug) : undefined },
      ...(segment && section ? [{ label: section.title }] : []),
    ]
  }

  const item = AGENCY_NAV.find((i) => i.href === `/${first}`)
  return [{ label: item?.title ?? "" }]
}

export function SiteHeader() {
  const openSearch = useOpenClientSearch()

  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4 md:px-6">
      <SidebarTrigger className="-ml-1.5" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      {/* Reads the URL, so it streams in behind Suspense (Cache Components rule). */}
      <Suspense fallback={<div className="flex-1" />}>
        <Crumbs />
      </Suspense>
      <ClientSearchShortcut />
      {/* Client search lives in the sidebar; on phones the sidebar is a sheet, so open it from here. */}
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto md:hidden"
        aria-label="Find a client"
        onClick={openSearch}
      >
        <Search />
      </Button>
      <span className="ml-auto hidden md:block" />
      <ThemeToggle />
      <NotificationsBell />
    </header>
  )
}

function Crumbs() {
  const crumbs = useCrumbs()
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, i) => (
          <Fragment key={i}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem className="min-w-0">
              {crumb.label === null ? (
                <Skeleton className="h-4 w-24" aria-label="Loading client" />
              ) : crumb.href ? (
                <BreadcrumbLink asChild>
                  <Link href={crumb.href} className="truncate">
                    {crumb.label}
                  </Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
