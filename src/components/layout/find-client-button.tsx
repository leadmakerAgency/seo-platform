"use client"

import { Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useOpenClientSearch } from "./client-search"

/** Focuses the client search in the sidebar. */
export function FindClientButton() {
  const openSearch = useOpenClientSearch()
  return (
    <Button variant="outline" onClick={openSearch}>
      <Search />
      Find a client
    </Button>
  )
}
