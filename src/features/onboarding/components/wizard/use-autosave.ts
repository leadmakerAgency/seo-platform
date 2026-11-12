"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { StepStatuses } from "../../constants"

export type SaveState = "idle" | "saving" | "saved" | "error"

type SaveResult =
  | { ok: true; data: { steps: StepStatuses } }
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>> }

const DEBOUNCE_MS = 800
const RETRY_MS = [2000, 5000, 10000, 20000]

/**
 * Saves changed fields shortly after typing stops (or at once on blur).
 * Pending changes are merged, so nothing is lost while a save is in flight.
 * Transient failures retry with backoff; validation errors are shown on the
 * field and not retried. Leaving the page with unsaved changes asks first.
 */
export function useAutosave<P extends Record<string, unknown>>(
  save: (patch: P) => Promise<SaveResult>,
  onSaved: (steps: StepStatuses) => void,
) {
  const [state, setState] = useState<SaveState>("idle")
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})
  const [message, setMessage] = useState<string | null>(null)
  const pending = useRef<Partial<P>>({})
  const timer = useRef<number | null>(null)
  const inFlight = useRef(false)
  const attempt = useRef(0)
  const saveRef = useRef(save)
  const onSavedRef = useRef(onSaved)
  const flushRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    saveRef.current = save
    onSavedRef.current = onSaved
  })

  /** Run the flush after `ms` (replaces any earlier timer). */
  const schedule = useCallback((ms: number) => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flushRef.current(), ms)
  }, [])

  const flush = useCallback(async () => {
    if (timer.current) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    if (inFlight.current || Object.keys(pending.current).length === 0) return
    const batch = pending.current
    pending.current = {}
    inFlight.current = true
    setState("saving")
    let result: SaveResult
    try {
      result = await saveRef.current(batch as P)
    } catch {
      result = { ok: false, error: "No connection. We'll keep trying." }
    }
    inFlight.current = false
    const morePending = () => Object.keys(pending.current).length > 0

    if (result.ok) {
      attempt.current = 0
      setMessage(null)
      onSavedRef.current(result.data.steps)
      setState(morePending() ? "saving" : "saved")
      if (morePending()) schedule(0)
      return
    }

    if (result.fieldErrors && Object.keys(result.fieldErrors).length) {
      // A bad value: show it on the field; keep the rest of the batch.
      const bad = result.fieldErrors
      setErrors((e) => ({ ...e, ...bad }))
      const rest = Object.fromEntries(Object.entries(batch).filter(([k]) => !(k in bad))) as Partial<P>
      pending.current = { ...rest, ...pending.current }
      setState("error")
      setMessage(result.error)
      if (morePending()) schedule(DEBOUNCE_MS)
      return
    }

    // Transient: put the batch back (newer edits win) and retry with backoff.
    pending.current = { ...batch, ...pending.current }
    setState("error")
    setMessage(result.error)
    schedule(RETRY_MS[Math.min(attempt.current, RETRY_MS.length - 1)])
    attempt.current++
  }, [schedule])

  useEffect(() => {
    flushRef.current = flush
  }, [flush])

  /** Queue changed fields; `now` saves immediately (blur, toggles, selects). */
  const queue = useCallback(
    (patch: Partial<P>, now = false) => {
      pending.current = { ...pending.current, ...patch }
      setErrors((e) => {
        const next = { ...e }
        for (const k of Object.keys(patch)) delete next[k]
        return next
      })
      setState("saving")
      schedule(now ? 0 : DEBOUNCE_MS)
    },
    [schedule],
  )

  // Ask before leaving with unsaved changes; save when the tab is hidden.
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length || inFlight.current) e.preventDefault()
    }
    const hidden = () => {
      if (document.visibilityState === "hidden") void flushRef.current()
    }
    window.addEventListener("beforeunload", beforeUnload)
    document.addEventListener("visibilitychange", hidden)
    return () => {
      window.removeEventListener("beforeunload", beforeUnload)
      document.removeEventListener("visibilitychange", hidden)
    }
  }, [])

  return { queue, flush, state, errors, message }
}
