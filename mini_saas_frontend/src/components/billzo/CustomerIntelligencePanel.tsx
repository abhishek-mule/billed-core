"use client"

import { useState, useEffect } from "react"
import {
  AlertTriangle, CheckCircle2, Clock, Send, Phone,
  Calendar, BarChart3, Receipt, Loader2, Zap, Pause, Hand,
} from "lucide-react"
import { formatINR, formatOverdueDays } from "@/lib/utils"
import { PromiseModal } from "./PromiseModal"
import { PauseModal } from "./PauseModal"

interface RecoveryCaseResponse {
  case: any
  openInvoiceCount: number
  oldestOverdueDays: number
  oldestOverdueLabel: string
  lastPaymentAt: string | null
  nextAction: string
  nextActionLabel: string
  nextActionReason: string
  customerSince: string
  paymentBehavior: string
}

interface CustomerIntelligencePanelProps {
  customerId: string
}

const STATE_LABELS: Record<string, string> = {
  active: 'Active',
  overdue: 'Overdue',
  promised: 'Promise to Pay',
  partial_payment: 'Partial Payment',
  disputed: 'Disputed',
  recovered: 'Recovered',
  closed: 'Closed',
}

const STATE_COLORS: Record<string, string> = {
  active: 'bg-blue-50 text-blue-700 border-blue-200',
  overdue: 'bg-rose-50 text-rose-700 border-rose-200',
  promised: 'bg-purple-50 text-purple-700 border-purple-200',
  partial_payment: 'bg-amber-50 text-amber-700 border-amber-200',
  disputed: 'bg-red-50 text-red-700 border-red-200',
  recovered: 'bg-green-50 text-green-700 border-green-200',
  closed: 'bg-slate-50 text-slate-500 border-slate-200',
}

const ACTION_ICONS: Record<string, typeof Send> = {
  send_reminder: Send,
  call: Phone,
  follow_up_call: Phone,
  wait: Clock,
  merchant_review: BarChart3,
}

export function CustomerIntelligencePanel({ customerId }: CustomerIntelligencePanelProps) {
  const [data, setData] = useState<RecoveryCaseResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/recovery/cases?customerId=${customerId}`, {
          credentials: 'include',
        })
        if (!res.ok) {
          if (res.status === 404) {
            if (!cancelled) { setData(null); setLoading(false) }
            return
          }
          throw new Error(`Failed to load: ${res.status}`)
        }
        const json = await res.json()
        if (!cancelled) setData(json)
      } catch (err: any) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [customerId])

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          <Zap size={12} />
          BillZo Recovery
        </div>
        <div className="space-y-2 animate-pulse">
          <div className="h-4 bg-slate-100 rounded w-3/4" />
          <div className="h-4 bg-slate-100 rounded w-1/2" />
          <div className="h-4 bg-slate-100 rounded w-2/3" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white border border-rose-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-rose-600 uppercase tracking-wider mb-2">
          <AlertTriangle size={12} />
          Recovery Error
        </div>
        <p className="text-xs text-rose-600">{error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          <Zap size={12} />
          BillZo Recovery
        </div>
        <p className="text-xs text-slate-500">No active recovery case for this customer.</p>
      </div>
    )
  }

  const [sending, setSending] = useState<string | null>(null)
  const [showPromise, setShowPromise] = useState(false)
  const [showPause, setShowPause] = useState(false)

  const stateKey = data.case.recovery_state_v2 || 'active'
  const stateLabel = STATE_LABELS[stateKey] || stateKey
  const stateColor = STATE_COLORS[stateKey] || STATE_COLORS.active
  const ActionIcon = ACTION_ICONS[data.nextAction] || Send

  async function sendAction(action: string) {
    if (!data) return
    setSending(action)
    try {
      await fetch('/api/recovery/queue/actions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: data.case.id,
          action,
          customerId,
          tenantId: data.case.tenant_id,
        }),
      })
    } catch {
      // silent — recovery queue handles retries
    } finally {
      setSending(null)
    }
  }

  return (
    <>
    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          <Zap size={12} />
          BillZo Recovery
        </div>
        <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${stateColor}`}>
          {stateLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Total Overdue</p>
          <p className="text-base font-bold text-slate-900 tabular-nums">{formatINR(data.case.total_overdue || 0)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Attention Score</p>
          <p className="text-base font-bold text-slate-900 tabular-nums">{data.case.attention_score || 0}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Oldest Overdue</p>
          <p className="text-sm font-semibold text-slate-900">{data.oldestOverdueLabel}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Open Invoices</p>
          <p className="text-sm font-semibold text-slate-900">{data.openInvoiceCount}</p>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3 space-y-2">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Receipt size={12} className="shrink-0 text-slate-400" />
          <span className="text-slate-400">Next action:</span>
          <span className="font-medium text-slate-900 flex items-center gap-1">
            <ActionIcon size={12} />
            {data.nextActionLabel}
          </span>
        </div>
        <div className="text-xs text-slate-500 bg-slate-50 rounded-lg px-2.5 py-1.5">
          <span className="font-medium text-slate-600">Why:</span> {data.nextActionReason}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs text-slate-500">
        {data.lastPaymentAt && (
          <div className="flex items-center gap-2">
            <Calendar size={11} className="shrink-0 text-slate-400" />
            Last payment: {new Date(data.lastPaymentAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </div>
        )}
        <div className="flex items-center gap-2">
          <BarChart3 size={11} className="shrink-0 text-slate-400" />
          {data.paymentBehavior}
        </div>
        <div className="flex items-center gap-2">
          <Clock size={11} className="shrink-0 text-slate-400" />
          Customer since {data.customerSince}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3 space-y-2">
        {stateKey === 'promised' && data.case.promise_to_pay_date && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200 text-xs text-purple-700">
            <CheckCircle2 size={14} />
            <span>
              Promised payment by{" "}
              <strong>{new Date(data.case.promise_to_pay_date).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}</strong>
              {new Date(data.case.promise_to_pay_date) < new Date() && (
                <span className="text-rose-600"> (overdue)</span>
              )}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setShowPromise(true)}
            disabled={sending !== null}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 disabled:opacity-50 transition-colors"
          >
            <Hand size={14} />
            Mark Promise
          </button>
          <button
            onClick={() => setShowPause(true)}
            disabled={sending !== null}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-50 transition-colors"
          >
            <Pause size={14} />
            Pause
          </button>
        </div>

        <button
          onClick={() => sendAction('send_reminder')}
          disabled={sending !== null}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-50 transition-colors"
        >
          {sending === 'send_reminder' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Send Reminder
        </button>
      </div>
    </div>

    {showPromise && (
      <PromiseModal
        customerId={customerId}
        customerName={data.case.customer_name || data.case.customers?.customer_name || "Customer"}
        amount={data.case.total_overdue || 0}
        caseId={data.case.id}
        onClose={() => setShowPromise(false)}
        onSuccess={() => { setShowPromise(false); window.dispatchEvent(new Event("billzo:changed")) }}
      />
    )}

    {showPause && (
      <PauseModal
        customerId={customerId}
        customerName={data.case.customer_name || data.case.customers?.customer_name || "Customer"}
        caseId={data.case.id}
        onClose={() => setShowPause(false)}
        onSuccess={() => { setShowPause(false); window.dispatchEvent(new Event("billzo:changed")) }}
      />
    )}
    </>
  )
}
