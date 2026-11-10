"use client"

import { RotateCw, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export default function DashboardError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <Empty className="min-h-[360px] border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlert />
        </EmptyMedia>
        <EmptyTitle>The dashboard didn&apos;t load</EmptyTitle>
        <EmptyDescription>
          Something went wrong reaching the database. Try again in a moment.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={() => retry()}>
          <RotateCw />
          Try again
        </Button>
      </EmptyContent>
    </Empty>
  )
}
