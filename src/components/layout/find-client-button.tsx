"use client"

import { Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useShell } from "./shell-context"

export function FindClientButton() {
  const { setSwitcherOpen } = useShell()
  return (
    <Button variant="outline" onClick={() => setSwitcherOpen(true)}>
      <Search />
      Find a client
    </Button>
  )
}
