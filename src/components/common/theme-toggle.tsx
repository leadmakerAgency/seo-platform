"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * Switches light <-> dark. Both icons are rendered and CSS picks one from the
 * `.dark` class, so the server HTML and the first client render match.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const toggle = () => setTheme(resolvedTheme === "dark" ? "light" : "dark")

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label="Switch light or dark theme"
        >
          <Moon className="dark:hidden" />
          <Sun className="hidden dark:block" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <span className="dark:hidden">Dark theme</span>
        <span className="hidden dark:inline">Light theme</span>
      </TooltipContent>
    </Tooltip>
  )
}
