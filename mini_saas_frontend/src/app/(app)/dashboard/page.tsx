"use client"

import { Suspense } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { workStore } from "@/lib/billzo/work-store-instance"
import { DashboardHeader } from "@/components/billzo/DashboardHeader"
import { DashboardSectionRenderer } from "@/components/billzo/DashboardSectionRenderer"
import { MerchantLanguage } from "@billzo/shared"
import type { AnyDashboardSection } from "@billzo/shared"

async function getDashboardData() {
  const { sections } = await workStore.getDashboard()
  return sections
}

function DashboardSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-24 animate-pulse">
      <div className="h-6 w-48 bg-muted rounded" />
      <div className="h-4 w-32 bg-muted rounded" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-xl border p-4 h-24">
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="mt-2 h-8 w-32 bg-muted rounded" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border p-5 h-48">
        <div className="h-4 w-24 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-6 w-full bg-muted rounded" />
          ))}
        </div>
      </div>
    </div>
  )
}

function DashboardError({ retry }: { retry: () => void }) {
  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-24 text-center py-12">
      <div className="mx-auto h-12 w-12 rounded-full bg-rose-100 flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-rose-600 animate-spin" />
      </div>
      <p className="text-foreground">Could not load your dashboard</p>
      <button
        onClick={retry}
        className="mx-auto mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
      >
        <RefreshCw className="h-4 w-4" />
        Try again
      </button>
    </div>
  )
}

async function DashboardContent() {
  const sectionsPromise = getDashboardData()

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardSections sectionsPromise={sectionsPromise} />
    </Suspense>
  )
}

async function DashboardSections({ sectionsPromise }: { sectionsPromise: Promise<AnyDashboardSection[]> }) {
  const sections = await sectionsPromise

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-24">
      <DashboardHeader />
      {sections.map(section => (
        <DashboardSectionRenderer key={section.type} section={section} />
      ))}
    </div>
  )
}

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <DashboardContent />
    </div>
  )
}