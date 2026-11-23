"use client"

import { Check, Loader2 } from "@/components/icons"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { ChipsInput } from "@/components/common/chips-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { saveProject, updateSettings, type ProjectInput } from "../actions"
import { AIV_MODELS, FREQUENCIES, FREQUENCY_LABEL, MODEL_META, planAiVisibility, WEEKDAYS } from "../config"
import type { AivBrand, AivProject } from "../queries"
import { MODEL_ICON } from "./bits"

export function SettingsForm({
  clientId,
  project,
  own,
  prompts,
  placeCountries,
  canManage,
  canFrequency,
}: {
  clientId: string
  project: AivProject
  own: AivBrand | null
  prompts: number
  placeCountries: string[]
  canManage: boolean
  canFrequency: boolean
}) {
  const [v, setV] = useState<ProjectInput>({
    brandName: project.brandName,
    description: project.description ?? "",
    industry: project.industry ?? "",
    personas: project.personas,
    brandIdentity: project.brandIdentity,
    models: project.models,
    countries: project.countries,
    frequency: project.frequency,
    runWeekday: project.runWeekday,
    paused: project.paused,
    ownNames: own?.trackedNames ?? [project.brandName],
    ownDomains: own?.domains ?? [],
  })
  const [pending, start] = useTransition()
  const set = <K extends keyof ProjectInput>(k: K, value: ProjectInput[K]) => setV((p) => ({ ...p, [k]: value }))
  const plan = planAiVisibility({ prompts, models: v.models })
  const disabled = !canManage || pending
  const countryOptions = [...new Set([...placeCountries, ...v.countries])]

  return (
    <div className="flex flex-col gap-8">
      <section className="flex max-w-3xl flex-col gap-4">
        <h2 className="text-[15px] font-semibold">The client</h2>
        <label className="flex flex-col gap-1 text-sm">
          Brand name
          <Input value={v.brandName} onChange={(e) => set("brandName", e.target.value)} maxLength={80} disabled={disabled} />
        </label>
        <div className="flex flex-col gap-1 text-sm">
          Other names AI might use
          <ChipsInput id="aiv-own-names" values={v.ownNames} onChange={(x) => set("ownNames", x)} max={10} maxLength={60} placeholder="Short name, misspellings" />
        </div>
        <div className="flex flex-col gap-1 text-sm">
          Client websites
          <ChipsInput id="aiv-own-domains" values={v.ownDomains} onChange={(x) => set("ownDomains", x)} max={10} maxLength={120} placeholder="example.com" />
        </div>
        <label className="flex flex-col gap-1 text-sm">
          What the client does <span className="text-xs text-muted-foreground">used when reading answers and suggesting questions</span>
          <Textarea rows={3} value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={600} disabled={disabled} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Industry
            <Input value={v.industry} onChange={(e) => set("industry", e.target.value)} maxLength={80} disabled={disabled} />
          </label>
          <div className="flex flex-col gap-1 text-sm">
            Who buys
            <ChipsInput id="aiv-personas" values={v.personas} onChange={(x) => set("personas", x)} max={8} maxLength={80} placeholder="Homeowners in Phoenix" />
          </div>
        </div>
      </section>

      <section className="flex max-w-3xl flex-col gap-3">
        <h2 className="text-[15px] font-semibold">Platforms</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {AIV_MODELS.map((m) => {
            const on = v.models.includes(m)
            const Icon = MODEL_ICON[m]
            return (
              <button
                key={m}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={disabled}
                onClick={() => set("models", on ? v.models.filter((x) => x !== m) : [...v.models, m])}
                className={cn("flex gap-2.5 rounded-lg border bg-card p-3 text-left transition-colors disabled:opacity-60", on ? "border-primary bg-brand-soft" : "hover:bg-muted/50")}
              >
                <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background")}>
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium"><Icon className="size-3.5 text-muted-foreground" aria-hidden />{MODEL_META[m].label}</span>
                  <span className="text-xs text-muted-foreground">{MODEL_META[m].note}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="flex max-w-3xl flex-col gap-3">
        <h2 className="text-[15px] font-semibold">Countries</h2>
        <p className="text-sm text-muted-foreground">Up to 3. Each question is asked as if from one of them. Taken from the Backlinks places.</p>
        <div className="flex flex-wrap gap-2">
          {countryOptions.map((c) => {
            const on = v.countries.includes(c)
            return (
              <button key={c} type="button" aria-pressed={on} disabled={disabled || (!on && v.countries.length >= 3)}
                onClick={() => set("countries", on ? v.countries.filter((x) => x !== c) : [...v.countries, c])}
                className={cn("rounded-md border px-3 py-1.5 text-sm disabled:opacity-50", on ? "border-primary bg-brand-soft" : "bg-card hover:bg-muted/50")}>
                {c}
              </button>
            )
          })}
          <Input
            className="h-9 w-24"
            placeholder="Add (US)"
            maxLength={2}
            disabled={disabled || v.countries.length >= 3}
            onKeyDown={(e) => {
              const val = (e.target as HTMLInputElement).value.toUpperCase()
              if (e.key === "Enter" && /^[A-Z]{2}$/.test(val) && !v.countries.includes(val)) {
                e.preventDefault()
                set("countries", [...v.countries, val])
                ;(e.target as HTMLInputElement).value = ""
              }
            }}
          />
        </div>
      </section>

      <section className="flex max-w-3xl flex-col gap-3">
        <h2 className="text-[15px] font-semibold">Schedule</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            How often
            <select value={v.frequency} disabled={disabled} onChange={(e) => set("frequency", e.target.value as ProjectInput["frequency"])} className="h-9 rounded-md border bg-card px-2">
              {FREQUENCIES.map((f) => (
                <option key={f} value={f} disabled={f !== "weekly" && !canFrequency}>
                  {FREQUENCY_LABEL[f]}{f !== "weekly" && !canFrequency ? " (admins)" : ""}
                </option>
              ))}
            </select>
          </label>
          {v.frequency === "weekly" && (
            <label className="flex flex-col gap-1 text-sm">
              Day
              <select value={v.runWeekday} disabled={disabled} onChange={(e) => set("runWeekday", Number(e.target.value))} className="h-9 rounded-md border bg-card px-2">
                {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={v.paused} disabled={disabled} onChange={(e) => set("paused", e.target.checked)} /> Paused
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Checks run at 6:00 Phoenix time{project.nextRunAt && !v.paused ? `; next on ${new Date(project.nextRunAt).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "America/Phoenix" })}` : ""}.
        </p>
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          {prompts} questions × {v.models.length} platforms = {plan.answers} answers per check · about <span className="font-medium tabular-nums">${plan.estimateUsd.toFixed(2)}</span> a check ·
          about <span className="font-medium tabular-nums">${plan.perMonth[v.frequency].toFixed(2)}</span> a month {FREQUENCY_LABEL[v.frequency].toLowerCase()}.
        </div>
      </section>

      {canManage && (
        <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background px-4 py-3 md:-mx-8 md:px-8">
          <Button
            disabled={pending || !v.brandName.trim() || !v.models.length || !v.countries.length}
            onClick={() =>
              start(async () => {
                const r = await saveProject(clientId, v)
                if (!r.ok) return void toast.error(r.error)
                toast.success("Saved")
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />} Save settings
          </Button>
        </div>
      )}
    </div>
  )
}

export function BudgetForm({ monthlyBudget, maxRun, manualRuns, monthSpend }: { monthlyBudget: number; maxRun: number; manualRuns: number; monthSpend: number }) {
  const [b, setB] = useState(String(monthlyBudget))
  const [m, setM] = useState(String(maxRun))
  const [r, setR] = useState(String(manualRuns))
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground tabular-nums">
        This month: ${monthSpend.toFixed(2)} of ${monthlyBudget.toFixed(2)} across all clients (DataForSEO and Claude).
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Monthly budget ($)
          <Input value={b} onChange={(e) => setB(e.target.value)} inputMode="decimal" className="w-32" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Most for one check ($)
          <Input value={m} onChange={(e) => setM(e.target.value)} inputMode="decimal" className="w-32" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Manual checks per client a month
          <Input value={r} onChange={(e) => setR(e.target.value)} inputMode="numeric" className="w-32" />
        </label>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await updateSettings({ monthlyBudgetUsd: Number(b), maxRunUsd: Number(m), manualRuns: Number(r) })
              if (!res.ok) return void toast.error(res.error)
              toast.success("Budgets saved")
            })
          }
        >
          {pending && <Loader2 className="animate-spin" />} Save budgets
        </Button>
      </div>
    </div>
  )
}

