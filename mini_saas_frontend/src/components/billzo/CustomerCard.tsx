"use client"

import { PhoneOff, User } from "lucide-react"
import { formatINR, cn } from "@/lib/utils"
import { ReminderStateBadge } from "./ReminderStateBadge"
import { CustomerActionSheet, type CustomerActionSheetProps } from "./CustomerActionSheet"
import { deriveWhyLines, dominantAction, type DominantActionInput } from "@/lib/billzo/reminder-state"

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
  promiseToPayDate?: string | null
  maxDeliveryStatus?: "sent" | "delivered" | "read" | null
  ignoredReminders?: number
  brokenPromises?: number
}

interface CustomerCardProps {
  item: CustomerCardItem
  rank: number
  tierIcon?: React.ReactNode
  sheet?: Omit<CustomerActionSheetProps, "dominant" | "canWhatsApp">
}

function overdueTone(overdue: number): { label: string; color: string; chip: string } {
  if (overdue > 30) return { label: `${overdue} days overdue`, color: "text-danger", chip: "bg-danger-soft text-danger" }
  if (overdue > 7) return { label: `${overdue} days overdue`, color: "text-warning", chip: "bg-warning-soft text-warning" }
  if (overdue > 0) return { label: `${overdue} days overdue`, color: "text-muted-foreground", chip: "bg-muted text-muted-foreground" }
  return { label: "Due now", color: "text-success", chip: "bg-success-soft text-success" }
}

function stateInput(item: CustomerCardItem): DominantActionInput {
  const hasPhone = !!item.phone
  const hasActivePromise = !!item.promiseToPayDate
  const promiseDueDays = hasActivePromise
    ? Math.ceil((new Date(item.promiseToPayDate!).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : undefined
  return {
    hasPhone,
    hasActivePromise,
    maxDeliveryStatus: item.maxDeliveryStatus ?? null,
    ignoredReminders: item.ignoredReminders || 0,
    brokenPromises: item.brokenPromises || 0,
    overdueDays: item.overdue,
    promiseDueDays,
    expectedToday: item.recoverableAmount,
  }
}

export function CustomerCard({ item, rank, tierIcon, sheet }: CustomerCardProps) {
  const input = stateInput(item)
  const tone = overdueTone(item.overdue)
  const missingPhone = !item.phone
  const whyLines = deriveWhyLines(input)
  const dominant = dominantAction(input)

  return (
    <div className="bg-card border border-border rounded-xl p-3 sm:p-3.5 hover:shadow-sm transition-all">
      {/* Header: amount + badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <span className="flex-shrink-0 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-muted flex items-center justify-center text-[8px] sm:text-[9px] font-bold text-muted-foreground">
            {rank}
          </span>
          <span className="text-xl sm:text-2xl font-bold text-foreground tabular-nums leading-none truncate">
            {formatINR(item.amount)}
          </span>
        </div>
        <ReminderStateBadge input={input} className="flex-shrink-0 text-[10px] sm:text-xs" />
      </div>

      {/* Name + tier */}
      <div className="flex items-center gap-1.5 mt-1.5 sm:mt-2">
        <span className="text-xs sm:text-sm font-semibold text-foreground truncate">
          {item.customerName}
        </span>
        {tierIcon && (
          <span className="ml-auto flex-shrink-0 text-xs font-bold leading-none">
            {tierIcon}
          </span>
        )}
      </div>

      {/* Why line */}
      <div className="flex items-center gap-1.5 sm:gap-2 mt-1 sm:mt-1.5 flex-wrap text-[10px] sm:text-[11px]">
        {whyLines.map((w) => (
          <span key={w} className={cn("font-semibold", tone.color)}>
            {w}
          </span>
        ))}
        <span className="text-muted-foreground">
          Expected today <span className="font-bold tabular-nums">{formatINR(item.recoverableAmount)}</span>
        </span>
      </div>

      {/* Phone missing — red */}
      {missingPhone && (
        <div className="flex items-center gap-1.5 mt-2 rounded-lg bg-danger-soft px-2 py-1.5 sm:px-2.5 sm:py-2 text-[10px] sm:text-[11px] font-semibold text-danger">
          <PhoneOff size={12} className="flex-shrink-0" />
          <span className="truncate">Phone missing — cannot send WhatsApp</span>
          {sheet?.onOpenCustomer ? (
            <button
              onClick={sheet.onOpenCustomer}
              className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-danger text-white text-[9px] sm:text-[10px] font-bold hover:opacity-90 flex-shrink-0"
            >
              <User size={10} /> Add Number
            </button>
          ) : null}
        </div>
      )}

      {/* Fixed action sheet */}
      <div className="mt-2.5 sm:mt-3 pt-2.5 sm:pt-3 border-t border-border">
        <CustomerActionSheet
          {...sheet}
          dominant={dominant}
          canWhatsApp={!missingPhone}
        />
      </div>
    </div>
  )
}

export default CustomerCard