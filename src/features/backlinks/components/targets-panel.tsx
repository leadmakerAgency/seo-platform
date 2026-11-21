"use client"

import { Check, Circle, Loader2, MapPin, Plus, Trash2 } from "lucide-react"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { CountryPicker } from "@/components/common/country-picker"
import { StatusTag } from "@/components/common/status"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { countryName } from "@/lib/countries"
import { formatNumber, formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  addTarget,
  removeTarget,
  searchTargetLocations,
  updateTarget,
  type LocationOption,
} from "../actions"
import type { Reach } from "../brief"
import type { Target } from "../queries"

const KIND_LABEL: Record<Target["kind"], string> = { city: "City", region: "Region", country: "Country" }

/**
 * "Where the client wants to be found": the places every Backlinks tab searches from, step 2 of
 * the backlink setup sheet. Each one is a DataForSEO location (so searches run from there) with
 * editable search words.
 */
export function TargetsPanel({
  clientId,
  targets,
  defaultCountry,
  suggestions,
  canEdit,
  nowIso,
  needs,
  reach,
  heading = true,
}: {
  clientId: string
  targets: Target[]
  defaultCountry: string
  /** The client's city and service areas, offered as quick searches when nothing is added. */
  suggestions: string[]
  canEdit: boolean
  nowIso: string
  /** What the brief needs from the places (a live checklist above the list). */
  needs?: { label: string; done: boolean }[]
  /** The brief's reach, to warn before removing the last place it needs. */
  reach?: Reach[]
  heading?: boolean
}) {
  const now = new Date(nowIso)
  const active = targets.filter((t) => t.active)
  const lockNote = (t: Target) => {
    if (!reach || !t.active) return null
    const others = active.filter((x) => x.id !== t.id)
    if (t.kind === "country" && reach.some((r) => r !== "local") && !others.some((x) => x.kind === "country")) {
      return "This is the only country, and the brief has national or global customers. The backlink tabs lock until another country is added."
    }
    if (t.kind !== "country" && reach.includes("local") && !others.some((x) => x.kind !== "country")) {
      return "This is the only city or region, and the brief has local customers. The backlink tabs lock until another one is added."
    }
    return null
  }
  return (
    <section className="flex flex-col gap-3" aria-labelledby={heading ? "targets-title" : undefined} aria-label={heading ? undefined : "Places"}>
      {heading && (
        <div className="flex flex-col gap-0.5">
          <h2 id="targets-title" className="text-[15px] leading-[22px] font-semibold">
            Where the client wants to be found
          </h2>
          <p className="max-w-[72ch] text-sm text-muted-foreground">
            Every Backlinks tab searches from these places. Add every city, region or country where the client
            wants customers. The client&apos;s own address doesn&apos;t matter here.
          </p>
        </div>
      )}

      {needs && needs.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 px-3 py-2.5">
          <p className="text-xs font-medium text-muted-foreground">This brief needs</p>
          <ul className="flex flex-col gap-1">
            {needs.map((n) => (
              <li key={n.label} className={cn("flex items-center gap-2 text-sm", n.done ? "text-foreground" : "text-warning")}>
                {n.done ? (
                  <Check className="size-3.5 shrink-0 text-success" strokeWidth={3} aria-hidden />
                ) : (
                  <Circle className="size-3.5 shrink-0" aria-hidden />
                )}
                {n.label}
                <span className="sr-only">{n.done ? "(done)" : "(missing)"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border bg-card">
        {targets.length > 0 ? (
          <ul className="divide-y">
            {targets.map((t) => (
              <TargetRow key={t.id} target={t} canEdit={canEdit} now={now} lockNote={lockNote(t)} />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            No places yet. Add the first one below.
          </p>
        )}
        {canEdit && (
          <AddTarget
            clientId={clientId}
            defaultCountry={defaultCountry}
            suggestions={targets.length === 0 ? suggestions : []}
          />
        )}
      </div>
    </section>
  )
}

function TargetRow({
  target: t,
  canEdit,
  now,
  lockNote,
}: {
  target: Target
  canEdit: boolean
  now: Date
  lockNote: string | null
}) {
  const [words, setWords] = useState(t.searchName)
  const [pending, startTransition] = useTransition()

  function save(patch: { searchName?: string; active?: boolean }) {
    startTransition(async () => {
      const r = await updateTarget(t.id, patch)
      if (!r.ok) {
        toast.error(r.error)
        setWords(t.searchName)
      }
    })
  }

  return (
    <li className={cn("grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_260px_auto] md:items-center", !t.active && "opacity-60")}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="font-medium">{t.label}</span>
          <StatusTag tone="neutral" dot={false}>
            {KIND_LABEL[t.kind]}
          </StatusTag>
          {!t.active && <span className="text-xs text-muted-foreground">Off: not searched</span>}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t.lastSearchedAt
            ? `Searched ${formatRelative(t.lastSearchedAt, now)} · ${formatNumber(t.places)} ${t.places === 1 ? "place" : "places"} found`
            : "Not searched yet"}
        </span>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Search words
        {canEdit ? (
          <Input
            value={words}
            maxLength={100}
            disabled={pending}
            onChange={(e) => setWords(e.target.value)}
            onBlur={() => words.trim().toLowerCase() !== t.searchName && save({ searchName: words })}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            aria-label={`Search words for ${t.label}`}
            className="h-8 text-sm text-foreground"
          />
        ) : (
          <span className="text-sm text-foreground">{t.searchName}</span>
        )}
      </label>
      {canEdit && (
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={t.active}
              disabled={pending}
              onCheckedChange={(v) => save({ active: Boolean(v) })}
            />
            On
          </label>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${t.label}`} disabled={pending}>
                <Trash2 />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {t.label}?</AlertDialogTitle>
                <AlertDialogDescription>
                  It won&apos;t be searched any more. Places already found for it stay in the list.
                  To pause it instead, untick On.
                </AlertDialogDescription>
                {lockNote && (
                  <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-foreground">
                    {lockNote}
                  </p>
                )}
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() =>
                    startTransition(async () => {
                      const r = await removeTarget(t.id)
                      if (!r.ok) toast.error(r.error)
                    })
                  }
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </li>
  )
}

function AddTarget({
  clientId,
  defaultCountry,
  suggestions,
}: {
  clientId: string
  defaultCountry: string
  suggestions: string[]
}) {
  const [country, setCountry] = useState(defaultCountry)
  const [query, setQuery] = useState("")
  const [options, setOptions] = useState<LocationOption[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searching, startSearch] = useTransition()
  const [adding, startAdd] = useTransition()
  const timer = useRef<number | undefined>(undefined)

  const typed = query.trim().length >= 2

  useEffect(() => {
    window.clearTimeout(timer.current)
    if (query.trim().length < 2) return
    timer.current = window.setTimeout(() => {
      startSearch(async () => {
        const r = await searchTargetLocations(country, query)
        if (!r.ok) {
          setError(r.error)
          setOptions([])
        } else {
          setError(null)
          setOptions(r.options)
        }
      })
    }, 250)
    return () => window.clearTimeout(timer.current)
  }, [country, query])

  const addWholeCountry = () =>
    startAdd(async () => {
      const r = await searchTargetLocations(country, "")
      const whole = r.ok ? r.options.find((o) => o.kind === "country") : null
      if (!r.ok) return void toast.error(r.error)
      if (!whole) return void toast.error(`${countryName(country)} isn't in DataForSEO's list.`)
      const added = await addTarget(clientId, whole.code)
      if (!added.ok) toast.error(added.error)
      else toast.success(`${whole.label} added`)
    })

  const add = (o: LocationOption) =>
    startAdd(async () => {
      const r = await addTarget(clientId, o.code)
      if (!r.ok) toast.error(r.error)
      else {
        toast.success(`${o.label} added`)
        setQuery("")
      }
    })

  return (
    <div className="flex flex-col gap-3 border-t bg-muted/30 px-4 py-3">
      <p className="text-sm font-medium">Add a place</p>
      <div className="grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)]">
        <CountryPicker id="target-country" value={country} onChange={(c) => c && setCountry(c)} />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`City, state or region in ${countryName(country)}`}
          aria-label="Search for a place"
          autoComplete="off"
        />
      </div>
      <div>
        <Button type="button" variant="outline" size="sm" disabled={adding} onClick={addWholeCountry}>
          <Plus /> All of {countryName(country)}
        </Button>
      </div>
      {suggestions.length > 0 && !query && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          From the client&apos;s details:
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQuery(s)}
              className="rounded-sm bg-brand-soft px-2 py-0.5 text-brand hover:underline"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-[13px] text-danger">{error}</p>}
      {typed && searching && (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Looking up places in {countryName(country)} (the first time takes a few seconds)…
        </p>
      )}
      {typed && !searching && (
        options && (
          <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-lg border bg-card">
            {options.length === 0 && !error && (
              <li className="px-3 py-2 text-[13px] text-muted-foreground">
                No places found. Try another spelling.
              </li>
            )}
            {options.map((o) => (
              <li key={o.code}>
                <button
                  type="button"
                  disabled={adding}
                  onClick={() => add(o)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60 disabled:opacity-50"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Plus className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">{o.name.split(",").join(", ")}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{o.type ?? KIND_LABEL[o.kind]}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}
