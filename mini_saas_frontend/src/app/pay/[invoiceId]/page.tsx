"use client"

import { useState, useEffect, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import QRCode from 'qrcode'
import { Loader2, CheckCircle, XCircle, Copy, Check, ExternalLink, Smartphone, Building, Banknote, Clock, Phone, CalendarClock, ChevronDown } from "lucide-react"
import { formatINR } from "@/lib/utils"
import { logRecoveryActivity } from "@/lib/billzo/recovery/activity"

interface InvoiceInfo {
  id: string
  invoiceNumber: string
  documentType: string
  total: number
  paidAmount: number
  status: string
  customerName: string
  description: string
  dueDate: string
  merchantName: string
  merchantPhone: string | null
  merchantAddress: string | null
  merchantLogo: string | null
  merchantGstin: string | null
  upiId: string | null
  bankDetails: { accountHolder?: string; bankName?: string; accountNumber?: string; ifsc?: string } | null
  paymentConfig: any | null
  items: Array<{ name: string; qty: number; price: number; hsn?: string; gst_rate?: number }>
}

type PageState = "loading" | "ready" | "success" | "error"

export default function PayInvoicePage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = params.invoiceId as string

  const [state, setState] = useState<PageState>("loading")
  const [error, setError] = useState<string | null>(null)
  const [invoice, setInvoice] = useState<InvoiceInfo | null>(null)
  const [upiQr, setUpiQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showPromiseForm, setShowPromiseForm] = useState(false)
  const [promiseDate, setPromiseDate] = useState("")
  const [promiseAmount, setPromiseAmount] = useState("")
  const [promiseNote, setPromiseNote] = useState("")
  const [promiseSubmitting, setPromiseSubmitting] = useState(false)

  useEffect(() => {
    fetchInvoice()
  }, [])

  const fetchInvoice = async () => {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, { cache: "no-store" })
      if (!res.ok) throw new Error("Invoice not found")
      const data = await res.json()
      const inv: InvoiceInfo = {
        id: data.id,
        invoiceNumber: data.invoice_number || data.id.slice(-8),
        documentType: data.document_type || 'tax_invoice',
        total: data.total,
        paidAmount: data.paid_amount || 0,
        status: data.status,
        customerName: data.customer_name || "Customer",
        description: data.description || `Invoice ${data.invoice_number || data.id.slice(-8)}`,
        dueDate: data.due_date || "",
        merchantName: data.merchant_name || "Business",
        merchantPhone: data.merchant_phone || null,
        merchantAddress: data.merchant_address || null,
        merchantLogo: data.merchant_logo || null,
        merchantGstin: data.merchant_gstin || null,
        upiId: data.upi_id || null,
        bankDetails: data.bank_details || null,
        paymentConfig: data.payment_config || null,
        items: data.items || [],
      }
      setInvoice(inv)

      if (data.upi_id) {
        try {
          const upiQrStr = `upi://pay?pa=${encodeURIComponent(data.upi_id)}&pn=${encodeURIComponent(data.merchant_name)}&am=${(data.total - (data.paid_amount || 0)).toFixed(2)}&cu=INR&tn=${encodeURIComponent('INV ' + (data.invoice_number || data.id.slice(-8)))}`
          const qrDataUrl = await QRCode.toDataURL(upiQrStr, { width: 200, margin: 1, color: { dark: '#1e293b', light: '#ffffff' } })
          setUpiQr(qrDataUrl)
        } catch { }
      }

      logView(data.id)
      logRecoveryActivity({ invoiceId: data.id, type: 'payment_link_opened', actor: 'customer' })
      setState("ready")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice")
      setState("error")
    }
  }

  const logView = async (id: string) => {
    logRecoveryActivity({ invoiceId: id, type: 'customer_viewed', actor: 'customer' })
  }

  const handleMarkPaid = async () => {
    if (!invoice || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/payment/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          amount: invoice.total - invoice.paidAmount,
          source: "upi",
          collectedVia: "customer_portal",
        }),
      })
      if (!res.ok) throw new Error("Failed to record payment")
      logRecoveryActivity({ invoiceId: invoice.id, type: 'customer_payment_reported', actor: 'customer', metadata: { amount: invoice.total - invoice.paidAmount } })
      setState("success")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment")
    } finally {
      setSubmitting(false)
    }
  }

  const handlePromise = async () => {
    if (!invoice || !promiseDate) return
    setPromiseSubmitting(true)
    try {
      const res = await fetch('/api/recovery/promise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoice.id,
          amount: promiseAmount ? Number(promiseAmount) : invoice.total - invoice.paidAmount,
          dueDate: promiseDate,
          note: promiseNote || null,
        }),
      })
      if (!res.ok) throw new Error("Failed to record promise")
      setShowPromiseForm(false)
      setState("success")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record promise")
    } finally {
      setPromiseSubmitting(false)
    }
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isPaid = invoice?.status === "paid" || (invoice?.paidAmount || 0) >= (invoice?.total || 0)
  const outstanding = invoice ? invoice.total - invoice.paidAmount : 0

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="mt-3 text-sm text-muted-foreground">Loading invoice...</p>
        </div>
      </div>
    )
  }

  if (state === "success" && invoice) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 bg-background">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-success-soft">
          <CheckCircle className="h-8 w-8 text-success" />
        </div>
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-bold text-foreground">Thank you!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your response has been recorded. The merchant will be notified.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {invoice.merchantName} • {invoice.invoiceNumber}
          </p>
        </div>
      </div>
    )
  }

  if (state === "error" && !invoice) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 bg-background">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-warning-soft">
          <XCircle className="h-8 w-8 text-warning" />
        </div>
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-bold text-foreground">Invoice not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Merchant Header */}
        <div className="text-center mb-6">
          {invoice?.merchantLogo && (
            <img
              src={invoice.merchantLogo}
              alt={invoice.merchantName}
              className="w-16 h-16 rounded-xl object-contain mx-auto mb-3 bg-card border border-border p-1"
            />
          )}
          <h1 className="text-xl font-bold text-foreground">{invoice?.merchantName}</h1>
          {invoice?.merchantAddress && (
            <p className="text-xs text-muted-foreground mt-0.5">{invoice.merchantAddress}</p>
          )}
          {invoice?.merchantGstin && invoice.documentType === 'tax_invoice' && (
            <p className="text-xs text-muted-foreground">GSTIN: {invoice.merchantGstin}</p>
          )}
        </div>

        {/* Invoice Card */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
          {/* Amount & Status */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{invoice?.documentType === 'bill' ? 'BILL' : 'TAX INVOICE'}</p>
            <p className="text-3xl font-bold text-foreground mt-1">
              {formatINR(outstanding)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {invoice?.invoiceNumber} • {invoice?.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
            </p>
          </div>

          {/* Items */}
          {invoice?.items && invoice.items.length > 0 && (
            <div className="border-t border-border pt-4 space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Items</p>
              {invoice.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-foreground">{item.name} x{item.qty}</span>
                  <span className="text-muted-foreground">{formatINR(item.price * item.qty)}</span>
                </div>
              ))}
              {invoice.paidAmount > 0 && (
                <div className="flex justify-between text-sm border-t border-border pt-2 mt-2">
                  <span className="text-muted-foreground">Paid</span>
                  <span className="text-success font-medium">{formatINR(invoice.paidAmount)}</span>
                </div>
              )}
            </div>
          )}

          {/* UPI Payment */}
          {invoice?.upiId && !isPaid && (
            <div className="border-t border-border pt-4">
              <div className="text-center">
                {upiQr && (
                  <div className="mb-3">
                    <img src={upiQr} alt="UPI QR" className="w-40 h-40 mx-auto" />
                    <p className="text-[10px] text-muted-foreground mt-1">Scan to Pay via UPI</p>
                  </div>
                )}
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs text-muted-foreground">UPI ID:</span>
                  <span className="text-sm font-mono font-medium text-foreground">{invoice.upiId}</span>
                  <button
                    onClick={() => handleCopy(invoice.upiId!)}
                    className="p-1 rounded hover:bg-muted transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bank Details */}
          {invoice?.bankDetails && !isPaid && (
            <div className="border-t border-border pt-4">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Bank Transfer</p>
              <div className="space-y-1 text-sm">
                {invoice.bankDetails.accountHolder && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account Holder</span>
                    <span className="text-foreground font-medium">{invoice.bankDetails.accountHolder}</span>
                  </div>
                )}
                {invoice.bankDetails.bankName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bank</span>
                    <span className="text-foreground font-medium">{invoice.bankDetails.bankName}</span>
                  </div>
                )}
                {invoice.bankDetails.accountNumber && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account</span>
                    <span className="text-foreground font-mono font-medium">{invoice.bankDetails.accountNumber}</span>
                  </div>
                )}
                {invoice.bankDetails.ifsc && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IFSC</span>
                    <span className="text-foreground font-mono font-medium">{invoice.bankDetails.ifsc}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          {!isPaid && (
            <div className="border-t border-border pt-4 space-y-2">
              <button
                onClick={handleMarkPaid}
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "I've Paid — Notify Merchant"}
              </button>

              {!showPromiseForm ? (
                <button
                  onClick={() => setShowPromiseForm(true)}
                  className="w-full py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                >
                  <CalendarClock className="w-4 h-4 inline mr-1.5" />
                  Need More Time?
                </button>
              ) : (
                <div className="rounded-xl border border-border p-4 space-y-3 bg-muted/20">
                  <p className="text-xs font-medium text-foreground">When can you pay?</p>
                  <input
                    type="date"
                    value={promiseDate}
                    onChange={e => setPromiseDate(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    min={new Date().toISOString().slice(0, 10)}
                  />
                  <input
                    type="number"
                    value={promiseAmount}
                    onChange={e => setPromiseAmount(e.target.value)}
                    placeholder={`Amount (default: ${formatINR(outstanding)})`}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                  <input
                    type="text"
                    value={promiseNote}
                    onChange={e => setPromiseNote(e.target.value)}
                    placeholder="Optional note..."
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowPromiseForm(false)}
                      className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handlePromise}
                      disabled={promiseSubmitting || !promiseDate}
                      className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50"
                    >
                      {promiseSubmitting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Confirm"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isPaid && (
            <div className="border-t border-border pt-4">
              <div className="rounded-xl border border-success bg-success-soft p-4 text-center">
                <CheckCircle className="w-8 h-8 text-success mx-auto mb-2" />
                <p className="text-sm font-semibold text-success">Invoice Paid</p>
                <p className="text-xs text-success mt-1">This invoice has been paid.</p>
              </div>
            </div>
          )}
        </div>

        {/* Contact Merchant */}
        {invoice?.merchantPhone && (
          <div className="mt-4 text-center">
            <a
              href={`tel:${invoice.merchantPhone}`}
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Phone className="w-4 h-4" />
              Contact {invoice.merchantName}
            </a>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl bg-warning-soft p-3 text-sm text-warning text-center">{error}</div>
        )}
      </div>
    </div>
  )
}
