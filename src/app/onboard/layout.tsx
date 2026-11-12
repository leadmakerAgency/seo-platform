import type { Metadata } from "next"

export const metadata: Metadata = {
  title: { absolute: "Get set up with LeadMaker" },
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
}

/** The client onboarding wizard: no app menu, no team session, mobile first. */
export default function OnboardLayout({ children }: LayoutProps<"/onboard">) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[720px] flex-col px-4 pt-6 pb-20 sm:pt-10">
      <div className="flex items-center gap-2.5 pb-8">
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-md bg-primary text-[13px] font-semibold tracking-tight text-primary-foreground"
        >
          LM
        </span>
        <span className="text-[15px] font-semibold tracking-tight">LeadMaker</span>
      </div>
      {children}
    </div>
  )
}
