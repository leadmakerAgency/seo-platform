"use client"

import { useState } from "react"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  WEBSITE_MANAGERS,
  WEBSITE_PLATFORMS,
  type StepStatuses,
  type WebsiteAccessStatus,
  type WebsiteManager,
  type WebsitePlatform,
} from "../../constants"
import type { OnboardingData } from "../../public"
import { saveWebsite } from "../../public-actions"
import type { WebsitePatchInput } from "../../schemas"
import { ChoiceButtons, Field, inputClass, SaveIndicator, selectClass } from "./fields"
import { useAutosave } from "./use-autosave"

const INSTRUCTIONS: Partial<Record<WebsitePlatform, (email: string) => string[]>> = {
  wordpress: (email) => [
    "Log in to your WordPress dashboard (yoursite.com/wp-admin).",
    "Go to Users, then “Add New User”.",
    `Enter ${email} as the email and choose the role “Administrator”.`,
    "Click “Add New User”.",
  ],
  wix: (email) => [
    "Open your site's dashboard on Wix.",
    "Go to Settings, then “Roles & Permissions”, then “Invite People”.",
    `Enter ${email} and choose “Admin (Co-Owner)” or “Website Manager”.`,
    "Click “Send Invite”.",
  ],
  squarespace: (email) => [
    "Open your site in Squarespace.",
    "Go to Settings, then “Permissions & Ownership”, then “Invite contributor”.",
    `Enter ${email} and choose “Administrator” or “Website Editor”.`,
    "Click “Invite”.",
  ],
  shopify: (email) => [
    "Open your Shopify admin.",
    "Go to Settings, then “Users and permissions”, then “Add staff”.",
    `Enter ${email}, allow Online Store and Content, and send the invite.`,
  ],
  webflow: (email) => [
    "Open your Webflow dashboard.",
    "Open your Workspace settings, then “Members”, then “Invite”.",
    `Enter ${email} and choose “Editor” or “Designer” for your site.`,
  ],
  godaddy: (email) => [
    "Log in to GoDaddy and open “Account Settings”, then “Delegate Access”.",
    `Click “Invite to Access”, enter ${email}, and choose “Products and Domains”.`,
  ],
}

type Values = {
  platform: WebsitePlatform | ""
  url: string
  managed_by: WebsiteManager | ""
  developer_name: string
  developer_email: string
  access_status: WebsiteAccessStatus
  notes: string
}

export function WebsiteStep({
  token,
  website,
  agencyEmail,
  readOnly,
  onSteps,
  onGoToLogins,
}: {
  token: string
  website: OnboardingData["website"]
  agencyEmail: string
  readOnly: boolean
  onSteps: (s: StepStatuses) => void
  onGoToLogins: () => void
}) {
  const [v, setV] = useState<Values>({
    platform: website?.platform ?? "",
    url: website?.url ?? "",
    managed_by: website?.managed_by ?? "",
    developer_name: website?.developer_name ?? "",
    developer_email: website?.developer_email ?? "",
    access_status: website?.access_status ?? "todo",
    notes: website?.notes ?? "",
  })
  const save = useAutosave<WebsitePatchInput>((patch) => saveWebsite(token, patch), onSteps)
  const err = save.errors

  const set = <K extends keyof Values>(key: K, value: Values[K], now = true) => {
    setV((s) => ({ ...s, [key]: value }))
    save.queue({ [key]: value } as WebsitePatchInput, now)
  }
  const steps = v.platform ? INSTRUCTIONS[v.platform]?.(agencyEmail) : undefined
  const noSite = v.platform === "none"

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-end">
        <SaveIndicator state={save.state} message={save.message} />
      </div>

      <Field id="w-platform" label="What is your website built with?">
        <select
          id="w-platform"
          className={selectClass}
          disabled={readOnly}
          value={v.platform}
          onChange={(e) => set("platform", e.target.value as WebsitePlatform)}
        >
          <option value="">Choose…</option>
          {WEBSITE_PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>

      {!noSite && v.platform && (
        <>
          <Field id="w-url" label="Website address" error={err.url}>
            <Input
              id="w-url"
              value={v.url}
              disabled={readOnly}
              inputMode="url"
              placeholder="example.com"
              onChange={(e) => set("url", e.target.value, false)}
              onBlur={() => void save.flush()}
              className={inputClass}
            />
          </Field>

          <Field id="w-managed" label="Who looks after your website?">
            <select
              id="w-managed"
              className={selectClass}
              disabled={readOnly}
              value={v.managed_by}
              onChange={(e) => set("managed_by", e.target.value as WebsiteManager)}
            >
              <option value="">Choose…</option>
              {WEBSITE_MANAGERS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>

          {(v.managed_by === "developer" || v.managed_by === "agency") && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="w-dev-name"
                label="Their name or company"
                optional
                error={err.developer_name}
              >
                <Input
                  id="w-dev-name"
                  value={v.developer_name}
                  disabled={readOnly}
                  onChange={(e) => set("developer_name", e.target.value, false)}
                  onBlur={() => void save.flush()}
                  className={inputClass}
                />
              </Field>
              <Field id="w-dev-email" label="Their email" optional error={err.developer_email}>
                <Input
                  id="w-dev-email"
                  type="email"
                  value={v.developer_email}
                  disabled={readOnly}
                  onChange={(e) => set("developer_email", e.target.value, false)}
                  onBlur={() => void save.flush()}
                  className={inputClass}
                />
              </Field>
            </div>
          )}

          <section className="flex flex-col gap-4 rounded-xl border p-4">
            <h3 className="text-lg font-semibold tracking-tight">Give us access</h3>
            {steps ? (
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
            ) : (
              <p className="text-[15px] text-muted-foreground">
                Invite <strong className="font-medium text-foreground">{agencyEmail}</strong> as an
                administrator or editor, or share a login on the next step. If someone else built
                your site, you can also forward this to them.
              </p>
            )}
            <ChoiceButtons
              label="Website access"
              value={v.access_status === "todo" ? null : v.access_status}
              options={[
                { value: "invited_us", label: "I've invited you" },
                { value: "login_in_vault", label: "I'll share a login instead" },
                { value: "later", label: "Later / I need help" },
              ]}
              onChange={(s) => {
                if (readOnly) return
                set("access_status", s)
                if (s === "login_in_vault") onGoToLogins()
              }}
            />
          </section>
        </>
      )}

      <Field
        id="w-notes"
        label="Anything we should know about your website?"
        optional
        error={err.notes}
      >
        <Textarea
          id="w-notes"
          rows={3}
          value={v.notes}
          disabled={readOnly}
          maxLength={1000}
          onChange={(e) => set("notes", e.target.value, false)}
          onBlur={() => void save.flush()}
          className="text-base"
        />
      </Field>
    </div>
  )
}
