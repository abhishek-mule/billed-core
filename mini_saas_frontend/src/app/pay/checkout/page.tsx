"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { AlertCircle, CheckCircle2, Clock, Copy, CreditCard, ExternalLink, Loader2, MessageSquare } from "lucide-react"
import QRCode from "qrcode"
import { formatINR } from "@/lib/utils"

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <Loader2 className="animate-spin text-teal-600" size={32} />
        <p className="text-sm text-slate-500 mt-2">Loading secure checkout...</p>
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  )
}

function CheckoutContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [invoice, setInvoice] = useState<any>(null)
  const [businessName, setBusinessName] = useState("")
  const [upiId, setUpiId] = useState("")
  const [qrDataUrl, setQrDataUrl] = useState("")
  const [activeTab, setActiveTab] = useState<"app" | "qr" | "copy">("app")
  
  // Self-report forms
  const [showPromiseForm, setShowPromiseForm] = useState(false)
  const [promiseDate, setPromiseDate] = useState("")
  const [promiseNote, setPromiseNote] = useState("")
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setError("Secure link token is missing.")
      setLoading(false)
      return
    }

    setLoading(true)
    fetch(`/api/public/invoice?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (!res.ok) {
          return res.json().then((d) => Promise.reject(d.error || "Failed to load link"))
        }
        return res.json()
      })
      .then((data) => {
        setInvoice(data.invoice)
        setBusinessName(data.businessName)
        setUpiId(data.upiId)

        // Generate QR code for UPI URL
        const amountStr = Number(data.invoice.outstandingAmount).toFixed(2)
        const upiUrl = `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent(data.businessName)}&am=${amountStr}&cu=INR&tn=${encodeURIComponent("Invoice " + data.invoice.invoiceNumber)}`
        
        QRCode.toDataURL(upiUrl, { width: 250, margin: 2 })
          .then((url) => setQrDataUrl(url))
          .catch((err) => console.error("QR Code generation error:", err))

        setLoading(false)
      })
      .catch((err) => {
        setError(err || "Failed to load link details.")
        setLoading(false)
      })
  }, [token])

  const upiDeepLink = upiId && invoice
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(businessName)}&am=${Number(invoice.outstandingAmount).toFixed(2)}&cu=INR&tn=${encodeURIComponent("Invoice " + invoice.invoiceNumber)}`
    : ""

  const handleCopyUpi = () => {
    if (!upiId) return
    navigator.clipboard.writeText(upiId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleReportPaid = async () => {
    if (!token || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/public/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          amount: invoice.outstandingAmount,
          source: "upi",
          notes: "Customer self-reported UPI payment",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to report payment")
      setSuccessMessage("Thank you! Your payment confirmation has been sent to the merchant.")
      setInvoice((prev: any) => ({ ...prev, status: "paid", outstandingAmount: 0 }))
    } catch (err: any) {
      alert(err.message || "Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreatePromise = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !promiseDate || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/public/promise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          dueDate: promiseDate,
          note: promiseNote || "Customer requested time extensions",
          amount: invoice.outstandingAmount,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to submit request")
      setSuccessMessage(`Request received. We've recorded your promise to pay on ${new Date(promiseDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.`)
      setShowPromiseForm(false)
    } catch (err: any) {
      alert(err.message || "Failed to save request")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <Loader2 className="animate-spin text-teal-600" size={32} />
        <p className="text-sm text-slate-500 mt-2">Loading secure checkout...</p>
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-center space-y-4">
          <div className="mx-auto w-12 h-12 bg-rose-100 dark:bg-rose-950 flex items-center justify-center rounded-full text-rose-600">
            <AlertCircle size={24} />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Checkout Error</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{error || "Payment session is invalid or expired."}</p>
        </div>
      </div>
    )
  }

  const isPaid = invoice.status === "paid" || invoice.outstandingAmount === 0

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4">
      <div className="max-w-md mx-auto space-y-6">
        
        {/* Invoice Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="bg-teal-600 p-6 text-white text-center space-y-1">
            <p className="text-xs font-semibold tracking-wider uppercase opacity-85">Paying to</p>
            <h1 className="text-xl font-bold">{businessName}</h1>
            <p className="text-xs opacity-75">Invoice #{invoice.invoiceNumber}</p>
          </div>

          <div className="p-6 space-y-6">
            <div className="text-center">
              <p className="text-xs text-slate-400 font-semibold tracking-wide uppercase">Amount Due</p>
              <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums">
                {formatINR(invoice.outstandingAmount)}
              </p>
              {invoice.dueDate && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Due on {new Date(invoice.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              )}
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Customer</span>
                <span className="font-semibold text-slate-900 dark:text-white">{invoice.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status</span>
                <span className={`font-semibold capitalize ${isPaid ? "text-emerald-600" : "text-amber-600"}`}>
                  {invoice.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Success Message Banner */}
        {successMessage && (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-4 flex gap-3 text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="flex-shrink-0 mt-0.5" size={18} />
            <p className="text-sm font-medium leading-normal">{successMessage}</p>
          </div>
        )}

        {/* Payment Tabs (Disabled if paid) */}
        {!isPaid && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
              <button
                onClick={() => setActiveTab("app")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${
                  activeTab === "app" ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Pay via App
              </button>
              <button
                onClick={() => setActiveTab("qr")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${
                  activeTab === "qr" ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Scan QR
              </button>
              <button
                onClick={() => setActiveTab("copy")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${
                  activeTab === "copy" ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Copy UPI ID
              </button>
            </div>

            {/* Pay via App Tab */}
            {activeTab === "app" && (
              <div className="text-center space-y-4 py-2">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Open your preferred UPI payment application (PhonePe, GPay, Paytm) on this device.
                </p>
                <a
                  href={upiDeepLink}
                  className="inline-flex w-full items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold h-12 rounded-xl text-sm transition-colors"
                >
                  Pay via UPI App <ExternalLink size={16} />
                </a>
                <p className="text-[11px] text-slate-400">
                  If the app does not launch or you are on a desktop, please use the &quot;Scan QR&quot; tab.
                </p>
              </div>
            )}

            {/* Scan QR Tab */}
            {activeTab === "qr" && (
              <div className="flex flex-col items-center justify-center space-y-4">
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                  Scan this QR code with any UPI app (GPay, PhonePe, Paytm, BHIM) to pay.
                </p>
                <div className="bg-white border border-slate-100 p-2 rounded-2xl shadow-sm">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="UPI Payment QR Code" className="w-[180px] h-[180px]" />
                  ) : (
                    <div className="w-[180px] h-[180px] bg-slate-50 flex items-center justify-center">
                      <Loader2 className="animate-spin text-slate-300" />
                    </div>
                  )}
                </div>
                <button
                  onClick={handleReportPaid}
                  disabled={submitting}
                  className="w-full text-xs text-teal-600 dark:text-teal-400 hover:underline font-semibold"
                >
                  I&apos;ve paid using QR code →
                </button>
              </div>
            )}

            {/* Copy UPI Tab */}
            {activeTab === "copy" && (
              <div className="space-y-4 py-2 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Copy this UPI address to manually pay from any banking application.
                </p>
                <div className="flex items-center justify-between gap-2 border border-slate-200 dark:border-slate-800 rounded-xl px-4 h-12 bg-slate-50 dark:bg-slate-900/50">
                  <span className="text-sm font-semibold truncate text-slate-800 dark:text-slate-200">{upiId}</span>
                  <button
                    onClick={handleCopyUpi}
                    className="flex-shrink-0 text-slate-400 hover:text-teal-600 transition-colors"
                  >
                    <Copy size={16} />
                  </button>
                </div>
                {copied && <span className="text-xs text-emerald-600 font-bold block">UPI ID copied!</span>}
              </div>
            )}
          </div>
        )}

        {/* Self-reporting & Promise buttons (Only shown if unpaid) */}
        {!isPaid && !successMessage && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Alternative Options</h3>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleReportPaid}
                disabled={submitting}
                className="w-full h-11 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 font-semibold rounded-xl text-xs text-slate-700 dark:text-slate-300 flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={15} className="text-emerald-500" />
                I&apos;ve already paid (Inform Merchant)
              </button>
              
              {!showPromiseForm ? (
                <button
                  onClick={() => setShowPromiseForm(true)}
                  className="w-full h-11 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 font-semibold rounded-xl text-xs text-slate-700 dark:text-slate-300 flex items-center justify-center gap-2"
                >
                  <Clock size={15} className="text-amber-500" />
                  Need more time? (Request Extension)
                </button>
              ) : (
                <form onSubmit={handleCreatePromise} className="border border-slate-100 dark:border-slate-800 rounded-2xl p-4 mt-2 space-y-4 bg-slate-50/50 dark:bg-slate-900/20">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Promise Pay Date</label>
                    <input
                      type="date"
                      required
                      value={promiseDate}
                      min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => setPromiseDate(e.target.value)}
                      className="w-full h-10 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-sm focus:outline-none focus:border-teal-500 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Add a note (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Will pay next Monday"
                      value={promiseNote}
                      onChange={(e) => setPromiseNote(e.target.value)}
                      className="w-full h-10 border border-slate-200 dark:border-slate-800 rounded-xl px-3 text-sm focus:outline-none focus:border-teal-500 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPromiseForm(false)}
                      className="flex-1 h-9 border border-slate-200 dark:border-slate-800 text-xs font-semibold rounded-xl text-slate-500 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 h-9 bg-teal-600 text-white text-xs font-semibold rounded-xl hover:bg-teal-700 flex items-center justify-center gap-1.5"
                    >
                      {submitting ? <Loader2 className="animate-spin" size={13} /> : "Submit Promise"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
