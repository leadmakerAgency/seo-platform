import { ArrowRight, Hand } from "@/components/icons"
import Link from "next/link"

import { ShockwaveMark } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { MODE_META, type Mode } from "./mode-tabs"

/** The empty Shockwave AI Search and Manual Search tabs, until they're built. */
export function ModePlaceholder({ mode, standardHref }: { mode: Exclude<Mode, "standard">; standardHref: string }) {
  const meta = MODE_META[mode]
  return (
    <div className="relative overflow-hidden rounded-xl border border-dashed bg-card">
      {/* Faint dot grid: an empty canvas waiting to be filled. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
      />
      <div className="relative flex flex-col items-center gap-4 px-6 py-14 text-center">
        {mode === "ai" ? (
          <span className="flex size-12 items-center justify-center rounded-xl border bg-card shadow-xs">
            <ShockwaveMark className="h-7" />
          </span>
        ) : (
          <Hand className="icon-duo size-10" aria-hidden />
        )}
        <div className="flex max-w-md flex-col gap-1.5">
          <h2 className="text-[15px] leading-[22px] font-semibold">{meta.label} is on its way</h2>
          <p className="text-sm text-muted-foreground">
            {mode === "ai"
              ? "Shockwave's own AI search will find and vet places for this client. It's being built next; until then, Standard Search does the finding."
              : "A place to add, track and follow up on backlinks the team finds by hand. It's being built next; until then, Standard Search does the finding."}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={standardHref} scroll={false}>
            Go to Standard Search
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  )
}
