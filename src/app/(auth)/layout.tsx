import { Logo } from "@/components/brand/logo"

/** Sign-in, setup and welcome: one panel on the tinted canvas, the mark above it. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col bg-sidebar">
      <main className="flex flex-1 justify-center px-4 pt-[12vh] pb-16">
        <div className="flex w-full max-w-[400px] flex-col gap-6">
          <Logo />
          <div className="rounded-lg border bg-card p-6 sm:p-7">{children}</div>
          <p className="px-1 text-xs text-muted-foreground">
            LeadMaker&apos;s internal SEO workspace. Access is by invite from an admin.
          </p>
        </div>
      </main>
    </div>
  )
}
