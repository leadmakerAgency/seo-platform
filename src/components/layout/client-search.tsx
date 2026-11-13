"use client"

import { Command as CommandPrimitive } from "cmdk"
import { Check, Loader2, Search, X } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { HealthDot } from "@/features/clients/components/health-badge"
import type { ClientSearchResult } from "@/features/clients/types"
import { clientHref, findClientSection } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import { useShell } from "./shell-context"

type SearchState = { query: string; results: ClientSearchResult[]; error: boolean }

/**
 * Opens the sidebar (or the mobile sheet) and focuses the client search.
 * Used by Ctrl/Cmd+K, the header search icon and "Find a client".
 */
export function useOpenClientSearch() {
  const { isMobile, state, setOpen, setOpenMobile } = useSidebar()
  const { setSearchFocusRequested } = useShell()
  return useCallback(() => {
    if (isMobile) setOpenMobile(true)
    else if (state === "collapsed") setOpen(true)
    setSearchFocusRequested(true)
  }, [isMobile, state, setOpen, setOpenMobile, setSearchFocusRequested])
}

/** Ctrl/Cmd+K anywhere in the app focuses the client search. */
export function ClientSearchShortcut() {
  const open = useOpenClientSearch()
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault()
        open()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])
  return null
}

const subscribeNothing = () => () => {}
/** "⌘K" on Apple devices, "Ctrl K" elsewhere (server render assumes ⌘K). */
function useShortcutLabel() {
  return useSyncExternalStore(
    subscribeNothing,
    () => (/Mac|iPhone|iPad/i.test(navigator.userAgent) ? "⌘K" : "Ctrl K"),
    () => "⌘K",
  )
}

/**
 * Where a picked client opens: the same section you're on (Onboarding stays
 * Onboarding when you switch clients), otherwise the client's overview.
 */
function targetHref(pathname: string, slug: string) {
  const match = /^\/clients\/[^/]+(?:\/([^/?#]+))?/.exec(pathname)
  const segment = match?.[1] ?? ""
  return clientHref(slug, segment && findClientSection(segment) ? segment : "")
}

/**
 * The sidebar's client picker: a search box with the results right under it.
 * Type, then click (or arrow keys + Enter) to open a client. No dialog.
 */
export function ClientSearch() {
  const router = useRouter()
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()
  const { currentClient, setCurrentClient, searchFocusRequested, setSearchFocusRequested } =
    useShell()
  const openSearch = useOpenClientSearch()
  const shortcut = useShortcutLabel()

  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<SearchState | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch matches while the list is open (debounced; the last request wins).
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients/search?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        })
        if (res.status === 401) {
          const next = `${window.location.pathname}${window.location.search}`
          router.replace(`/login?next=${encodeURIComponent(next)}`)
          return
        }
        if (!res.ok) throw new Error(String(res.status))
        const body = (await res.json()) as { results: ClientSearchResult[] }
        setState({ query, results: body.results, error: false })
      } catch {
        if (!controller.signal.aborted) setState({ query, results: [], error: true })
      }
    }, 120)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [query, open, router])

  // Ctrl/Cmd+K or "Find a client": focus the box (also right after the mobile sheet opens).
  useEffect(() => {
    if (!searchFocusRequested) return
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
    setSearchFocusRequested(false)
  }, [searchFocusRequested, setSearchFocusRequested])

  const loading = open && (state === null || state.query !== query)
  // Keep showing the previous results while the next ones load (no flicker).
  const results = state?.results ?? []

  function close() {
    setOpen(false)
    setQuery("")
  }

  function select(client: ClientSearchResult) {
    close()
    inputRef.current?.blur()
    if (isMobile) setOpenMobile(false)
    // Show the new client in the sidebar straight away; its page confirms it.
    setCurrentClient(client)
    router.push(targetHref(pathname, client.slug))
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Collapsed (icon) sidebar: one button that expands it and focuses the search. */}
      <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
        <SidebarMenuItem>
          <SidebarMenuButton tooltip={`Search clients (${shortcut})`} onClick={openSearch}>
            <Search />
            <span>Search clients</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {currentClient && (
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={currentClient.name}>
              <Link href={clientHref(currentClient.slug)}>
                <ClientInitials name={currentClient.name} />
                <span>{currentClient.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
      </SidebarMenu>

      <CommandPrimitive
        ref={rootRef}
        shouldFilter={false}
        loop
        label="Search clients"
        className="flex flex-col gap-1 group-data-[collapsible=icon]:hidden"
        onBlur={(e) => {
          // Close when focus leaves the search (not when it moves within it).
          if (!rootRef.current?.contains(e.relatedTarget as Node | null)) close()
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            if (query) setQuery("")
            else {
              close()
              inputRef.current?.blur()
            }
          }
        }}
      >
        <div
          className={cn(
            "flex h-9 items-center gap-2 rounded-md border border-sidebar-border bg-background px-2.5 shadow-xs transition-[color,box-shadow]",
            "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
          )}
        >
          {loading ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <CommandPrimitive.Input
            ref={inputRef}
            value={query}
            onValueChange={(v) => {
              setQuery(v)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onMouseDown={() => setOpen(true)}
            placeholder="Search clients…"
            aria-label="Search clients by name, city or website"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQuery("")
                inputRef.current?.focus()
              }}
              className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none hidden shrink-0 rounded border bg-muted px-1.5 font-sans text-[10px] font-medium text-muted-foreground md:inline-block">
              {shortcut}
            </kbd>
          )}
        </div>

        {open && (
          <CommandPrimitive.List
            // Keep focus in the box while clicking a result.
            onMouseDown={(e) => e.preventDefault()}
            className="max-h-72 overflow-y-auto overscroll-contain rounded-md border border-sidebar-border bg-background p-1 shadow-sm"
          >
            {state?.error ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                Search isn&apos;t working right now. Try again.
              </p>
            ) : !loading && results.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {query.trim()
                  ? `No clients match “${query.trim()}”.`
                  : "No clients yet. Add one from the Dashboard."}
              </p>
            ) : (
              <CommandPrimitive.Group
                heading={query.trim() ? "Matches" : "Clients"}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-1 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {results.length === 0 && loading && (
                  <p className="px-2 py-2 text-xs text-muted-foreground">Searching…</p>
                )}
                {results.map((client) => {
                  const current = client.id === currentClient?.id
                  return (
                    <CommandPrimitive.Item
                      key={client.id}
                      value={client.id}
                      onSelect={() => select(client)}
                      className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[selected=true]:bg-sidebar-accent data-[selected=true]:text-sidebar-accent-foreground"
                    >
                      <ClientInitials name={client.name} />
                      <span className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span className="truncate font-medium">{client.name}</span>
                        {client.location && (
                          <span className="truncate text-xs text-muted-foreground">
                            {client.location}
                          </span>
                        )}
                      </span>
                      {current ? (
                        <Check className="size-4 shrink-0 text-primary" aria-label="Open now" />
                      ) : (
                        <HealthDot health={client.health} />
                      )}
                    </CommandPrimitive.Item>
                  )
                })}
              </CommandPrimitive.Group>
            )}
          </CommandPrimitive.List>
        )}
      </CommandPrimitive>

      {/* The client you're working on. */}
      {currentClient && !open && (
        <Link
          href={clientHref(currentClient.slug)}
          aria-label={`${currentClient.name}: open the overview`}
          className="flex items-center gap-2.5 rounded-md border border-sidebar-border bg-sidebar-accent/60 px-2.5 py-2 outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:hidden"
        >
          <ClientInitials name={currentClient.name} />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[13px] font-medium">{currentClient.name}</span>
            {currentClient.location && (
              <span className="truncate text-xs text-muted-foreground">
                {currentClient.location}
              </span>
            )}
          </span>
          <HealthDot health={currentClient.health} />
        </Link>
      )}
    </div>
  )
}

function ClientInitials({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-[10px] font-semibold text-foreground"
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  )
}
