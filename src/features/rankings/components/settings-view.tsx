"use client"

import { MapPin, X } from "@/components/icons"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Tables } from "@/lib/supabase/database.types"
import { formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import { searchLocations, updateBudget, updateRankSettings, type LocationOption } from "../actions"
import { ENGINE_META, ENGINES, WEEKDAYS, type Engine } from "../constants"
import type { BudgetStatus } from "../queries"
import { formatUsd } from "./bits"

/** The Settings tab (admins and account managers). */
export function SettingsView({
  clientId,
  settings,
  countryIso,
  budget,
  nowIso,
}: {
  clientId: string
  settings: Tables<"rank_settings">
  countryIso: string
  /** Admins only. */
  budget: BudgetStatus | null
  nowIso: string
}) {
  return (
    <div className="flex flex-col gap-8">
      <LocationCard clientId={clientId} settings={settings} countryIso={countryIso} />
      <ScheduleCard clientId={clientId} settings={settings} />
      <TermsCard clientId={clientId} settings={settings} />
      <MapsCard clientId={clientId} settings={settings} />
      {budget && <BudgetCard budget={budget} nowIso={nowIso} />}
    </div>
  )
}

function Card({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <p className="max-w-[72ch] text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

function LocationCard({
  clientId,
  settings,
  countryIso,
}: {
  clientId: string
  settings: Tables<"rank_settings">
  countryIso: string
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<LocationOption[]>([])
  const [searching, startSearch] = useTransition()
  const [saving, startSave] = useTransition()
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    window.clearTimeout(timer.current)
    if (query.trim().length < 2) return
    timer.current = window.setTimeout(() => {
      startSearch(async () => setResults(await searchLocations(query, countryIso)))
    }, 250)
    return () => window.clearTimeout(timer.current)
  }, [query, countryIso])

  const pick = (o: LocationOption) =>
    startSave(async () => {
      const r = await updateRankSettings(clientId, { location_code: o.code })
      if (!r.ok) return void toast.error(r.error)
      toast.success(`Checking from ${o.name.split(",")[0]}`)
      setQuery("")
      setResults([])
    })

  return (
    <Card
      title="Where we search from"
      description="Google and Maps results depend on where the searcher is, so every check runs as a phone in this place. Use the client's own city."
    >
      <div className="flex items-center gap-2 text-sm">
        <MapPin className="size-4 text-muted-foreground" aria-hidden />
        {settings.location_name ? (
          <span>
            <span className="font-medium">{settings.location_name.split(",").join(", ")}</span>
            <span className="text-muted-foreground"> · mobile · English</span>
          </span>
        ) : (
          <span className="text-warning">Not set. Checks wait until a location is picked.</span>
        )}
      </div>
      <Field className="max-w-md">
        <FieldLabel htmlFor="loc-search">Change location</FieldLabel>
        <Input
          id="loc-search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (e.target.value.trim().length < 2) setResults([])
          }}
          placeholder="Start typing a city, e.g. Phoenix"
          autoComplete="off"
        />
        <FieldDescription>
          {searching
            ? "Searching…"
            : query.trim().length >= 2 && results.length === 0
              ? "No places found. The list may still be downloading; try again in a minute."
              : "Cities, counties and regions in the client's country."}
        </FieldDescription>
      </Field>
      {results.length > 0 && (
        <ul className="flex max-w-md flex-col divide-y rounded-lg border">
          {results.map((o) => (
            <li key={o.code}>
              <button
                type="button"
                disabled={saving}
                onClick={() => pick(o)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60 disabled:opacity-50"
              >
                <span>{o.name.split(",").join(", ")}</span>
                <span className="text-xs text-muted-foreground">{o.type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function ScheduleCard({ clientId, settings }: { clientId: string; settings: Tables<"rank_settings"> }) {
  const [engines, setEngines] = useState<Engine[]>(settings.engines)
  const [weekday, setWeekday] = useState(String(settings.check_weekday))
  const [paused, setPaused] = useState(settings.paused)
  const [pending, startTransition] = useTransition()
  const dirty =
    engines.slice().sort().join() !== settings.engines.slice().sort().join() ||
    Number(weekday) !== settings.check_weekday ||
    paused !== settings.paused

  return (
    <Card
      title="What we check, and when"
      description="Each engine costs about $0.006 per keyword per week for Google and Bing, and less for Maps. Checks run early in the morning, Phoenix time."
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Search engines</legend>
        {ENGINES.map((e) => (
          <Label key={e} className="flex items-center gap-2 font-normal">
            <Checkbox
              checked={engines.includes(e)}
              onCheckedChange={(v) => setEngines((list) => (v ? [...new Set([...list, e])] : list.filter((x) => x !== e)))}
            />
            {ENGINE_META[e].label}
            <span className="text-muted-foreground">({ENGINE_META[e].depthLabel})</span>
          </Label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-end gap-6">
        <Field className="w-48">
          <FieldLabel htmlFor="rs-day">Weekly check on</FieldLabel>
          <Select value={weekday} onValueChange={setWeekday}>
            <SelectTrigger id="rs-day" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((d, i) => (
                <SelectItem key={d} value={String(i)}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Label className="flex h-8 items-center gap-2 font-normal">
          <Checkbox checked={paused} onCheckedChange={(v) => setPaused(Boolean(v))} />
          Pause weekly checks
        </Label>
      </div>
      <div>
        <Button
          disabled={!dirty || pending || engines.length === 0}
          onClick={() =>
            startTransition(async () => {
              const r = await updateRankSettings(clientId, { engines, check_weekday: Number(weekday), paused })
              if (!r.ok) toast.error(r.error)
              else toast.success("Saved")
            })
          }
        >
          Save
        </Button>
        {engines.length === 0 && <span className="ml-3 text-[13px] text-danger">Check at least one search engine.</span>}
      </div>
    </Card>
  )
}

function TermsCard({ clientId, settings }: { clientId: string; settings: Tables<"rank_settings"> }) {
  const [topics, setTopics] = useState(settings.topic_terms)
  const [negatives, setNegatives] = useState(settings.negative_terms)
  const [pending, startTransition] = useTransition()
  const dirty = topics.join("|") !== settings.topic_terms.join("|") || negatives.join("|") !== settings.negative_terms.join("|")

  return (
    <Card
      title="What counts as relevant"
      description="Keyword research keeps a keyword only if it mentions one of the services and none of the words to leave out. Filled from the client's services and categories."
    >
      <Chips label="Services and topics" values={topics} onChange={setTopics} placeholder="air duct cleaning" />
      <Chips label="Leave out keywords with" values={negatives} onChange={setNegatives} placeholder="jobs" tone="muted" />
      <div>
        <Button
          disabled={!dirty || pending}
          onClick={() =>
            startTransition(async () => {
              const r = await updateRankSettings(clientId, { topic_terms: topics, negative_terms: negatives })
              if (!r.ok) toast.error(r.error)
              else toast.success("Saved. The next research run uses these.")
            })
          }
        >
          Save
        </Button>
      </div>
    </Card>
  )
}

function Chips({
  label,
  values,
  onChange,
  placeholder,
  tone = "brand",
}: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
  placeholder: string
  tone?: "brand" | "muted"
}) {
  const [draft, setDraft] = useState("")
  const id = `chips-${label.replace(/\W+/g, "-").toLowerCase()}`
  const add = () => {
    const next = draft
      .split(",")
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, " "))
      .filter((t) => t && t.length <= 120 && !values.includes(t))
    if (next.length) onChange([...values, ...next].slice(0, 50))
    setDraft("")
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className={cn(
              "inline-flex h-[24px] items-center gap-1 rounded-sm pr-1 pl-2 text-xs",
              tone === "brand" ? "bg-brand-soft text-brand" : "bg-muted text-muted-foreground",
            )}
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="rounded-sm p-0.5 hover:bg-background/60"
              aria-label={`Remove ${v}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {values.length === 0 && <span className="text-[13px] text-muted-foreground">None yet.</span>}
      </div>
      <div className="flex max-w-md gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add()
            }
          }}
          placeholder={placeholder}
        />
        <Button type="button" variant="outline" onClick={add} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
    </div>
  )
}

function MapsCard({ clientId, settings }: { clientId: string; settings: Tables<"rank_settings"> }) {
  const [pending, startTransition] = useTransition()
  const matched = Boolean(settings.maps_place_id || settings.maps_cid)
  return (
    <Card
      title="The business on Google Maps"
      description="Maps results are matched to the client's Google Business Profile. The first check that finds it by website remembers it, so later checks match it exactly."
    >
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        {matched ? (
          <span>
            <span className="font-medium">{settings.maps_name || "Matched"}</span>
            <span className="text-muted-foreground">
              {settings.maps_place_id ? ` · place ID ${settings.maps_place_id}` : settings.maps_cid ? ` · CID ${settings.maps_cid}` : ""}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">Not matched yet. Matched by website on the next check.</span>
        )}
        {matched && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await updateRankSettings(clientId, { maps_place_id: null })
                if (!r.ok) toast.error(r.error)
                else toast.success("Cleared. The next check matches it again by website.")
              })
            }
          >
            Wrong business? Clear it
          </Button>
        )}
      </div>
    </Card>
  )
}

function BudgetCard({ budget, nowIso }: { budget: BudgetStatus; nowIso: string }) {
  const [monthly, setMonthly] = useState(String(budget.budget))
  const [runs, setRuns] = useState(String(budget.research_runs_per_client_month))
  const [low, setLow] = useState(String(budget.low_balance))
  const [pending, startTransition] = useTransition()
  const share = budget.budget > 0 ? Math.min(100, (budget.spent / budget.budget) * 100) : 100

  return (
    <Card
      title="DataForSEO budget"
      description="Admins only. Shared by every client. When this month's spend reaches the budget, new checks and research wait until next month or until the budget is raised."
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Spent this month</dt>
          <dd className={cn("font-heading text-xl font-semibold tabular-nums", budget.over_budget && "text-danger")}>
            {formatUsd(budget.spent)}
            <span className="text-sm font-normal text-muted-foreground"> of {formatUsd(budget.budget, 0)}</span>
          </dd>
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className={cn("h-full", budget.over_budget ? "bg-danger-dot" : share > 90 ? "bg-warning-dot" : "bg-primary")} style={{ width: `${share}%` }} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Account balance</dt>
          <dd className={cn("font-heading text-xl font-semibold tabular-nums", budget.balance !== null && budget.balance < budget.low_balance && "text-warning")}>
            {budget.balance !== null ? formatUsd(budget.balance) : "—"}
          </dd>
          <span className="text-xs text-muted-foreground">
            {budget.balance_at ? `Checked ${formatRelative(budget.balance_at, new Date(nowIso))}` : "Checked once a day"}
          </span>
        </div>
      </dl>
      <div className="grid max-w-2xl gap-4 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="b-month">Monthly budget ($)</FieldLabel>
          <Input id="b-month" type="number" min={0} step={5} inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} className="tabular-nums" />
        </Field>
        <Field>
          <FieldLabel htmlFor="b-runs">Research runs per client a month</FieldLabel>
          <Input id="b-runs" type="number" min={0} max={50} inputMode="numeric" value={runs} onChange={(e) => setRuns(e.target.value)} className="tabular-nums" />
        </Field>
        <Field>
          <FieldLabel htmlFor="b-low">Warn when balance is under ($)</FieldLabel>
          <Input id="b-low" type="number" min={0} inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} className="tabular-nums" />
        </Field>
      </div>
      <div>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await updateBudget({
                monthly_budget_usd: Number(monthly),
                research_runs_per_client_month: Number(runs),
                low_balance_usd: Number(low),
              })
              if (!r.ok) toast.error(r.error)
              else toast.success("Budget saved")
            })
          }
        >
          Save budget
        </Button>
      </div>
    </Card>
  )
}
