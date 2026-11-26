"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { ChipsInput } from "@/components/common/chips-input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { saveScanSettings } from "../actions"
import type { ScanOverview } from "../scan-queries"

/** Rankings → Settings → Ranking scan (monthly scans, Search Console site, country, brand terms). */
export function ScanSettings({
  clientId,
  overview,
  countryName,
  connectionsHref,
}: {
  clientId: string
  overview: ScanOverview
  countryName: string
  connectionsHref: string
}) {
  const s = overview.settings
  const [auto, setAuto] = useState(s?.scanAuto ?? true)
  const [site, setSite] = useState(s?.gscAccountId ?? overview.gscAccounts[0]?.id ?? "")
  const [countryOnly, setCountryOnly] = useState(s?.gscCountryOnly ?? true)
  const [brand, setBrand] = useState<string[]>(s?.brandTerms ?? [])
  const [pending, start] = useTransition()
  if (!s) return null

  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[15px] font-semibold">Ranking scan</h2>
        <p className="text-sm text-muted-foreground">
          What the client already ranks for, from DataForSEO, Search Console and the Business Profile (Rankings → Ranking now).
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={auto} onCheckedChange={(v) => setAuto(Boolean(v))} />
        Scan automatically once a month
      </label>
      <div className="flex flex-col gap-1.5">
        <Label>Search Console site</Label>
        {overview.gscAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not connected.{" "}
            <Link href={connectionsHref} className="font-medium text-brand hover:underline">
              Connect it in Connections
            </Link>{" "}
            for the most complete scan.
          </p>
        ) : overview.gscAccounts.length === 1 ? (
          <p className="text-sm">{overview.gscAccounts[0].site}</p>
        ) : (
          <Select value={site} onValueChange={setSite}>
            <SelectTrigger className="w-full sm:w-[360px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {overview.gscAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.site}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={countryOnly} onCheckedChange={(v) => setCountryOnly(Boolean(v))} />
        Only Search Console searches from {countryName}
      </label>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brand-terms">Brand terms</Label>
        <ChipsInput id="brand-terms" values={brand} onChange={setBrand} max={20} maxLength={60} placeholder="Other names people use for the business" />
        <p className="text-xs text-muted-foreground">
          Searches with these are marked Brand. The website&apos;s name and the client&apos;s name are always used.
        </p>
      </div>
      <div>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveScanSettings(clientId, {
                scanAuto: auto,
                gscCountryOnly: countryOnly,
                brandTerms: brand,
                ...(overview.gscAccounts.length > 1 ? { gscAccountId: site || null } : {}),
              })
              if (r.ok) toast.success("Scan settings saved")
              else toast.error(r.error)
            })
          }
        >
          Save scan settings
        </Button>
      </div>
    </section>
  )
}
