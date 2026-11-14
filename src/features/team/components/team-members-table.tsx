"use client"

import { Ellipsis, Link2, Power, PowerOff, Trash2 } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { StatusTag, type Tone } from "@/components/common/status"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatRelative, initials } from "@/lib/format"
import {
  can,
  ROLE_LABELS,
  ROLES,
  STATUS_LABELS,
  type AppRole,
  type MemberStatus,
} from "@/lib/roles"
import { cn } from "@/lib/utils"
import { changeRole, newInviteLink, removeMember, setMemberAccess } from "../actions"
import type { TeamMemberRow } from "../queries"
import { CopyLink } from "./copy-link"

const STATUS_TONE: Record<MemberStatus, Tone> = {
  active: "success",
  invited: "info",
  disabled: "neutral",
}

export function TeamMembersTable({
  members,
  currentMemberId,
}: {
  members: TeamMemberRow[]
  currentMemberId: string
}) {
  const [pending, startTransition] = useTransition()
  const [inviteLink, setInviteLink] = useState<{ name: string; link: string } | null>(null)
  const [removing, setRemoving] = useState<TeamMemberRow | null>(null)
  const now = new Date()

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const res = await action()
      if (res.ok) toast.success(success)
      else toast.error(res.error ?? "Something went wrong.")
    })
  }

  return (
    <>
      <div
        className={cn(
          "overflow-x-auto rounded-lg border bg-card transition-opacity",
          pending && "pointer-events-none opacity-60",
        )}
      >
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 pl-4 text-xs font-medium text-muted-foreground">
                Person
              </TableHead>
              <TableHead className="h-9 text-xs font-medium text-muted-foreground">Role</TableHead>
              <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                Clients they see
              </TableHead>
              <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                Open tasks
              </TableHead>
              <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                Last active
              </TableHead>
              <TableHead className="h-9 w-12 pr-2">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => {
              const isMe = m.id === currentMemberId
              return (
                <TableRow key={m.id} className="h-14">
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-muted text-xs font-medium">
                          {initials(m.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">
                          {m.name}
                          {isMe && (
                            <span className="font-normal text-muted-foreground"> (you)</span>
                          )}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{m.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={m.role}
                      disabled={isMe || m.status === "disabled"}
                      onValueChange={(role) =>
                        run(
                          () => changeRole(m.id, role as AppRole),
                          `${m.name} is now ${ROLE_LABELS[role as AppRole]}`,
                        )
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-[170px]"
                        aria-label={`Role for ${m.name}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <StatusTag tone={STATUS_TONE[m.status]}>{STATUS_LABELS[m.status]}</StatusTag>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {can(m.role, "clients.see_all")
                      ? "All clients"
                      : `${m.taskClients} from their tasks`}
                  </TableCell>
                  <TableCell className="tabular-nums">{m.openTasks}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {m.lastSignInAt ? formatRelative(m.lastSignInAt, now) : "Never"}
                  </TableCell>
                  <TableCell className="pr-2">
                    {!isMe && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${m.name}`}
                          >
                            <Ellipsis />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {m.status === "invited" && (
                            <DropdownMenuItem
                              onSelect={() =>
                                startTransition(async () => {
                                  const res = await newInviteLink(m.id)
                                  if (res.ok) setInviteLink({ name: m.name, link: res.data.link })
                                  else toast.error(res.error)
                                })
                              }
                            >
                              <Link2 />
                              Copy new invite link
                            </DropdownMenuItem>
                          )}
                          {m.status === "active" && (
                            <DropdownMenuItem
                              onSelect={() =>
                                run(
                                  () => setMemberAccess(m.id, "disabled"),
                                  `Access turned off for ${m.name}`,
                                )
                              }
                            >
                              <PowerOff />
                              Turn off access
                            </DropdownMenuItem>
                          )}
                          {m.status === "disabled" && (
                            <DropdownMenuItem
                              onSelect={() =>
                                run(
                                  () => setMemberAccess(m.id, "active"),
                                  `Access turned on for ${m.name}`,
                                )
                              }
                            >
                              <Power />
                              Turn access back on
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(m)}>
                            <Trash2 />
                            Remove from team
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(inviteLink)} onOpenChange={(open) => !open && setInviteLink(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>New invite link for {inviteLink?.name}</DialogTitle>
            <DialogDescription>
              Send them this link. It works once and replaces any earlier link.
            </DialogDescription>
          </DialogHeader>
          {inviteLink && <CopyLink link={inviteLink.link} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name} from the team?</AlertDialogTitle>
            <AlertDialogDescription>
              Their account is deleted and they can&apos;t sign in. Clients they looked after and
              tasks assigned to them become unassigned. This can&apos;t be undone; to pause someone
              instead, turn off their access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const target = removing
                setRemoving(null)
                if (target) run(() => removeMember(target.id), `${target.name} was removed`)
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
