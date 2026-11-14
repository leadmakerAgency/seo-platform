"use client"

import { ArrowLeft, ArrowRight, Check, CircleCheck, Loader2, Lock } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { StatusTag } from "@/components/common/status"
import { Button } from "@/components/ui/button"
import {
  connectErrorMessage,
  PLATFORM_META,
  type SocialPlatform,
} from "@/features/connections/constants"
import { cn } from "@/lib/utils"
import {
  isFinished,
  STEP_STATUS_META,
  STEPS,
  type StepKey,
  type StepStatuses,
} from "../../constants"
import type { OnboardingData } from "../../public"
import { submitOnboarding } from "../../public-actions"
import { BusinessStep } from "./business-step"
import { GoogleStep } from "./google-step"
import { LoginsStep } from "./logins-step"
import { SocialStep } from "./social-step"
import { WebsiteStep } from "./website-step"

type View = StepKey | "review"
const ORDER: View[] = [...STEPS.map((s) => s.key), "review"]

export function OnboardingWizard({
  data,
  reportingEmail,
  agencyEmail,
  connectReady,
  search,
}: {
  data: OnboardingData
  reportingEmail: string | null
  agencyEmail: string
  connectReady: boolean
  search: { step?: string; result?: string; platform?: string; code?: string }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [steps, setSteps] = useState<StepStatuses>({
    status: data.onboarding.status,
    business: data.onboarding.business,
    social: data.onboarding.social,
    google: data.onboarding.google,
    website: data.onboarding.website,
    logins: data.onboarding.logins,
  })
  const [view, setView] = useState<View>(() => {
    if (search.step && (ORDER as string[]).includes(search.step)) return search.step as View
    if (data.onboarding.status === "submitted" || data.onboarding.status === "reviewed")
      return "review"
    return STEPS.find((s) => !isFinished(data.onboarding[s.key]))?.key ?? "review"
  })
  const top = useRef<HTMLDivElement>(null)
  const readOnly = steps.status === "reviewed"
  const index = ORDER.indexOf(view)

  // The result of a Zernio sign-in, then a clean address (the token stays, the rest goes).
  const shown = useRef(false)
  useEffect(() => {
    if (shown.current || !search.result) return
    shown.current = true
    const label =
      search.platform && search.platform in PLATFORM_META
        ? PLATFORM_META[search.platform as SocialPlatform].label
        : "Your account"
    if (search.result === "connected") toast.success(`${label} connected. Thank you!`)
    else if (search.result === "pending" || search.result === "check")
      toast.info(`${label}: almost done`, { description: "It can take a moment to show up here." })
    else if (search.result === "stale") toast.info("That sign-in already finished.")
    else if (search.result === "error")
      toast.error(`${label} wasn't connected`, {
        description: connectErrorMessage(search.code ?? null),
        duration: 10_000,
      })
    router.replace(`${pathname}?step=social`, { scroll: false })
  }, [search, router, pathname])

  function go(next: View) {
    setView(next)
    // Keep the address in step with the page, so a reload or a shared link opens the same step.
    // (A shallow history update: no server round trip.)
    window.history.replaceState(null, "", `${pathname}?step=${next}`)
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  // Locked steps: every field, select and choice inside is disabled the same way.
  const lockable = (children: React.ReactNode) => (
    <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
      {children}
    </fieldset>
  )

  return (
    <div ref={top} className="flex scroll-mt-4 flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          Welcome, {data.client.name}
        </h1>
        <p className="max-w-prose text-[15px] text-muted-foreground">
          This takes about 15 minutes. Everything saves as you go, so you can stop and come back any
          time with the same link.
          {data.contact ? ` Questions? Ask ${data.contact}, your account manager.` : ""}
        </p>
      </header>

      <nav aria-label="Steps" className="-mx-4 overflow-x-auto px-4">
        <ol className="flex min-w-max gap-1.5">
          {ORDER.map((key, i) => {
            const status = key === "review" ? null : steps[key]
            const done = status
              ? isFinished(status)
              : steps.status === "submitted" || steps.status === "reviewed"
            const active = view === key
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => go(key)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-md border bg-card px-3 text-sm transition-colors",
                    active
                      ? "border-primary bg-brand-soft font-medium text-brand"
                      : "hover:bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-5 place-items-center rounded-full text-[11px] font-semibold",
                      active
                        ? "bg-primary text-primary-foreground"
                        : done
                          ? "bg-success-soft text-success"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {done && !active ? <Check className="size-3" /> : i + 1}
                  </span>
                  {key === "review" ? "Finish" : STEPS[i].short}
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      {readOnly && (
        <div className="flex gap-3 rounded-lg border border-success/30 bg-success-soft px-4 py-3 text-[15px]">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Your onboarding is complete. Your LeadMaker team has checked these answers and is using
            them, so they&apos;re locked and can only be viewed here. You can still connect accounts
            on the <strong className="font-medium">Accounts</strong> step. If anything else needs to
            change, tell {data.contact ?? "your account manager"}.
          </p>
        </div>
      )}

      <section className="flex flex-col gap-6">
        {view !== "review" && (
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">
              Step {index + 1} of {STEPS.length} · about {STEPS[index].minutes} min
            </span>
            <h2 className="text-xl font-semibold tracking-tight">{STEPS[index].label}</h2>
          </div>
        )}

        {view === "business" &&
          lockable(
            <BusinessStep
              token={data.token}
              clientName={data.client.name}
              business={data.business}
              readOnly={readOnly}
              onSteps={setSteps}
            />,
          )}
        {view === "social" && (
          <SocialStep
            token={data.token}
            accounts={data.accounts}
            notUsing={data.notUsing}
            connectReady={connectReady}
            onSteps={setSteps}
          />
        )}
        {view === "google" &&
          lockable(
            <GoogleStep
              token={data.token}
              google={data.google}
              reportingEmail={reportingEmail}
              readOnly={readOnly}
              onSteps={setSteps}
            />,
          )}
        {view === "website" &&
          lockable(
            <WebsiteStep
              token={data.token}
              website={data.website}
              agencyEmail={agencyEmail}
              readOnly={readOnly}
              onSteps={setSteps}
              onGoToLogins={() => toast.info("Add the website login on the “Logins” step.")}
            />,
          )}
        {view === "logins" &&
          lockable(
            <LoginsStep
              token={data.token}
              logins={data.logins}
              skipped={data.onboarding.logins_skipped}
              readOnly={readOnly}
              onSteps={setSteps}
            />,
          )}
        {view === "review" && (
          <ReviewStep
            token={data.token}
            steps={steps}
            readOnly={readOnly}
            onSteps={setSteps}
            onGo={go}
          />
        )}
      </section>

      {view !== "review" && (
        <div className="flex items-center justify-between gap-3 border-t pt-6">
          <Button
            variant="ghost"
            size="lg"
            className="h-11"
            disabled={index === 0}
            onClick={() => go(ORDER[index - 1])}
          >
            <ArrowLeft />
            Back
          </Button>
          <Button size="lg" className="h-11" onClick={() => go(ORDER[index + 1])}>
            {ORDER[index + 1] === "review" ? "Review and finish" : "Continue"}
            <ArrowRight />
          </Button>
        </div>
      )}
    </div>
  )
}

function ReviewStep({
  token,
  steps,
  readOnly,
  onSteps,
  onGo,
}: {
  token: string
  steps: StepStatuses
  readOnly: boolean
  onSteps: (s: StepStatuses) => void
  onGo: (v: View) => void
}) {
  const [pending, startTransition] = useTransition()
  const submitted = steps.status === "submitted" || steps.status === "reviewed"
  const missing = STEPS.filter((s) => !isFinished(steps[s.key]))

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border bg-card px-6 py-12 text-center">
        <CircleCheck className="size-10 text-success" aria-hidden />
        <h2 className="text-xl font-semibold tracking-tight">Thank you, that&apos;s everything!</h2>
        <p className="max-w-prose text-[15px] text-muted-foreground">
          Your LeadMaker team has been told and will check everything. You can keep this link: if
          something changes
          {readOnly ? ", tell your account manager" : ", come back and update it here"}.
        </p>
        {!readOnly && missing.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Still open: {missing.map((m) => m.label).join(", ")}.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">Review and finish</h2>
        <p className="text-[15px] text-muted-foreground">
          Business details are needed to finish. Anything else you can come back to later with the
          same link.
        </p>
      </div>
      <ul className="flex flex-col divide-y rounded-lg border bg-card">
        {STEPS.map((s) => {
          const meta = STEP_STATUS_META[steps[s.key]]
          return (
            <li key={s.key} className="flex items-center gap-3 px-4 py-3">
              {isFinished(steps[s.key]) ? (
                <CircleCheck className="size-5 shrink-0 text-success" aria-hidden />
              ) : (
                <span
                  className="size-5 shrink-0 rounded-full border-2 border-muted-foreground/30"
                  aria-hidden
                />
              )}
              <span className="flex-1 text-[15px] font-medium">{s.label}</span>
              <StatusTag tone={meta.tone}>{meta.label}</StatusTag>
              {!isFinished(steps[s.key]) && (
                <Button variant="ghost" size="sm" onClick={() => onGo(s.key)}>
                  Open
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <Button
        size="lg"
        className="h-12 w-full text-base sm:w-fit"
        disabled={pending || readOnly || steps.business !== "done"}
        onClick={() =>
          startTransition(async () => {
            const r = await submitOnboarding(token)
            if (!r.ok) {
              toast.error(r.error)
              return
            }
            onSteps(r.data.steps)
          })
        }
      >
        {pending && <Loader2 className="animate-spin" />}
        Send to LeadMaker
      </Button>
      {steps.business !== "done" && (
        <p className="text-sm text-muted-foreground">
          Fill in the business details first (name, phone, category, address or service areas, and a
          contact).
        </p>
      )}
    </div>
  )
}
