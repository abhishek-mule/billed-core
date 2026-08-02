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
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Merchant Header */}
        <div className="grid grid-cols-12 gap-4 mb-8">
          <div className="col-span-12 flex items-center gap-4">
            {invoice?.merchantLogo && (
              <img
                src={invoice.merchantLogo}
                alt={invoice.merchantName}
                className="w-12 h-12 rounded-xl object-contain bg-white border border-[#e2e8f0] p-1"
              />
            )}
            <div>
              <h1 className="text-lg font-bold text-[#1e293b]">{invoice?.merchantName}</h1>
              {invoice?.merchantAddress && (
                <p className="text-xs text-[#94a3b8] mt-0.5">{invoice.merchantAddress}</p>
              )}
              {invoice?.merchantGstin && invoice.documentType === 'tax_invoice' && (
                <p className="text-xs text-[#94a3b8]">GSTIN: {invoice.merchantGstin}</p>
              )}
            </div>
          </div>
        </div>

        {/* Invoice Card */}
        <div className="bg-white rounded-2xl border border-[#e2e8f0] p-8 space-y-6 shadow-sm">
          {/* Document Type & Grand Total */}
          <div className="text-center border-b border-[#f1f5f9] pb-6">
            <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-[0.12em]">
              {invoice?.documentType === 'bill' ? 'BILL' : 'TAX INVOICE'}
            </p>
            <div className="mt-3">
              <p className="text-[40px] font-bold text-[#16802d] leading-none tracking-tight tabular-nums">
                {formatINR(outstanding)}
              </p>
              {invoice && invoice.paidAmount > 0 && (
                <p className="text-xs text-[#94a3b8] mt-1 line-through">{formatINR(invoice.total)}</p>
              )}
            </div>
            <p className="text-xs text-[#94a3b8] mt-2">
              {invoice?.invoiceNumber}
              {invoice?.dueDate && <span>  ·  {new Date(invoice.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
            </p>
          </div>

          {/* Items */}
          {invoice?.items && invoice.items.length > 0 && (
            <div>
              <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wider pb-2 border-b border-[#f1f5f9]">
                <div className="col-span-7">Item</div>
                <div className="col-span-2 text-center">Qty</div>
                <div className="col-span-3 text-right">Amount</div>
              </div>
              {invoice.items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 py-2.5 text-sm border-b border-[#f8fafc] last:border-0">
                  <div className="col-span-7 text-[#1e293b] font-medium">{item.name}</div>
                  <div className="col-span-2 text-center text-[#94a3b8]">{item.qty}</div>
                  <div className="col-span-3 text-right text-[#1e293b] font-medium tabular-nums">{formatINR(item.price * item.qty)}</div>
                </div>
              ))}
              {(invoice?.paidAmount ?? 0) > 0 && invoice && (
                <div className="grid grid-cols-12 gap-2 pt-3 mt-2 border-t border-[#e2e8f0]">
                  <div className="col-span-9 text-sm text-[#16802d] font-medium">Paid</div>
                  <div className="col-span-3 text-right text-sm text-[#16802d] font-bold tabular-nums">{formatINR(invoice.paidAmount)}</div>
                </div>
              )}
            </div>
          )}

          {/* QR Section */}
          {invoice?.upiId && !isPaid && (
            <div className="rounded-xl bg-[#f8fafc] border border-[#e2e8f0] p-6">
              <div className="grid grid-cols-12 gap-6 items-center">
                <div className="col-span-5 flex flex-col items-center">
                  {upiQr && (
                    <>
                      <img src={upiQr} alt="UPI QR" className="w-36 h-36" />
                      <p className="text-[10px] text-[#94a3b8] mt-1.5 font-medium tracking-wider uppercase">Scan to Pay</p>
                    </>
                  )}
                </div>
                <div className="col-span-7 space-y-3">
                  <p className="text-[11px] font-semibold text-[#1e293b] uppercase tracking-wider">UPI Payment</p>
                  <div>
                    <p className="text-[11px] text-[#94a3b8]">UPI ID</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm font-mono font-bold text-[#1e293b]">{invoice.upiId}</span>
                      <button
                        onClick={() => handleCopy(invoice.upiId!)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1e293b] text-white text-[10px] font-semibold hover:bg-[#334155] transition-colors"
                      >
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-[#94a3b8]">Scan with any UPI app such as Google Pay, PhonePe, Paytm</p>
                </div>
              </div>
            </div>
          )}

          {/* Bank Details */}
          {invoice?.bankDetails && !isPaid && (
            <div className="rounded-xl border border-[#e2e8f0] p-5">
              <p className="text-[11px] font-semibold text-[#1e293b] uppercase tracking-wider mb-3">Bank Transfer</p>
              <div className="grid grid-cols-1 gap-2 text-sm">
                {invoice.bankDetails.accountHolder && (
                  <div className="grid grid-cols-4 gap-2">
                    <span className="text-[#94a3b8] text-[12px]">A/c Holder</span>
                    <span className="col-span-3 text-[#1e293b] font-medium text-[13px]">{invoice.bankDetails.accountHolder}</span>
                  </div>
                )}
                {invoice.bankDetails.bankName && (
                  <div className="grid grid-cols-4 gap-2">
                    <span className="text-[#94a3b8] text-[12px]">Bank</span>
                    <span className="col-span-3 text-[#1e293b] font-medium text-[13px]">{invoice.bankDetails.bankName}</span>
                  </div>
                )}
                {invoice.bankDetails.accountNumber && (
                  <div className="grid grid-cols-4 gap-2">
                    <span className="text-[#94a3b8] text-[12px]">Account</span>
                    <span className="col-span-3 text-[#1e293b] font-mono font-medium text-[13px]">{invoice.bankDetails.accountNumber}</span>
                  </div>
                )}
                {invoice.bankDetails.ifsc && (
                  <div className="grid grid-cols-4 gap-2">
                    <span className="text-[#94a3b8] text-[12px]">IFSC</span>
                    <span className="col-span-3 text-[#1e293b] font-mono font-medium text-[13px]">{invoice.bankDetails.ifsc}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          {!isPaid && (
            <div className="space-y-3 pt-2">
              <button
                onClick={handleMarkPaid}
                disabled={submitting}
                className="w-full py-3.5 rounded-xl bg-[#1e293b] text-white text-sm font-semibold hover:bg-[#334155] transition-all disabled:opacity-50 shadow-sm"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "I've Paid — Notify Merchant"}
              </button>

              {!showPromiseForm ? (
                <button
                  onClick={() => setShowPromiseForm(true)}
                  className="w-full py-3 rounded-xl border border-[#e2e8f0] text-sm font-medium text-[#64748b] hover:text-[#1e293b] hover:bg-[#f8fafc] transition-all"
                >
                  <CalendarClock className="w-4 h-4 inline mr-1.5" />
                  Need More Time?
                </button>
              ) : (
                <div className="rounded-xl border border-[#e2e8f0] p-5 space-y-3 bg-[#f8fafc]">
                  <p className="text-xs font-semibold text-[#1e293b]">When can you pay?</p>
                  <input
                    type="date"
                    value={promiseDate}
                    onChange={e => setPromiseDate(e.target.value)}
                    className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-[#1e293b] text-[#1e293b]"
                    min={new Date().toISOString().slice(0, 10)}
                  />
                  <input
                    type="number"
                    value={promiseAmount}
                    onChange={e => setPromiseAmount(e.target.value)}
                    placeholder={`Amount (default: ${formatINR(outstanding)})`}
                    className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-[#1e293b] text-[#1e293b]"
                  />
                  <input
                    type="text"
                    value={promiseNote}
                    onChange={e => setPromiseNote(e.target.value)}
                    placeholder="Optional note..."
                    className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-[#1e293b] text-[#1e293b]"
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setShowPromiseForm(false)}
                      className="flex-1 py-2.5 rounded-lg border border-[#e2e8f0] text-sm font-medium text-[#64748b] hover:text-[#1e293b] transition-colors bg-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handlePromise}
                      disabled={promiseSubmitting || !promiseDate}
                      className="flex-1 py-2.5 rounded-lg bg-[#1e293b] text-white text-sm font-semibold hover:bg-[#334155] transition-all disabled:opacity-50"
                    >
                      {promiseSubmitting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Confirm"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isPaid && (
            <div className="rounded-xl bg-[#f0fdf4] border border-[#bbf7d0] p-6 text-center">
              <CheckCircle className="w-10 h-10 text-[#16802d] mx-auto mb-3" />
              <p className="text-lg font-bold text-[#16802d]">Invoice Paid</p>
              <p className="text-sm text-[#16802d] mt-1">This invoice has been paid. Thank you!</p>
            </div>
          )}
        </div>

        {/* Contact Merchant */}
        {invoice?.merchantPhone && (
          <div className="mt-6 text-center">
            <a
              href={`tel:${invoice.merchantPhone}`}
              className="inline-flex items-center gap-2 text-sm text-[#64748b] hover:text-[#1e293b] transition-colors"
            >
              <Phone className="w-4 h-4" />
              Contact {invoice.merchantName}
            </a>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl bg-[#fef2f2] border border-[#fecaca] p-3 text-sm text-[#dc2626] text-center">{error}</div>
        )}

        <div className="mt-8 text-center">
          <p className="text-[10px] text-[#cbd5e1]">Powered by BillZo</p>
        </div>
      </div>
    </div>
  )
}
