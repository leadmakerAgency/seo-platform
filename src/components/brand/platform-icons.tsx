import type { SocialPlatform } from "@/features/connections/constants"
import { PLATFORM_META } from "@/features/connections/constants"
import { cn } from "@/lib/utils"

const MARKS: Record<SocialPlatform, string> = {
  googlebusiness: "G",
  facebook: "f",
  instagram: "IG",
  linkedin: "in",
  youtube: "YT",
  twitter: "X",
  tiktok: "TT",
  pinterest: "P",
  threads: "@",
}

/** A flat tile in the platform's colour with its short mark (no third-party logos). */
export function PlatformMark({
  platform,
  className,
}: {
  platform: SocialPlatform
  className?: string
}) {
  return (
    <span
      aria-hidden
      style={{ backgroundColor: PLATFORM_META[platform].color }}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-lg text-[13px] font-semibold tracking-tight text-white",
        className,
      )}
    >
      {MARKS[platform]}
    </span>
  )
}
