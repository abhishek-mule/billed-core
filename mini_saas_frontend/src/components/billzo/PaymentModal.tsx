"use client"

import { useState } from "react"
import {
  Loader2, AlertCircle, CheckCircle2, CreditCard, Banknote, Landmark, ScrollText,
  Bell, CalendarDays,
} from "lucide-react"
import { formatINR } from "@/lib/utils"

interface PaymentModalProps {
  customerId: string
  customerName: string
  amount: number
  openInvoiceCount: number
  caseId: string
  onClose: () => void
  onSuccess: () => void
}

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "upi", label: "UPI", icon: CreditCard },
  { value: "bank_transfer", label: "Bank Transfer", icon: Landmark },
  { value: "cheque", label: "Cheque", icon: ScrollText },
]

const TIME_SLOTS = [
  "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
  "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM",
  "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM",
]

type Step = 'form' | 'followup_choice' | 'followup_commit' | 'followup_done' | 'done'

export function PaymentModal({
  customerId,
  customerName,
  amount,
  openInvoiceCount,
  caseId,
  onClose,
  onSuccess,
}: PaymentModalProps) {
  const [step, setStep] = useState<Step>('form')
  const [paymentAmount, setPaymentAmount] = useState<number | null>(null)
  const [method, setMethod] = useState("cash")
  const [reference, setReference] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [recordedAmount, setRecordedAmount] = useState(0)
  const [remainingAmount, setRemainingAmount] = useState(0)
  const [promiseDate, setPromiseDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().slice(0, 10)
  })
  const [promiseTime, setPromiseTime] = useState("10:00 AM")
  const [followUpSaving, setFollowUpSaving] = useState(false)

  const actualRemaining = amount - (paymentAmount || 0)

  async function handleSavePayment() {
    if (!paymentAmount || paymentAmount <= 0) {
      setError("Enter a valid amount")
      return
    }
    if (paymentAmount > amount) {
      setError("Amount received cannot exceed outstanding")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/recovery/queue/actions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          action: "record_payment",
          customerId,
          payload: {
            amount: paymentAmount,
            source: method,
            notes: reference.trim() || undefined,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to record payment")

      setRecordedAmount(paymentAmount)
      setRemainingAmount(amount - paymentAmount)

      if (paymentAmount >= amount) {
        setStep('done')
      } else {
        setStep('followup_choice')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleNoCommit() {
    setFollowUpSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/recovery/queue/actions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          action: "schedule_reminder",
          customerId,
          payload: { delayDays: 3 },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to schedule follow-up")
      setStep('followup_done')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setFollowUpSaving(false)
    }
  }

  async function handleSaveCommit() {
    if (!promiseDate) return
    setFollowUpSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/recovery/queue/actions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          action: "mark_promise",
          customerId,
          payload: {
            dueDate: new Date(promiseDate + "T" + promiseTime).toISOString(),
            amount: remainingAmount,
            notes: "Follow-up after partial payment",
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to save promise")
      setStep('followup_done')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setFollowUpSaving(false)
    }
  }

  const methodLabel = PAYMENT_METHODS.find(m => m.value === method)?.label || method
  const autoFollowupDate = new Date(Date.now() + 3 * 86400000).toLocaleDateString("en-IN", { day: "numeric", month: "short" })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-card rounded-xl shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)] border border-border p-6 space-y-4">

        {/* ── FORM STEP ── */}
        {step === 'form' && (
          <>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CreditCard className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">Record Payment</h2>
                <p className="text-sm text-slate-500">{customerName}</p>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3">
              <p className="text-xs text-slate-500 font-medium">Outstanding</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{formatINR(amount)}</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Amount Received
              </label>
              <input
                type="number"
                value={paymentAmount ?? ""}
                onChange={e => setPaymentAmount(e.target.value ? Number(e.target.value) : null)}
                placeholder="Enter amount"
                className="w-full mt-1 h-12 rounded-lg border border-border bg-card px-3 text-lg font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 tabular-nums placeholder:text-muted-foreground"
                min={1}
                max={amount}
                step={1}
              />
              {paymentAmount !== null && paymentAmount > 0 && paymentAmount < amount && (
                <p className="text-xs text-muted-foreground mt-1">
                  Remaining after this: {formatINR(actualRemaining)}
                </p>
              )}
              {openInvoiceCount > 1 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {openInvoiceCount} open invoices — amount applied to oldest invoice.
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                Method
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map(pm => {
                  const Icon = pm.icon
                  const selected = method === pm.value
                  return (
                    <button
                      key={pm.value}
                      onClick={() => setMethod(pm.value)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border transition-colors ${
                        selected
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                          : "bg-card text-muted-foreground border-border hover:border-border"
                      }`}
                    >
                      <Icon size={14} />
                      {pm.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Reference (optional)
              </label>
              <input
                type="text"
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="e.g. UPI ref / cheque no."
                className="w-full mt-1 h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="flex-1 h-10 rounded-lg border border-border text-sm font-medium text-muted-foreground bg-card hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePayment}
                disabled={saving || !paymentAmount || paymentAmount <= 0}
                className="flex-1 h-10 rounded-lg bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Record Payment
              </button>
            </div>
          </>
        )}

        {/* ── FOLLOW-UP: Did customer commit? ── */}
        {step === 'followup_choice' && (
          <>
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
                <AlertCircle size={14} />
                {error}
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                <Bell className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">{formatINR(recordedAmount)} received</h2>
                <p className="text-sm text-slate-500">{customerName}</p>
              </div>
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3">
              <p className="text-xs text-amber-600 font-medium">Remaining outstanding</p>
              <p className="text-lg font-bold text-amber-700 tabular-nums">{formatINR(remainingAmount)}</p>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-700">Did customer commit to a payment date?</p>
              <div className="flex gap-3 mt-3">
                <button
                  onClick={handleNoCommit}
                  disabled={followUpSaving}
                  className="flex-1 h-11 rounded-lg border border-border text-sm font-medium text-muted-foreground bg-card hover:bg-muted disabled:opacity-50"
                >
                  No
                </button>
                <button
                  onClick={() => setStep('followup_commit')}
                  disabled={followUpSaving}
                  className="flex-1 h-11 rounded-lg bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Yes
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                If No, auto follow-up in 3 days ({autoFollowupDate})
              </p>
            </div>
          </>
        )}

        {/* ── FOLLOW-UP: Customer committed ── */}
        {step === 'followup_commit' && (
          <>
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
                <AlertCircle size={14} />
                {error}
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-700">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">Customer committed</h2>
                <p className="text-sm text-slate-500">{customerName} · {formatINR(remainingAmount)} remaining</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Expected Payment
              </label>
              <input
                type="date"
                value={promiseDate}
                onChange={e => setPromiseDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="w-full mt-1 h-11 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Reminder
              </label>
              <select
                value={promiseTime}
                onChange={e => setPromiseTime(e.target.value)}
                className="w-full mt-1 h-11 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {TIME_SLOTS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep('followup_choice')}
                disabled={followUpSaving}
                className="flex-1 h-10 rounded-lg border border-border text-sm font-medium text-muted-foreground bg-card hover:bg-muted disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handleSaveCommit}
                disabled={followUpSaving || !promiseDate}
                className="flex-1 h-10 rounded-lg bg-purple-600 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {followUpSaving && <Loader2 size={14} className="animate-spin" />}
                Save
              </button>
            </div>
          </>
        )}

        {/* ── FOLLOW-UP DONE ── */}
        {step === 'followup_done' && (
          <div className="flex flex-col items-center gap-2 py-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 size={32} className="text-emerald-600" />
            </div>
            <p className="font-bold text-foreground text-lg">Done</p>
            <p className="text-sm text-slate-500 text-center">
              {formatINR(recordedAmount)} received · {formatINR(remainingAmount)} remaining
            </p>
            <button
              onClick={() => { onSuccess(); onClose() }}
              className="mt-4 px-6 h-10 rounded-lg bg-foreground text-background text-sm font-bold"
            >
              Close
            </button>
          </div>
        )}

        {/* ── DONE (full payment) ── */}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-2 py-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 size={32} className="text-emerald-600" />
            </div>
            <p className="font-bold text-foreground text-lg">Payment Recorded</p>
            <p className="text-sm text-slate-500">
              {formatINR(recordedAmount)} via {methodLabel}
            </p>
            <button
              onClick={() => { onSuccess(); onClose() }}
              className="mt-4 px-6 h-10 rounded-lg bg-foreground text-background text-sm font-bold"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
