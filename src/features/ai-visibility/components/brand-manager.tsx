"use client"

import { Check, Loader2, Pencil, Plus, X } from "@/components/icons"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { reviewSuggestion, saveBrand } from "../actions"
import { findName } from "../analysis"
import type { AivBrand, AivSuggestion } from "../queries"
import { BrandDot } from "./bits"

/** Tracked brands (the client and competitors), the brand form with a match tester, and suggestions. */
export function BrandManager({ clientId, brands, suggestions, canManage }: { clientId: string; brands: AivBrand[]; suggestions: AivSuggestion[]; canManage: boolean }) {
  const [editing, setEditing] = useState<AivBrand | "new" | null>(null)
  const [pending, start] = useTransition()
  const active = brands.filter((b) => b.active)
  const off = brands.filter((b) => !b.active)
  const brandSuggestions = suggestions.filter((s) => s.kind === "brand")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {active.length - 1} competitors tracked (12 at most). Names are matched as whole words; add every way the brand is written.
        </p>
        {canManage && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> Add competitor
          </Button>
        )}
      </div>
      <ul className="grid gap-2 md:grid-cols-2">
        {active.map((b) => (
          <li key={b.id} className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-2 text-sm font-medium">
                <BrandDot slot={b.colorSlot} /> {b.name}
                {b.isOwn && <span className="rounded-sm bg-brand-soft px-1.5 py-0.5 text-xs text-brand">The client</span>}
              </span>
              <span className="text-xs text-muted-foreground">Matches: {b.trackedNames.join(", ")}{b.pattern ? ` · pattern ${b.pattern}` : ""}</span>
              {b.domains.length > 0 && <span className="text-xs text-muted-foreground">Sites: {b.domains.join(", ")}</span>}
            </div>
            {canManage && (
              <Button size="icon-sm" variant="ghost" aria-label={`Edit ${b.name}`} onClick={() => setEditing(b)}>
                <Pencil />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {off.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Turned off: {off.map((b, i) => (
            <span key={b.id}>
              {i > 0 && ", "}
              {canManage ? (
                <button type="button" className="underline hover:text-foreground" onClick={() => setEditing(b)}>{b.name}</button>
              ) : (
                b.name
              )}
            </span>
          ))}
        </p>
      )}

      {brandSuggestions.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border bg-card p-3">
          <h3 className="text-sm font-semibold">Named in answers but not tracked</h3>
          <ul className="flex flex-col divide-y">
            {brandSuggestions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {String(s.payload.display_name ?? "")} <span className="text-xs text-muted-foreground">· {s.reason}</span>
                </span>
                {canManage && (
                  <span className="flex gap-1">
                    <Button size="xs" disabled={pending} onClick={() => start(async () => {
                      const r = await reviewSuggestion(s.id, true)
                      if (!r.ok) toast.error(r.error)
                      else toast.success("Tracked from the next check")
                    })}>
                      <Check /> Track
                    </Button>
                    <Button size="xs" variant="ghost" disabled={pending} onClick={() => start(async () => {
                      const r = await reviewSuggestion(s.id, false)
                      if (!r.ok) toast.error(r.error)
                    })}>
                      <X /> Not a competitor
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <BrandDialog clientId={clientId} brand={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function BrandDialog({ clientId, brand, onClose }: { clientId: string; brand: AivBrand | "new" | null; onClose: () => void }) {
  const b = brand && brand !== "new" ? brand : null
  return (
    <Dialog open={brand !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {brand !== null && <BrandForm key={b?.id ?? "new"} clientId={clientId} brand={b} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function BrandForm({ clientId, brand, onClose }: { clientId: string; brand: AivBrand | null; onClose: () => void }) {
  const [name, setName] = useState(brand?.name ?? "")
  const [names, setNames] = useState((brand?.trackedNames ?? []).join(", "))
  const [domains, setDomains] = useState((brand?.domains ?? []).join(", "))
  const [pattern, setPattern] = useState(brand?.pattern ?? "")
  const [active, setActive] = useState(brand?.active ?? true)
  const [sample, setSample] = useState("")
  const [pending, start] = useTransition()
  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean)
  const tested = sample.trim()
    ? [...list(names), name].some((n) => findName(sample, n) >= 0) ||
      (() => {
        try {
          return pattern ? new RegExp(pattern, "iu").test(sample) : false
        } catch {
          return false
        }
      })()
    : null

  return (
    <>
      <DialogHeader>
        <DialogTitle>{brand ? `Edit ${brand.name}` : "Add a competitor"}</DialogTitle>
        <DialogDescription>Use the shortest unique name (“HubSpot”, not “hubspot.com” or “HubSpot UK”). Add other spellings as extra names.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Other names to match <span className="text-xs text-muted-foreground">comma separated</span>
          <Input value={names} onChange={(e) => setNames(e.target.value)} placeholder="Acme, Acme Studio" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Websites <span className="text-xs text-muted-foreground">comma separated; marks their pages in the sources</span>
          <Input value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="acme.com" />
        </label>
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">Advanced: a pattern</summary>
          <Input className="mt-2" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="acme\s*(web|studio)" maxLength={200} />
        </details>
        <label className="flex flex-col gap-1 text-sm">
          Test <span className="text-xs text-muted-foreground">paste a sentence to see if it matches</span>
          <Input value={sample} onChange={(e) => setSample(e.target.value)} />
          {tested !== null && <span className="text-xs">{tested ? "Matches" : "No match"}</span>}
        </label>
        {brand && !brand.isOwn && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Tracked
          </label>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          disabled={!name.trim() || pending}
          onClick={() =>
            start(async () => {
              const r = await saveBrand(clientId, { id: brand?.id, displayName: name, trackedNames: [name, ...list(names)], pattern, domains: list(domains), active })
              if (!r.ok) return void toast.error(r.error)
              toast.success("Saved. Counts from the next check.")
              onClose()
            })
          }
        >
          {pending && <Loader2 className="animate-spin" />} Save
        </Button>
      </DialogFooter>
    </>
  )
}
