"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Search, Loader2, CreditCard, Smartphone, Banknote,
  AlertCircle, RefreshCw, X, ChevronRight, Plus,
  TrendingUp, Wallet, RotateCcw, Check, ArrowRight,
} from "lucide-react"
import { db, uuid, notifyChanged } from "@/lib/billzo/db"
import { formatINR } from "@/lib/utils"
import { MerchantLanguage } from "@billzo/shared"
import { getCookie } from "@/lib/cookies"
import type { Customer, Invoice } from "@/lib/billzo/types"

// ── helpers ──
const providerIcon: Record<string, React.ReactNode> = {
  cash: <Banknote className="h-4 w-4" />,
  upi: <Smartphone className="h-4 w-4" />,
  razorpay_test: <CreditCard className="h-4 w-4" />,
}

const methodOptions = [
  { id: "cash", label: "Cash", icon: <Banknote className="h-5 w-5" /> },
  { id: "upi", label: "UPI", icon: <Smartphone className="h-5 w-5" /> },
  { id: "razorpay_test", label: "Card / Online", icon: <CreditCard className="h-5 w-5" /> },
]

const reversalReasons = ["Wrong amount", "Duplicate entry", "Customer dispute", "Payment failed later", "Other"]

function fmtAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function isToday(s: string) {
  const d = new Date(s)
  const t = new Date()
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear()
}

function isYesterday(s: string) {
  const d = new Date(s)
  const y = new Date()
  y.setDate(y.getDate() - 1)
  return d.getDate() === y.getDate() && d.getMonth() === y.getMonth() && d.getFullYear() === y.getFullYear()
}

function getOutstanding(inv: any): number {
  return (inv.total || 0) - (inv.paidAmount || 0)
}

// ── component ──
export default function PulsePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [payments, setPayments] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // modals
  const [selectedPmt, setSelectedPmt] = useState<any | null>(null)
  const [showRecord, setShowRecord] = useState(false)
  const [showReverse, setShowReverse] = useState(false)
  const [reverseReason, setReverseReason] = useState("")
  const [recordStep, setRecordStep] = useState(1)
  const [partyQ, setPartyQ] = useState("")
  const [selectedCust, setSelectedCust] = useState<Customer | null>(null)
  const [pmtAmount, setPmtAmount] = useState("")
  const [selectedMethod, setSelectedMethod] = useState("cash")
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      setError(null)
      const tenantId = getCookie("bz_tenant")
      if (!tenantId) { router.push("/auth"); return }

      const [pmtData, invData, custData] = await Promise.all([
        db().payments.where("tenantId").equals(tenantId).toArray(),
        db().invoices.where("tenantId").equals(tenantId).toArray(),
        db().customers.where("tenantId").equals(tenantId).toArray(),
      ])

      setPayments(pmtData.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      setInvoices(invData)
      setCustomers(custData)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
      console.error("Failed to load pulse:", err)
    } finally {
      setLoading(false)
    }
  }

  // Auto-select customer from payInvoice param
  useEffect(() => {
    if (loading || customers.length === 0) return
    const payTarget = searchParams.get('payInvoice')
    if (!payTarget) return

    let match = customers.find(c => c.id === payTarget)
    if (!match) {
      const inv = invoices.find(i => i.id === payTarget)
      if (inv) match = customers.find(c => c.id === inv.customerId)
    }
    if (match) {
      setSelectedCust(match)
      setShowRecord(true)
      setRecordStep(2)
    }
  }, [loading, customers, invoices, searchParams])

  // ── derived ──
  const invMap = useMemo(() => {
    const m = new Map<string, Invoice>()
    for (const inv of invoices) m.set(inv.id, inv)
    return m
  }, [invoices])

  const successPmts = useMemo(() => payments.filter(p => p.status === "success"), [payments])

  const todayCollected = useMemo(
    () => successPmts.filter(p => isToday(p.createdAt)).reduce((s, p) => s + (p.amount || 0), 0),
    [successPmts]
  )

  const monthCollected = useMemo(() => {
    const ms = new Date(); ms.setDate(1); ms.setHours(0, 0, 0, 0)
    return successPmts.filter(p => new Date(p.createdAt) >= ms).reduce((s, p) => s + (p.amount || 0), 0)
  }, [successPmts])

  const pendingUdhaari = useMemo(
    () => invoices.filter(i => i.status === "unpaid" || i.status === "overdue" || i.status === "partial")
      .reduce((s, inv) => s + getOutstanding(inv), 0),
    [invoices]
  )

  const grouped = useMemo(() => {
    const gs: { label: string; payments: any[] }[] = []
    const t: any[] = [], y: any[] = [], o: any[] = []
    for (const p of successPmts) {
      if (isToday(p.createdAt)) t.push(p)
      else if (isYesterday(p.createdAt)) y.push(p)
      else o.push(p)
    }
    if (t.length) gs.push({ label: "Today", payments: t })
    if (y.length) gs.push({ label: "Yesterday", payments: y })
    if (o.length) gs.push({ label: "Earlier", payments: o })
    return gs
  }, [successPmts])

  // outstanding per customer (for record payment step 1)
  const custOutstanding = useMemo(() => {
    const m = new Map<string, number>()
    for (const inv of invoices) {
      const o = getOutstanding(inv)
      if (o > 0) m.set(inv.customerId, (m.get(inv.customerId) || 0) + o)
    }
    return m
  }, [invoices])

  const filteredCusts = useMemo(() => {
    if (!partyQ) return customers.slice(0, 20)
    const q = partyQ.toLowerCase()
    return customers.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q)).slice(0, 20)
  }, [customers, partyQ])

  // ── record payment ──
  const resetRecord = () => {
    setRecordStep(1); setPartyQ(""); setSelectedCust(null); setPmtAmount(""); setSelectedMethod("cash")
  }

  const submitPayment = async () => {
    if (!selectedCust || !pmtAmount) return
    setSaving(true)
    try {
      const tenantId = getCookie("bz_tenant")!
      const pid = uuid()
      const inv = invoices.find(i => i.customerId === selectedCust.id && getOutstanding(i) > 0)
      await db().payments.add({
        id: pid,
        tenantId,
        invoiceId: inv?.id,
        customerId: selectedCust.id,
        provider: selectedMethod,
        amount: parseFloat(pmtAmount),
        status: "success",
        collectedVia: "manual",
        lifecycleStatus: "created",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: "pending",
      } as any)

      // update invoice paidAmount
      if (inv) {
        const newPaid = (inv.paidAmount || 0) + parseFloat(pmtAmount)
        const newStatus = newPaid >= inv.total ? "paid" : inv.status
        await db().invoices.update(inv.id, { paidAmount: newPaid, status: newStatus, updatedAt: new Date().toISOString() })
      }

      notifyChanged()
      setShowRecord(false)
      resetRecord()
      await loadData()
    } catch (err) {
      console.error("Failed to record payment:", err)
    } finally {
      setSaving(false)
    }
  }

  // ── reverse payment ──
  const submitReverse = async () => {
    if (!selectedPmt || !reverseReason) return
    setSaving(true)
    try {
      const tenantId = getCookie("bz_tenant")!
      // create reversal entry
      await db().payments.add({
        id: uuid(),
        tenantId,
        invoiceId: selectedPmt.invoiceId,
        customerId: selectedPmt.customerId,
        provider: selectedPmt.provider,
        amount: -Math.abs(selectedPmt.amount),
        status: "success",
        collectedVia: "manual",
        notes: `Reverse of ${selectedPmt.id}: ${reverseReason}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: "pending",
      } as any)

      // adjust invoice
      const inv = invMap.get(selectedPmt.invoiceId)
      if (inv) {
        const newPaid = Math.max(0, (inv.paidAmount || 0) - selectedPmt.amount)
        await db().invoices.update(inv.id, { paidAmount: newPaid, updatedAt: new Date().toISOString() })
      }

      notifyChanged()
      setShowReverse(false)
      setSelectedPmt(null)
      setReverseReason("")
      await loadData()
    } catch (err) {
      console.error("Failed to reverse payment:", err)
    } finally {
      setSaving(false)
    }
  }

  // ── loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-muted/50 pb-8">
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4">
          <div className="h-6 bg-muted animate-pulse rounded w-48" />
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-lg border border-border p-4 space-y-2">
                <div className="h-3 bg-muted animate-pulse rounded w-20" />
                <div className="h-7 bg-muted animate-pulse rounded w-24" />
              </div>
            ))}
          </div>
          <div className="h-12 bg-muted animate-pulse rounded-lg" />
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-muted/50 pb-8">
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-5 lg:py-8">
          <div className="border border-red-200 rounded-lg p-8 text-center bg-card">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-3" />
            <p className="text-sm font-semibold text-red-900 mb-1">Something went wrong</p>
            <p className="text-xs text-red-600 mb-4">{error}</p>
            <button onClick={() => { setError(null); setLoading(true); loadData() }}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 hover:bg-red-700">
              <RefreshCw className="h-4 w-4" /> Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── render ──
  return (
    <div className="min-h-screen bg-muted/50 pb-24 lg:pb-8">
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-5">

        {/* ═══════════════════════════
           HEADER
           ═══════════════════════════ */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">
              {successPmts.length} collected &middot; {formatINR(todayCollected)} today
            </p>
          </div>

          <button
            onClick={() => { setShowRecord(true); resetRecord() }}
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background text-xs font-medium rounded-lg hover:bg-foreground/90"
          >
            <Plus className="h-3.5 w-3.5" /> {MerchantLanguage.payment.recordPayment}
          </button>
        </div>

        {/* ═══════════════════════════
           COLLECTION CARDS
           ═══════════════════════════ */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-lg px-4 py-3.5">
            <p className="text-[11px] text-muted-foreground font-medium">{MerchantLanguage.payment.todayCollected}</p>
            <p className="text-xl font-bold tabular-nums tracking-tight text-foreground mt-0.5">
              {formatINR(todayCollected)}
            </p>
            <p className="text-[10px] text-emerald-600 mt-0.5 flex items-center gap-0.5">
              <TrendingUp className="h-3 w-3" /> {successPmts.filter(p => isToday(p.createdAt)).length} payments
            </p>
          </div>
          <div className="bg-card border border-border rounded-lg px-4 py-3.5">
            <p className="text-[11px] text-muted-foreground font-medium">{MerchantLanguage.payment.thisMonth}</p>
            <p className="text-xl font-bold tabular-nums tracking-tight text-foreground mt-0.5">
              {formatINR(monthCollected)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{successPmts.length} total collections</p>
          </div>
          <div className="bg-card border border-border rounded-lg px-4 py-3.5">
            <p className="text-[11px] text-muted-foreground font-medium">Pending Udhar</p>
            <p className="text-xl font-bold tabular-nums tracking-tight text-amber-700 mt-0.5">
              {formatINR(pendingUdhaari)}
            </p>
            <p className="text-[10px] text-amber-600 mt-0.5">
              {invoices.filter(i => i.status === "overdue" || i.status === "partial").length} overdue invoices
            </p>
          </div>
        </div>

        {/* ═══════════════════════════
           PAYMENT STREAM (only success)
           ═══════════════════════════ */}
        {successPmts.length === 0 ? (
          <div className="bg-card border border-border rounded-lg px-5 py-10 text-center">
            <Wallet className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground">No payments recorded yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-5">Get started by creating an invoice or recording a payment manually</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => router.push("/pos")}
                className="px-4 py-2 border border-border rounded-lg text-xs font-medium text-foreground hover:bg-muted"
              >
                Create invoice
              </button>
              <button
                onClick={() => { setShowRecord(true); resetRecord() }}
                className="px-4 py-2 bg-foreground text-background text-xs font-medium rounded-lg hover:bg-foreground/90"
              >
                Record payment
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(group => (
              <div key={group.label}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-0.5">
                  {group.label} &middot; {group.payments.length} payment{group.payments.length !== 1 ? "s" : ""}
                </p>
                <div className="space-y-1">
                  {group.payments.map(p => {
                    const inv = invMap.get(p.invoiceId)
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPmt(p)}
                        className="w-full bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-3 hover:border-border transition-colors text-left"
                      >
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                          {providerIcon[p.provider] || <CreditCard className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold tabular-nums tracking-tight text-foreground">
                              {p.amount < 0 ? `- ${formatINR(Math.abs(p.amount))}` : formatINR(p.amount)}
                            </span>
                            {p.amount < 0 && (
                              <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Reversal</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {inv ? inv.customerName : "Unknown"} &middot; {fmtAgo(p.createdAt)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded capitalize">
                            {p.provider?.replace("_", " ")}
                          </span>
                          <ChevronRight className="h-4 w-4 text-slate-300" />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════
         FAB — mobile only
         ══════════════════════════════════════ */}
      <button
        onClick={() => { setShowRecord(true); resetRecord() }}
        className="fixed bottom-6 right-5 lg:hidden z-40 h-14 w-14 rounded-full bg-foreground text-background shadow-lg dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)] flex items-center justify-center hover:bg-foreground/90 active:scale-95 transition-all"
        aria-label="Record payment"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* ══════════════════════════════════════
         MODAL: Payment Detail
         ══════════════════════════════════════ */}
      {selectedPmt && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/20" onClick={() => setSelectedPmt(null)}>
          <div className="bg-card w-full max-w-sm rounded-t-2xl lg:rounded-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Payment Details</p>
              <button onClick={() => setSelectedPmt(null)} className="p-1 rounded-md hover:bg-muted">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="text-center py-3">
              <p className={`text-2xl font-bold tabular-nums tracking-tight ${selectedPmt.amount < 0 ? "text-red-600" : "text-foreground"}`}>
                {selectedPmt.amount < 0 ? `- ${formatINR(Math.abs(selectedPmt.amount))}` : formatINR(selectedPmt.amount)}
              </p>
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium text-foreground">{invMap.get(selectedPmt.invoiceId)?.customerName || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Method</span>
                <span className="font-medium text-foreground capitalize">{selectedPmt.provider?.replace("_", " ")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Time</span>
                <span className="font-medium text-foreground">{new Date(selectedPmt.createdAt).toLocaleString("en-IN")}</span>
              </div>
              {selectedPmt.notes && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Notes</span>
                  <span className="font-medium text-foreground text-right max-w-[60%]">{selectedPmt.notes}</span>
                </div>
              )}
              {selectedPmt.providerPaymentId && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ref ID</span>
                  <span className="font-medium text-foreground text-[10px]">{selectedPmt.providerPaymentId}</span>
                </div>
              )}
            </div>

            {selectedPmt.amount > 0 && (
              <button
                onClick={() => { setShowReverse(true); setReverseReason("") }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border border-red-200 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reverse Payment
              </button>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
         MODAL: Reverse Reason
         ══════════════════════════════════════ */}
      {showReverse && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/20" onClick={() => setShowReverse(false)}>
          <div className="bg-card w-full max-w-sm rounded-t-2xl lg:rounded-2xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Reverse Payment</p>
              <button onClick={() => setShowReverse(false)} className="p-1 rounded-md hover:bg-muted">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Why are you reversing this payment?</p>
            <div className="space-y-1">
              {reversalReasons.map(r => (
                <button
                  key={r}
                  onClick={() => setReverseReason(r)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors ${
                    reverseReason === r ? "bg-muted text-foreground font-semibold" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <button
              onClick={submitReverse}
              disabled={!reverseReason || saving}
              className="w-full py-2.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Confirm Reversal
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
         MODAL: Record Payment (3-step)
         ══════════════════════════════════════ */}
      {showRecord && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/20" onClick={() => setShowRecord(false)}>
          <div className="bg-card w-full max-w-sm rounded-t-2xl lg:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {[1, 2, 3].map(s => (
                  <div key={s} className={`h-2 w-2 rounded-full ${recordStep >= s ? "bg-foreground" : "bg-muted"}`} />
                ))}
                <span className="text-[11px] text-muted-foreground ml-1">
                  Step {recordStep}/3
                </span>
              </div>
              <button onClick={() => setShowRecord(false)} className="p-1 rounded-md hover:bg-muted">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {/* Step 1: Select Party */}
            {recordStep === 1 && (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground">Select party</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    value={partyQ}
                    onChange={e => setPartyQ(e.target.value)}
                    placeholder="Search by name or phone..."
                    className="w-full h-10 rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    autoFocus
                  />
                </div>
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {filteredCusts.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No customers found</p>
                  ) : filteredCusts.map(c => {
                    const due = custOutstanding.get(c.id)
                    return (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedCust(c); setRecordStep(2) }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-colors text-left"
                      >
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                          {c.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                          <p className="text-[11px] text-muted-foreground">{c.phone}</p>
                        </div>
                        {due !== undefined && (
                          <div className="text-right shrink-0">
                            <p className="text-xs font-semibold tabular-nums text-amber-600">{formatINR(due)}</p>
                            <p className="text-[10px] text-muted-foreground">outstanding</p>
                          </div>
                        )}
                        <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Step 2: Enter Amount */}
            {recordStep === 2 && selectedCust && (
              <div className="space-y-4">
                <p className="text-sm font-semibold text-foreground">Enter amount</p>

                <div className="bg-muted/50 rounded-lg px-4 py-2.5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{selectedCust.name}</span>
                  {custOutstanding.has(selectedCust.id) && (
                    <span className="font-medium text-foreground">
                      Outstanding: {formatINR(custOutstanding.get(selectedCust.id)!)}
                    </span>
                  )}
                </div>

                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">₹</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={pmtAmount}
                    onChange={e => setPmtAmount(e.target.value)}
                    placeholder="0"
                    className="w-full h-14 rounded-lg border border-border bg-card pl-10 pr-4 text-xl font-bold tabular-nums text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    autoFocus
                  />
                </div>

                {custOutstanding.has(selectedCust.id) && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPmtAmount(String(custOutstanding.get(selectedCust.id)!))}
                      className="flex-1 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted"
                    >
                      Full amount
                    </button>
                    <button
                      onClick={() => setPmtAmount(String(Math.round(custOutstanding.get(selectedCust.id)! / 2)))}
                      className="flex-1 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted"
                    >
                      Half
                    </button>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setRecordStep(1)}
                    className="flex-1 py-2.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => pmtAmount && parseFloat(pmtAmount) > 0 && setRecordStep(3)}
                    disabled={!pmtAmount || parseFloat(pmtAmount) <= 0}
                    className="flex-1 py-2.5 rounded-lg bg-foreground text-background text-xs font-medium hover:bg-foreground/90 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Select Method */}
            {recordStep === 3 && (
              <div className="space-y-4">
                <p className="text-sm font-semibold text-foreground">Payment method</p>

                <div className="bg-muted/50 rounded-lg px-4 py-2.5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{selectedCust?.name}</span>
                  <span className="font-semibold tabular-nums text-foreground">{formatINR(parseFloat(pmtAmount || "0"))}</span>
                </div>

                <div className="space-y-1.5">
                  {methodOptions.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedMethod(m.id)}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg border transition-colors text-left ${
                        selectedMethod === m.id
                          ? "border-foreground bg-muted"
                          : "border-border hover:border-border"
                      }`}
                    >
                      <div className="text-muted-foreground">{m.icon}</div>
                      <span className="text-sm font-medium text-foreground">{m.label}</span>
                      {selectedMethod === m.id && <Check className="h-4 w-4 text-foreground ml-auto" />}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setRecordStep(2)}
                    className="flex-1 py-2.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    Back
                  </button>
                  <button
                    onClick={submitPayment}
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-lg bg-foreground text-background text-xs font-medium hover:bg-foreground/90 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <><Check className="h-4 w-4" /> Record Payment</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
