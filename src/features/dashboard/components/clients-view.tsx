"use client"

import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table"
import { ChevronLeft, ChevronRight, Search, SearchX, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { HealthBadge } from "@/features/clients/components/health-badge"
import { STAGE_LABELS } from "@/features/clients/constants"
import { COUNTRIES, displayUrl, formatDate, formatNumber, initials } from "@/lib/format"
import { clientHref } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import type { ClientRow } from "../queries"
import {
  DASHBOARD_PAGE_SIZE,
  SORT_OPTIONS,
  dashboardHref,
  hasFilters,
  type DashboardParams,
} from "../search-params"

const ALL = "all"

const features = tableFeatures({})
const column = createColumnHelper<typeof features, ClientRow>()
const columns = column.columns([
  column.display({
    id: "client",
    header: "Client",
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col">
        <Link
          href={clientHref(row.original.slug)}
          className="truncate font-medium underline-offset-4 hover:underline"
        >
          {row.original.name}
        </Link>
        {row.original.website && (
          <span className="truncate text-xs text-muted-foreground">
            {displayUrl(row.original.website)}
          </span>
        )}
      </div>
    ),
  }),
  column.display({
    id: "location",
    header: "Location",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">{row.original.location}</span>
    ),
  }),
  column.display({
    id: "health",
    header: "Status",
    cell: ({ row }) => <HealthBadge health={row.original.health} />,
  }),
  column.display({
    id: "stage",
    header: "Stage",
    cell: ({ row }) => (
      <span className="whitespace-nowrap">{STAGE_LABELS[row.original.stage]}</span>
    ),
  }),
  column.display({
    id: "owner",
    header: "Looked after by",
    cell: ({ row }) =>
      row.original.owner ? (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <Avatar className="size-6">
            <AvatarFallback className="bg-muted text-[10px] font-medium">
              {initials(row.original.owner.name)}
            </AvatarFallback>
          </Avatar>
          {row.original.owner.name}
        </span>
      ) : (
        <span className="text-muted-foreground">Nobody yet</span>
      ),
  }),
  column.display({
    id: "plan",
    header: "Every month",
    cell: ({ row }) => {
      const { keywords, backlinks, articles } = row.original.plan
      return (
        <span className="whitespace-nowrap text-muted-foreground tabular-nums">
          {keywords} keywords · {backlinks} links · {articles} articles
        </span>
      )
    },
  }),
  column.display({
    id: "added",
    header: "Added",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground tabular-nums">
        {formatDate(row.original.createdAt)}
      </span>
    ),
  }),
  column.display({
    id: "open",
    header: () => <span className="sr-only">Open</span>,
    cell: ({ row }) => (
      <Button asChild variant="ghost" size="icon-sm" aria-label={`Open ${row.original.name}`}>
        <Link href={clientHref(row.original.slug)}>
          <ChevronRight />
        </Link>
      </Button>
    ),
  }),
])

/** Toolbar, table and pagination for the dashboard client list. Filters live in the URL. */
export function ClientsView({
  rows,
  total,
  params,
  emptyAction,
}: {
  rows: ClientRow[]
  total: number
  params: DashboardParams
  /** Shown when there are no clients at all (the Add client button, by role). */
  emptyAction?: ReactNode
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const table = useTable({ features, columns, data: rows })

  function go(patch: Partial<DashboardParams>) {
    startTransition(() => {
      router.replace(dashboardHref(params, patch), { scroll: false })
    })
  }

  const filtered = hasFilters(params)
  const pageCount = Math.max(1, Math.ceil(total / DASHBOARD_PAGE_SIZE))
  const from = total === 0 ? 0 : (params.page - 1) * DASHBOARD_PAGE_SIZE + 1
  const to = Math.min(params.page * DASHBOARD_PAGE_SIZE, total)

  if (total === 0 && !filtered) {
    return (
      <Empty className="border py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Search />
          </EmptyMedia>
          <EmptyTitle>No clients yet</EmptyTitle>
          <EmptyDescription>
            Add your first client to start tracking their rankings, content and backlinks.
          </EmptyDescription>
        </EmptyHeader>
        {emptyAction && <EmptyContent>{emptyAction}</EmptyContent>}
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Toolbar params={params} onChange={go} />

      <div
        className={cn(
          "overflow-hidden rounded-lg border transition-opacity",
          pending && "pointer-events-none opacity-60",
        )}
        aria-busy={pending}
      >
        {rows.length === 0 ? (
          <Empty className="py-14">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchX />
              </EmptyMedia>
              <EmptyTitle>No clients match these filters</EmptyTitle>
              <EmptyDescription>Check the spelling or clear the filters.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant="outline"
                onClick={() =>
                  go({ q: undefined, health: undefined, country: undefined, owner: undefined })
                }
              >
                Clear filters
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Table className="min-w-[980px]">
            <TableHeader className="bg-muted/40">
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id} className="hover:bg-transparent">
                  {group.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="h-9 text-xs font-medium text-muted-foreground first:pl-4 last:w-12 last:pr-2"
                    >
                      {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="h-12">
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className="max-w-[260px] first:pl-4 last:pr-2">
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="tabular-nums">
            Showing {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}{" "}
            {total === 1 ? "client" : "clients"}
          </span>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={params.page <= 1 || pending}
                onClick={() => go({ page: params.page - 1 })}
              >
                <ChevronLeft />
                Previous
              </Button>
              <span className="px-1 tabular-nums">
                Page {params.page} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={params.page >= pageCount || pending}
                onClick={() => go({ page: params.page + 1 })}
              >
                Next
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Toolbar({
  params,
  onChange,
}: {
  params: DashboardParams
  onChange: (patch: Partial<DashboardParams>) => void
}) {
  const [query, setQuery] = useState(params.q ?? "")
  const lastSent = useRef(params.q ?? "")

  // Debounce typing into the URL.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed === lastSent.current) return
    const timer = window.setTimeout(() => {
      lastSent.current = trimmed
      onChange({ q: trimmed || undefined })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query, onChange])

  const filtered = hasFilters(params)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1 sm:max-w-[320px]">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, city or website"
          aria-label="Search clients"
          className="pl-8"
        />
      </div>

      <Select
        value={params.country ?? ALL}
        onValueChange={(v) => onChange({ country: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="w-[170px]" aria-label="Country">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All countries</SelectItem>
          {COUNTRIES.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={params.owner ?? ALL}
        onValueChange={(v) => onChange({ owner: v === "me" ? "me" : undefined })}
      >
        <SelectTrigger className="w-[180px]" aria-label="Looked after by">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Everyone&apos;s clients</SelectItem>
          <SelectItem value="me">My clients</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={params.sort}
        onValueChange={(v) => onChange({ sort: v as DashboardParams["sort"] })}
      >
        <SelectTrigger className="w-[170px]" aria-label="Sort by">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {filtered && (
        <Button
          variant="ghost"
          onClick={() => {
            setQuery("")
            lastSent.current = ""
            onChange({ q: undefined, health: undefined, country: undefined, owner: undefined })
          }}
        >
          <X />
          Clear filters
        </Button>
      )}
    </div>
  )
}
