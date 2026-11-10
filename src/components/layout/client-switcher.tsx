"use client"

import { Building2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { HealthDot } from "@/features/clients/components/health-badge"
import type { ClientSearchResult } from "@/features/clients/types"
import { clientHref } from "@/lib/navigation"
import { useShell } from "./shell-context"

type SearchState = { query: string; results: ClientSearchResult[]; error: boolean }

/** Ctrl/Cmd+K dialog that finds a client by name, city or website. */
export function ClientSwitcher() {
  const router = useRouter()
  const { switcherOpen, setSwitcherOpen } = useShell()
  const [query, setQuery] = useState("")
  const [state, setState] = useState<SearchState | null>(null)

  useEffect(() => {
    if (!switcherOpen) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })
        if (res.status === 401) {
          // Session expired: send them to sign in, then back to this page.
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
    }, 150)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [query, switcherOpen, router])

  const loading = state === null || state.query !== query
  const results = state?.results ?? []

  function select(slug: string) {
    setSwitcherOpen(false)
    setQuery("")
    router.push(clientHref(slug))
  }

  return (
    <CommandDialog
      open={switcherOpen}
      onOpenChange={setSwitcherOpen}
      title="Switch client"
      description="Search clients by name, city or website"
    >
      {/* Results come from the server, so cmdk's own filtering is turned off. */}
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search clients by name, city or website…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {!loading && (
            <CommandEmpty>
              {state?.error
                ? "Search isn't working right now. Try again."
                : query
                  ? `No clients match "${query}".`
                  : "No clients yet. Add one from the Dashboard."}
            </CommandEmpty>
          )}
          {results.length > 0 && (
            <CommandGroup heading={query ? "Matches" : "Clients"}>
              {results.map((client) => (
                <CommandItem
                  key={client.id}
                  value={client.id}
                  onSelect={() => select(client.slug)}
                  className="gap-3"
                >
                  <Building2 className="text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{client.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {client.location}
                    </span>
                  </span>
                  <HealthDot health={client.health} />
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
