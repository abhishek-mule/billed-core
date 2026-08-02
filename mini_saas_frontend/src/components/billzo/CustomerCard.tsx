"use client"

import Link from "next/link"
import { ArrowRight, MessageSquare, Phone, Bell, HeartHandshake, UserX } from "lucide-react"
import type { ReactNode } from "react"
import { formatINR } from "@/lib/utils"

export type CustomerCardItem = {
  caseId: string
  customerId: string
  customerName: string
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

function actionIcon(action: string) {
  const icons: Record<string, any> = {
    call: Phone,
    send_reminder: Bell,
    reminder: Bell,
    record_payment: MessageSquare,
    visit: UserX,
    promise_followup: HeartHandshake,
  }
  return icons[action] || Bell
}

function actionLabel(a: string) {
  const labels: Record<string, string> = {
    call: "Call",
    send_reminder: "Send reminder",
    reminder: "Reminder",
    record_payment: "Record payment",
    wait: "Wait",
    visit: "Visit",
    promise_followup: "Follow up",
  }
  return labels[a] || a.replace(/_/g, " ")
}

function defaultReason(actionType: string): string {
  const reasons: Record<string, string> = {
    call: "Direct conversation needed",
    send_reminder: "No reminder sent yet",
    reminder: "Follow-up scheduled",
    record_payment: "Payment reported",
    visit: "In-person visit needed",
    promise_followup: "Pending promise",
  }
  return reasons[actionType] || "Action recommended"
}

function confidenceLabel(pct: number): string {
  if (pct >= 80) return "High chance today"
  if (pct >= 60) return "Likely today"
  if (pct >= 40) return "Moderate chance"
  return "Low chance"
}

export function CustomerCard({ item, rank, tierIcon, whyNow }: CustomerCardProps) {
  const confidence =
    item.amount > 0 ? Math.round((item.recoverableAmount / item.amount) * 100) : 0
  const ActionIcon = actionIcon(item.actionType)
  const primaryReason = item.reasons.length > 0
    ? item.reasons.map((r) => r.type.replace(/_/g, " ")).join(", ")
    : null
  const isGenericName =
    item.customerName === "Walk-in Customer" || item.customerName === "Customer"

  return (
    <Link
      href={`/recovery/case/${item.caseId}`}
      className="block bg-card border border-border rounded-xl p-3 hover:shadow-sm hover:border-recovery/30 transition-all active:scale-[0.99]"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground">
            {rank}
          </span>
          <span className="text-lg font-bold text-foreground tabular-nums leading-none truncate">
            {formatINR(item.amount)}
          </span>
        </div>
        <span className="flex-shrink-0 text-[11px] font-medium text-muted-foreground whitespace-nowrap">
          {confidenceLabel(confidence)}
        </span>
      </div>

      <div className="flex items-center gap-1.5 mt-1">
        <span className="text-xs font-semibold text-foreground truncate">
          {item.customerName}
        </span>
        {item.invoiceCount > 1 && (
          <span className="text-[11px] text-muted-foreground/60 flex-shrink-0">
            · {item.invoiceCount} invoices
          </span>
        )}
        {isGenericName && item.invoiceNumber && (
          <span className="text-[11px] text-muted-foreground/60 flex-shrink-0 truncate">
            · {item.invoiceNumber}
          </span>
        )}
        {tierIcon && (
          <span className="ml-auto flex-shrink-0 text-xs font-bold leading-none">
            {tierIcon}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-1">
        <ActionIcon size={11} className="flex-shrink-0 text-muted-foreground" />
        <span className="text-[11px] font-semibold text-foreground truncate">
          {actionLabel(item.actionType)}
        </span>
        <span className="text-[11px] text-muted-foreground truncate">
          · {whyNow || primaryReason || defaultReason(item.actionType)}
        </span>
        <span className="ml-auto flex-shrink-0 inline-flex items-center gap-1 text-xs font-bold text-recovery whitespace-nowrap">
          Recover <ArrowRight size={12} />
        </span>
      </div>
    </Link>
  )
}
