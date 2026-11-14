"use client"

import { Check, Copy, ExternalLink } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { GOOGLE_ACCESS_OPTIONS, type GoogleAccessStatus, type StepStatuses } from "../../constants"
import type { OnboardingData } from "../../public"
import { saveGoogleAccess } from "../../public-actions"
import type { GooglePatchInput } from "../../schemas"
import { ChoiceButtons, Field, inputClass, SaveIndicator } from "./fields"
import { useAutosave } from "./use-autosave"

type Values = {
  sc_status: GoogleAccessStatus
  sc_property: string
  ga4_status: GoogleAccessStatus
  ga4_property: string
}

export function GoogleStep({
  token,
  google,
  reportingEmail,
  readOnly,
  onSteps,
}: {
  token: string
  google: OnboardingData["google"]
  reportingEmail: string | null
  readOnly: boolean
  onSteps: (s: StepStatuses) => void
}) {
  const [v, setV] = useState<Values>({
    sc_status: google?.sc_status ?? "todo",
    sc_property: google?.sc_property ?? "",
    ga4_status: google?.ga4_status ?? "todo",
    ga4_property: google?.ga4_property ?? "",
  })
  const save = useAutosave<GooglePatchInput>((patch) => saveGoogleAccess(token, patch), onSteps)

  const set = <K extends keyof Values>(key: K, value: Values[K], now = true) => {
    setV((s) => ({ ...s, [key]: value }))
    save.queue({ [key]: value } as GooglePatchInput, now)
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-[15px] text-muted-foreground">
          Search Console and Google Analytics show how people find and use your website. Adding our
          reporting account as a <strong className="font-medium text-foreground">viewer</strong>{" "}
          lets us include that in your monthly report. It can only read, never change anything.
        </p>
        <SaveIndicator state={save.state} message={save.message} />
      </div>

      <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4">
        <span className="text-sm text-muted-foreground">The email to add</span>
        {reportingEmail ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md bg-background px-2.5 py-1.5 font-mono text-[15px] break-all">
              {reportingEmail}
            </code>
            <CopyEmail email={reportingEmail} />
          </div>
        ) : (
          <p className="text-[15px]">
            Your LeadMaker contact will send you this email. You can skip this step for now and come
            back with the same link.
          </p>
        )}
      </div>

      <Block
        title="Google Search Console"
        href="https://search.google.com/search-console/users"
        steps={[
          "Open Search Console and pick your website at the top left.",
          "Go to Settings, then “Users and permissions”, then “Add user”.",
          "Paste the email above and choose “Restricted”.",
          "Click “Add”.",
        ]}
      >
        <ChoiceButtons
          label="Search Console"
          value={v.sc_status === "todo" ? null : v.sc_status}
          options={GOOGLE_ACCESS_OPTIONS}
          onChange={(s) => !readOnly && set("sc_status", s)}
        />
        <Field
          id="g-sc"
          label="Your website as shown in Search Console"
          optional
          error={save.errors.sc_property}
        >
          <Input
            id="g-sc"
            value={v.sc_property}
            disabled={readOnly}
            placeholder="https://www.example.com/"
            onChange={(e) => set("sc_property", e.target.value, false)}
            onBlur={() => void save.flush()}
            className={inputClass}
          />
        </Field>
      </Block>

      <Block
        title="Google Analytics (GA4)"
        href="https://analytics.google.com/analytics/web/"
        steps={[
          "Open Google Analytics and click Admin (the gear, bottom left).",
          "Under Property, open “Property access management”.",
          "Click “+”, then “Add users”.",
          "Paste the email above, choose the “Viewer” role and click “Add”.",
        ]}
      >
        <ChoiceButtons
          label="Google Analytics"
          value={v.ga4_status === "todo" ? null : v.ga4_status}
          options={GOOGLE_ACCESS_OPTIONS}
          onChange={(s) => !readOnly && set("ga4_status", s)}
        />
        <Field id="g-ga4" label="Property name or ID" optional error={save.errors.ga4_property}>
          <Input
            id="g-ga4"
            value={v.ga4_property}
            disabled={readOnly}
            placeholder="King Air website – GA4"
            onChange={(e) => set("ga4_property", e.target.value, false)}
            onBlur={() => void save.flush()}
            className={inputClass}
          />
        </Field>
      </Block>
    </div>
  )
}

function Block({
  title,
  href,
  steps,
  children,
}: {
  title: string
  href: string
  steps: string[]
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <Button asChild variant="outline" size="sm">
          <a href={href} target="_blank" rel="noreferrer noopener">
            Open {title.split(" (")[0]}
            <ExternalLink />
          </a>
        </Button>
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium">
              {i + 1}
            </span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
      {children}
    </section>
  )
}

function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(email)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 2000)
        } catch {
          toast.error("Couldn't copy. Select the email and copy it instead.")
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : "Copy"}
    </Button>
  )
}
