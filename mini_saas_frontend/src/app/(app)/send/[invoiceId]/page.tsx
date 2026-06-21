"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Phone, User, Building2, CheckCircle2,
  Loader2, AlertTriangle, Send, IndianRupee,
  Clock, ExternalLink, FileText, CreditCard,
  Bell, Ban, MessageSquare,
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
  const [includePaymentLink, setIncludePaymentLink] = useState(true)
  const [remindMe, setRemindMe] = useState(true)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendStep, setSendStep] = useState("")
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null)
  const [paymentLinkLoading, setPaymentLinkLoading] = useState(false)
  const [editMessage, setEditMessage] = useState(false)
  const [customMessage, setCustomMessage] = useState("")

  const isUdhar = paymentMethod === "udhar" || (invoice ? invoice.status !== "paid" && invoice.paidAmount === 0 : false)

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
        ? `\n\nFor quick payment: ${paymentLinkUrl}`
        : ""
      : "\n\nPayment received. Thank you!"

    return `Namaste ${inv.customerName},\n\nYour invoice ${inv.invoiceNumber || inv.id.slice(0, 8)} of ${formatINR(inv.total)} has been generated.${paymentNote}\n\nThank you,\n${shopName}`
  }

  const handleSend = async () => {
    if (!invoice) return
    if (!customerPhone) {
      setError("Please enter a customer phone number for WhatsApp")
      return
    }
    setSending(true)
    setError(null)

    try {
      setSendStep("Generating PDF...")
      await new Promise(r => setTimeout(r, 300))

      if (includePaymentLink && isUdhar && !paymentLinkUrl) {
        setSendStep("Creating payment link...")
        await generatePaymentLink()
        await new Promise(r => setTimeout(r, 200))
      }

      setSendStep("Preparing message...")
      const message = buildMessage()

      setSendStep("Opening WhatsApp...")

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

      setSendStep("✓ Opening WhatsApp")
      window.open(waLink, "_blank")

      if (includePaymentLink && isUdhar && paymentLinkUrl) {
        fetch("/api/payment/payment-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            invoiceId: invoice.id,
            amount: invoice.total,
            customerName: invoice.customerName,
            customerPhone: customerPhone,
          }),
        }).catch(() => {})
      }

      fetch("/api/intents/send-message", {
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
      }).catch(() => {})

      if (remindMe && isUdhar) {
        fetch("/api/recovery/case", {
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
        }).catch(() => {})
      }

      setSent(true)
      setSendStep("")
      setTimeout(() => router.push("/dashboard"), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send")
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
        <div className="h-8 bg-muted rounded-lg animate-pulse" />
        <div className="h-40 bg-muted rounded-xl animate-pulse" />
        <div className="h-24 bg-muted rounded-xl animate-pulse" />
        <div className="h-32 bg-muted rounded-xl animate-pulse" />
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

  const totalExposure = invoice.total + customerOutstanding

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-40 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-secondary">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold">Invoice Ready to Send</h1>
          <p className="text-xs text-muted-foreground">
            {invoice.invoiceNumber || invoice.id.slice(0, 8).toUpperCase()} • {formatINR(invoice.total)} • {invoice.customerName}
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {/* Sent confirmation */}
      {sent && (
        <div className="rounded-xl bg-success/10 border border-success/20 p-6 text-center">
          <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-2" />
          <p className="font-semibold text-lg">Invoice Sent!</p>
          <p className="text-xs text-muted-foreground mt-1">Redirecting to dashboard...</p>
        </div>
      )}

      {!sent && (
        <>
          {/* Section 1: Customer & Contact */}
          <section className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <User size={14} />
              Recipient
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                {invoice.customerName.charAt(0)}
              </div>
              <div>
                <p className="font-semibold">{invoice.customerName}</p>
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
                placeholder="Customer WhatsApp number"
                type="tel"
                className="flex-1 text-sm bg-transparent border-b border-border focus:outline-none focus:border-primary py-1 placeholder:text-muted-foreground/60"
              />
            </div>
            {!customerPhone && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                No customer phone. The invoice will be sent to <strong>your</strong> WhatsApp so you can forward it manually.
              </div>
            )}
          </section>

          {/* Outstading Warning */}
          {totalExposure > 50000 && isUdhar && (
            <div className="rounded-lg bg-warning-soft border border-warning/30 p-3 text-xs text-warning-foreground flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Credit Exposure: {formatINR(totalExposure)}</p>
                <p className="mt-0.5">Customer has {formatINR(customerOutstanding)} outstanding. New invoice adds {formatINR(invoice.total)}.</p>
              </div>
            </div>
          )}

          {/* Section 2: Invoice Summary */}
          <section className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <FileText size={14} />
              Invoice Summary
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Invoice No</p>
                <p className="font-medium">{invoice.invoiceNumber || invoice.id.slice(0, 8).toUpperCase()}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Date</p>
                <p className="font-medium">{new Date(invoice.createdAt).toLocaleDateString("en-IN")}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Items</p>
                <p className="font-medium">{invoice.items.length} products</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Total</p>
                <p className="font-bold text-lg">{formatINR(invoice.total)}</p>
              </div>
            </div>
            <div className={`text-xs font-medium px-2 py-1 rounded-full inline-flex items-center gap-1 ${
              isUdhar ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
            }`}>
              {isUdhar ? "UDHARI" : "PAID"}
            </div>
          </section>

          {/* Section 3: Quick Payment */}
          {isUdhar && (
            <section className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <CreditCard size={14} />
                Quick Payment
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
                {paymentLinkLoading && <Loader2 size={14} className="animate-spin" />}
              </label>
              {includePaymentLink && paymentLinkUrl && (
                <a
                  href={paymentLinkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-primary font-medium hover:underline"
                >
                  <ExternalLink size={12} />
                  {paymentLinkUrl}
                </a>
              )}
              <p className="text-xs text-muted-foreground">
                Customer can pay via UPI, Card, or Bank Transfer.
              </p>
            </section>
          )}

          {/* Section 4: Message Preview */}
          <section className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <MessageSquare size={14} />
                WhatsApp Message Preview
              </div>
              <button
                onClick={() => setEditMessage(!editMessage)}
                className="text-xs font-medium text-primary hover:underline"
              >
                {editMessage ? "Done" : "Edit"}
              </button>
            </div>
            {editMessage ? (
              <textarea
                value={customMessage || buildMessage()}
                onChange={e => setCustomMessage(e.target.value)}
                className="w-full text-sm bg-muted/50 rounded-lg p-3 border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                rows={6}
              />
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm whitespace-pre-wrap">
                {customMessage || buildMessage()}
              </div>
            )}
          </section>

          {/* Section 5: Remind me */}
          {isUdhar && (
            <section className="bg-card border border-border rounded-xl p-4">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      remindMe ? "bg-primary border-primary" : "border-muted-foreground/30"
                    }`}
                    onClick={() => setRemindMe(!remindMe)}
                  >
                    {remindMe && <CheckCircle2 size={14} className="text-white" />}
                  </div>
                  <div>
                    <span className="text-sm font-medium">Remind me if payment is not received</span>
                    <p className="text-xs text-muted-foreground">Adds to recovery queue if unpaid by due date</p>
                  </div>
                </div>
                <Bell size={16} className="text-muted-foreground" />
              </label>
            </section>
          )}
        </>
      )}

      {/* Fixed bottom send button */}
      {!sent && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-card/90 backdrop-blur-xl border-t border-border z-50">
          <div className="max-w-lg mx-auto">
            {sending ? (
              <div className="rounded-xl bg-primary text-primary-foreground p-4 text-sm text-center space-y-1">
                <div className="flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Sending invoice...
                </div>
                {sendStep && <p className="text-primary-foreground/70 text-xs">{sendStep}</p>}
              </div>
            ) : (
              <button
                onClick={handleSend}
                disabled={sending}
                className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold text-base flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
              >
                <Send size={18} />
                Send Invoice on WhatsApp
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
