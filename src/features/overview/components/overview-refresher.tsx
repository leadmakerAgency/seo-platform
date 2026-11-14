"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/**
 * Quietly re-renders the page every minute while it's visible, so ticks made on
 * other pages (or by other people) show up without a reload.
 */
export function OverviewRefresher({ every = 60_000 }: { every?: number }) {
  const router = useRouter()
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh()
    }
    const timer = window.setInterval(tick, every)
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [router, every])
  return null
}
