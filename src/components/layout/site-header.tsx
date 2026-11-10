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
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { AGENCY_NAV, clientHref, findClientSection } from "@/lib/navigation"
import { useShell } from "./shell-context"

type Crumb = { label: string; href?: string }

function useCrumbs(): Crumb[] {
  const pathname = usePathname()
  const { currentClient } = useShell()
  const [, first, slug, segment = ""] = pathname.split("/")

  if (first === "clients" && slug) {
    const section = findClientSection(segment)
    const name = currentClient?.slug === slug ? currentClient.name : "Client"
    return [
      { label: "Clients", href: "/dashboard" },
      { label: name, href: segment ? clientHref(slug) : undefined },
      ...(segment && section ? [{ label: section.title }] : []),
    ]
  }

  const item = AGENCY_NAV.find((i) => i.href === `/${first}`)
  return [{ label: item?.title ?? "" }]
}

export function SiteHeader() {
  const { setSwitcherOpen } = useShell()

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 md:px-6">
      <SidebarTrigger className="-ml-1.5" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      {/* Reads the URL, so it streams in behind Suspense (Cache Components rule). */}
      <Suspense fallback={<div className="flex-1" />}>
        <Crumbs />
      </Suspense>
      <Button
        variant="outline"
        size="sm"
        className="ml-auto hidden w-56 justify-start gap-2 font-normal text-muted-foreground sm:flex"
        onClick={() => setSwitcherOpen(true)}
      >
        <Search />
        Find a client
        <Kbd className="ml-auto">⌘K</Kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto sm:hidden"
        aria-label="Find a client"
        onClick={() => setSwitcherOpen(true)}
      >
        <Search />
      </Button>
    </header>
  )
}

function Crumbs() {
  const crumbs = useCrumbs()
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, i) => (
          <Fragment key={`${crumb.label}-${i}`}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem className="min-w-0">
              {crumb.href ? (
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
