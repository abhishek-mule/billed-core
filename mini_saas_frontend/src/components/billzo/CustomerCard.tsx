"use client"

import Link from "next/link"
import { ArrowRight, PhoneOff } from "lucide-react"
import type { ReactNode } from "react"
import { formatINR, cn } from "@/lib/utils"

export type CustomerCardItem = {
  caseId: string
  customerId: string
  customerName: string
  phone?: string | null
  invoiceNumber?: string | null
  invoiceCount: number
  amount: number
  recoverableAmount: number
  overdue: number
  actionType: string
  state: string
  reasons: { type: string; impact: string }[]
}

interface CustomerCardProps {
  item: CustomerCardItem
  rank: number
  tierIcon?: ReactNode
  whyNow?: string
}

function overdueTone(overdue: number): { label: string; color: string; chip: string } {
  if (overdue > 30) return { label: `${overdue} days overdue`, color: "text-danger", chip: "bg-danger-soft text-danger" }
  if (overdue > 7) return { label: `${overdue} days overdue`, color: "text-warning", chip: "bg-warning-soft text-warning" }
  if (overdue > 0) return { label: `${overdue} days overdue`, color: "text-muted-foreground", chip: "bg-muted text-muted-foreground" }
  return { label: "Due now", color: "text-success", chip: "bg-success-soft text-success" }
}

export function CustomerCard({ item, rank, tierIcon }: CustomerCardProps) {
  const tone = overdueTone(item.overdue)
  const missingPhone = !item.phone
  const expectedToday = item.recoverableAmount

  return (
    <Link
      href={`/recovery/case/${item.caseId}`}
      className="block bg-card border border-border rounded-xl p-3.5 hover:shadow-sm hover:border-recovery/30 transition-all active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground">
            {rank}
          </span>
          <span className="text-2xl font-bold text-foreground tabular-nums leading-none truncate">
            {formatINR(item.amount)}
          </span>
        </div>
        <span className={cn("flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold", tone.chip)}>
          {tone.label}
        </span>
      </div>

      <div className="flex items-center gap-1.5 mt-2">
        <span className="text-sm font-semibold text-foreground truncate">
          {item.customerName}
        </span>
        {tierIcon && (
          <span className="ml-auto flex-shrink-0 text-xs font-bold leading-none">
            {tierIcon}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-border">
        <span className="text-xs text-muted-foreground">
          Expected today <span className="font-bold text-foreground tabular-nums">{formatINR(expectedToday)}</span>
        </span>
        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-recovery text-white text-xs font-bold hover:bg-recovery/90 transition-colors">
          Take Action <ArrowRight size={12} />
        </span>
      </div>

      {missingPhone && (
        <div className="flex items-center gap-1.5 mt-2 rounded-lg bg-danger-soft px-2.5 py-1.5 text-[11px] font-semibold text-danger">
          <PhoneOff size={12} />
          Phone number missing — can&apos;t message
        </div>
      )}
    </Link>
  )
}
