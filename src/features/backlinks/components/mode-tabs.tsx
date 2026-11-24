import { Hand, Lock, Search, type IconComponent } from "@/components/icons"
import Link from "next/link"

import { ShockwaveMark } from "@/components/brand/logo"
import { cn } from "@/lib/utils"

/**
 * The three ways to find backlinks for a client, at the top of the Backlinks page (?mode=…).
 * They switch the whole page, so they are a mode switcher, not small tabs: the large size of the
 * segmented-tabs pattern (docs/design-system.md, "Mode switcher"). A tinted track holds three
 * equal segments; the active one is a solid ink card (a raised segment with a violet top edge in
 * dark mode). Server-rendered links, so each mode has its own URL and the back button works.
 */

export const MODES = ["standard", "ai", "manual"] as const
export type Mode = (typeof MODES)[number]

export const isMode = (v: unknown): v is Mode =>
  typeof v === "string" && (MODES as readonly string[]).includes(v)

export const MODE_META: Record<
  Mode,
  { label: string; short: string; caption: string; soon?: boolean }
> = {
  standard: {
    label: "Standard Search",
    short: "Standard",
    caption: "Searches built from the brief and your places",
  },
  ai: {
    label: "Shockwave AI Search",
    short: "Shockwave AI",
    caption: "AI finds and vets places for the client",
  },
  manual: {
    label: "Manual Search",
    short: "Manual",
    caption: "Pick trusted sites and track every listing to Live",
  },
}

const ICONS: Record<Exclude<Mode, "ai">, IconComponent> = { standard: Search, manual: Hand }

/** Link to a mode; Standard Search keeps the plain page URL. */
export const modeHref = (base: string, mode: Mode) =>
  mode === "standard" ? base : `${base}?mode=${mode}`

/** Icons stand on their own (no tile). The AI mode uses the Shockwave bolt, in colour when active. */
function ModeIcon({ mode, active }: { mode: Mode; active: boolean }) {
  if (mode === "ai") {
    return (
      <ShockwaveMark
        className={cn(
          "h-6 transition-[filter,opacity]",
          !active &&
            "opacity-60 grayscale group-hover/mode:opacity-100 group-hover/mode:grayscale-0",
        )}
      />
    )
  }
  const Icon = ICONS[mode]
  return <Icon aria-hidden className="size-6 shrink-0" />
}

/** `locked`: the backlink setup isn't complete, so the modes show a lock and can't be opened. */
export function ModeTabs({
  base,
  mode,
  locked = false,
}: {
  base: string
  mode: Mode
  locked?: boolean
}) {
  return (
    <nav aria-label="How to find backlinks" className={cn(locked && "select-none")}>
      <ul className="grid grid-cols-3 gap-1 rounded-xl border bg-muted/70 p-1">
        {MODES.map((m) => {
          const meta = MODE_META[m]
          const active = m === mode && !locked
          const className = cn(
            "group/mode relative flex h-full flex-col items-center gap-2 rounded-lg px-2 py-3 text-center outline-none transition-colors",
            "sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-3.5 sm:text-left",
            "focus-visible:ring-2 focus-visible:ring-ring/50",
            active
              ? cn(
                  "bg-foreground text-background",
                  // Dark: a white block on graphite is too loud; raise the segment instead.
                  "dark:bg-card dark:text-foreground dark:ring-1 dark:ring-input",
                  "dark:before:absolute dark:before:inset-x-4 dark:before:top-0 dark:before:h-0.5 dark:before:rounded-full dark:before:bg-primary",
                )
              : cn(
                  "text-muted-foreground",
                  locked ? "cursor-not-allowed opacity-60" : "hover:bg-card hover:text-foreground",
                ),
          )
          const inner = (
            <>
              <ModeIcon mode={m} active={active} />
              <span className="flex min-w-0 flex-col items-center gap-0.5 sm:items-start">
                <span className="flex items-center gap-1.5 font-heading text-[13px] leading-5 font-semibold sm:text-[15px]">
                  <span className="sm:hidden">{meta.short}</span>
                  <span className="hidden truncate sm:inline">{meta.label}</span>
                  {locked && <Lock className="size-3.5 shrink-0" aria-hidden />}
                </span>
                <span
                  className={cn(
                    "hidden text-xs leading-4 text-pretty md:block",
                    active
                      ? "text-background/70 dark:text-muted-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {meta.caption}
                </span>
              </span>
            </>
          )
          return (
            <li key={m} className="min-w-0">
              {locked ? (
                <span
                  role="link"
                  aria-disabled="true"
                  title="Finish the backlink setup first"
                  className={className}
                >
                  {inner}
                  <span className="sr-only"> (locked: finish the backlink setup first)</span>
                </span>
              ) : (
                <Link
                  href={modeHref(base, m)}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={className}
                >
                  {inner}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
