import type { Metadata } from "next"

import { LeadMakerMark } from "@/components/brand/leadmaker-mark"

export const metadata: Metadata = {
  title: { absolute: "Get set up with LeadMaker" },
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
}

/** The client onboarding wizard: no app menu, no team session, mobile first. */
export default function OnboardLayout({ children }: LayoutProps<"/onboard">) {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 w-full max-w-[720px] items-center px-4">
          <LeadMakerMark />
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[720px] flex-col px-4 pt-6 pb-20 sm:pt-10">
        {children}
      </div>
    </div>
  )
}
