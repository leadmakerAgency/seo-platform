import { Logo } from "@/components/brand/logo"

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="px-6 py-5">
        <Logo />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[12vh] pb-16">
        <div className="w-full max-w-[380px]">{children}</div>
      </main>
    </div>
  )
}
