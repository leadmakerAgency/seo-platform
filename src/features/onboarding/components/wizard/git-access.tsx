"use client"

import { CircleAlert, CircleCheck, KeyRound, Plug } from "@/components/icons"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { StepStatuses } from "../../constants"
import type { OnboardingData } from "../../public"
import { saveOnboardingGitToken, startOnboardingGitConnect } from "../../public-actions"
import { Field, inputClass } from "./fields"

/**
 * Website step → "Sveltia, Decap or Netlify CMS": give LeadMaker access to the blog's GitHub
 * repository (docs/plans/git-cms/08-onboarding.md). Connect GitHub installs the LeadMaker
 * Publisher app on just that repository; a token is the fallback; Later is always fine.
 */
export function GitAccess({
  token,
  git,
  gitReady,
  readOnly,
  onSteps,
  onLater,
}: {
  token: string
  git: OnboardingData["git"]
  gitReady: boolean
  readOnly: boolean
  onSteps: (s: StepStatuses) => void
  onLater: () => void
}) {
  const [showToken, setShowToken] = useState(!gitReady)
  const [repo, setRepo] = useState(git?.repo ?? "")
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState(git)
  const [pending, start] = useTransition()

  const connect = () =>
    start(async () => {
      const r = await startOnboardingGitConnect(token)
      if (!r.ok) toast.error(r.error)
      else window.location.assign(r.data.url)
    })

  const sendToken = () =>
    start(async () => {
      setError(null)
      const r = await saveOnboardingGitToken(token, { repo, token: value })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setValue("")
      onSteps(r.data.steps)
      setStatus({
        repo: r.data.repo,
        status: r.data.connected ? "connected" : "needs_attention",
        authMethod: "token",
        error: r.data.message,
      })
      if (r.data.connected) toast.success("Repository connected. Thank you!")
      else
        toast.info("We can reach the repository. Our team will finish the setup.", {
          description: r.data.message ?? undefined,
        })
    })

  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold tracking-tight">
          Connect your blog&apos;s GitHub repository
        </h3>
        <p className="text-[15px] text-muted-foreground">
          Your blog posts are files in a GitHub repository. Connecting it lets us publish articles
          for you; your host (Vercel, Netlify…) puts them live as usual. We only get access to the
          one repository you choose, and you can remove it on GitHub at any time.
        </p>
      </div>

      {status && (
        <p
          className={
            status.status === "connected"
              ? "flex items-start gap-2 rounded-md bg-success-soft p-3 text-[15px]"
              : "flex items-start gap-2 rounded-md bg-warning-soft p-3 text-[15px]"
          }
        >
          {status.status === "connected" ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          ) : (
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          )}
          <span>
            <strong className="font-medium">{status.repo}</strong>{" "}
            {status.status === "connected"
              ? "is connected. You're all set for this step."
              : `is connected, but our team needs to finish the setup${status.error ? `: ${status.error}` : "."}`}
          </span>
        </p>
      )}

      {!readOnly && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {gitReady && (
              <Button type="button" className="min-h-11" disabled={pending} onClick={connect}>
                <Plug />
                {status ? "Connect another repository" : "Connect GitHub"}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setShowToken((v) => !v)}
            >
              <KeyRound />
              {gitReady ? "Send a token instead" : "Send a GitHub token"}
            </Button>
            {!status && (
              <Button type="button" variant="ghost" className="min-h-11" onClick={onLater}>
                Later / I need help
              </Button>
            )}
          </div>
          {gitReady && (
            <p className="text-sm text-muted-foreground">
              Connect GitHub opens GitHub: sign in, pick{" "}
              <strong className="font-medium text-foreground">Only select repositories</strong>,
              choose your website&apos;s repository and click Install. You&apos;ll come straight
              back here.
            </p>
          )}

          {showToken && (
            <form
              className="flex flex-col gap-4 rounded-md border bg-background p-4"
              onSubmit={(e) => {
                e.preventDefault()
                sendToken()
              }}
            >
              <ol className="flex flex-col gap-2 text-[15px] leading-relaxed">
                {[
                  "On GitHub, open Settings → Developer settings → Personal access tokens → Fine-grained tokens, and click “Generate new token”.",
                  "Name it “LeadMaker”. Set an expiry (up to a year).",
                  "Under Repository access choose “Only select repositories” and pick your website's repository.",
                  "Under Permissions → Repository permissions set Contents to “Read and write”, and Deployments and Commit statuses to “Read-only”.",
                  "Click “Generate token”, copy it and paste it below.",
                ].map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>
              <Field id="git-repo" label="Repository">
                <Input
                  id="git-repo"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  placeholder="your-company/website or https://github.com/your-company/website"
                  autoComplete="off"
                  className={inputClass}
                  required
                />
              </Field>
              <Field id="git-token" label="Token">
                <Input
                  id="git-token"
                  type="password"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="github_pat_…"
                  autoComplete="new-password"
                  className={inputClass}
                  required
                />
              </Field>
              <p className="text-sm text-muted-foreground">
                We check the token with GitHub, then keep it encrypted. Nobody at LeadMaker can read
                it back.
              </p>
              {error && (
                <p role="alert" className="text-[15px] text-danger">
                  {error}
                </p>
              )}
              <div>
                <Button type="submit" className="min-h-11" disabled={pending}>
                  {pending ? "Checking…" : "Connect with this token"}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  )
}
