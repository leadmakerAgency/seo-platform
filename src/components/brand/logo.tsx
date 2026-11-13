import Image from "next/image"

import { cn } from "@/lib/utils"
import mark from "./shockwave-mark.png"

/** The Shockwave lightning mark on its own (sidebar collapsed, small spaces). */
export function ShockwaveMark({ className }: { className?: string }) {
  return (
    <Image
      src={mark}
      alt=""
      aria-hidden
      priority
      className={cn("h-7 w-auto shrink-0 select-none", className)}
    />
  )
}

/** Shockwave wordmark: the lightning mark with the product name beside it. */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="grid size-7 shrink-0 place-items-center">
        <ShockwaveMark />
      </span>
      {compact ? (
        <span className="sr-only">Shockwave</span>
      ) : (
        <span className="flex min-w-0 flex-col leading-none">
          <span className="truncate text-[14px] font-semibold tracking-tight">Shockwave</span>
          <span className="truncate text-[11px] text-muted-foreground">SEO Platform</span>
        </span>
      )}
    </span>
  )
}
