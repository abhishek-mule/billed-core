"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Loader2, Phone, Send, CheckCircle2,
  AlertTriangle, Zap, Clock,
} from "lucide-react"
import { formatINR, formatOverdueDays } from "@/lib/utils"
import { buildReason, getNextActionLabel, type PriorityCase } from "@/lib/recovery/queue-service"

interface TodaysPriorityProps {
  primaryCase: PriorityCase | null
  secondaryCases: PriorityCase[]
  onAction: (caseId: string, action: 'send_reminder' | 'call') => void
  actionLoading: string | null
}

function actionButtonClass(action: 'send_reminder' | 'call') {
  if (action === 'call') {
    return "flex-1 bg-green-500 hover:bg-green-600 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
  }
  return "flex-1 bg-primary hover:bg-primary/90 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
}

export default function TodaysPriority({
  primaryCase,
  secondaryCases,
  onAction,
  actionLoading,
}: TodaysPriorityProps) {
  if (!primaryCase) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Today&apos;s Priority
          </h2>
          <span className="text-[10px] font-medium text-muted-foreground/60 flex items-center gap-1">
            <Zap size={10} />
            BillZo Intelligence
          </span>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <p className="font-semibold text-green-700 text-lg tracking-tight">🎉 You're all caught up</p>
          <p className="text-xs text-green-600 mt-1">
            No customers need follow-up today. Keep sending invoices and BillZo will monitor payments automatically.
          </p>
        </div>
      </section>
    )
  }

  const primaryAction = primaryCase.nextActionType === 'call' || primaryCase.nextActionType === 'follow_up_call' 
    ? 'call' 
    : 'send_reminder'
  const isPrimaryBusy = actionLoading === `${primaryCase.caseId}:${primaryAction}`

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Today&apos;s Priority
        </h2>
        <span className="text-[10px] font-medium text-muted-foreground/60 flex items-center gap-1">
          <Zap size={10} />
          BillZo Intelligence
        </span>
      </div>

      {/* PRIMARY CARD */}
      <div className="bg-foreground text-background rounded-xl p-5 shadow-lg dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-60 mb-1">
              TODAY&apos;S MOST IMPORTANT CUSTOMER
            </p>
            <p className="text-lg font-bold">{primaryCase.customerName}</p>
          </div>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            primaryCase.oldestOverdueDays > 30 ? 'bg-red-500/30 text-red-300' :
            primaryCase.oldestOverdueDays > 14 ? 'bg-amber-500/30 text-amber-300' :
            'bg-blue-500/30 text-blue-300'
          }`}>
            {formatOverdueDays(primaryCase.oldestOverdueDays)}
          </span>
        </div>
        
        <div className="flex items-center justify-between mb-4">
          <span className="text-2xl font-bold tabular-nums">
            {formatINR(primaryCase.totalOverdue)}
          </span>
          <span className="text-sm opacity-60">
            {primaryCase.openInvoiceCount} invoices
          </span>
        </div>

        {/* WHY */}
        <div className="bg-background/5 rounded-lg p-3 mb-4 text-sm">
          <p className="font-medium opacity-80 mb-1">Why:</p>
          <p className="opacity-70">{buildReason(primaryCase)}</p>
        </div>

        {/* ACTIONS */}
        <div className="flex gap-3">
          <button
            onClick={() => onAction(primaryCase.caseId, 'call')}
            disabled={isPrimaryBusy}
            className={actionButtonClass('call')}
          >
            {isPrimaryBusy ? (
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            ) : (
              <>
                <Phone size={14} />
                Call
              </>
            )}
          </button>
          <button
            onClick={() => onAction(primaryCase.caseId, 'send_reminder')}
            disabled={isPrimaryBusy}
            className={actionButtonClass('send_reminder')}
          >
            {isPrimaryBusy ? (
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            ) : (
              <>
                <Send size={14} />
                WhatsApp
              </>
            )}
          </button>
        </div>
      </div>

      {/* SECONDARY CASES */}
      {secondaryCases.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              More customers needing attention ({secondaryCases.length})
            </h3>
          </div>
          <div className="space-y-2">
            {secondaryCases.map((sc, i) => {
              const action = sc.nextActionType === 'call' || sc.nextActionType === 'follow_up_call' 
                ? 'call' 
                : 'send_reminder'
              const isBusy = actionLoading === `${sc.caseId}:${action}`
              const actionLabel = getNextActionLabel(sc.nextActionType)
              
              return (
                <div key={sc.caseId} className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/50 rounded-lg transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                      sc.oldestOverdueDays > 30 ? 'bg-rose-100 text-rose-700' :
                      sc.oldestOverdueDays > 14 ? 'bg-amber-100 text-amber-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {sc.oldestOverdueDays}d
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{sc.customerName}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatINR(sc.totalOverdue)} · {actionLabel}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => onAction(sc.caseId, action)}
                    disabled={isBusy}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all active:scale-[0.97] ${
                      action === 'call'
                        ? 'bg-green-50 text-green-700 hover:bg-green-100'
                        : 'bg-primary/10 text-primary hover:bg-primary/20'
                    } ${isBusy ? 'opacity-50 cursor-wait' : ''}`}
                  >
                    {isBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        {action === 'call' ? <Phone size={11} /> : <Send size={11} />}
                        {action === 'call' ? 'Call' : 'WA'}
                      </>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}