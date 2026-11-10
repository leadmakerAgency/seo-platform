import type { Metadata } from "next"

import { Button } from "@/components/ui/button"
import { signOut } from "@/features/auth/actions"

export const metadata: Metadata = { title: "No access yet" }

export default function NoAccessPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">You don&apos;t have access yet</h1>
        <p className="text-sm text-muted-foreground">
          Your account exists, but an admin still needs to activate it and give you a role.
        </p>
      </div>
      <form action={signOut}>
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </div>
  )
}
