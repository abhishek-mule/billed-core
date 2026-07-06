"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Phone, CheckCircle2,
  Loader2, AlertTriangle, Send, IndianRupee,
  Clock, ExternalLink, FileText, CreditCard,
  Bell, MessageSquare, Hand,
  CalendarClock, Copy, Check,
  Download, Repeat, Sun, Sunrise, Sunset, Moon,
} from "lucide-react"
import { formatINR } from "@/lib/utils"
import { toast } from "sonner"
import { db } from "@/lib/billzo/db"
import { getCookie } from "@/lib/cookies"
import { getTenantId } from "@/lib/billzo/tenant"
import { downloadInvoicePDF, generateInvoicePDF, getWhatsAppShareLink, type InvoiceData } from "@/lib/billzo/pdf"
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
  items: Array<{ name: string; hsn?: string; qty: number; price: number; gstRate: number }>
  createdAt: string
  method?: string
}

type ActionView = 'main' | 'send_now' | 'schedule_promise' | 'schedule_reminder' | 'mark_paid'

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

function getNextSunday(): string {
  const d = new Date()
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7))
  return d.toISOString().split('T')[0]
}

function getDefaultTiming(): string {
  const h = new Date().getHours()
  if (h < 12) return 'afternoon'
  if (h < 17) return 'evening'
  return 'night'
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
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "upi" | "udhar">("udhar")

  const [actionView, setActionView] = useState<ActionView>('main')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null)
  const [paymentLinkLoading, setPaymentLinkLoading] = useState(false)
  const [paymentLinkError, setPaymentLinkError] = useState(false)

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

  // Send flow fields
  const [customMessage, setCustomMessage] = useState("")
  const [showMessagePreview, setShowMessagePreview] = useState(false)

  const isUdhar = paymentMethod === "udhar" || (invoice ? invoice.status !== "paid" && invoice.paidAmount === 0 : false)
  const totalExposure = invoice ? invoice.total + customerOutstanding : 0

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
      setPaymentMethod(inv.paidAmount > 0 ? "cash" : "udhar")
      setPromiseAmount(inv.total - inv.paidAmount)
      setPromiseDate(getNextSunday())
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

  const updatePhone = async (phone: string) => {
    setCustomerPhone_(phone)
    if (invoice && phone) {
      await db().invoices.update(invoiceId, { customerPhone: phone })
    }
  }

  const generatePaymentLink = async () => {
    if (!invoice || paymentLinkUrl) return
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
      if (data.short_url || data.url) {
        setPaymentLinkUrl(data.short_url || data.url)
      } else {
        setPaymentLinkError(true)
      }
    } catch (err) {
      console.error("Payment link error:", err)
      setPaymentLinkError(true)
    } finally {
      setPaymentLinkLoading(false)
    }
  }

  const buildMessage = (): string => {
    const shopName = getCookie("bz_tenant_name") || "My Shop"
    const inv = invoice
    if (!inv) return ""
    if (customMessage) return customMessage

    const paymentNote = isUdhar && paymentLinkUrl
      ? `\n\nPay here: ${paymentLinkUrl}`
      : isUdhar
        ? ""
        : "\n\nPayment received. Thank you!"

    return `Namaste ${inv.customerName},\n\nInvoice #${inv.invoiceNumber || inv.id.slice(0, 8)}\nAmount: ${formatINR(inv.total)}${paymentNote}\n\nThank you,\n${shopName}`
  }

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
      businessGstin: tenantData?.gstin,
      businessPan: tenantData?.pan,
      businessAddress: tenantData?.address,
      bankDetails: tenantData?.bankDetails,
      upiId: tenantData?.upiId,
      whiteLabel: tenantData?.whiteLabel,
      placeOfSupply: tenantData?.gstin ? tenantData.gstin.slice(0, 2) : undefined,
    }
  }

  const getDefaultMessage = buildMessage()

  const handleSendNow = async () => {
    if (!invoice) return
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
      }
      const waLink = getWhatsAppShareLink(waData)
      window.open(waLink, "_blank")

      // Now async operations
      if (isUdhar && !paymentLinkUrl) {
        await generatePaymentLink()
      }

      const message = buildMessage()

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

      setSent(true)
      setTimeout(() => setActionView('main'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send")
    } finally {
      setSending(false)
    }
  }

  const handleScheduleReminder = async () => {
    if (!invoice) return
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

      setPromiseSaved(true)
      setPromiseRecorded(true)
      setTimeout(() => { setPromiseSaved(false); setActionView('main') }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save promise")
    } finally {
      setPromiseSaving(false)
    }
  }

  const handleMarkPaid = () => {
    router.push(`/invoices/${invoiceId}`)
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
      <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
        <div className="h-8 bg-muted rounded-lg animate-pulse" />
        <div className="h-40 bg-muted rounded-xl animate-pulse" />
        <div className="h-24 bg-muted rounded-xl animate-pulse" />
      </div>
    )
  }

  if (error && !invoice) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <p className="text-lg font-semibold mb-2">Something went wrong</p>
        <p className="text-sm text-muted-foreground mb-6">{error}</p>
        <Link href="/pos" className="text-sm font-medium text-primary hover:underline">Back to POS</Link>
      </div>
    )
  }

  if (!invoice) return null

  // ──────────────────── MAIN VIEW ────────────────────

  function renderMainView() {
    const i = invoice
    if (!i) return null
    const phoneVerified = !!customerPhone

    return (
      <div className="space-y-4">
        {/* Success header with amount */}
        <div className="rounded-xl bg-success/10 border border-success/20 p-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
          <h1 className="text-lg font-bold">Invoice Created</h1>
          <p className="text-xl font-bold mt-1 text-foreground">{formatINR(i.total)}</p>
          <p className="text-xs text-muted-foreground">#{i.invoiceNumber || i.id.slice(0, 8).toUpperCase()}</p>
        </div>

        {/* Customer & Phone */}
        <section className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
              {i.customerName.charAt(0)}
            </div>
            <div className="flex-1">
              <p className="font-semibold">{i.customerName}</p>
              {customerOutstanding > 0 && (
                <p className="text-xs text-amber-600">{formatINR(customerOutstanding)} previous outstanding</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Phone size={14} className="text-muted-foreground shrink-0" />
            <input
              value={customerPhone}
              onChange={e => updatePhone(e.target.value)}
              placeholder="Add phone for WhatsApp"
              type="tel"
              className="flex-1 text-sm bg-transparent border-b border-border focus:outline-none focus:border-primary py-1 placeholder:text-muted-foreground/60"
            />
          </div>
          {/* Communication status */}
          <div className={`flex items-center gap-2 text-xs ${customerPhone ? 'text-emerald-600' : 'text-muted-foreground'}`}>
            <span className={`w-2 h-2 rounded-full ${customerPhone ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
            {customerPhone
              ? `WhatsApp · ${customerPhone.replace(/\d(?=\d{4})/g, 'x')}`
              : 'No WhatsApp number — share manually'}
          </div>
        </section>

        {/* Invoice summary — compact sidebar */}
        <section className="bg-card border border-border rounded-xl p-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground text-xs">Items</span><p className="font-medium">{i.items.length} products</p></div>
            <div className="text-right"><span className="text-muted-foreground text-xs">Total</span><p className="font-bold text-lg">{formatINR(i.total)}</p></div>
          </div>
          <div className={`mt-2 text-xs font-medium px-2 py-1 rounded-full inline-flex items-center gap-1 ${
            isUdhar ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
          }`}>
            {isUdhar ? "UDHARI" : "PAID"}
          </div>
        </section>

        {/* ────── Recommended Action ────── */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Recommended Action</p>
          <button
            onClick={() => {
              if (!customerPhone) {
                setShowNoPhoneSheet(true)
              } else {
                setShowMessagePreview(true)
                setActionView('send_now')
              }
            }}
            className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold text-base flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-[0.98] shadow-lg dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
          >
            <Send size={18} />
            {customerPhone ? 'Send WhatsApp' : 'Share Invoice'}
          </button>
        </div>

        {/* ────── Communication ────── */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Communication</p>
          <div className="grid grid-cols-2 gap-2">
            <SecondaryAction
              icon={CalendarClock}
              label="Schedule Reminder"
              onClick={() => {
                setScheduleDate(getTomorrow())
                setScheduleTime("18:30")
                setActionView('schedule_reminder')
              }}
            />
            <SecondaryAction
              icon={Hand}
              label="Record Promise"
              onClick={() => setActionView('schedule_promise')}
            />
          </div>
        </div>

        {/* ────── Payments ────── */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Payments</p>
          <div className="grid grid-cols-2 gap-2">
            <SecondaryAction
              icon={CheckCircle2}
              label="Receive Payment"
              onClick={handleMarkPaid}
            />
            <SecondaryAction
              icon={paymentLinkLoading ? Loader2 : (paymentLinkUrl ? Copy : ExternalLink)}
              label={paymentLinkLoading ? "Generating..." : (paymentLinkUrl ? "Copy Payment Link" : "Payment Link")}
              description={paymentLinkLoading ? "Please wait..." : (paymentLinkUrl ? "Tap to copy" : "Generating...")}
              onClick={() => { if (paymentLinkUrl) copyPaymentLink() }}
              loading={paymentLinkLoading}
            />
          </div>
          {paymentLinkUrl && copied && (
            <p className="text-xs text-emerald-600 font-medium text-center">Copied!</p>
          )}
          {paymentLinkError && (
            <p className="text-xs text-amber-600 font-medium flex items-center gap-1 justify-center">
              <AlertTriangle size={12} />
              Payment link couldn't be generated
              <button onClick={generatePaymentLink} className="underline font-semibold">Retry</button>
            </p>
          )}
          {paymentLinkUrl && (
            <SecondaryAction
              icon={ExternalLink}
              label="QR Code"
              description="Scan to pay"
              onClick={() => window.open(paymentLinkUrl, '_blank')}
            />
          )}
        </div>

        {/* ────── Documents ────── */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Documents</p>
          <div className="grid grid-cols-2 gap-2">
            <SecondaryAction
              icon={FileText}
              label="Share PDF"
              onClick={async () => {
                const pdfData = buildPdfData()
                const doc = await generateInvoicePDF(pdfData)
                const blob = (doc as any).output('blob')
                const url = URL.createObjectURL(blob)
                window.open(url, '_blank')
              }}
            />
            <SecondaryAction
              icon={Download}
              label="Download PDF"
              onClick={async () => {
                const pdfData = buildPdfData()
                await downloadInvoicePDF(pdfData)
              }}
            />
          </div>
        </div>

        {/* ────── Current Status ────── */}
        <section className="bg-card border border-border rounded-xl p-4 space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Current Status</p>
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">WhatsApp Send</span>
              <span className={`text-xs font-medium ${phoneVerified ? 'text-emerald-600' : 'text-amber-600'}`}>
                {phoneVerified ? 'Ready' : 'Add phone'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Reminder Scheduled</span>
              <span className={`text-xs font-medium ${reminderScheduled ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                {reminderScheduled ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Promise Recorded</span>
              <span className={`text-xs font-medium ${promiseRecorded ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                {promiseRecorded ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Payment Link</span>
              <span className={`text-xs font-medium ${paymentLinkUrl ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                {paymentLinkUrl ? 'Ready' : 'Not created'}
              </span>
            </div>
          </div>
        </section>

        {/* Bottom nav */}
        <div className="flex gap-3 pt-1">
          <Link
            href="/dashboard"
            className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-center hover:bg-secondary transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href={`/invoices/${invoiceId}`}
            className="flex-1 py-3 rounded-xl bg-foreground text-background text-sm font-semibold text-center hover:opacity-90 transition-all"
          >
            View Invoice
          </Link>
        </div>

        {/* Credit exposure warning */}
        {totalExposure > 50000 && isUdhar && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Credit Exposure: {formatINR(totalExposure)}</p>
              <p className="mt-0.5">Customer has {formatINR(customerOutstanding)} outstanding. New invoice adds {formatINR(i.total)}.</p>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ────── SEND NOW VIEW ──────

  function renderSendNowView() {
    const i = invoice
    if (!i) return null
    return (
      <>
        <button onClick={() => setActionView('main')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft size={16} /> Back
        </button>

        <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 text-center">
          <Send className="h-8 w-8 text-primary mx-auto mb-2" />
          <h2 className="text-lg font-bold">{customerPhone ? 'Send Invoice on WhatsApp' : 'Share Invoice'}</h2>
        </div>

        {!customerPhone && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200">
            No customer WhatsApp number. We'll open your WhatsApp so you can forward the invoice manually.
          </div>
        )}

        {/* Message preview — shown directly before send */}
        <section className="bg-card border border-border rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Message Preview</p>
            <button
              onClick={() => setCustomMessage(getDefaultMessage !== customMessage ? '' : ' ')}
              className="text-[10px] font-medium text-primary hover:underline"
            >
              {customMessage ? 'Reset' : 'Edit'}
            </button>
          </div>
          <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <MessageSquare size={14} className="text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-green-700 dark:text-green-300 font-medium mb-1">To: {i.customerName}</p>
                <p className="text-xs text-green-700 dark:text-green-300 whitespace-pre-wrap">
                  {customMessage || getDefaultMessage}
                </p>
                {isUdhar && (
                  <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                    <ExternalLink size={10} />
                    {paymentLinkUrl ? '✓ Payment link included' : 'Payment link will be attached'}
                  </p>
                )}
              </div>
            </div>
          </div>
          {customMessage && (
            <textarea
              value={customMessage}
              onChange={e => setCustomMessage(e.target.value)}
              className="w-full text-xs bg-muted/50 rounded-lg p-3 border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              rows={4}
              placeholder="Type your message..."
            />
          )}
        </section>

        {/* Payment link — always included for unpaid invoices */}
        {isUdhar && (
          <section className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Payment Link</span>
              {paymentLinkLoading ? (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" />
                  Generating...
                </span>
              ) : paymentLinkUrl ? (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 size={12} />
                  Ready
                </span>
              ) : paymentLinkError ? (
                <span className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  Failed
                </span>
              ) : null}
            </div>
            {paymentLinkUrl && (
              <button
                onClick={copyPaymentLink}
                className="flex items-center gap-2 text-xs text-primary font-medium"
              >
                <Copy size={12} />
                {copied ? 'Copied!' : 'Copy payment link'}
              </button>
            )}
            {paymentLinkError && (
              <button onClick={generatePaymentLink} className="text-xs text-amber-600 underline font-medium">
                Retry
              </button>
            )}
            <p className="text-[10px] text-muted-foreground">Automatically included in message. Customer can pay via UPI, Card, or Bank Transfer.</p>
          </section>
        )}

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        <button
          onClick={handleSendNow}
          disabled={sending || (isUdhar && paymentLinkLoading)}
          className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold text-base flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
        >
          {sent ? <CheckCircle2 size={18} /> : sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          {sent ? 'Sent!' : sending ? 'Sending...' : 'Send Now'}
        </button>
      </>
    )
  }

  // ────── PROMISE VIEW ──────

  function renderPromiseView() {
    if (promiseSaved) {
      return (
        <div className="rounded-xl bg-success/10 border border-success/20 p-8 text-center space-y-3">
          <Hand className="h-12 w-12 text-success mx-auto" />
          <h2 className="text-xl font-bold">Recovery Plan Updated</h2>
          <p className="text-sm text-muted-foreground">Promise — {new Date(promiseDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} &middot; {TIME_LABELS[promiseTime]}</p>
          <p className="text-xs text-muted-foreground">
            Next Action: Wait for promise &middot; {getPromiseRemindLabel()}
            {promiseAutoFollowup && ' · Auto follow-up enabled'}
          </p>
        </div>
      )
    }

    return (
      <>
        <button onClick={() => setActionView('main')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft size={16} /> Back
        </button>

        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4">
          <h2 className="font-bold flex items-center gap-2"><Hand size={18} className="text-amber-600" /> Promise to Pay</h2>
          <p className="text-xs text-muted-foreground mt-1">Customer committed to pay. BillZo will remind them.</p>
        </div>

        <section className="bg-card border border-border rounded-xl p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Amount</label>
            <div className="relative mt-1">
              <IndianRupee size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="number"
                value={promiseAmount}
                onChange={e => setPromiseAmount(Number(e.target.value))}
                className="w-full h-11 rounded-xl border border-border bg-card pl-8 pr-3 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
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
              className="w-full h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 mt-1"
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
                        ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-700'
                        : 'border-border text-muted-foreground hover:border-amber-200'
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
              className="w-full h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 mt-1"
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
                    promiseAutoFollowup ? "bg-amber-600 border-amber-600" : "border-muted-foreground/30"
                  }`}
                  onClick={() => setPromiseAutoFollowup(!promiseAutoFollowup)}
                >
                  {promiseAutoFollowup && <CheckCircle2 size={14} className="text-white" />}
                </div>
                <div>
                  <span className="text-sm font-medium">Auto Follow-up</span>
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
              className="w-full h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 mt-1"
            />
          </div>
        </section>

        <button
          onClick={handleSavePromise}
          disabled={promiseSaving || !promiseDate}
          className="w-full py-4 bg-amber-600 text-white rounded-xl font-bold text-base flex items-center justify-center gap-2 hover:bg-amber-700 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg"
        >
          {promiseSaving ? <Loader2 size={18} className="animate-spin" /> : <Hand size={18} />}
          {promiseSaving ? 'Saving...' : 'Save Promise'}
        </button>
      </>
    )
  }

  // ────── SCHEDULE REMINDER VIEW ──────

  function renderScheduleReminderView() {
    const i = invoice
    if (!i) return null
    if (scheduleSaved) {
      return (
        <div className="rounded-xl bg-success/10 border border-success/20 p-8 text-center space-y-3">
          <CalendarClock className="h-12 w-12 text-success mx-auto" />
          <h2 className="text-xl font-bold">Recovery Plan Updated</h2>
          <p className="text-sm text-muted-foreground">
            Scheduled Reminder — {new Date(scheduleDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} &middot; {scheduleTime}
          </p>
          {scheduleRepeat !== 'once' && (
            <p className="text-xs text-muted-foreground">
              Repeats {scheduleRepeat === 'daily' ? 'daily' : scheduleRepeat === 'weekly' ? 'weekly' : 'every 2 days'}
            </p>
          )}
          <p className="text-xs text-muted-foreground">Next Action: Send reminder (automatic)</p>
        </div>
      )
    }

    return (
      <>
        <button onClick={() => setActionView('main')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft size={16} /> Back
        </button>

        <div className="rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 p-4">
          <h2 className="font-bold flex items-center gap-2"><CalendarClock size={18} className="text-violet-600" /> Schedule Reminder</h2>
          <p className="text-xs text-muted-foreground mt-1">BillZo sends at the scheduled time. Rate limits handled automatically.</p>
        </div>

        <section className="bg-card border border-border rounded-xl p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <input
              type="date"
              value={scheduleDate}
              onChange={e => setScheduleDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Time</label>
            <input
              type="time"
              value={scheduleTime}
              onChange={e => setScheduleTime(e.target.value)}
              className="w-full h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 mt-1"
            />
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
                      ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/30 text-violet-700'
                      : 'border-border text-muted-foreground hover:border-violet-200'
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
              value={customMessage || getDefaultMessage}
              onChange={e => setCustomMessage(e.target.value)}
              className="w-full text-sm bg-muted/50 rounded-lg p-3 border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              rows={3}
            />
          </div>
        </section>

        <button
          onClick={handleScheduleReminder}
          disabled={scheduleSaving || !scheduleDate}
          className="w-full py-4 bg-violet-600 text-white rounded-xl font-bold text-base flex items-center justify-center gap-2 hover:bg-violet-700 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg"
        >
          {scheduleSaving ? <Loader2 size={18} className="animate-spin" /> : <CalendarClock size={18} />}
          {scheduleSaving ? 'Scheduling...' : 'Schedule Reminder'}
        </button>
      </>
    )
  }

  // ──────────────────── MAIN RENDER ────────────────────

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-10 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => actionView !== 'main' ? setActionView('main') : router.back()} className="p-2 -ml-2 rounded-lg hover:bg-secondary">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">
          {actionView === 'main' ? '' : actionView === 'send_now' ? 'Send WhatsApp' : actionView === 'schedule_promise' ? 'Record Promise' : actionView === 'schedule_reminder' ? 'Schedule Reminder' : ''}
        </h1>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {sent ? (
        <div className="rounded-xl bg-success/10 border border-success/20 p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-2" />
          <h2 className="text-xl font-bold">Invoice Sent!</h2>
          <p className="text-sm text-muted-foreground mt-1">WhatsApp opened with your invoice.</p>
          <div className="flex gap-3 mt-6">
            <button onClick={() => { setSent(false); setActionView('main') }} className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-colors">
              Back
            </button>
            <Link href="/dashboard" className="flex-1 py-3 rounded-xl bg-foreground text-background text-sm font-semibold text-center hover:opacity-90">
              Dashboard
            </Link>
          </div>
        </div>
      ) : (
        <>
          {actionView === 'main' && renderMainView()}
          {actionView === 'send_now' && renderSendNowView()}
          {actionView === 'schedule_promise' && renderPromiseView()}
          {actionView === 'schedule_reminder' && renderScheduleReminderView()}
        </>
      )}

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
                onClick={() => { setShowNoPhoneSheet(false); setShowMessagePreview(true); setActionView('send_now') }}
                className="w-full flex items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-muted transition-all"
              >
                <Send size={18} className="text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">Open WhatsApp & Forward</p>
                  <p className="text-[10px] text-muted-foreground">Message goes to your WhatsApp to forward</p>
                </div>
              </button>

              <button
                onClick={() => { setShowNoPhoneSheet(false) }}
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
                  const msg = getDefaultMessage
                  navigator.clipboard.writeText(msg)
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

// ──────────────────── SECONDARY ACTION BUTTON ────────────────────

function SecondaryAction({
  icon: Icon,
  label,
  description,
  onClick,
  loading,
}: {
  icon: any
  label: string
  description?: string
  onClick: () => void
  loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-2 rounded-xl border border-border p-3 text-left transition-all hover:bg-muted active:scale-[0.98] ${loading ? 'opacity-50' : ''}`}
    >
      {loading ? (
        <Loader2 size={18} className="animate-spin text-muted-foreground shrink-0" />
      ) : (
        <Icon size={18} className="text-muted-foreground shrink-0" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-[10px] text-muted-foreground truncate">{description}</p>}
      </div>
    </button>
  )
}
