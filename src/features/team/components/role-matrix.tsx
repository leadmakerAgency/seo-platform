import { Check, Minus } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AGENCY_NAV, CLIENT_SECTIONS, canAccess } from "@/lib/navigation"
import {
  can,
  PERMISSION_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLES,
  type AppRole,
  type Permission,
} from "@/lib/roles"

/** Generated from roles.ts and navigation.ts, so it always matches what the app enforces. */
export function RoleMatrix() {
  const permissions = Object.keys(PERMISSION_LABELS) as Permission[]
  const pages = [...AGENCY_NAV, ...CLIENT_SECTIONS.filter((s) => s.segment !== "")]

  const rows: { label: string; allowed: (role: AppRole) => boolean }[] = [
    ...permissions.map((p) => ({
      label: PERMISSION_LABELS[p],
      allowed: (r: AppRole) => can(r, p),
    })),
    ...pages.map((page) => ({
      label: `Open ${page.title}${page.comingSoon ? " (coming soon)" : ""}`,
      allowed: (r: AppRole) => canAccess(page, r),
    })),
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg border">
        <Table className="min-w-[720px]">
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 pl-4 text-xs font-medium text-muted-foreground">
                Permission
              </TableHead>
              {ROLES.map((r) => (
                <TableHead
                  key={r}
                  className="h-9 text-center text-xs font-medium text-muted-foreground"
                >
                  {ROLE_LABELS[r]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label} className="h-10">
                <TableCell className="pl-4">{row.label}</TableCell>
                {ROLES.map((r) => (
                  <TableCell key={r} className="text-center">
                    {row.allowed(r) ? (
                      <Check aria-label="Yes" className="mx-auto size-4 text-success" />
                    ) : (
                      <Minus aria-label="No" className="mx-auto size-4 text-muted-foreground/50" />
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {ROLES.map((r) => (
          <div key={r} className="rounded-lg border p-3">
            <dt className="text-sm font-medium">{ROLE_LABELS[r]}</dt>
            <dd className="mt-1 text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
