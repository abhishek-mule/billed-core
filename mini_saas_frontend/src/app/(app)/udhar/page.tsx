"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  History,
  Loader2,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  X,
} from "lucide-react"
import { formatINR } from "@/lib/utils"
import { MerchantLanguage } from "@billzo/shared"
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

type Filter = "all" | "need_action" | "waiting" | "done"

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return ""
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

function recommendation(c: PriorityCase) {
  if (c.nextActionType === "review_payment") {
    return {
      label: "Review Payment",
      reason: "A payment needs confirmation before this can be marked done.",
      icon: CreditCard,
      tone: "text-emerald-700 bg-emerald-50 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/30",
      primary: "Receive Payment",
      state: "need_action" as const,
    }
  }
  if (c.brokenPromises > 0) {
    return {
      label: "Call Customer",
      reason: "A payment promise was missed. Calling is better than another reminder.",
      icon: Phone,
      tone: "text-rose-700 bg-rose-50 border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/30",
      primary: "Call",
      state: "need_action" as const,
    }
  }
  if (c.ignoredReminders >= 3) {
    return {
      label: "Call Instead",
      reason: "Three reminders were ignored. A direct follow-up is more likely to work.",
      icon: Phone,
      tone: "text-amber-700 bg-amber-50 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/30",
      primary: "Call",
      state: "need_action" as const,
    }
  }
  if (c.promiseToPayDate) {
    const due = new Date(c.promiseToPayDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (due <= today) {
      return {
        label: "Promise Today",
        reason: `Expected today. Follow up if payment does not arrive.`,
        icon: Clock,
        tone: "text-amber-700 bg-amber-50 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/30",
        primary: "Review",
        state: "need_action" as const,
      }
    }
    return {
      label: "Wait",
      reason: `Customer promised payment on ${formatDate(c.promiseToPayDate)}. No action needed now.`,
      icon: Clock,
      tone: "text-sky-700 bg-sky-50 border-sky-100 dark:bg-sky-950/20 dark:border-sky-900/30",
      primary: "Waiting",
      state: "waiting" as const,
    }
  }
  return {
    label: c.oldestOverdueDays > 0 ? "Send Reminder" : "Receive Payment",
    reason: c.oldestOverdueDays > 0
      ? `${c.oldestOverdueDays} days overdue. BillZo recommends following up now.`
      : "Money is pending from this customer.",
    icon: c.oldestOverdueDays > 0 ? MessageSquare : CreditCard,
    tone: "text-primary bg-primary/10 border-primary/15",
    primary: c.oldestOverdueDays > 0 ? "Reminder" : "Receive Payment",
    state: "need_action" as const,
  }
}

function loadDoneIds(): Set<string> {
  try {
    const raw = localStorage.getItem("udhar_done_ids")
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function saveDoneIds(ids: Set<string>) {
  try {
    localStorage.setItem("udhar_done_ids", JSON.stringify([...ids]))
  } catch {}
}

export default function UdharPage() {
  const [raw, setRaw] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [sending, setSending] = useState<string | null>(null)
  const [doneIds, setDoneIds] = useState<Set<string>>(loadDoneIds)
  const [promiseFor, setPromiseFor] = useState<PriorityCase | null>(null)
  const [paymentFor, setPaymentFor] = useState<PriorityCase | null>(null)
  const [historyFor, setHistoryFor] = useState<PriorityCase | null>(null)

  useEffect(() => {
    saveDoneIds(doneIds)
  }, [doneIds])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/recovery/queue", { credentials: "include" })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      setRaw(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Udhar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const onChanged = () => load()
    window.addEventListener("billzo:changed", onChanged)
    return () => window.removeEventListener("billzo:changed", onChanged)
  }, [load])

  const isPreview = raw?.access === "preview"
  const priorityCases: PriorityCase[] = raw?.access === "full" ? (raw?.summary?.priorityCases || []) : []
  const totalOverdue = isPreview ? (raw?.data?.totalOverdue || 0) : (raw?.summary?.stuckMoneyTotal || 0)
  const samples = raw?.data?.samples || []

  useEffect(() => {
    priorityCases.slice(0, 10).forEach(c => prefetchCustomerTimeline(c.customerId))
  }, [priorityCases])

  const q = searchQuery.toLowerCase().trim()
  const rows = useMemo(() => {
    return priorityCases
      .map(c => ({ customer: c, rec: recommendation(c), done: doneIds.has(c.customerId) }))
      .filter(row => {
        if (q && !row.customer.customerName.toLowerCase().includes(q)) return false
        if (filter === "all") return true
        if (filter === "done") return row.done
        if (row.done) return false
        if (filter === "waiting") return row.rec.state === "waiting"
        return row.rec.state === "need_action"
      })
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1
        if (a.rec.state !== b.rec.state) return a.rec.state === "need_action" ? -1 : 1
        return b.customer.attentionScore - a.customer.attentionScore
      })
  }, [doneIds, filter, priorityCases, q])

  const counts = useMemo(() => {
    const mapped = priorityCases.map(c => ({ rec: recommendation(c), done: doneIds.has(c.customerId) }))
    return {
      all: mapped.length,
      need_action: mapped.filter(r => !r.done && r.rec.state === "need_action").length,
      waiting: mapped.filter(r => !r.done && r.rec.state === "waiting").length,
      done: mapped.filter(r => r.done).length,
    }
  }, [doneIds, priorityCases])

  function markDone(customerId: string) {
    setDoneIds(prev => {
      const next = new Set(prev)
      next.add(customerId)
      return next
    })
  }

  async function handleSend(c: PriorityCase) {
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
          payload: { origin: "udhar" },
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to send reminder")
      }
      markDone(c.customerId)
      toast.success("Reminder sent")
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reminder")
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-24">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{MerchantLanguage.udhar.heading}</h1>
          <p className="text-sm text-muted-foreground mt-1">{MerchantLanguage.udhar.subtitle}</p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground hover:bg-secondary"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {MerchantLanguage.common.refresh}
        </button>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/30">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} />
            {error}
          </div>
        </div>
      )}

      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={MerchantLanguage.udhar.searchCustomer}
          className="w-full h-10 rounded-xl border border-border bg-card pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={15} />
          </button>
        )}
      </div>

      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-3xl font-extrabold tracking-tight tabular-nums">{formatINR(totalOverdue)}</p>
          <p className="mt-1 text-sm font-medium text-muted-foreground">{MerchantLanguage.udhar.waitingToBeCollected}</p>
      </section>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
        {([
          ["all", MerchantLanguage.common.all, counts.all],
          ["need_action", MerchantLanguage.udhar.needAction, counts.need_action],
          ["waiting", MerchantLanguage.state.waiting, counts.waiting],
          ["done", MerchantLanguage.common.done, counts.done],
        ] as const).map(([id, label, count]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`h-8 whitespace-nowrap rounded-lg px-3 text-xs font-bold transition-colors ${
              filter === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {label} {count > 0 ? count : ""}
          </button>
        ))}
        {counts.done > 0 && (
          <button
            onClick={() => { setDoneIds(new Set()); setFilter("all") }}
            className="ml-auto h-8 whitespace-nowrap rounded-lg px-3 text-xs font-bold text-muted-foreground hover:text-foreground"
            title="Clear all done marks"
          >
            {MerchantLanguage.common.reset}
          </button>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl border border-border bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {!loading && isPreview && (
        <div className="space-y-3">
          {samples.length > 0 ? samples.map((s: any, i: number) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold">Customer {String.fromCharCode(65 + i)}</p>
                  <p className="text-xs text-muted-foreground">{s.daysOverdue > 0 ? `${s.daysOverdue} days overdue` : "Due today"}</p>
                </div>
                <p className="font-extrabold tabular-nums">{formatINR(s.amount)}</p>
              </div>
            </div>
          )) : (
            <EmptyUdhar />
          )}
        </div>
      )}

      {!loading && !isPreview && rows.length === 0 && <EmptyUdhar />}

      {!loading && !isPreview && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map(({ customer: c, rec, done }) => {
            const Icon = done ? CheckCircle2 : rec.icon
            const isSending = sending === c.caseId
            return (
              <article key={c.caseId} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl border ${done ? "border-emerald-100 bg-emerald-50 text-emerald-600" : rec.tone}`}>
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold">{done ? "Done" : rec.label}</p>
                        <Link href={`/parties/${c.customerId}`} className="mt-0.5 block truncate text-sm font-semibold text-foreground hover:text-primary">
                          {c.customerName}
                        </Link>
                      </div>
                      <p className="text-lg font-extrabold tabular-nums">{formatINR(c.totalOverdue)}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.oldestOverdueDays > 0 ? `Overdue ${c.oldestOverdueDays} days` : "Payment pending"}
                      {c.promiseToPayDate ? ` - Promise ${formatDate(c.promiseToPayDate)}` : ""}
                    </p>
                    <div className="mt-3 rounded-lg bg-muted/60 px-3 py-2">
                      <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Recommended</p>
                      <p className="mt-0.5 text-sm font-bold">{done ? "Completed" : rec.primary}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{done ? "This item was handled in this session." : rec.reason}</p>
                    </div>

                    {!done && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => setPaymentFor(c)}
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700"
                        >
                          <CreditCard size={13} />
                          Receive Payment
                        </button>
                        <button
                          onClick={() => handleSend(c)}
                          disabled={isSending}
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/95 disabled:opacity-50"
                        >
                          {isSending ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />}
                          Reminder
                        </button>
                        <button
                          onClick={() => setPromiseFor(c)}
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground hover:bg-secondary"
                        >
                          Promise
                        </button>
                        <button
                          onClick={() => setHistoryFor(c)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-secondary"
                          title="History"
                        >
                          <History size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {promiseFor && (
        <PromiseModal
          customerId={promiseFor.customerId}
          customerName={promiseFor.customerName}
          amount={promiseFor.totalOverdue}
          caseId={promiseFor.caseId}
          onClose={() => setPromiseFor(null)}
          onSuccess={() => { markDone(promiseFor.customerId); setPromiseFor(null); load() }}
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
          onSuccess={() => { markDone(paymentFor.customerId); setPaymentFor(null); load() }}
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

function EmptyUdhar() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
      <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
      <p className="mt-3 text-sm font-bold">{MerchantLanguage.udhar.allCaughtUp}</p>
      <p className="mt-1 text-xs text-muted-foreground">{MerchantLanguage.udhar.noOutstandingPayments}</p>
      <div className="flex items-center justify-center gap-3 mt-5">
        <Link href="/pos" className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-foreground text-background text-xs font-semibold hover:bg-foreground/90">
          {MerchantLanguage.action.createInvoice}
        </Link>
        <Link href="/parties/add" className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-secondary">
          {MerchantLanguage.action.addCustomer}
        </Link>
      </div>
    </div>
  )
}
