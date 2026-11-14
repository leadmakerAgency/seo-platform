/** Shown for a bad, revoked or expired onboarding link (no detail about why). */
export function InactiveLink() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-6">
      <h1 className="text-xl font-semibold tracking-tight">This link isn&apos;t active</h1>
      <p className="text-[15px] text-muted-foreground">
        Ask your LeadMaker contact to send you a new one.
      </p>
    </div>
  )
}
