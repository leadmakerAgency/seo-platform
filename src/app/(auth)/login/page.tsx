import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { LoginForm } from "@/features/auth/components/login-form"

export const metadata: Metadata = { title: "Sign in" }

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">Sign in to Shockwave with your LeadMaker team account.</p>
      </div>
      <Suspense fallback={<Skeleton className="h-[188px] w-full" />}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
