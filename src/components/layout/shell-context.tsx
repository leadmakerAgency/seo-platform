"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import type { ClientHealth } from "@/features/clients/constants"

export type CurrentClient = {
  id: string
  slug: string
  name: string
  location: string
  health: ClientHealth
}

type ShellState = {
  /** The client the user is working on; drives the client nav in the sidebar. */
  currentClient: CurrentClient | null
  setCurrentClient: (client: CurrentClient | null) => void
  /**
   * Set when something asks for the sidebar's client search (Ctrl/Cmd+K, "Find a client").
   * The search box focuses itself and clears it, even if it only mounts afterwards
   * (the mobile sidebar is a sheet that renders when opened).
   */
  searchFocusRequested: boolean
  setSearchFocusRequested: (requested: boolean) => void
}

const ShellContext = createContext<ShellState | null>(null)

export function ShellProvider({ children }: { children: ReactNode }) {
  const [currentClient, setCurrentClient] = useState<CurrentClient | null>(null)
  const [searchFocusRequested, setSearchFocusRequested] = useState(false)

  const value = useMemo(
    () => ({ currentClient, setCurrentClient, searchFocusRequested, setSearchFocusRequested }),
    [currentClient, searchFocusRequested],
  )
  return <ShellContext value={value}>{children}</ShellContext>
}

export function useShell() {
  const value = useContext(ShellContext)
  if (!value) throw new Error("useShell must be used inside <ShellProvider>.")
  return value
}

/** Rendered by client pages to tell the shell which client is open. */
export function SetCurrentClient({ client }: { client: CurrentClient }) {
  const { setCurrentClient } = useShell()
  useEffect(() => {
    setCurrentClient(client)
  }, [client, setCurrentClient])
  return null
}
