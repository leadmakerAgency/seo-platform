"use client"

import { KeyRound } from "@/components/icons"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { connectWordPress } from "@/features/content/actions"

/**
 * A self-hosted WordPress site: site address, username and an application password. The
 * password goes straight to Zernio, which checks and stores it; LeadMaker never saves it.
 */
export function WordPressPasswordButton({
  clientId,
  variant = "outline",
}: {
  clientId: string
  variant?: "default" | "outline" | "ghost"
}) {
  const [open, setOpen] = useState(false)
  const [site, setSite] = useState("")
  const [user, setUser] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const submit = () =>
    start(async () => {
      setError(null)
      const r = await connectWordPress(clientId, { siteUrl: site, username: user, applicationPassword: password })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setPassword("")
      setOpen(false)
      toast.success("WordPress connected", {
        description: r.data.blogName
          ? `Articles will go to “${r.data.blogName}”.`
          : r.data.blogs > 1
            ? "Pick the blog in Content → Settings."
            : "You can now publish articles from the Content page.",
      })
    })

  return (
    <>
      <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
        <KeyRound />
        Self-hosted site
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) {
            setPassword("")
            setError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect a self-hosted WordPress site</DialogTitle>
            <DialogDescription>
              In WordPress, open Users → Profile, scroll to Application passwords, type “LeadMaker” and click Add. Paste
              the password it shows here. It goes straight to Zernio; LeadMaker never stores it, and it can be revoked
              in WordPress at any time.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wp-site">Site address</Label>
              <Input
                id="wp-site"
                inputMode="url"
                placeholder="https://example.com"
                value={site}
                onChange={(e) => setSite(e.target.value)}
                autoComplete="off"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wp-user">WordPress username</Label>
              <Input id="wp-user" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" required />
              <p className="text-xs text-muted-foreground">The user needs to be able to publish posts (Editor or Administrator).</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wp-pass">Application password</Label>
              <Input
                id="wp-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="abcd efgh ijkl mnop qrst uvwx"
                required
              />
              <p className="text-xs text-muted-foreground">Not the normal login password. WordPress counts it as one Zernio account.</p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Connecting…" : "Connect"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
