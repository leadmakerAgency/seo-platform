import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SetupForm } from "@/features/auth/components/setup-form"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Set up" }

export default function SetupPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Create the admin account</h1>
        <p className="text-sm text-muted-foreground">
          This runs once. The first account becomes the admin; everyone else is invited later.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-[260px] w-full" />}>
        <SetupGate />
      </Suspense>
    </div>
  )
}

async function SetupGate() {
  const supabase = await createSupabaseServerClient()
  const { data: setupRequired } = await supabase.rpc("setup_required")

  if (!setupRequired) {
    return (
      <div className="flex flex-col gap-4 rounded-md bg-muted p-4">
        <p className="text-sm text-muted-foreground">
          Setup is already done. Ask an admin to invite you, or sign in.
        </p>
        <Button asChild variant="outline" className="w-fit">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    )
  }

  return <SetupForm />
}
