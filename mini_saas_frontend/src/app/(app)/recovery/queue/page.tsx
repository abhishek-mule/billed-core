"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  Loader2, Send, Hand, RefreshCw,
  AlertTriangle, CheckCircle2, History, Banknote,
  Clock, Users, ChevronRight, Zap, Shield, AlertCircle,
  CreditCard, CalendarDays, CheckSquare, X, PhoneOff,
} from "lucide-react"
import { formatINR } from "@/lib/utils"
import { MerchantLanguage } from "@billzo/shared"
import { trackQueueEvent, events as E } from "@/lib/billzo/analytics"
import { PromiseModal } from "@/components/billzo/PromiseModal"
import { PaymentModal } from "@/components/billzo/PaymentModal"
import { HistoryDrawer, prefetchCustomerTimeline } from "@/components/billzo/HistoryDrawer"
import { PageShell, BackLink } from "@/components/billzo/PageShell"
import { ErrorState } from "@/components/billzo/ErrorState"
import { Skeleton, SkeletonCard } from "@/components/billzo/Skeleton"

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
  lastDeliveryStatus?: string | null
  lastDeliveryActivity?: string | null
}

interface SampleRow {
  customer: string
  amount: number
  daysOverdue: number
}

type SectionId = 'promise_due' | 'broken_promise' | 'overdue' | 'partial' | 'promise_made'

const SECTION_ORDER: SectionId[] = ['promise_due', 'broken_promise', 'overdue', 'partial', 'promise_made']

const SECTION_CONFIG: Record<SectionId, { label: string; dot: string }> = {
  promise_due: { label: 'Promise Due Today', dot: 'bg-warning' },
  broken_promise: { label: 'Broken Promise', dot: 'bg-danger' },
  overdue: { label: 'Overdue', dot: 'bg-outstanding' },
  partial: { label: 'Partial Payment', dot: 'bg-info' },
  promise_made: { label: 'Promise Made', dot: 'bg-recovery' },
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
  if (c.brokenPromises > 0) return 'text-danger'
  if (c.promiseToPayDate) {
    const due = new Date(c.promiseToPayDate)
    if (due <= new Date()) return 'text-warning'
    return 'text-recovery'
  }
  if (c.ignoredReminders >= 3) return 'text-muted-foreground'
  if (c.oldestOverdueDays > 0) return 'text-outstanding'
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

type DeliveryMeta = { label: string; color: string; icon: any; title: string }

function deliveryStatus(c: PriorityCase): DeliveryMeta | null {
  const s = c.lastDeliveryStatus
  if (!s) return null
  switch (s) {
    case "delivered":
      return { label: "Delivered", color: "bg-recovery-soft text-recovery", icon: CheckCircle2, title: `Delivered ${formatLastContact(c.lastDeliveryActivity)}` }
    case "read":
      return { label: "Read", color: "bg-info-soft text-info", icon: CheckCircle2, title: `Read ${formatLastContact(c.lastDeliveryActivity)}` }
    case "sent":
      return { label: "Sent", color: "bg-outstanding-soft text-outstanding", icon: Send, title: `Sent ${formatLastContact(c.lastDeliveryActivity)}` }
    case "queued":
      return { label: "Queued", color: "bg-muted text-muted-foreground", icon: Clock, title: "Queued for delivery" }
    case "failed":
      return { label: "Failed", color: "bg-danger-soft text-danger", icon: AlertTriangle, title: "Delivery failed" }
    default:
      return null
  }
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
  const [bulkSending, setBulkSending] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
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
  useEffect(() => {
    if (!selectMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectMode(false)
        clearSelection()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectMode])

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
        if (data.error === "FEATURE_LOCKED" || data.code === "FEATURE_LOCKED") {
          toast.error("Upgrade to Pro to send reminders from the queue")
        } else if (data.error === "TENANT_NOT_FOUND" || data.code === "TENANT_NOT_FOUND") {
          toast.error("Session expired — please sign in again")
        } else {
          toast.error(data.error || data.message || "Failed to send reminder")
        }
      }
    } catch {
      toast.error("Network error — could not send reminder")
    } finally {
      setSending(null)
    }
  }

  const toggleSelect = (caseId: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(caseId)) next.delete(caseId)
      else next.add(caseId)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelected(prev => {
      if (prev.size === priorityCases.length) return new Set<string>()
      return new Set(priorityCases.map(c => c.caseId))
    })
  }

  const clearSelection = () => setSelected(new Set<string>())

  const handleBulkSend = async () => {
    const ids = priorityCases.filter(c => selected.has(c.caseId)).map(c => c.caseId)
    if (ids.length === 0) return
    setBulkSending(true)
    trackQueueEvent("BULK_SEND" as any, undefined, { count: ids.length })
    try {
      const res = await fetch("/api/recovery/queue/actions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_reminder",
          caseIds: ids,
          payload: { origin: "recovery_queue_bulk" },
        }),
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        const n = data.succeeded ?? ids.length
        toast.success(`Reminder${n === 1 ? "" : "s"} sent to ${n} customer${n === 1 ? "" : "s"}`)
        ids.forEach(id => {
          const c = priorityCases.find(x => x.caseId === id)
          if (c) markActioned(c.customerId)
        })
        clearSelection()
        load()
      } else {
        const data = await res.json().catch(() => ({}))
        if (data.error === "QUOTA_EXCEEDED" || data.code === "QUOTA_EXCEEDED") {
          toast.error("You've reached your reminder limit — upgrade to Pro")
        } else if (data.error === "FEATURE_LOCKED") {
          toast.error("Upgrade to Pro to send reminders")
        } else {
          toast.error(data.error || data.message || "Some reminders failed to send")
        }
      }
    } catch {
      toast.error("Network error — could not send reminders")
    } finally {
      setBulkSending(false)
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
    <PageShell title="Recovery Queue" subtitle="Today's collection">
      <div className="space-y-5">

        {/* Header */}
        <BackLink href="/recovery" label="Recovery" />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">{MerchantLanguage.recovery.queue}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Today's collection</p>
          </div>
          <div className="flex items-center gap-2">
            {!isPreview && priorityCases.length > 0 && (
              <button
                onClick={() => {
                  const next = !selectMode
                  setSelectMode(next)
                  if (!next) clearSelection()
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium bg-card hover:bg-muted"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                {selectMode ? "Done" : "Multi-select"}
              </button>
            )}
            <button
              onClick={load}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground bg-card hover:bg-muted"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {MerchantLanguage.common.refresh}
            </button>
          </div>
        </div>

        {error && (
          <ErrorState severity="error" message={error} onRetry={load} />
        )}

        {loading && (
          <div className="space-y-4">
            <Skeleton className="h-28 rounded-xl" />
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
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
                      <CheckCircle2 size={12} className="text-success" />
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
                      <div key={i} className="bg-card border border-border rounded-2xl shadow-sm p-4">
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
                      <CheckCircle2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                      <p className="font-semibold text-foreground">No outstanding payments</p>
                      <p className="text-xs text-muted-foreground mt-1">Keep sending invoices to track recovery.</p>
                    </div>
                  )}
                </div>

                {samples.length > 0 && (
                  <div className="bg-foreground rounded-xl p-5 text-center">
                    <Zap className="h-6 w-6 text-warning mx-auto mb-2" />
                    <p className="font-bold text-background text-lg">Upgrade to Pro</p>
                    <p className="text-sm text-muted-foreground mt-1 mb-4">
                      See customer names, send reminders, and track promises.
                    </p>
                    <Link
                      href="/settings"
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-warning hover:bg-warning/90 text-foreground font-bold text-sm transition-all"
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
                <div className="bg-card border border-border rounded-2xl shadow-sm p-8 text-center">
                  <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-3" />
                  <p className="font-semibold text-foreground text-lg">All caught up</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    No customers need follow-up right now.
                  </p>
                  <Link
                    href="/pos"
                    className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-lg bg-success text-success-foreground text-sm font-medium hover:bg-success/90 transition-colors"
                  >
                    + Create Invoice
                  </Link>
                </div>
            )}

            {/* What to do — actionable summary before the list */}
            {!isPreview && !allDone && (sections !== null || priorityCases.length > 0) && (() => {
              const promisesDue = raw?.summary?.promiseSummary?.dueToday ?? 0
              const broken = priorityCases.filter(c => c.brokenPromises > 0).length
              const highPriority = priorityCases.filter(c => c.brokenPromises > 0 || (c.promiseToPayDate && new Date(c.promiseToPayDate) <= new Date())).length
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="flex items-center gap-2 bg-recovery-soft rounded-xl px-4 py-3">
                    <AlertTriangle size={16} className="text-recovery flex-shrink-0" />
                    <span className="text-sm font-semibold text-foreground">{needCount} customer{needCount !== 1 ? "s" : ""} need attention</span>
                  </div>
                  {highPriority > 0 && (
                    <div className="flex items-center gap-2 bg-overdue-soft rounded-xl px-4 py-3">
                      <AlertCircle size={16} className="text-overdue flex-shrink-0" />
                      <span className="text-sm font-semibold text-foreground">{highPriority} high priority{highPriority !== 1 ? "" : ""}</span>
                    </div>
                  )}
                  {promisesDue > 0 && (
                    <div className="flex items-center gap-2 bg-outstanding-soft rounded-xl px-4 py-3">
                      <Clock size={16} className="text-outstanding flex-shrink-0" />
                      <span className="text-sm font-semibold text-foreground">{promisesDue} promise{promisesDue !== 1 ? "s" : ""} expire{promisesDue === 1 ? "s" : ""} today</span>
                    </div>
                  )}
                </div>
              )
            })()}

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
                      {selectMode && (
                        <button
                          onClick={toggleSelectAll}
                          className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                        >
                          {selected.size === priorityCases.length ? "Clear all" : "Select all"}
                        </button>
                      )}
                    </div>
                    {section.items.map(c => (
                      <CustomerCard
                        key={c.caseId}
                        customer={c}
                        sending={sending}
                        selectMode={selectMode}
                        selected={selected.has(c.caseId)}
                        onToggleSelect={() => toggleSelect(c.caseId)}
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
              <div className="bg-card border-2 border-success/30 rounded-xl p-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft mx-auto">
                  <CheckCircle2 size={36} className="text-success" />
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

      {/* Bulk action bar */}
      {selectMode && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-40 px-4">
          <div className="mx-auto max-w-md flex items-center gap-3 bg-foreground text-background rounded-2xl px-4 py-3 shadow-xl">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">{selected.size} selected</p>
              <p className="text-xs text-muted-foreground">
                {formatINR(priorityCases.filter(c => selected.has(c.caseId)).reduce((s, c) => s + c.totalOverdue, 0))} outstanding
              </p>
            </div>
            <button
              onClick={handleBulkSend}
              disabled={bulkSending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 disabled:opacity-50 active:scale-[0.97] transition-all"
            >
              {bulkSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Send Reminder
            </button>
            <button
              onClick={() => { clearSelection(); setSelectMode(false) }}
              className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
              title="Exit multi-select"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      </PageShell>
  )
}

// ── Customer Card ──

function CustomerCard({
  customer: c,
  sending,
  selectMode = false,
  selected = false,
  onToggleSelect,
  onSend,
  onPromise,
  onPayment,
  onHistory,
  signalColor,
  formatSignal,
}: {
  customer: PriorityCase
  sending: string | null
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: () => void
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
    ? 'bg-danger-soft text-danger'
    : c.promiseToPayDate
      ? (new Date(c.promiseToPayDate) <= new Date() ? 'bg-warning-soft text-warning' : 'bg-recovery-soft text-recovery')
      : c.ignoredReminders >= 3
        ? 'bg-muted text-foreground'
        : 'bg-outstanding-soft text-outstanding'

  return (
    <div className={`bg-card border rounded-2xl shadow-sm p-4 transition-shadow ${selected ? 'border-primary ring-1 ring-primary/40' : 'border-border'}`}>
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
            <span className="text-xs text-muted-foreground font-medium">Customer Balance</span>
          </div>
        </div>
        {c.phone && (
          <span className="hidden sm:block text-xs text-muted-foreground font-mono">{c.phone}</span>
        )}
        {selectMode && (
          <button
            onClick={() => onToggleSelect?.()}
            className={`flex-shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-md border transition-colors ${
              selected ? "bg-primary border-primary text-primary-foreground" : "border-border text-transparent hover:text-muted-foreground"
            }`}
            aria-pressed={selected}
          >
            <CheckSquare size={14} />
          </button>
        )}
      </div>

      {/* Status chip */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${statusColor}`}>
          {c.promiseToPayDate && new Date(c.promiseToPayDate) <= new Date() && <Clock size={11} />}
          {c.brokenPromises > 0 && <AlertCircle size={11} />}
          {c.lastPaymentAt && <CheckCircle2 size={11} />}
          {formatSignal}
        </span>
        {(() => {
          const d = deliveryStatus(c)
          if (!d) return null
          const Icon = d.icon
          return (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${d.color}`} title={d.title}>
              <Icon size={11} />
              {d.label}
            </span>
          )
        })()}
      </div>

      {/* Journey steps */}
      <div className="flex items-center gap-2 mt-2.5">
        {stages.map((s, i) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${s.active ? 'bg-muted-foreground/20' : 'bg-muted'}`} />
            <span className={`text-[10px] font-medium ${s.active ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
              {s.label}
            </span>
            {i < stages.length - 1 && (
              <span className="text-muted-foreground/40 text-[10px]">—</span>
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
        <div className="mt-2 rounded-lg bg-info-soft border border-border px-3 py-2">
          <p className="text-xs text-info">
            <span className="font-semibold">Last Payment:</span> {formatINR(c.lastPaymentAmount)} via {formatPaymentMethod(c.lastPaymentMethod)}
            <span className="text-info/70 ml-1">{formatDate(c.lastPaymentAt)}</span>
          </p>
        </div>
      )}

      {/* Reminder count */}
      {c.ignoredReminders > 0 && (
        <p className="text-[10px] text-muted-foreground mt-1.5">
          {c.ignoredReminders} reminder{c.ignoredReminders > 1 ? "s" : ""} ignored
        </p>
      )}

      {/* Phone missing — blocking */}
      {!c.phone && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-danger-soft px-2.5 py-1.5 text-[11px] font-semibold text-danger">
          <PhoneOff size={12} />
          Phone number missing — can&apos;t send reminders
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
        <button
          onClick={() => { trackQueueEvent(E.record_payment, c.customerId, { caseId: c.caseId }); onPayment(c) }}
          disabled={isSending}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-success text-success-foreground text-xs font-bold hover:bg-success/90 disabled:opacity-50 transition-all active:scale-[0.97]"
        >
          <CreditCard size={13} />
          Record Payment
        </button>
        <button
          onClick={() => onSend(c)}
          disabled={isSending}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.97]"
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
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-border bg-card text-foreground text-xs font-semibold hover:bg-muted transition-all active:scale-[0.97] disabled:opacity-50"
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
