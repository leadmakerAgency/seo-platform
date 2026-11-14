/**
 * The LeadMaker header for pages clients see (onboarding wizard, requests
 * portal). Clients hired LeadMaker, so these pages never say Shockwave.
 */
export function LeadMakerMark() {
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-md bg-primary font-heading text-[13px] font-bold tracking-tight text-primary-foreground"
      >
        LM
      </span>
      <span className="font-heading text-base font-semibold tracking-tight">LeadMaker</span>
    </span>
  )
}
