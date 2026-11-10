import { cn } from "@/lib/utils"

/** LeadMaker wordmark: a flat violet tile with the product name beside it. */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-[13px] font-semibold tracking-tight text-primary-foreground"
      >
        LM
      </span>
      {!compact && (
        <span className="flex min-w-0 flex-col leading-none">
          <span className="truncate text-[14px] font-semibold tracking-tight">LeadMaker</span>
          <span className="truncate text-[11px] text-muted-foreground">SEO Platform</span>
        </span>
      )}
    </span>
  )
}
