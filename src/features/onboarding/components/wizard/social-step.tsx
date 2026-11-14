"use client"

import { CircleCheck, Loader2, Plug, TriangleAlert } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { PlatformMark } from "@/components/brand/platform-icons"
import { Button } from "@/components/ui/button"
import { PLATFORM_META, PLATFORMS, type SocialPlatform } from "@/features/connections/constants"
import { cn } from "@/lib/utils"
import type { StepStatuses } from "../../constants"
import type { OnboardingData } from "../../public"
import { setNotUsing, startOnboardingConnect } from "../../public-actions"

const CLIENT_HELP: Partial<Record<SocialPlatform, string>> = {
  googlebusiness:
    "Your listing on Google Search and Maps. Sign in with the Google account that owns it, keep every box ticked, then pick your location.",
  facebook: "Sign in as someone who manages your business Page, then pick the Page.",
  instagram: "Needs an Instagram Business or Creator account.",
  youtube: "In Google's account chooser, pick your business channel.",
}

export function SocialStep({
  token,
  accounts,
  notUsing: initialNotUsing,
  connectReady,
  onSteps,
}: {
  token: string
  accounts: OnboardingData["accounts"]
  notUsing: SocialPlatform[]
  connectReady: boolean
  onSteps: (s: StepStatuses) => void
}) {
  const [notUsing, setNotUsingState] = useState<Set<SocialPlatform>>(() => new Set(initialNotUsing))
  const [busy, setBusy] = useState<SocialPlatform | "rest" | null>(null)
  const [, startTransition] = useTransition()

  const connected = new Map<SocialPlatform, OnboardingData["accounts"]>()
  for (const a of accounts) connected.set(a.platform, [...(connected.get(a.platform) ?? []), a])
  const remaining = PLATFORMS.filter((p) => !connected.has(p) && !notUsing.has(p))

  function connect(platform: SocialPlatform) {
    setBusy(platform)
    startTransition(async () => {
      const r = await startOnboardingConnect(token, platform)
      if (!r.ok) {
        setBusy(null)
        toast.error(r.error)
        return
      }
      window.location.assign(r.data.url)
    })
  }

  function toggleNotUsing(
    platforms: SocialPlatform[],
    value: boolean,
    key: SocialPlatform | "rest",
  ) {
    setBusy(key)
    startTransition(async () => {
      const r = await setNotUsing(token, platforms, value)
      setBusy(null)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setNotUsingState((s) => {
        const next = new Set(s)
        for (const p of platforms) {
          if (value) next.add(p)
          else next.delete(p)
        }
        return next
      })
      onSteps(r.data.steps)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-[15px] text-muted-foreground">
        Connecting lets us post updates, reply to reviews and report results for you. You sign in on
        Google or Facebook yourself; we never see your password, and you can remove our access at
        any time.
      </p>
      {!connectReady && (
        <p className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-[15px]">
          Connecting is being set up on our side. You can continue with the other steps, and
          we&apos;ll let you know when it&apos;s ready.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {PLATFORMS.map((platform) => {
          const meta = PLATFORM_META[platform]
          const mine = connected.get(platform) ?? []
          const skipped = notUsing.has(platform)
          const broken = mine.some((a) => a.status === "needs_reconnect")
          return (
            <li
              key={platform}
              className={cn(
                "flex flex-col gap-3 rounded-lg border bg-card p-4",
                platform === "googlebusiness" && "border-foreground/20",
                skipped && "bg-muted/40",
              )}
            >
              <div className="flex items-start gap-3">
                <PlatformMark platform={platform} className="size-10" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">
                    {meta.label}
                    {platform === "googlebusiness" && (
                      <span className="ml-2 rounded-sm bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-brand">
                        Most important
                      </span>
                    )}
                  </span>
                  {mine.length > 0 ? (
                    <span className="flex flex-col text-sm">
                      {mine.map((a, i) => (
                        <span
                          key={i}
                          className={cn(
                            "flex items-center gap-1.5",
                            broken ? "text-warning" : "text-success",
                          )}
                        >
                          {a.status === "needs_reconnect" ? (
                            <TriangleAlert className="size-4" aria-hidden />
                          ) : (
                            <CircleCheck className="size-4" aria-hidden />
                          )}
                          {a.name ?? "Connected"}
                          {a.status === "needs_reconnect" ? " needs reconnecting" : ""}
                        </span>
                      ))}
                    </span>
                  ) : skipped ? (
                    <span className="text-sm text-muted-foreground">You don&apos;t use this.</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {CLIENT_HELP[platform] ?? meta.help}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 sm:pl-[52px]">
                {!skipped && (
                  <Button
                    size="lg"
                    className="h-11"
                    variant={mine.length ? "outline" : "default"}
                    disabled={!connectReady || busy !== null}
                    onClick={() => connect(platform)}
                  >
                    {busy === platform ? <Loader2 className="animate-spin" /> : <Plug />}
                    {busy === platform
                      ? "Opening sign-in…"
                      : broken
                        ? "Reconnect"
                        : mine.length
                          ? "Connect another"
                          : `Connect ${meta.label}`}
                  </Button>
                )}
                {mine.length === 0 && (
                  <Button
                    size="lg"
                    variant="ghost"
                    className="h-11"
                    disabled={busy !== null}
                    onClick={() => toggleNotUsing([platform], !skipped, platform)}
                  >
                    {skipped ? "Actually, we use this" : "We don't use this"}
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {remaining.length > 1 && (
        <Button
          variant="outline"
          size="lg"
          className="h-11 w-full sm:w-fit"
          disabled={busy !== null}
          onClick={() => toggleNotUsing(remaining, true, "rest")}
        >
          {busy === "rest" && <Loader2 className="animate-spin" />}
          We don&apos;t use the {remaining.length} not connected yet
        </Button>
      )}
    </div>
  )
}
