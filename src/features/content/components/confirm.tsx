"use client"

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react"

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
import { cn } from "@/lib/utils"

type Ask = { title: string; description: ReactNode; action: string; danger?: boolean }

const Ctx = createContext<(a: Ask) => Promise<boolean>>(async () => false)

/** `const confirm = useConfirm(); if (await confirm({...})) …` with the app's dialog. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)
  const confirm = useCallback(
    (a: Ask) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve
        setAsk(a)
      }),
    [],
  )
  const close = (v: boolean) => {
    resolver.current?.(v)
    resolver.current = null
    setAsk(null)
  }
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <AlertDialog open={Boolean(ask)} onOpenChange={(o) => !o && close(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ask?.title}</AlertDialogTitle>
            <AlertDialogDescription>{ask?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className={cn(ask?.danger && "bg-danger text-white hover:bg-danger/90")}
              onClick={() => close(true)}
            >
              {ask?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Ctx.Provider>
  )
}

export const useConfirm = () => useContext(Ctx)
