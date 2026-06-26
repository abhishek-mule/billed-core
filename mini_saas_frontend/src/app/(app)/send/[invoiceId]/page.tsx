"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Phone, User, CheckCircle2,
  Loader2, AlertTriangle, Send, IndianRupee,
  Clock, ExternalLink, FileText, CreditCard,
  Bell, Ban, MessageSquare, Hand,
  CalendarClock, Copy, Check,
  MoreHorizontal, X,
} from "lucide-react"
import { formatINR } from "@/lib/utils"
import { db } from "@/lib/billzo/db"
import { getCookie } from "@/lib/cookies"
import { getWhatsAppShareLink, type InvoiceData } from "@/lib/billzo/pdf"

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

export default function InvoiceSendPage() {
  const router = useRouter()
  const params = useParams()
  const invoiceId = params?.invoiceId as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [invoice, setInvoice] = useState<InvoiceDataFull | null>(null)
  const [customerPhone, setCustomerPhone_] = useState("")
  const [customerOutstanding, setCustomerOutstanding] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "upi" | "udhar">("udhar")

  const [actionView, setActionView] = useState<ActionView>('main')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null)
  const [paymentLinkLoading, setPaymentLinkLoading] = useState(false)

  // Promise fields
  const [promiseAmount, setPromiseAmount] = useState(0)
  const [promiseDate, setPromiseDate] = useState("")
  const [promiseTime, setPromiseTime] = useState("evening")
  const [promiseNotes, setPromiseNotes] = useState("")
  const [promiseSaving, setPromiseSaving] = useState(false)
  const [promiseSaved, setPromiseSaved] = useState(false)

  // Schedule fields
  const [scheduleDate, setScheduleDate] = useState("")
  const [scheduleTime, setScheduleTime] = useState("18:30")
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleSaved, setScheduleSaved] = useState(false)

  // Send flow fields
  const [includePaymentLink, setIncludePaymentLink] = useState(true)
  const [customMessage, setCustomMessage] = useState("")

  const isUdhar = paymentMethod === "udhar" || (invoice ? invoice.status !== "paid" && invoice.paidAmount === 0 : false)
  const totalExposure = invoice ? invoice.total + customerOutstanding : 0

  // Pre-fill promise date to upcoming Sunday
  function getNextSunday(): string {
    const d = new Date()
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7))
    return d.toISOString().split('T')[0]
  }

  const loadData = useCallback(async () => {
    if (!invoiceId) { setError("No invoice ID"); setLoading(false); return }
    try {
      const inv = await db().invoices.get(invoiceId)
      if (!inv) { setError("Invoice not found"); setLoading(false); return }

      const items = await db().invoiceItems.where("invoiceId").equals(invoiceId).toArray()
      const outstanding = (inv.total || 0) - (inv.paidAmount || 0)

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
      setIncludePaymentLink(inv.paidAmount === 0)
      setPromiseAmount(inv.total - inv.paidAmount)
      setPromiseDate(getNextSunday())
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice")
      setLoading(false)
    }
  }, [invoiceId])

  useEffect(() => { loadData() }, [loadData])

  const updatePhone = async (phone: string) => {
    setCustomerPhone_(phone)
    if (invoice && phone) {
      await db().invoices.update(invoiceId, { customerPhone: phone })
    }
  }

  const generatePaymentLink = async () => {
    if (!invoice || paymentLinkUrl) return
    setPaymentLinkLoading(true)
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
      }
    } catch (err) {
      console.error("Payment link error:", err)
    } finally {
      setPaymentLinkLoading(false)
    }
  }

  const buildMessage = (): string => {
    const shopName = getCookie("bz_tenant_name") || "My Shop"
    const inv = invoice
    if (!inv) return ""

    if (customMessage) return customMessage

    const paymentNote = isUdhar
      ? paymentLinkUrl
        ? `\n\nPay here: ${paymentLinkUrl}`
        : ""
      : "\n\nPayment received. Thank you!"

    return `Namaste ${inv.customerName},\n\nYour invoice ${inv.invoiceNumber || inv.id.slice(0, 8)} of ${formatINR(inv.total)} is ready.${paymentNote}\n\nThank you,\n${shopName}`
  }

  const handleSendNow = async () => {
    if (!invoice) return
    if (!customerPhone) {
      setError("Please enter a customer phone number for WhatsApp")
      return
    }
    setSending(true)
    setError(null)

    try {
      if (includePaymentLink && isUdhar && !paymentLinkUrl) {
        await generatePaymentLink()
      }

      const message = buildMessage()
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

      await fetch("/api/recovery/queue/actions", {
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
            notes: customMessage || undefined,
          },
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
          customerPhone: customerPhone || undefined,
        }),
      })

      setScheduleSaved(true)
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
      const timeMap: Record<string, string> = { morning: '09:00', afternoon: '14:00', evening: '18:00', night: '21:00' }
      const [h, m] = (timeMap[promiseTime] || '18:00').split(':').map(Number)
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
            notes: promiseNotes || `Promise on invoice ${invoice.invoiceNumber || invoice.id.slice(0, 8)}`,
          },
        }),
      })

      setPromiseSaved(true)
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

  // ────────────────────────────────────

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
  const inv = invoice

  // ──────────────────── SUB-VIEWS ────────────────────

  function renderMainView() {
    const i = invoice
    if (!i) return null
    return (
      <>
        {/* Success header */}
        <div className="rounded-xl bg-success/10 border border-success/20 p-6 text-center">
          <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-2" />
          <h1 className="text-xl font-bold">Invoice Created</h1>
          <p className="text-sm text-muted-foreground mt-1">
            #{i.invoiceNumber || i.id.slice(0, 8).toUpperCase()} &middot; {formatINR(i.total)}
          </p>
        </div>

        {/* Customer summary */}
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
        </section>

        {/* Invoice summary */}
        <section className="bg-card border border-border rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <FileText size={14} />
            Invoice Summary
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Items</p>
              <p className="font-medium">{i.items.length} products</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Total</p>
              <p className="font-bold text-lg">{formatINR(i.total)}</p>
            </div>
          </div>
          <div className={`text-xs font-medium px-2 py-1 rounded-full inline-flex items-center gap-1 ${
            isUdhar ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
          }`}>
            {isUdhar ? "UDHARI" : "PAID"}
          </div>
        </section>

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

        {/* Action Grid */}
        <div className="grid grid-cols-2 gap-3">
          <ActionButton
            icon={Send}
            label="Send Now"
            description="WhatsApp invoice to customer"
            onClick={() => setActionView('send_now')}
            color="text-primary"
            bg="bg-primary/5 hover:bg-primary/10"
          />
          <ActionButton
            icon={CalendarClock}
            label="Schedule Reminder"
            description="Set a date & time to send"
            onClick={() => {
              const d = new Date()
              d.setDate(d.getDate() + 1)
              setScheduleDate(d.toISOString().split('T')[0])
              setScheduleTime("18:30")
              setActionView('schedule_reminder')
            }}
            color="text-violet-600"
            bg="bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-950/50"
          />
          <ActionButton
            icon={Hand}
            label="Record Promise"
            description="Customer committed to pay"
            onClick={() => setActionView('schedule_promise')}
            color="text-amber-600"
            bg="bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50"
          />
          <ActionButton
            icon={CheckCircle2}
            label="Mark Paid"
            description="Record as paid now"
            onClick={handleMarkPaid}
            color="text-emerald-600"
            bg="bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50"
          />
          <ActionButton
            icon={FileText}
            label="Share PDF"
            description="Download or share invoice PDF"
            onClick={() => {
              const pdfUrl = `/api/invoices/${i.id}/pdf`
              window.open(pdfUrl, '_blank')
            }}
            color="text-blue-600"
            bg="bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50"
          />
          {isUdhar && (
            <ActionButton
              icon={paymentLinkLoading ? Loader2 : (paymentLinkUrl ? Check : CreditCard)}
              label={paymentLinkUrl ? "Payment Link Ready" : "Create Payment Link"}
              description={paymentLinkUrl ? "Copy link to share" : "UPI, card, bank transfer"}
              onClick={async () => {
                if (paymentLinkUrl) {
                  copyPaymentLink()
                } else {
                  await generatePaymentLink()
                }
              }}
              loading={paymentLinkLoading}
              color="text-indigo-600"
              bg="bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50"
            />
          )}
        </div>

        {paymentLinkUrl && copied && (
          <div className="text-xs text-center text-emerald-600 font-medium">Payment link copied!</div>
        )}

        {/* Bottom: Done / View Invoice */}
        <div className="flex gap-3 pt-2">
          <Link
            href="/dashboard"
            className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-center hover:bg-secondary transition-colors"
          >
            Go to Dashboard
          </Link>
          <Link
            href={`/invoices/${invoiceId}`}
            className="flex-1 py-3 rounded-xl bg-foreground text-background text-sm font-semibold text-center hover:opacity-90 transition-all"
          >
            View Invoice
          </Link>
        </div>
      </>
    )
  }

  // ────── SEND NOW VIEW ──────

  function renderSendNowView() {
    return (
      <>
        <button onClick={() => setActionView('main')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft size={16} /> Back to actions
        </button>

        <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 text-center">
          <Send className="h-8 w-8 text-primary mx-auto mb-2" />
          <h2 className="text-lg font-bold">Send Invoice via WhatsApp</h2>
        </div>

        {!customerPhone && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200">
            No customer phone. Enter number above to send directly, or the invoice will be sent to <strong>your</strong> WhatsApp to forward.
          </div>
        )}

        <section className="bg-card border border-border rounded-xl p-4 space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  includePaymentLink ? "bg-primary border-primary" : "border-muted-foreground/30"
                }`}
                onClick={() => setIncludePaymentLink(!includePaymentLink)}
              >
                {includePaymentLink && <CheckCircle2 size={14} className="text-white" />}
              </div>
              <span className="text-sm font-medium">Include Payment Link</span>
            </div>
          </label>
          {includePaymentLink && paymentLinkUrl && (
            <div className="flex items-center gap-2 text-xs text-primary font-medium">
              <ExternalLink size={12} />
              <span className="truncate flex-1">{paymentLinkUrl}</span>
              <button onClick={copyPaymentLink} className="shrink-0 hover:text-primary/80">
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          )}
        </section>

        <section className="bg-card border border-border rounded-xl p-4 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Message</div>
          <textarea
            value={customMessage || buildMessage()}
            onChange={e => setCustomMessage(e.target.value)}
            className="w-full text-sm bg-muted/50 rounded-lg p-3 border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            rows={5}
          />
        </section>

        <button
          onClick={handleSendNow}
          disabled={sending}
          className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold text-base flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
        >
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          {sending ? "Sending..." : "Send Now"}
        </button>
      </>
    )
  }

  // ────── SCHEDULE PROMISE VIEW ──────

  function renderPromiseView() {
    if (promiseSaved) {
      return (
        <div className="rounded-xl bg-success/10 border border-success/20 p-8 text-center space-y-3">
          <Hand className="h-12 w-12 text-success mx-auto" />
          <h2 className="text-xl font-bold">Promise Saved</h2>
          <p className="text-sm text-muted-foreground">
            Next reminder: {new Date(promiseDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} &middot; {promiseTime === 'morning' ? '9:00 AM' : promiseTime === 'afternoon' ? '2:00 PM' : promiseTime === 'evening' ? '6:00 PM' : '9:00 PM'}
          </p>
          <p className="text-xs text-muted-foreground">Status: Awaiting promise</p>
        </div>
      )
    }

    return (
      <>
        <button onClick={() => setActionView('main')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft size={16} /> Back to actions
        </button>

        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4">
          <h2 className="font-bold flex items-center gap-2"><Hand size={18} className="text-amber-600" /> Promise to Pay</h2>
          <p className="text-xs text-muted-foreground mt-1">Customer said they will pay. We'll remind them on the promise date.</p>
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
            <select
              value={promiseTime}
              onChange={e => setPromiseTime(e.target.value)}
              className="w-full h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 mt-1"
            >
              <option value="morning">Morning (9 AM)</option>
              <option value="afternoon">Afternoon (2 PM)</option>
              <option value="evening">Evening (6 PM)</option>
              <option value="night">Night (9 PM)</option>
            </select>
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
          {promiseSaving ? "Saving..." : "Save Promise"}
        </button>
      </>
    )
  }

  // ────── SCHEDULE REMINDER VIEW ──────

  function renderScheduleReminderView() {
    if (scheduleSaved) {
      return (
        <div className="rounded-xl bg-success/10 border border-success/20 p-8 text-center space-y-3">
          <CalendarClock className="h-12 w-12 text-success mx-auto" />
          <h2 className="text-xl font-bold">Reminder Scheduled</h2>
          <p className="text-sm text-muted-foreground">
            {new Date(scheduleDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} &middot; {scheduleTime}
          </p>
          <p className="text-xs text-muted-foreground">Status: Scheduled</p>
        </div>
      )
    }

    return (
      <>
        <button onClick={() => setActionView('main')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft size={16} /> Back to actions
        </button>

        <div className="rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 p-4">
          <h2 className="font-bold flex items-center gap-2"><CalendarClock size={18} className="text-violet-600" /> Schedule Reminder</h2>
          <p className="text-xs text-muted-foreground mt-1">Set when to remind this customer. BillZo handles rate limits.</p>
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
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              <MessageSquare size={14} />
              Message
            </div>
            <textarea
              value={customMessage || buildMessage()}
              onChange={e => setCustomMessage(e.target.value)}
              className="w-full text-sm bg-muted/50 rounded-lg p-3 border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              rows={4}
            />
          </div>
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                includePaymentLink ? "bg-primary border-primary" : "border-muted-foreground/30"
              }`}
                onClick={() => setIncludePaymentLink(!includePaymentLink)}
              >
                {includePaymentLink && <CheckCircle2 size={14} className="text-white" />}
              </div>
              <span className="text-sm font-medium">Include Payment Link</span>
            </div>
          </label>
        </section>

        <button
          onClick={handleScheduleReminder}
          disabled={scheduleSaving || !scheduleDate}
          className="w-full py-4 bg-violet-600 text-white rounded-xl font-bold text-base flex items-center justify-center gap-2 hover:bg-violet-700 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg"
        >
          {scheduleSaving ? <Loader2 size={18} className="animate-spin" /> : <CalendarClock size={18} />}
          {scheduleSaving ? "Scheduling..." : "Schedule Reminder"}
        </button>
      </>
    )
  }

  // ──────────────────── MAIN RENDER ────────────────────

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-40 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-secondary">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold">{actionView === 'main' ? 'Invoice' : 'Back to Actions'}</h1>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {/* Action-specific views */}
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
    </div>
  )
}

// ──────────────────── SUB-COMPONENTS ────────────────────

function ActionButton({
  icon: Icon,
  label,
  description,
  onClick,
  color,
  bg,
  loading,
}: {
  icon: any
  label: string
  description: string
  onClick: () => void
  color: string
  bg: string
  loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-xl p-4 text-center transition-all active:scale-[0.98] border border-border ${bg} ${loading ? 'opacity-50' : ''}`}
    >
      {loading ? (
        <Loader2 size={22} className={`animate-spin ${color}`} />
      ) : (
        <Icon size={22} className={color} />
      )}
      <span className="text-xs font-semibold">{label}</span>
      <span className="text-[10px] text-muted-foreground leading-tight">{description}</span>
    </button>
  )
}
