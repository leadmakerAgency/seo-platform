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
  /** The Ctrl/Cmd+K client switcher. */
  switcherOpen: boolean
  setSwitcherOpen: (open: boolean) => void
}

const ShellContext = createContext<ShellState | null>(null)

export function ShellProvider({ children }: { children: ReactNode }) {
  const [currentClient, setCurrentClient] = useState<CurrentClient | null>(null)
  const [switcherOpen, setSwitcherOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setSwitcherOpen((open) => !open)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const value = useMemo(
    () => ({ currentClient, setCurrentClient, switcherOpen, setSwitcherOpen }),
    [currentClient, switcherOpen],
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
