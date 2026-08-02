"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { X, ArrowRight } from "lucide-react"
import { formatINR } from "@/lib/utils"

const TODAY_KEY = () => {
  const d = new Date()
  return `billzo_brief_dismissed_${d.getFullYear()}_${d.getMonth()}_${d.getDate()}`
}

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
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(TODAY_KEY())
    if (!dismissed) setVisible(true)
  }, [])

  const dismiss = () => {
    localStorage.setItem(TODAY_KEY(), "1")
    setVisible(false)
  }

  if (!visible) return null
  if (customerCount === 0) return null

  return (
    <div className="relative bg-gradient-to-br from-recovery/95 via-recovery/90 to-recovery/85 rounded-2xl p-5 text-white shadow-lg overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
      <button
        onClick={dismiss}
        className="absolute top-3 right-3 z-10 flex items-center justify-center w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white/70 hover:text-white"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>

      <div className="relative z-10 space-y-3">
        <p className="text-lg font-bold leading-tight">
          Recover {customerCount} customer{customerCount !== 1 ? "s" : ""} today
        </p>
        <p className="text-sm text-white/80">
          Today&apos;s Recovery Target: <span className="font-bold text-white">{formatINR(expectedToday)}</span>
        </p>

        {bestFirstAction && (
          <Link
            href={`/recovery/case/${bestFirstAction.caseId}`}
            className="flex items-center gap-3 bg-white/10 rounded-xl p-3 hover:bg-white/15 transition-colors group mt-2"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-white/60 font-semibold uppercase tracking-wider">
                Best first action
              </p>
              <p className="text-sm font-bold mt-0.5">
                {bestFirstAction.actionType === "call" ? "Call" : "Message"}{" "}
                {bestFirstAction.customerName}
              </p>
              <p className="text-xs text-white/70 mt-0.5">
                {formatINR(bestFirstAction.amount)} — {bestFirstAction.actionType === "call" ? "highest value" : "send reminder"}
              </p>
            </div>
            <ArrowRight size={16} className="text-white/60 group-hover:text-white/90 transition-colors flex-shrink-0" />
          </Link>
        )}
      </div>
    </div>
  )
}
