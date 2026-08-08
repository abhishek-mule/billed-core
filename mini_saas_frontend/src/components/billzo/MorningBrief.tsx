"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { formatINR } from "@/lib/utils"

interface MorningBriefProps {
  customerCount: number
  expectedToday: number
  bestFirstAction?: {
    customerName: string
    amount: number
    actionType: string
    caseId: string
  } | null
}

export function MorningBrief({
  customerCount,
  expectedToday,
  bestFirstAction,
}: MorningBriefProps) {
  if (customerCount === 0) return null

  return (
    <div className="relative bg-gradient-to-br from-recovery/95 via-recovery/90 to-recovery/85 rounded-2xl p-4 sm:p-5 text-white shadow-lg overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />

      <div className="relative z-10 space-y-2.5 sm:space-y-3">
        <p className="text-[10px] sm:text-xs font-semibold text-white/70 uppercase tracking-wider">
          Today&apos;s Target
        </p>
        <p className="text-2xl sm:text-3xl font-bold tabular-nums tracking-tight">
          {formatINR(expectedToday)}
        </p>
        <p className="text-xs sm:text-sm text-white/80">
          {customerCount} customer{customerCount !== 1 ? "s" : ""} need action
          {bestFirstAction && (
            <> · {bestFirstAction.customerName} is first</>
          )}
        </p>

        <Link
          href="/recovery"
          className="inline-flex items-center gap-1.5 mt-1 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-white text-recovery text-xs sm:text-sm font-bold hover:bg-white/90 transition-colors"
        >
          Start Recovery <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  )
}
