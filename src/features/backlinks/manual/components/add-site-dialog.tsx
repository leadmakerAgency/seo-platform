"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { DIRECTORY_TYPES, TYPE_LABELS, type DirectoryType } from "../../constants"
import { siteKeyOf, displayHost } from "../../site-key"
import { addManualSite } from "../actions"

/** Add a site a VA found by hand: it goes straight onto the work list (approved). */
export function AddSiteDialog({
  clientId,
  open,
  onOpenChange,
  onAdded,
}: {
  clientId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded?: (submissionId: string | null) => void
}) {
  const [url, setUrl] = useState("")
  const [name, setName] = useState("")
  const [type, setType] = useState<DirectoryType>("business_directory")
  const [cost, setCost] = useState<"free" | "paid" | "unknown">("unknown")
  const [note, setNote] = useState("")
  const [suggest, setSuggest] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})
  const [pending, startTransition] = useTransition()

  const key = useMemo(() => {
    const raw = url.trim()
    if (!raw) return null
    return siteKeyOf(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  }, [url])

  function reset() {
    setUrl("")
    setName("")
    setType("business_directory")
    setCost("unknown")
    setNote("")
    setSuggest(false)
    setErrors({})
  }

  function submit() {
    setErrors({})
    startTransition(async () => {
      const r = await addManualSite(clientId, {
        url,
        name: name || (key ? displayHost(key.siteKey) : ""),
        type,
        costType: cost,
        note,
        suggest,
      })
      if (!r.ok) {
        setErrors(r.fieldErrors ?? { form: r.error })
        if (!r.fieldErrors) toast.error(r.error)
        return
      }
      toast.success(
        r.data.result === "already"
          ? "Already on the work list."
          : suggest
            ? "Added. A manager will review it for the catalog."
            : "Added to the work list.",
      )
      reset()
      onOpenChange(false)
      onAdded?.(r.data.submissionId)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a site by hand</DialogTitle>
          <DialogDescription>
            A site you found yourself. It goes onto this client&apos;s work list, approved.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field data-invalid={Boolean(errors.url) || undefined}>
            <FieldLabel htmlFor="add-url">Website or listing page</FieldLabel>
            <Input
              id="add-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.example.com/add-your-business"
              autoFocus
            />
            {key ? (
              <FieldDescription>Saved as {displayHost(key.siteKey)}</FieldDescription>
            ) : url.trim() ? (
              <FieldDescription>
                That doesn&apos;t look like a website address yet.
              </FieldDescription>
            ) : null}
            {errors.url && <FieldError>{errors.url}</FieldError>}
          </Field>
          <Field data-invalid={Boolean(errors.name) || undefined}>
            <FieldLabel htmlFor="add-name">Site name</FieldLabel>
            <Input
              id="add-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={key ? displayHost(key.siteKey) : "Peoria Business Directory"}
              maxLength={120}
            />
            {errors.name && <FieldError>{errors.name}</FieldError>}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Kind of site</FieldLabel>
              <Select value={type} onValueChange={(v) => setType(v as DirectoryType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIRECTORY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Cost</FieldLabel>
              <Select value={cost} onValueChange={(v) => setCost(v as typeof cost)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="unknown">Not sure</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="add-note">Note (optional)</FieldLabel>
            <Textarea
              id="add-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Why it's a good fit, how to submit"
            />
          </Field>
          <div className="flex items-start gap-2">
            <Checkbox
              id="add-suggest"
              checked={suggest}
              onCheckedChange={(v) => setSuggest(v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="add-suggest" className="flex flex-col items-start gap-0.5 font-normal">
              <span className="text-sm">Suggest this site for the catalog</span>
              <span className="text-xs text-muted-foreground">
                A manager reviews it; once accepted, every client can pick it.
              </span>
            </Label>
          </div>
          {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !key}>
            {pending ? "Adding…" : "Add to the work list"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
