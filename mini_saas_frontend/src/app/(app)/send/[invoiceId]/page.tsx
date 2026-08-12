"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Phone, CheckCircle2,
  Loader2, AlertTriangle, Send, IndianRupee,
  Clock, ExternalLink,
  MessageSquare, Hand, Printer,
  CalendarClock, Copy, Check, ChevronDown,
  Download, Sun, Sunrise, Sunset, Moon, Smartphone,
} from "lucide-react"
import { formatINR } from "@/lib/utils"
import { toast } from "sonner"
import { db } from "@/lib/billzo/db"
import { getCookie } from "@/lib/cookies"
import { getTenantId } from "@/lib/billzo/tenant"
import { downloadInvoicePDF, generateInvoicePDF, printInvoicePDF, getWhatsAppShareLink, type InvoiceData } from "@/lib/billzo/pdf"
import { logRecoveryActivity } from "@/lib/billzo/recovery/activity"
import type { Tenant } from "@/lib/billzo/types"

interface InvoiceDataFull {
  id: string
  invoiceNumber?: string
  customerId: string
  customerName: string
  customerPhone?: string
  total: number
  paidAmount: number
  status: string
  dueAt: string
  documentType?: 'tax_invoice' | 'bill'
  items: Array<{ name: string; hsn?: string; qty: number; price: number; gstRate: number }>
  createdAt: string
  method?: string
}

type ActionView = 'main' | 'send_now' | 'schedule_promise' | 'schedule_reminder'

const TIME_LABELS: Record<string, string> = {
  morning: 'Morning (9 AM)',
  afternoon: 'Afternoon (2 PM)',
  evening: 'Evening (6 PM)',
  night: 'Night (9 PM)',
}

const TIME_ICONS: Record<string, any> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  night: Moon,
}

function StatusBadge({ invoice, paidAmount }: { invoice: InvoiceDataFull; paidAmount: number }) {
  const isPaid = invoice.status === 'paid' || paidAmount >= invoice.total
  const isPartial = !isPaid && paidAmount > 0
  const isOverdue = !isPaid && !isPartial && !!invoice.dueAt && new Date(invoice.dueAt) < new Date()

  const label = isPaid ? 'PAID' : isPartial ? 'PARTIAL' : isOverdue ? 'OVERDUE' : 'UDHARI'
  const style = isPaid
    ? 'bg-success-soft text-success'
    : isPartial
      ? 'bg-info-soft text-info'
      : isOverdue
        ? 'bg-overdue-soft text-overdue'
        : 'bg-warning-soft text-warning'

  return (
    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${style}`}>
      {label}
    </span>
  )
}

function QuickAction({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}

function getNextSunday(): string {
  const d = new Date()
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7))
  return d.toISOString().split('T')[0]
}

function getTomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

export default function InvoiceSendPage() {
  const router = useRouter()
  const params = useParams()
  const invoiceId = params?.invoiceId as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [invoice, setInvoice] = useState<InvoiceDataFull | null>(null)
  const [tenantData, setTenantData] = useState<Tenant | null>(null)
  const [customerPhone, setCustomerPhone_] = useState("")
  const [customerOutstanding, setCustomerOutstanding] = useState(0)

  const [actionView, setActionView] = useState<ActionView>('main')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null)
  const [paymentLinkLoading, setPaymentLinkLoading] = useState(false)
  const [paymentLinkError, setPaymentLinkError] = useState(false)

  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [showPaymentCollect, setShowPaymentCollect] = useState(false)

  // Promise fields
  const [promiseAmount, setPromiseAmount] = useState(0)
  const [promiseDate, setPromiseDate] = useState("")
  const [promiseTime, setPromiseTime] = useState("evening")
  const [promiseRemindWhen, setPromiseRemindWhen] = useState("at_promise_time")
  const [promiseAutoFollowup, setPromiseAutoFollowup] = useState(true)
  const [promiseNotes, setPromiseNotes] = useState("")
  const [promiseSaving, setPromiseSaving] = useState(false)
  const [promiseSaved, setPromiseSaved] = useState(false)
  const [promiseRecorded, setPromiseRecorded] = useState(false)

  // Schedule fields
  const [scheduleDate, setScheduleDate] = useState("")
  const [scheduleTime, setScheduleTime] = useState("18:30")
  const [scheduleRepeat, setScheduleRepeat] = useState("once")
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleSaved, setScheduleSaved] = useState(false)
  const [reminderScheduled, setReminderScheduled] = useState(false)

  // Share fallback sheet
  const [showNoPhoneSheet, setShowNoPhoneSheet] = useState(false)

  // Monthly reminder quota (from /api/billing/usage)
  const [quota, setQuota] = useState<{ used: number; limit: number; remaining: number; unlimited: boolean; exceeded: boolean } | null>(null)

  // Send flow fields
  const [customMessage, setCustomMessage] = useState("")

  const isUdhar = !!invoice && invoice.status !== 'paid' && invoice.paidAmount < invoice.total
  const totalExposure = invoice ? invoice.total + customerOutstanding : 0

  const paymentReady = useMemo(() => {
    const cfg = tenantData?.paymentConfig
    if (!cfg) return !!tenantData?.upiId
    if (cfg.method === 'upi') return !!cfg.upiId
    if (cfg.method === 'bank') return !!cfg.bankAccount && !!cfg.bankIfsc
    if (cfg.method === 'cash') return true
    return false
  }, [tenantData])

  const loadData = useCallback(async () => {
    if (!invoiceId) { setError("No invoice ID"); setLoading(false); return }
    try {
      const inv = await db().invoices.get(invoiceId)
      if (!inv) { setError("Invoice not found"); setLoading(false); return }

      const items = await db().invoiceItems.where("invoiceId").equals(invoiceId).toArray()

      const allUnpaid = await db().invoices
        .where("customerId").equals(inv.customerId)
        .and(i => i.id !== invoiceId && (i.status === "unpaid" || i.status === "overdue" || i.status === "partial"))
        .toArray()
      const prevOutstanding = allUnpaid.reduce((s, i) => s + ((i.total || 0) - (i.paidAmount || 0)), 0)

      setInvoice({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        customerName: inv.customerName,
        customerPhone: inv.customerPhone,
        total: inv.total,
        paidAmount: inv.paidAmount,
        status: inv.status,
        dueAt: inv.dueAt,
        items: items.map(i => ({ name: i.name, hsn: i.hsn, qty: i.qty, price: i.price, gstRate: i.gstRate })),
        createdAt: inv.createdAt,
        method: inv.paidAmount > 0 ? "cash" : "udhar",
      })
      setCustomerPhone_(inv.customerPhone || "")
      setCustomerOutstanding(prevOutstanding)
      setPromiseAmount(inv.total - inv.paidAmount)
      setPromiseDate(getNextSunday())

      // Hydrate recovery state from the local DB so the timeline survives reloads.
      const SHARED_STATUSES = ['sent', 'server_ack', 'delivered', 'read', 'clicked_upi', 'payment_confirmed', 'received']
      setSent(Boolean(inv.lastWhatsAppAt) || SHARED_STATUSES.includes(inv.lastWhatsAppStatus))
      setReminderScheduled(Boolean(inv.nextRecoveryAt) || Boolean(inv.lastReminderAt))

      let promiseRecorded = false
      if (inv.customerId) {
        const promises = await db().promises.where("customerId").equals(inv.customerId).toArray()
        promiseRecorded = promises.some(p => p.invoiceIds.includes(invoiceId) && p.status === 'active')
      }
      setPromiseRecorded(promiseRecorded)

      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice")
      setLoading(false)
    }
  }, [invoiceId])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const tid = getTenantId()
    if (tid) {
      db().tenants.get(tid).then(t => setTenantData(t ?? null))
    }
  }, [])

  // Auto-generate payment link on mount if invoice is unpaid
  useEffect(() => {
    if (!invoice || paymentLinkUrl || paymentLinkLoading) return
    if (invoice.status !== "paid" && invoice.paidAmount === 0) {
      generatePaymentLink()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice])

  // Load the monthly reminder quota so send/schedule can be gated up front.
  useEffect(() => {
    const loadQuota = async () => {
      try {
        const res = await fetch("/api/billing/usage", { credentials: "include" })
        if (!res.ok) return
        const d = await res.json()
        if (typeof d.used === "number" && typeof d.limit === "number") {
          setQuota({ used: d.used, limit: d.limit, remaining: d.remaining, unlimited: d.unlimited, exceeded: d.exceeded })
        }
      } catch {
        /* non-fatal — server gates still apply */
      }
    }
    loadQuota()
  }, [])

  const updatePhone = async (phone: string) => {
    setCustomerPhone_(phone)
    if (invoice && phone) {
      await db().invoices.update(invoiceId, { customerPhone: phone })
    }
  }

  const generatePaymentLink = async (): Promise<string | null> => {
    if (!invoice) return null
    if (paymentLinkUrl) return paymentLinkUrl
    setPaymentLinkLoading(true)
    setPaymentLinkError(false)
    try {
      const res = await fetch("/api/payment/payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          invoiceId: invoice.id,
          amount: invoice.total,
          customerName: invoice.customerName,
          customerPhone: customerPhone || undefined,
        }),
      })
      const data = await res.json()
      const url = data.short_url || data.url
      if (url) {
        setPaymentLinkUrl(url)
        return url
      } else {
        setPaymentLinkError(true)
        return null
      }
    } catch (err) {
      console.error("Payment link error:", err)
      setPaymentLinkError(true)
      return null
    } finally {
      setPaymentLinkLoading(false)
    }
  }

  const buildDefaultMessage = (paymentUrl?: string | null): string => {
    const shopName = getCookie("bz_tenant_name") || "My Shop"
    const inv = invoice
    if (!inv) return ""

    const effectiveLink = paymentUrl || paymentLinkUrl
    const paymentNote = isUdhar && effectiveLink
      ? `\n\nPay here: ${effectiveLink}`
      : isUdhar
        ? ""
        : "\n\nPayment received. Thank you!"

    return `Namaste ${inv.customerName},\n\nInvoice #${inv.invoiceNumber || inv.id.slice(0, 8)}\nAmount: ${formatINR(inv.total)}${paymentNote}\n\nThank you,\n${shopName}`
  }

  const defaultMessage = buildDefaultMessage()
  const messageToSend = customMessage && customMessage.trim() ? customMessage.trim() : defaultMessage

  const buildPdfData = (): InvoiceData => {
    const inv = invoice!
    const itemsForPdf = inv.items.map(i => {
      const lineTotal = i.price * i.qty
      const taxable = i.gstRate ? Math.round(lineTotal * 100 / (100 + i.gstRate)) : lineTotal
      return { name: i.name, hsn: i.hsn, qty: i.qty, price: i.price, gstRate: i.gstRate, taxable }
    })
    const subtotal = itemsForPdf.reduce((s, i) => s + i.taxable, 0)
    return {
      invoiceNumber: inv.invoiceNumber || inv.id,
      date: new Date(inv.createdAt).toLocaleDateString('en-IN'),
      customerName: inv.customerName,
      customerPhone: inv.customerPhone || undefined,
      items: itemsForPdf,
      subtotal,
      tax: inv.total - subtotal,
      total: inv.total,
      businessName: tenantData?.name || getCookie('bz_tenant_name') || 'My Shop',
      businessPhone: tenantData?.phone,
      businessEmail: tenantData?.email,
      businessGstin: tenantData?.gstin,
      businessPan: tenantData?.pan,
      businessAddress: tenantData?.address,
      logo: tenantData?.logo,
      bankDetails: tenantData?.bankDetails,
      upiId: tenantData?.upiId,
      whiteLabel: tenantData?.whiteLabel,
      placeOfSupply: tenantData?.gstin ? tenantData.gstin.slice(0, 2) : undefined,
      documentType: inv.documentType || 'tax_invoice',
    }
  }

  const downloadPdf = async () => {
    const pdfData = buildPdfData()
    await downloadInvoicePDF(pdfData)
  }

  const printPdf = async () => {
    const pdfData = buildPdfData()
    await printInvoicePDF(pdfData)
  }

  const openUpiPayment = async () => {
    if (paymentLinkUrl) {
      window.open(paymentLinkUrl, '_blank')
    } else {
      const url = await generatePaymentLink()
      if (url) window.open(url, '_blank')
    }
  }

  const shareViaOwnWhatsApp = async () => {
    let url = paymentLinkUrl
    if (isUdhar && !url) url = await generatePaymentLink()
    const msg = customMessage && customMessage.trim() ? customMessage.trim() : buildDefaultMessage(url)
    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank')
    setShowNoPhoneSheet(false)
  }

  const handleSendNow = async () => {
    if (!invoice) return
    if (!customerPhone) { setShowNoPhoneSheet(true); return }
    if (quota?.exceeded) {
      setError("Monthly reminder limit reached. Upgrade to Pro to keep sending.")
      return
    }
    setSending(true)
    setError(null)

    try {
      // Build WhatsApp link synchronously and open immediately (avoids popup blocker)
      const businessName = getCookie("bz_tenant_name") || "My Shop"
      const subtotal = invoice.items.reduce((s, i) => s + (i.price * i.qty * 100 / (100 + (i.gstRate || 0))), 0)
      const waData: InvoiceData = {
        invoiceNumber: invoice.invoiceNumber || invoice.id.slice(0, 8).toUpperCase(),
        date: new Date(invoice.createdAt).toLocaleDateString("en-IN"),
        customerName: invoice.customerName,
        customerPhone: customerPhone,
        items: invoice.items.map(i => ({
          name: i.name,
          qty: i.qty,
          price: i.price,
          gstRate: i.gstRate,
          hsn: i.hsn,
        })),
        subtotal: Math.round(subtotal),
        tax: invoice.total - Math.round(subtotal),
        total: invoice.total,
        businessName,
        businessPhone: getCookie("bz_tenant_phone") || undefined,
        whiteLabel: true,
        documentType: invoice.documentType || 'tax_invoice',
      }
      // Generate the payment link FIRST so it can be embedded in the message,
      // then open WhatsApp (blank tab opened synchronously to dodge popup blockers).
      const waWin = window.open("", "_blank")
      const linkUrl = isUdhar ? await generatePaymentLink() : null
      const waLink = getWhatsAppShareLink(waData, linkUrl)
      if (waWin) waWin.location.href = waLink

      const message = customMessage && customMessage.trim() ? customMessage.trim() : buildDefaultMessage(linkUrl)

      await fetch("/api/intents/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          templateKey: "invoice_sent",
          vars: {
            customerName: invoice.customerName,
            amount: formatINR(invoice.total),
            invoiceNumber: invoice.invoiceNumber || invoice.id.slice(0, 8),
          },
          personalNote: message,
        }),
      })

      await fetch("/api/recovery/case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          invoiceId: invoice.id,
          customerId: invoice.customerId,
          amount: invoice.total - invoice.paidAmount,
          customerName: invoice.customerName,
          customerPhone: customerPhone,
        }),
      })

      logRecoveryActivity({
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        type: "invoice_sent",
        actor: "merchant",
      })

      await db().invoices.update(invoice.id, {
        lastWhatsAppStatus: 'sent',
        lastWhatsAppAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      setSent(true)
      toast.success("Invoice sent on WhatsApp")
      setTimeout(() => setActionView('main'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send")
    } finally {
      setSending(false)
    }
  }

  const handleScheduleReminder = async () => {
    if (!invoice) return
    if (quota?.exceeded) {
      setError("Monthly reminder limit reached. Upgrade to Pro to schedule more reminders.")
      return
    }
    setScheduleSaving(true)
    setError(null)
    try {
      const [h, m] = scheduleTime.split(':').map(Number)
      const dueDate = new Date(scheduleDate)
      dueDate.setHours(h, m, 0, 0)

      const res = await fetch("/api/recovery/queue/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          action: "schedule_reminder",
          payload: {
            dueDate: dueDate.toISOString(),
            amount: invoice.total - invoice.paidAmount,
            repeat: scheduleRepeat !== 'once' ? scheduleRepeat : undefined,
            notes: customMessage || undefined,
          },
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Failed to schedule reminder")
      }

      toast.success("Reminder scheduled")
      await db().invoices.update(invoice.id, {
        nextRecoveryAt: dueDate.toISOString(),
        updatedAt: new Date().toISOString(),
      })
      setScheduleSaved(true)
      setReminderScheduled(true)
      setTimeout(() => { setScheduleSaved(false); setActionView('main') }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule")
    } finally {
      setScheduleSaving(false)
    }
  }

  const handleSavePromise = async () => {
    if (!invoice) return
    if (!promiseDate) { setError("Please select a promise date"); return }
    setPromiseSaving(true)
    setError(null)
    try {
      const [h, m] = getTimeFromTiming(promiseTime).split(':').map(Number)
      const dueDate = new Date(promiseDate)
      dueDate.setHours(h, m, 0, 0)

      await fetch("/api/recovery/queue/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          action: "mark_promise",
          payload: {
            dueDate: dueDate.toISOString(),
            amount: promiseAmount,
            remindWhen: promiseRemindWhen,
            autoFollowup: promiseAutoFollowup,
            notes: promiseNotes || `Promise on invoice ${invoice.invoiceNumber || invoice.id.slice(0, 8)}`,
          },
        }),
      })

      if (promiseAutoFollowup) {
        await fetch("/api/recovery/case", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            invoiceId: invoice.id,
            customerId: invoice.customerId,
            amount: invoice.total - invoice.paidAmount,
            customerName: invoice.customerName,
            customerPhone: customerPhone || undefined,
            autoFollowup: true,
          }),
        })
      }

      const tid = getTenantId()
      await db().promises.put({
        id: `p_${Date.now()}`,
        tenantId: tid || '',
        customerId: invoice.customerId,
        invoiceIds: [invoice.id],
        amount: promiseAmount,
        dueDate: dueDate.toISOString(),
        status: 'active',
        note: promiseNotes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      setPromiseSaved(true)
      setPromiseRecorded(true)
      toast.success("Promise recorded")
      setTimeout(() => { setPromiseSaved(false); setActionView('main') }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save promise")
    } finally {
      setPromiseSaving(false)
    }
  }

  const copyPaymentLink = () => {
    if (paymentLinkUrl) {
      navigator.clipboard.writeText(paymentLinkUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function getTimeFromTiming(timing: string): string {
    const map: Record<string, string> = { morning: '09:00', afternoon: '14:00', evening: '18:00', night: '21:00' }
    return map[timing] || '18:00'
  }

  function formatTimeFromTiming(timing: string): string {
    const time = getTimeFromTiming(timing)
    const [h, m] = time.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
  }

  function getPromiseRemindLabel(): string {
    const labels: Record<string, string> = {
      at_promise_time: `At promise time (${formatTimeFromTiming(promiseTime)})`,
      thirty_min_before: '30 min before',
      one_hour_before: '1 hour before',
      next_morning: 'Next morning (9 AM)',
    }
    return labels[promiseRemindWhen] || labels.at_promise_time
  }

  // ──────────────────── LOADING / ERROR / NULL ────────────────────

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <div className="h-8 w-40 bg-muted rounded-lg animate-pulse" />
        <div className="h-40 bg-muted rounded-2xl animate-pulse" />
        <div className="h-28 bg-muted rounded-2xl animate-pulse" />
        <div className="h-24 bg-muted rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (error && !invoice) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <p className="text-lg font-semibold mb-2">Something went wrong</p>
        <p className="text-sm text-muted-foreground mb-6">{error}</p>
        <Link href="/pos" className="text-sm font-medium text-primary hover:underline">Back to POS</Link>
      </div>
    )
  }

  if (!invoice) return null

  // ──────────────────── MAIN VIEW ────────────────────

  function RecoveryTimelinePreview({ alreadyPaid }: { alreadyPaid: boolean }) {
    const steps = [
      { label: 'Invoice created', done: true },
      { label: 'Shared with customer', done: !!sent },
      { label: 'Reminder scheduled', done: !!reminderScheduled },
      { label: 'Promise recorded', done: !!promiseRecorded },
      { label: 'Payment received', done: alreadyPaid },
    ]
    return (
      <div className="space-y-2.5">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              step.done ? 'bg-success' : 'bg-muted'
            }`}>
              {step.done && <Check className="w-3 h-3 text-success-foreground" />}
              {!step.done && <span className="text-[10px] text-muted-foreground font-medium">{i + 1}</span>}
            </div>
            <span className={`text-xs ${step.done ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    )
  }

  function renderMainView() {
    const i = invoice
    if (!i) return null
    const alreadyPaid = i.status === "paid" || i.paidAmount >= i.total
    const phoneVerified = !!customerPhone

    // ── State 1: Already Paid ──
    if (alreadyPaid) {
      return (
        <div className="space-y-5 text-center max-w-sm mx-auto pt-6">
          <div className="w-16 h-16 rounded-full bg-success-soft flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-success" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Payment received</h1>
            <p className="text-[40px] font-bold text-success mt-2 leading-none tracking-tight tabular-nums">{formatINR(i.total)}</p>
            <p className="text-sm text-muted-foreground mt-2">#{i.invoiceNumber || i.id.slice(0, 8).toUpperCase()}</p>
          </div>
          <div className="flex gap-3 pt-4">
            <button
              onClick={() => router.push('/pos')}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all"
            >
              New Sale
            </button>
            <Link
              href={`/invoices/${invoiceId}`}
              className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary text-center transition-all"
            >
              View Invoice
            </Link>
          </div>
        </div>
      )
    }

    // Determine the single recommended action
    const recommendedAction = (() => {
      if (!phoneVerified) {
        return {
          id: 'add_phone' as const,
          title: 'Add phone number',
          why: 'Add a WhatsApp number so the invoice and payment link can reach the customer.',
        }
      }
      if (!sent) {
        return {
          id: 'share' as const,
          title: 'Send invoice on WhatsApp',
          why: "The customer hasn't received this invoice yet. Most customers pay right after receiving it.",
        }
      }
      if (!reminderScheduled) {
        return {
          id: 'reminder' as const,
          title: 'Schedule a reminder',
          why: 'Invoice sent but not paid yet. A gentle reminder keeps it top of mind.',
        }
      }
      return {
        id: 'waiting' as const,
        title: 'Waiting for customer',
        why: 'Invoice sent and reminder scheduled. You will be notified when there is activity.',
      }
    })()

    // ── State 2 & 3: Unpaid ──
    return (
      <div className="space-y-4">
        {/* Hero card: amount + customer */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Invoice amount</p>
              <p className="text-[34px] font-bold text-success mt-1 leading-none tracking-tight tabular-nums">{formatINR(i.total)}</p>
            </div>
            <StatusBadge invoice={i} paidAmount={i.paidAmount} />
          </div>
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border/60">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-foreground font-bold text-lg shrink-0">
              {i.customerName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-sm truncate">{i.customerName}</p>
              <p className="text-xs text-muted-foreground">{customerPhone || 'No phone saved'}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[11px] text-muted-foreground">#{i.invoiceNumber || i.id.slice(0, 8).toUpperCase()}</p>
              <p className="text-[11px] text-muted-foreground">{new Date(i.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
            </div>
          </div>
        </div>

        {/* Next step */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Next step</span>
          </div>
          <p className="text-[13px] text-muted-foreground mb-4 leading-relaxed">{recommendedAction.why}</p>

          {recommendedAction.id === 'add_phone' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-xl border border-input bg-background px-4 py-3">
                <Phone size={15} className="text-muted-foreground shrink-0" />
                <input
                  value={customerPhone}
                  onChange={e => updatePhone(e.target.value)}
                  placeholder="Enter WhatsApp number"
                  type="tel"
                  inputMode="tel"
                  className="flex-1 text-sm bg-transparent focus:outline-none text-foreground placeholder:text-muted-foreground/60"
                  autoFocus
                />
              </div>
              <button
                onClick={() => customerPhone && setActionView('send_now')}
                disabled={!customerPhone}
                className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4 inline mr-1.5" />
                Save & Continue
              </button>
              <p className="text-xs text-muted-foreground text-center">
                Already received on WhatsApp?{' '}
                <button onClick={() => setShowNoPhoneSheet(true)} className="font-medium text-primary hover:underline">
                  Share another way
                </button>
              </p>
            </div>
          )}

          {recommendedAction.id === 'share' && (
            <div className="space-y-3">
              <button
                onClick={() => setActionView('send_now')}
                className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                Send on WhatsApp
              </button>
              <button
                onClick={() => paymentLinkUrl ? copyPaymentLink() : void generatePaymentLink()}
                disabled={paymentLinkLoading}
                className="w-full py-2.5 rounded-xl border border-input text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {paymentLinkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                {paymentLinkLoading ? 'Generating link…' : paymentLinkUrl ? 'Copy payment link' : 'Generate payment link'}
              </button>
              {paymentLinkUrl && copied && (
                <p className="text-xs text-success font-medium text-center">Payment link copied!</p>
              )}
              {paymentLinkError && (
                <p className="text-xs text-warning text-center">Payment link failed. <button onClick={generatePaymentLink} className="underline font-medium">Retry</button></p>
              )}
            </div>
          )}

          {recommendedAction.id === 'reminder' && (
            <div className="space-y-3">
              <button
                onClick={() => { setScheduleDate(getTomorrow()); setScheduleTime("18:30"); setActionView('schedule_reminder') }}
                disabled={!!quota?.exceeded}
                className="w-full py-3.5 rounded-xl bg-recovery text-recovery-foreground text-sm font-semibold hover:opacity-90 transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <CalendarClock className="w-4 h-4" />
                {quota?.exceeded ? 'Reminder limit reached' : 'Schedule Reminder'}
              </button>
              {quota?.exceeded && (
                <p className="text-xs text-warning text-center">
                  You have used {quota.used} of {quota.limit} reminders this month.{' '}
                  <Link href="/pricing" className="font-semibold text-primary hover:underline">Upgrade to Pro →</Link>
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setPromiseDate(getNextSunday()); setActionView('schedule_promise') }}
                  className="py-2.5 rounded-xl border border-input text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
                >
                  <Hand className="w-3.5 h-3.5 inline mr-1" /> Record promise
                </button>
                <button
                  onClick={() => setShowPaymentCollect(!showPaymentCollect)}
                  className="py-2.5 rounded-xl border border-input text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
                >
                  <IndianRupee className="w-3.5 h-3.5 inline mr-1" /> Receive payment
                </button>
              </div>
            </div>
          )}

          {recommendedAction.id === 'waiting' && (
            <div className="rounded-xl bg-secondary/50 border border-border p-4 text-center">
              <Clock className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">All set for now</p>
              <p className="text-xs text-muted-foreground mt-1">You will be notified when the customer responds.</p>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-2.5">
          <QuickAction icon={Hand} label="Record promise" onClick={() => { setPromiseDate(getNextSunday()); setActionView('schedule_promise') }} />
          <QuickAction icon={CalendarClock} label="Schedule reminder" onClick={() => { setScheduleDate(getTomorrow()); setScheduleTime("18:30"); setActionView('schedule_reminder') }} />
          <QuickAction icon={IndianRupee} label="Receive payment" onClick={() => setShowPaymentCollect(!showPaymentCollect)} />
          <QuickAction icon={Download} label="Download PDF" onClick={downloadPdf} />
        </div>

        {/* Receive payment options */}
        {showPaymentCollect && (
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-3">
            <p className="text-xs font-semibold text-foreground">Receive payment</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => router.push(`/invoices/${invoiceId}`)}
                className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-secondary transition-all text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  <IndianRupee className="w-4 h-4 text-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Cash</p>
                  <p className="text-[10px] text-muted-foreground">Record payment</p>
                </div>
              </button>
              <button
                onClick={openUpiPayment}
                className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-secondary transition-all text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  <Smartphone className="w-4 h-4 text-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">UPI</p>
                  <p className="text-[10px] text-muted-foreground">Payment link</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Exposure strip */}
        {customerOutstanding > 0 && (
          <div className="flex justify-between items-center rounded-xl bg-warning-soft/60 border border-warning/30 px-4 py-3">
            <span className="text-xs font-medium text-foreground">Total outstanding with {i.customerName}</span>
            <span className="text-sm font-bold text-foreground tabular-nums">{formatINR(totalExposure)}</span>
          </div>
        )}

        {/* Recovery timeline */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mb-3">Recovery timeline</p>
          <RecoveryTimelinePreview alreadyPaid={alreadyPaid} />
        </div>

        {/* Items & documents */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <button
            onClick={() => setDetailsExpanded(!detailsExpanded)}
            className="w-full flex items-center justify-between"
          >
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Items</p>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${detailsExpanded ? 'rotate-180' : ''}`} />
          </button>

          {i.items.length === 1 ? (
            <div className="flex items-center justify-between mt-3">
              <div>
                <p className="text-sm font-medium text-foreground">{i.items[0].name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{i.items[0].qty} × {formatINR(i.items[0].price)}</p>
              </div>
              <p className="text-sm font-bold text-foreground tabular-nums">{formatINR(i.items[0].price * i.items[0].qty)}</p>
            </div>
          ) : (
            <div className="mt-3">
              <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pb-2 border-b border-border/60 mb-1">
                <div className="col-span-7">Item</div>
                <div className="col-span-2 text-center">Qty</div>
                <div className="col-span-3 text-right">Amount</div>
              </div>
              {i.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 py-2 text-sm border-b border-border/40 last:border-0">
                  <div className="col-span-7 text-foreground">{item.name}</div>
                  <div className="col-span-2 text-center text-muted-foreground">{item.qty}</div>
                  <div className="col-span-3 text-right text-foreground font-medium tabular-nums">{formatINR(item.price * item.qty)}</div>
                </div>
              ))}
            </div>
          )}

          {detailsExpanded && (
            <div className="mt-4 pt-4 border-t border-border/60 space-y-4">
              <div className="space-y-2 text-sm">
                {i.items[0]?.hsn && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">HSN</span>
                    <span className="text-foreground font-medium">{i.items[0].hsn}</span>
                  </div>
                )}
                {i.items[0]?.gstRate ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">GST</span>
                    <span className="text-foreground font-medium">{i.items[0].gstRate}%</span>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Status</span>
                  <span className="text-warning font-medium">Pending</span>
                </div>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-2">Documents</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={downloadPdf}
                    className="flex items-center justify-center gap-2 rounded-lg border border-input px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
                  >
                    <Download className="w-3.5 h-3.5" /> Download PDF
                  </button>
                  <button
                    onClick={printPdf}
                    className="flex items-center justify-center gap-2 rounded-lg border border-input px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print
                  </button>
                </div>
              </div>
              <Link href={`/invoices/${invoiceId}`} className="block text-center text-xs font-medium text-primary hover:underline">
                View full invoice →
              </Link>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ────── SEND NOW VIEW ──────

  function renderSendNowView() {
    const i = invoice
    if (!i) return null
    const showCustomEditor = !!customMessage

    return (
      <div className="space-y-4">
        {/* Quota banner */}
        {quota?.exceeded ? (
          <div className="rounded-xl bg-warning-soft/60 border border-warning/30 p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground">Monthly reminder limit reached</p>
            <p className="text-xs text-muted-foreground">
              You have used {quota.used} of {quota.limit} reminders this month.
            </p>
            <Link href="/pricing" className="inline-block text-xs font-semibold text-primary hover:underline">
              Upgrade to Pro →
            </Link>
          </div>
        ) : quota ? (
          <div className="flex items-center justify-between rounded-xl bg-secondary/40 border border-border px-3 py-2 text-xs text-muted-foreground">
            <span>Reminders this month</span>
            <span className="font-semibold text-foreground tabular-nums">
              {quota.unlimited ? `${quota.used} · unlimited` : `${quota.used} / ${quota.limit}`}
            </span>
          </div>
        ) : null}

        {/* Recipient strip */}
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-success-soft flex items-center justify-center shrink-0">
            <MessageSquare className="w-4 h-4 text-success" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">To {i.customerName}</p>
            <p className="text-xs text-muted-foreground truncate">{customerPhone || 'No WhatsApp number saved'}</p>
          </div>
          <span className="text-sm font-bold text-foreground tabular-nums shrink-0">{formatINR(i.total)}</span>
        </div>

        {/* Message editor */}
        <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Message</p>
            <button
              onClick={() => setCustomMessage(showCustomEditor ? '' : defaultMessage)}
              className="text-[10px] font-medium text-primary hover:underline"
            >
              {showCustomEditor ? 'Use default' : 'Edit'}
            </button>
          </div>
          <div className="rounded-xl bg-success-soft/60 border border-success/25 p-3">
            <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{messageToSend}</p>
            {isUdhar && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                <ExternalLink size={11} />
                {paymentLinkUrl ? 'Payment link included ✓' : 'Payment link will be attached'}
              </p>
            )}
          </div>
          {showCustomEditor && (
            <textarea
              value={customMessage}
              onChange={e => setCustomMessage(e.target.value)}
              className="w-full text-sm bg-background rounded-xl p-3 border border-input focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={4}
              placeholder="Write your own message…"
            />
          )}
        </section>

        {/* Payment link */}
        {isUdhar && (
          <section className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Payment Link</span>
              {paymentLinkLoading ? (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" /> Generating…
                </span>
              ) : paymentLinkUrl ? (
                <span className="text-xs text-success flex items-center gap-1">
                  <CheckCircle2 size={12} /> Ready
                </span>
              ) : paymentLinkError ? (
                <span className="text-xs text-warning flex items-center gap-1">
                  <AlertTriangle size={12} /> Failed
                </span>
              ) : null}
            </div>
            {paymentLinkUrl && (
              <button onClick={copyPaymentLink} className="flex items-center gap-2 text-xs text-primary font-medium">
                <Copy size={12} />
                {copied ? 'Copied!' : 'Copy payment link'}
              </button>
            )}
            {paymentLinkError && (
              <button onClick={generatePaymentLink} className="text-xs text-warning underline font-medium">Retry</button>
            )}
            <p className="text-[10px] text-muted-foreground">Automatically included in the message. Customer can pay directly via UPI.</p>
          </section>
        )}

        {/* Warnings */}
        {!customerPhone && (
          <div className="rounded-xl bg-warning-soft/60 border border-warning/30 p-3 text-xs text-warning">
            No WhatsApp number saved. Add the number first, or forward manually.
            <button onClick={() => setShowNoPhoneSheet(true)} className="font-semibold underline ml-1">Forward manually</button>
          </div>
        )}
        {isUdhar && !paymentReady && (
          <div className="rounded-xl bg-warning-soft/60 border border-warning/30 p-3 text-xs text-warning">
            Payment method not configured — the customer will not be able to pay online.
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/25 p-3 text-xs text-destructive">{error}</div>
        )}

        <button
          onClick={handleSendNow}
          disabled={sending || (isUdhar && paymentLinkLoading) || !!quota?.exceeded}
          className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold text-base flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg"
        >
          {sent ? <CheckCircle2 size={18} /> : sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          {sent ? 'Sent!' : sending ? 'Sending…' : quota?.exceeded ? 'Limit reached' : 'Send Now'}
        </button>
      </div>
    )
  }

  // ────── PROMISE VIEW ──────

  function renderPromiseView() {
    if (promiseSaved) {
      return (
        <div className="rounded-xl bg-success-soft/60 border border-success/25 p-8 text-center space-y-3">
          <Hand className="h-12 w-12 text-success mx-auto" />
          <h2 className="text-xl font-bold">Promise recorded</h2>
          <p className="text-sm text-muted-foreground">Promise — {new Date(promiseDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} &middot; {TIME_LABELS[promiseTime]}</p>
          <p className="text-xs text-muted-foreground">
            Next action: wait for promise &middot; {getPromiseRemindLabel()}
            {promiseAutoFollowup && ' · Auto follow-up enabled'}
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-warning-soft/60 border border-warning/30 p-4">
          <h2 className="font-bold flex items-center gap-2 text-foreground"><Hand size={18} className="text-warning" /> Promise to Pay</h2>
          <p className="text-xs text-muted-foreground mt-1">Customer committed to pay. BillZo will remind them.</p>
        </div>

        <section className="bg-card border border-border rounded-2xl p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Amount</label>
            <div className="relative mt-1">
              <IndianRupee size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="number"
                value={promiseAmount}
                onChange={e => setPromiseAmount(Number(e.target.value))}
                className="w-full h-11 rounded-xl border border-input bg-background pl-8 pr-3 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Expected Date</label>
            <input
              type="date"
              value={promiseDate}
              onChange={e => setPromiseDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Expected Time</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {['morning', 'afternoon', 'evening', 'night'].map(t => {
                const Icon = TIME_ICONS[t]
                return (
                  <button
                    key={t}
                    onClick={() => setPromiseTime(t)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-all ${
                      promiseTime === t
                        ? 'border-warning bg-warning-soft text-warning'
                        : 'border-border text-muted-foreground hover:border-warning'
                    }`}
                  >
                    <Icon size={14} />
                    {TIME_LABELS[t].split(' (')[0]}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Remind When?</label>
            <select
              value={promiseRemindWhen}
              onChange={e => setPromiseRemindWhen(e.target.value)}
              className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 mt-1"
            >
              <option value="at_promise_time">At promise time ({formatTimeFromTiming(promiseTime)})</option>
              <option value="thirty_min_before">30 minutes before</option>
              <option value="one_hour_before">1 hour before</option>
              <option value="next_morning">Next morning (9 AM)</option>
            </select>
          </div>
          <div>
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2">
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    promiseAutoFollowup ? "bg-warning border-warning" : "border-muted-foreground/30"
                  }`}
                  onClick={() => setPromiseAutoFollowup(!promiseAutoFollowup)}
                >
                  {promiseAutoFollowup && <CheckCircle2 size={14} className="text-warning-foreground" />}
                </div>
                <div>
                  <span className="text-sm font-medium text-foreground">Auto Follow-up</span>
                  <p className="text-[10px] text-muted-foreground">If unpaid, send reminder next day</p>
                </div>
              </div>
            </label>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <input
              type="text"
              value={promiseNotes}
              onChange={e => setPromiseNotes(e.target.value)}
              placeholder="e.g. Salary credit"
              className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/20 mt-1"
            />
          </div>
        </section>

        <button
          onClick={handleSavePromise}
          disabled={promiseSaving || !promiseDate}
          className="w-full py-4 bg-warning text-warning-foreground rounded-xl font-bold text-base flex items-center justify-center gap-2 hover:bg-warning disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg"
        >
          {promiseSaving ? <Loader2 size={18} className="animate-spin" /> : <Hand size={18} />}
          {promiseSaving ? 'Saving…' : 'Save Promise'}
        </button>
      </div>
    )
  }

  // ────── SCHEDULE REMINDER VIEW ──────

  function renderScheduleReminderView() {
    const i = invoice
    if (!i) return null
    if (scheduleSaved) {
      return (
        <div className="rounded-xl bg-success-soft/60 border border-success/25 p-8 text-center space-y-3">
          <CalendarClock className="h-12 w-12 text-success mx-auto" />
          <h2 className="text-xl font-bold">Reminder scheduled</h2>
          <p className="text-sm text-muted-foreground">
            Scheduled Reminder — {new Date(scheduleDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} &middot; {scheduleTime}
          </p>
          {scheduleRepeat !== 'once' && (
            <p className="text-xs text-muted-foreground">
              Repeats {scheduleRepeat === 'daily' ? 'daily' : scheduleRepeat === 'weekly' ? 'weekly' : 'every 2 days'}
            </p>
          )}
          <p className="text-xs text-muted-foreground">Next action: send reminder (automatic)</p>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {/* Quota banner */}
        {quota?.exceeded && (
          <div className="rounded-xl bg-warning-soft/60 border border-warning/30 p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground">Monthly reminder limit reached</p>
            <p className="text-xs text-muted-foreground">
              You have used {quota.used} of {quota.limit} reminders this month.
            </p>
            <Link href="/pricing" className="inline-block text-xs font-semibold text-primary hover:underline">
              Upgrade to Pro →
            </Link>
          </div>
        )}

        <div className="rounded-xl bg-recovery-soft/60 border border-recovery/30 p-4">
          <h2 className="font-bold flex items-center gap-2 text-foreground"><CalendarClock size={18} className="text-recovery" /> Schedule Reminder</h2>
          <p className="text-xs text-muted-foreground mt-1">BillZo sends at the scheduled time. Rate limits handled automatically.</p>
        </div>

        <section className="bg-card border border-border rounded-2xl p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Date</label>
              <input
                type="date"
                value={scheduleDate}
                onChange={e => setScheduleDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Time</label>
              <input
                type="time"
                value={scheduleTime}
                onChange={e => setScheduleTime(e.target.value)}
                className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 mt-1"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Repeat</label>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {[
                { value: 'once', label: 'Once' },
                { value: 'daily', label: 'Daily' },
                { value: 'every_2_days', label: '2 Days' },
                { value: 'weekly', label: 'Weekly' },
              ].map(r => (
                <button
                  key={r.value}
                  onClick={() => setScheduleRepeat(r.value)}
                  className={`rounded-lg border py-2 text-xs font-medium transition-all ${
                    scheduleRepeat === r.value
                      ? 'border-recovery bg-recovery-soft text-recovery'
                      : 'border-border text-muted-foreground hover:border-recovery'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              <MessageSquare size={14} />
              Message
            </div>
            <textarea
              value={customMessage || defaultMessage}
              onChange={e => setCustomMessage(e.target.value)}
              className="w-full text-sm bg-background rounded-xl p-3 border border-input focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={3}
            />
          </div>
        </section>

        <button
          onClick={handleScheduleReminder}
          disabled={scheduleSaving || !scheduleDate || !!quota?.exceeded}
          className="w-full py-4 bg-recovery text-recovery-foreground rounded-xl font-bold text-base flex items-center justify-center gap-2 hover:bg-recovery disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg"
        >
          {scheduleSaving ? <Loader2 size={18} className="animate-spin" /> : <CalendarClock size={18} />}
          {scheduleSaving ? 'Scheduling…' : quota?.exceeded ? 'Limit reached' : 'Schedule Reminder'}
        </button>
      </div>
    )
  }

  // ──────────────────── MAIN RENDER ────────────────────

  const pageTitle =
    actionView === 'main' ? 'Send Invoice'
    : actionView === 'send_now' ? 'Send on WhatsApp'
    : actionView === 'schedule_promise' ? 'Record Promise'
    : 'Schedule Reminder'

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-12 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => actionView !== 'main' ? setActionView('main') : router.back()}
          className="p-2 -ml-2 rounded-lg hover:bg-secondary"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-foreground">{pageTitle}</h1>
        <div className="ml-auto">
          {actionView === 'main' && <StatusBadge invoice={invoice} paidAmount={invoice.paidAmount} />}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/25 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {actionView === 'main' && renderMainView()}
      {actionView === 'send_now' && renderSendNowView()}
      {actionView === 'schedule_promise' && renderPromiseView()}
      {actionView === 'schedule_reminder' && renderScheduleReminderView()}

      {/* ──────────── No Phone Fallback Sheet ──────────── */}
      {showNoPhoneSheet && invoice && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center bg-background/70 backdrop-blur animate-in fade-in" onClick={() => setShowNoPhoneSheet(false)}>
          <div
            className="w-full lg:max-w-sm bg-card lg:rounded-2xl rounded-t-3xl border border-border shadow-lg p-6 animate-in slide-in-from-bottom space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center">
              <Phone size={28} className="mx-auto text-muted-foreground mb-2" />
              <h3 className="font-bold text-lg">No WhatsApp Number</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {invoice.customerName} has no WhatsApp number saved. Choose how to share.
              </p>
            </div>

            <div className="space-y-2">
              <button
                onClick={shareViaOwnWhatsApp}
                className="w-full flex items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-muted transition-all"
              >
                <Send size={18} className="text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">Open WhatsApp & Forward</p>
                  <p className="text-[10px] text-muted-foreground">Message goes to your WhatsApp to forward</p>
                </div>
              </button>

              <button
                onClick={() => { setShowNoPhoneSheet(false); setActionView('main') }}
                className="w-full flex items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-muted transition-all"
              >
                <Phone size={18} className="text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">Add WhatsApp Number</p>
                  <p className="text-[10px] text-muted-foreground">Save customer phone for direct sending</p>
                </div>
              </button>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(messageToSend)
                  setShowNoPhoneSheet(false)
                  toast.success('Invoice message copied')
                }}
                className="w-full flex items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-muted transition-all"
              >
                <svg className="w-[18px] h-[18px] text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                <div>
                  <p className="text-sm font-medium">Copy Message</p>
                  <p className="text-[10px] text-muted-foreground">Copy invoice text to clipboard</p>
                </div>
              </button>

              <button
                onClick={async () => {
                  setShowNoPhoneSheet(false)
                  const pdfData = buildPdfData()
                  const doc = await generateInvoicePDF(pdfData)
                  const blob = (doc as any).output('blob')
                  const url = URL.createObjectURL(blob)
                  window.open(url, '_blank')
                }}
                className="w-full flex items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-muted transition-all"
              >
                <svg className="w-[18px] h-[18px] text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                <div>
                  <p className="text-sm font-medium">Share PDF</p>
                  <p className="text-[10px] text-muted-foreground">Open invoice PDF to share</p>
                </div>
              </button>
            </div>

            <button
              onClick={() => setShowNoPhoneSheet(false)}
              className="w-full py-3 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
