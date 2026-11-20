import { Hand, Search, type LucideIcon } from "lucide-react"
import Link from "next/link"

import { ShockwaveMark } from "@/components/brand/logo"
import { cn } from "@/lib/utils"

/**
 * The three ways to find backlinks for a client, as tabs at the top of the Backlinks page
 * (?mode=…). Standard Search is everything built so far; the other two are being built.
 * Server-rendered links, so each mode has its own URL and the back button works.
 */

export const MODES = ["standard", "ai", "manual"] as const
export type Mode = (typeof MODES)[number]

export const isMode = (v: unknown): v is Mode => typeof v === "string" && (MODES as readonly string[]).includes(v)

export const MODE_META: Record<Mode, { label: string; short: string; caption: string; soon?: boolean }> = {
  standard: { label: "Standard Search", short: "Standard", caption: "Searches built from the brief and your places" },
  ai: { label: "Shockwave AI Search", short: "Shockwave AI", caption: "AI finds and vets places for the client" },
  manual: { label: "Manual Search", short: "Manual", caption: "Pick trusted sites and track every listing to Live" },
}

const ICONS: Record<Exclude<Mode, "ai">, LucideIcon> = { standard: Search, manual: Hand }

/** Link to a mode; Standard Search keeps the plain page URL. */
export const modeHref = (base: string, mode: Mode) => (mode === "standard" ? base : `${base}?mode=${mode}`)

function ModeIcon({ mode, active }: { mode: Mode; active: boolean }) {
  if (mode === "ai") {
    return (
      <span
        aria-hidden
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
          active
            ? "border-brand/25 bg-gradient-to-br from-brand-soft to-info-soft"
            : "border-border bg-card group-hover/mode:border-brand/20",
        )}
      >
        <ShockwaveMark className={cn("h-5 transition-[filter,opacity]", !active && "opacity-70 grayscale group-hover/mode:opacity-100 group-hover/mode:grayscale-0")} />
      </span>
    )
  }
  const Icon = ICONS[mode]
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
        active ? "border-brand/25 bg-brand-soft text-brand" : "border-border bg-card text-muted-foreground group-hover/mode:text-foreground",
      )}
    >
      <Icon className="size-4" />
    </span>
  )
}

export function ModeTabs({ base, mode }: { base: string; mode: Mode }) {
  return (
    <nav aria-label="How to find backlinks" className="-mt-3 border-b">
      {/* Phones: three equal columns, icon over a short name. Wider: icon beside the full name. */}
      <ul className="-mb-px grid grid-cols-3 gap-1 sm:flex sm:gap-2 sm:overflow-x-auto sm:[scrollbar-width:none]">
        {MODES.map((m) => {
          const meta = MODE_META[m]
          const active = m === mode
          return (
            <li key={m} className="min-w-0 sm:shrink-0">
              <Link
                href={modeHref(base, m)}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group/mode relative flex flex-col items-center gap-1.5 rounded-t-lg px-1 pt-2 pb-3 text-center outline-none",
                  "sm:flex-row sm:gap-2.5 sm:px-3 sm:text-left",
                  "focus-visible:ring-2 focus-visible:ring-ring/35",
                  // Active underline, drawn under the tab and over the bar's border.
                  "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors",
                  active ? "after:bg-primary" : "after:bg-transparent hover:after:bg-border",
                )}
              >
                <ModeIcon mode={m} active={active} />
                <span className="flex min-w-0 flex-col items-center sm:items-start">
                  <span
                    className={cn(
                      "flex items-center gap-1.5 text-xs whitespace-nowrap sm:text-sm",
                      active ? "font-semibold text-foreground" : "font-medium text-muted-foreground group-hover/mode:text-foreground",
                    )}
                  >
                    <span className="sm:hidden">{meta.short}</span>
                    <span className="hidden sm:inline">{meta.label}</span>
                    {meta.soon && (
                      <span className="hidden rounded-[4px] border border-dashed px-1 py-px text-[10px] leading-none font-medium tracking-wide text-muted-foreground uppercase sm:inline">
                        Soon
                      </span>
                    )}
                  </span>
                  <span className="hidden text-xs whitespace-nowrap text-muted-foreground xl:block">{meta.caption}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
