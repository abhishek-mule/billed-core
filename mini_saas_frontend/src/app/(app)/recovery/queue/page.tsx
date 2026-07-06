"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  Loader2, Send, Hand, RefreshCw,
  AlertTriangle, CheckCircle2, History, Banknote,
  Clock, Users, ChevronRight, Zap, Shield, AlertCircle,
  CreditCard, CalendarDays,
} from "lucide-react"
import { formatINR } from "@/lib/utils"
import { MerchantLanguage } from "@billzo/shared"
import { trackQueueEvent, events as E } from "@/lib/billzo/analytics"
import { PromiseModal } from "@/components/billzo/PromiseModal"
import { PaymentModal } from "@/components/billzo/PaymentModal"
import { HistoryDrawer, prefetchCustomerTimeline } from "@/components/billzo/HistoryDrawer"

interface PriorityCase {
  caseId: string
  customerId: string
  customerName: string
  phone: string
  totalOverdue: number
  oldestOverdueDays: number
  attentionScore: number
  nextActionType: string
  promiseToPayDate: string | null
  ignoredReminders: number
  brokenPromises: number
  openInvoiceCount: number
  automationMode: string
  lastActivityAt?: string | null
  lastPaymentAmount?: number
  lastPaymentMethod?: string
  lastPaymentAt?: string | null
  nextReminderAt?: string | null
}

interface SampleRow {
  customer: string
  amount: number
  daysOverdue: number
}

type SectionId = 'promise_due' | 'broken_promise' | 'overdue' | 'partial' | 'promise_made'

const SECTION_ORDER: SectionId[] = ['promise_due', 'broken_promise', 'overdue', 'partial', 'promise_made']

const SECTION_CONFIG: Record<SectionId, { label: string; dot: string }> = {
  promise_due: { label: 'Promise Due Today', dot: 'bg-amber-500' },
  broken_promise: { label: 'Broken Promise', dot: 'bg-rose-500' },
  overdue: { label: 'Overdue', dot: 'bg-orange-500' },
  partial: { label: 'Partial Payment', dot: 'bg-blue-500' },
  promise_made: { label: 'Promise Made', dot: 'bg-purple-500' },
}

function getSection(c: PriorityCase): SectionId {
  if (c.brokenPromises > 0) return 'broken_promise'
  if (c.promiseToPayDate) {
    const due = new Date(c.promiseToPayDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (due <= today) return 'promise_due'
    return 'promise_made'
  }
  if (c.lastPaymentAmount && c.lastPaymentAmount < c.totalOverdue) return 'partial'
  return 'overdue'
}

function signalColor(c: PriorityCase): string {
  if (c.brokenPromises > 0) return 'text-rose-600'
  if (c.promiseToPayDate) {
    const due = new Date(c.promiseToPayDate)
    if (due <= new Date()) return 'text-amber-600'
    return 'text-purple-600'
  }
  if (c.ignoredReminders >= 3) return 'text-muted-foreground'
  if (c.oldestOverdueDays > 0) return 'text-orange-600'
  return 'text-muted-foreground'
}

function formatSignal(c: PriorityCase): string {
  if (c.brokenPromises > 0) return 'Broken Promise'
  if (c.promiseToPayDate) {
    const due = new Date(c.promiseToPayDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (due <= today) return 'Promise Due Today'
    const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return `Promise in ${diff}d`
  }
  if (c.ignoredReminders >= 3) return 'Needs call'
  if (c.oldestOverdueDays > 0) return `Overdue by ${c.oldestOverdueDays}d`
  return 'Pending'
}

function formatLastContact(dateStr: string | null | undefined): string {
  if (!dateStr) return "No contact yet"
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60000) return "just now"
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ""
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

function formatActionTime(c: PriorityCase): string {
  if (c.promiseToPayDate) {
    const due = new Date(c.promiseToPayDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (due <= today) return "Call Today"
    const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff === 1) return "Call Tomorrow"
    return `Call in ${diff}d`
  }
  if (c.ignoredReminders >= 3) return "Personal visit needed"
  if (c.brokenPromises > 0) return "Call Today"
  return "Send reminder"
}

const JOURNEY_LABELS = ['Overdue', 'Promise', 'Due', 'Paid'] as const
type JourneyLabel = typeof JOURNEY_LABELS[number]

function getJourneyStages(c: PriorityCase): Array<{ label: JourneyLabel; active: boolean }> {
  const hasPromise = !!c.promiseToPayDate
  const isPromiseDue = hasPromise && new Date(c.promiseToPayDate!) <= new Date()
  const hasPayment = !!c.lastPaymentAt

  return [
    { label: 'Overdue', active: true },
    { label: 'Promise', active: hasPromise || c.brokenPromises > 0 },
    { label: 'Due', active: isPromiseDue },
    { label: 'Paid', active: hasPayment },
  ]
}

function formatPaymentMethod(method: string | undefined): string {
  const labels: Record<string, string> = {
    cash: 'Cash',
    upi: 'UPI',
    bank_transfer: 'Bank Transfer',
    cheque: 'Cheque',
  }
  return labels[method || ''] || method || 'Payment'
}

// ── Component ──

export default function RecoveryQueuePage() {
  const [raw, setRaw] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [promiseFor, setPromiseFor] = useState<PriorityCase | null>(null)
  const [paymentFor, setPaymentFor] = useState<PriorityCase | null>(null)
  const [historyFor, setHistoryFor] = useState<PriorityCase | null>(null)
  const [actionedIds, setActionedIds] = useState<Set<string>>(new Set())
  const completedFired = useRef(false)
  const queueStartTime = useRef(Date.now())
  const queueVersion = useRef(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/recovery/queue", { credentials: "include" })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const json = await res.json()
      setRaw(json)
      queueVersion.current++
      completedFired.current = false
    } catch (err: any) {
      setError(err.message || "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { queueStartTime.current = Date.now(); load(); trackQueueEvent(E.view_queue) }, [load])
  useEffect(() => {
    window.addEventListener("billzo:changed", load)
    return () => window.removeEventListener("billzo:changed", load)
  }, [load])

  const prevCompletion = useRef<number>(-1)
  const priorityCases: PriorityCase[] = raw?.access === "full" ? (raw?.summary?.priorityCases || []) : []
  const needCount = priorityCases.length
  const doneCount = actionedIds.size
  const allDone = needCount > 0 && doneCount >= needCount
  useEffect(() => {
    if (allDone && !completedFired.current && prevCompletion.current !== doneCount) {
      completedFired.current = true
      prevCompletion.current = doneCount
      const timeToComplete = Date.now() - queueStartTime.current
      trackQueueEvent("QUEUE_COMPLETED" as any, undefined, { count: needCount, timeToCompleteMs: timeToComplete })
    } else if (!allDone) {
      prevCompletion.current = -1
    }
  }, [allDone, doneCount, needCount])

  const markActioned = useCallback((customerId: string) => {
    setActionedIds(prev => {
      const next = new Set(prev)
      next.add(customerId)
      return next
    })
  }, [])

  const isPreview = raw?.access === "preview"
  const totalOverdue = isPreview ? (raw?.data?.totalOverdue || 0) : (raw?.summary?.stuckMoneyTotal || 0)
  const customersNeedingAction = isPreview ? (raw?.data?.overdueCount || 0) : (raw?.summary?.customersNeedingAction || 0)
  const samples: SampleRow[] = raw?.data?.samples || []

  const handleSend = async (c: PriorityCase) => {
    trackQueueEvent(E.send_reminder, c.customerId, { caseId: c.caseId })
    setSending(c.caseId)
    try {
      const res = await fetch("/api/recovery/queue/actions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: c.caseId,
          action: "send_reminder",
          customerId: c.customerId,
          payload: { origin: "recovery_queue" },
        }),
      })
      if (res.ok) {
        markActioned(c.customerId)
        toast.success("Reminder sent")
        load()
      } else {
        const data = await res.json().catch(() => ({}))
        if (data.error === "FEATURE_LOCKED") {
          toast.error("Upgrade to Pro to send reminders from the queue")
        } else {
          toast.error(data.error || "Failed to send reminder")
        }
      }
    } catch {
      toast.error("Network error — could not send reminder")
    } finally {
      setSending(null)
    }
  }

  const sections = priorityCases.length
    ? SECTION_ORDER.map(id => ({
        id,
        items: priorityCases
          .filter(c => getSection(c) === id)
          .sort((a, b) => b.totalOverdue - a.totalOverdue),
      })).filter(s => s.items.length > 0)
    : null

  return (
    <div className="min-h-screen bg-muted/50 pb-8">
      <div className="max-w-2xl mx-auto px-4 lg:px-6 py-5 lg:py-8 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">{MerchantLanguage.recovery.queue}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Today's collection</p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground bg-card hover:bg-muted"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {MerchantLanguage.common.refresh}
          </button>
        </div>

        {error && (
          <div className="border border-red-200 rounded-xl p-4 bg-card">
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle size={16} />
              {error}
            </div>
          </div>
        )}

        {loading && (
          <div className="space-y-4">
            <div className="h-28 bg-card rounded-xl border border-border animate-pulse" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-card rounded-xl border border-border animate-pulse" />
            ))}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Hero Card */}
            <div className="bg-foreground text-background rounded-2xl p-5 lg:p-6 shadow-lg dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <Banknote size={14} />
                <span className="uppercase tracking-wider font-semibold">To collect</span>
              </div>
              <p className="text-3xl lg:text-4xl font-bold tabular-nums tracking-tight">
                {formatINR(totalOverdue)}
              </p>
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Users size={12} />
                  {customersNeedingAction} customer{customersNeedingAction !== 1 ? "s" : ""}
                </span>
                {!isPreview && priorityCases.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    {allDone ? (
                      <CheckCircle2 size={12} className="text-emerald-400" />
                    ) : (
                      <CheckCircle2 size={12} />
                    )}
                    {allDone ? "All done" : `Completed: ${doneCount}/${needCount}`}
                  </span>
                )}
              </div>
            </div>

            {/* Preview/Paywall */}
            {isPreview && (
              <div className="space-y-4">
                <div className="space-y-2">
                  {samples.length > 0 ? (
                    samples.map((s, i) => (
                      <div key={i} className="bg-card border border-border rounded-xl p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                              {s.customer.slice(-1)}
                            </span>
                            <div>
                              <p className="font-medium text-foreground">{s.customer}</p>
                              <p className="text-xs text-muted-foreground">
                                {s.daysOverdue > 0 ? `${s.daysOverdue} days overdue` : "Due today"}
                              </p>
                            </div>
                          </div>
                          <p className="font-bold text-foreground tabular-nums">{formatINR(s.amount)}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center">
                      <CheckCircle2 className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                      <p className="font-semibold text-foreground">No outstanding payments</p>
                      <p className="text-xs text-muted-foreground mt-1">Keep sending invoices to track recovery.</p>
                    </div>
                  )}
                </div>

                {samples.length > 0 && (
                  <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 text-center">
                    <Zap className="h-6 w-6 text-amber-400 mx-auto mb-2" />
                    <p className="font-bold text-white text-lg">Upgrade to Pro</p>
                    <p className="text-sm text-slate-300 mt-1 mb-4">
                      See customer names, send reminders, and track promises.
                    </p>
                    <Link
                      href="/settings"
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-foreground font-bold text-sm transition-all"
                    >
                      Upgrade Now
                      <ChevronRight size={16} />
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Full Queue */}
            {!isPreview && sections === null && (
              <div className="bg-card border border-border rounded-xl p-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                <p className="font-semibold text-foreground text-lg">All caught up</p>
                <p className="text-sm text-muted-foreground mt-1">
                  No customers need follow-up right now.
                </p>
                <Link
                  href="/pos"
                  className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
                >
                  + Create Invoice
                </Link>
              </div>
            )}

            {!isPreview && sections !== null && !allDone && (
              <>
                {sections.map(section => (
                  <section key={section.id} className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <span className={`w-2 h-2 rounded-full ${SECTION_CONFIG[section.id].dot}`} />
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        {SECTION_CONFIG[section.id].label}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {section.items.length}
                      </span>
                    </div>
                    {section.items.map(c => (
                      <CustomerCard
                        key={c.caseId}
                        customer={c}
                        sending={sending}
                        onSend={handleSend}
                        onPromise={(c) => { setPromiseFor(c) }}
                        onPayment={(c) => { setPaymentFor(c) }}
                        onHistory={(c) => { trackQueueEvent(E.open_history, c.customerId, { caseId: c.caseId }); setHistoryFor(c) }}
                        signalColor={signalColor(c)}
                        formatSignal={formatSignal(c)}
                      />
                    ))}
                  </section>
                ))}

                <div className="border-t border-border pt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{needCount} customer{needCount !== 1 ? "s" : ""} need{needCount === 1 ? "s" : ""} attention</span>
                  <Link href="/recovery/history" className="flex items-center gap-1 text-primary hover:underline font-medium">
                    <History size={12} />
                    View History
                  </Link>
                </div>
              </>
            )}

            {/* Queue Complete state — all customers actioned */}
            {!isPreview && sections !== null && allDone && (
              <div className="bg-card border-2 border-emerald-200 rounded-xl p-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mx-auto">
                  <CheckCircle2 size={36} className="text-emerald-600" />
                </div>
                <h2 className="text-xl font-bold text-foreground mt-4">Today's actions complete</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {needCount} customer{needCount !== 1 ? "s" : ""} processed
                </p>
                <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
                  <span>{formatINR(totalOverdue)} still outstanding</span>
                  <span>&middot;</span>
                  <span>{doneCount} action{doneCount !== 1 ? "s" : ""} taken</span>
                </div>
                <Link
                  href="/recovery/history"
                  className="inline-flex items-center gap-1.5 mt-6 px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground bg-card hover:bg-muted transition-colors"
                >
                  <History size={14} />
                  View History
                </Link>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {promiseFor && (
        <PromiseModal
          customerId={promiseFor.customerId}
          customerName={promiseFor.customerName}
          amount={promiseFor.totalOverdue}
          caseId={promiseFor.caseId}
          onClose={() => setPromiseFor(null)}
          onSuccess={() => { setPromiseFor(null); load(); markActioned(promiseFor.customerId) }}
        />
      )}
      {paymentFor && (
        <PaymentModal
          customerId={paymentFor.customerId}
          customerName={paymentFor.customerName}
          amount={paymentFor.totalOverdue}
          openInvoiceCount={paymentFor.openInvoiceCount}
          caseId={paymentFor.caseId}
          onClose={() => setPaymentFor(null)}
          onSuccess={() => { setPaymentFor(null); load(); markActioned(paymentFor.customerId) }}
        />
      )}
      <HistoryDrawer
        customerId={historyFor?.customerId ?? ""}
        customerName={historyFor?.customerName ?? ""}
        open={!!historyFor}
        onClose={() => setHistoryFor(null)}
      />
    </div>
  )
}

// ── Customer Card ──

function CustomerCard({
  customer: c,
  sending,
  onSend,
  onPromise,
  onPayment,
  onHistory,
  signalColor,
  formatSignal,
}: {
  customer: PriorityCase
  sending: string | null
  onSend: (c: PriorityCase) => void
  onPromise: (c: PriorityCase) => void
  onPayment: (c: PriorityCase) => void
  onHistory: (c: PriorityCase) => void
  signalColor: string
  formatSignal: string
}) {
  const isSending = sending === c.caseId
  const stages = getJourneyStages(c)

  // Prefetch timeline data when card mounts so History drawer opens instantly
  useEffect(() => { prefetchCustomerTimeline(c.customerId) }, [c.customerId])
  const statusColor = c.brokenPromises > 0
    ? 'bg-rose-100 text-rose-700'
    : c.promiseToPayDate
      ? (new Date(c.promiseToPayDate) <= new Date() ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700')
      : c.ignoredReminders >= 3
        ? 'bg-muted text-foreground'
        : 'bg-orange-100 text-orange-700'

  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:shadow-sm dark:hover:shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-shadow">
      {/* Header: name + amount */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/parties/${c.customerId}`}
            className="font-semibold text-foreground hover:text-primary transition-colors truncate"
          >
            {c.customerName}
          </Link>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="text-2xl font-bold text-foreground tabular-nums">
              {formatINR(c.totalOverdue)}
            </span>
            <span className="text-xs text-muted-foreground font-medium">Outstanding</span>
          </div>
        </div>
        {c.phone && (
          <span className="hidden sm:block text-xs text-muted-foreground font-mono">{c.phone}</span>
        )}
      </div>

      {/* Status chip */}
      <div className="mt-3">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${statusColor}`}>
          {c.promiseToPayDate && new Date(c.promiseToPayDate) <= new Date() && <Clock size={11} />}
          {c.brokenPromises > 0 && <AlertCircle size={11} />}
          {c.lastPaymentAt && <CheckCircle2 size={11} />}
          {formatSignal}
        </span>
      </div>

      {/* Journey steps */}
      <div className="flex items-center gap-2 mt-2.5">
        {stages.map((s, i) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${s.active ? 'bg-muted-foreground/20' : 'bg-muted'}`} />
            <span className={`text-[10px] font-medium ${s.active ? 'text-muted-foreground' : 'text-slate-300'}`}>
              {s.label}
            </span>
            {i < stages.length - 1 && (
              <span className="text-slate-200 text-[10px]">—</span>
            )}
          </div>
        ))}
      </div>

      {/* Details row */}
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {c.promiseToPayDate && (
          <span>
            <span className="font-medium text-muted-foreground">Expected Payment:</span> {formatDate(c.promiseToPayDate)}
          </span>
        )}
        <span>
          <span className="font-medium text-muted-foreground">Last Contact:</span> {formatLastContact(c.lastActivityAt)}
        </span>
        {c.nextReminderAt && (
          <span>
            <span className="font-medium text-muted-foreground">Next Reminder:</span> {formatDate(c.nextReminderAt)} {new Date(c.nextReminderAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })}
          </span>
        )}
        {!c.nextReminderAt && (
          <span>
            <span className="font-medium text-muted-foreground">Next Action:</span> {formatActionTime(c)}
          </span>
        )}
      </div>

      {/* Last payment info */}
      {c.lastPaymentAt && c.lastPaymentAmount && (
        <div className="mt-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
          <p className="text-xs text-blue-700">
            <span className="font-semibold">Last Payment:</span> {formatINR(c.lastPaymentAmount)} via {formatPaymentMethod(c.lastPaymentMethod)}
            <span className="text-blue-500 ml-1">{formatDate(c.lastPaymentAt)}</span>
          </p>
        </div>
      )}

      {/* Reminder count */}
      {c.ignoredReminders > 0 && (
        <p className="text-[10px] text-muted-foreground mt-1.5">
          {c.ignoredReminders} reminder{c.ignoredReminders > 1 ? "s" : ""} ignored
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
        <button
          onClick={() => { trackQueueEvent(E.record_payment, c.customerId, { caseId: c.caseId }); onPayment(c) }}
          disabled={isSending}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all active:scale-[0.97]"
        >
          <CreditCard size={13} />
          Record Payment
        </button>
        <button
          onClick={() => onSend(c)}
          disabled={isSending}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-primary text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.97]"
        >
          {isSending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Send size={13} />
          )}
          Send Reminder
        </button>
        <button
          onClick={() => { trackQueueEvent(E.mark_promise, c.customerId, { caseId: c.caseId }); onPromise(c) }}
          disabled={isSending}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 text-xs font-semibold transition-all active:scale-[0.97] disabled:opacity-50"
        >
          <Hand size={13} />
          Promise
        </button>
        <button
          onClick={() => onHistory(c)}
          className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
          title="View history"
        >
          <History size={14} />
        </button>
      </div>
    </div>
  )
}
