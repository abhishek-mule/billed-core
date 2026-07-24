"use client"

import { useState, useEffect, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2, CheckCircle, XCircle, ArrowLeft, Copy, Check, ExternalLink, Smartphone, Building, Banknote } from "lucide-react"
import { Button } from "@/components/billzo/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/billzo/Card"
import { PaymentEngine } from "@/lib/billzo/payment/engine"
import type { PaymentConfig, PaymentPresentation } from "@/lib/billzo/payment/types"

interface InvoiceInfo {
  id: string
  invoiceNumber: string
  total: number
  status: string
  customerName: string
  description: string
  dueDate: string
  merchantName: string
  paymentConfig: PaymentConfig | null
}

type PageState = "loading" | "ready" | "success" | "error"

const METHOD_ICONS: Record<string, any> = {
  upi: Smartphone,
  bank: Building,
  cash: Banknote,
}

export default function PayInvoicePage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = params.invoiceId as string

  const [state, setState] = useState<PageState>("loading")
  const [error, setError] = useState<string | null>(null)
  const [invoice, setInvoice] = useState<InvoiceInfo | null>(null)
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchInvoice()
  }, [])

  const fetchInvoice = async () => {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, { cache: "no-store" })
      if (!res.ok) throw new Error("Invoice not found")
      const data = await res.json()

      setInvoice({
        id: data.id,
        invoiceNumber: data.invoice_number || data.id.slice(-8),
        total: data.total,
        status: data.status,
        customerName: data.customer_name || "Customer",
        description: data.description || `Invoice ${data.invoice_number || data.id.slice(-8)}`,
        dueDate: data.due_date || "",
        merchantName: data.merchant_name || "Business",
        paymentConfig: data.payment_config || null,
      })
      setState("ready")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice")
      setState("error")
    }
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
          amount: invoice.total,
          source: "upi",
          collectedVia: "customer_portal",
        }),
      })
      if (!res.ok) throw new Error("Failed to record payment")
      setState("success")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment")
    } finally {
      setSubmitting(false)
    }
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const presentation = useMemo<PaymentPresentation | null>(() => {
    if (!invoice || !invoice.paymentConfig) return null
    return PaymentEngine.buildPresentation({
      invoice,
      paymentConfig: invoice.paymentConfig,
    })
  }, [invoice])

  const isPaid = invoice?.status === "paid"

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (state === "success") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-success-soft">
          <CheckCircle className="h-8 w-8 text-success" />
        </div>
        <div className="text-center">
          <h1 className="text-lg font-bold text-foreground">Mark Payment Received</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You have reported a payment of <span className="font-semibold">₹{invoice?.total.toLocaleString("en-IN")}</span>.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            The merchant will confirm receipt shortly.
          </p>
        </div>
      </div>
    )
  }

  if (state === "error" && !invoice) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-warning-soft">
          <XCircle className="h-8 w-8 text-warning" />
        </div>
        <div className="text-center">
          <h1 className="text-lg font-bold text-foreground">Invoice not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
        <Button onClick={() => router.back()}>Go Back</Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button
          onClick={() => router.back()}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <Card>
          <CardHeader>
            <CardTitle>Pay {invoice?.merchantName}</CardTitle>
          </CardHeader>
          <CardContent>
            {invoice && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">To</span>
                  <span className="text-sm font-medium">{invoice.merchantName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Invoice</span>
                  <span className="text-sm font-medium">{invoice.invoiceNumber}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Amount</span>
                  <span className="text-xl font-bold">₹{invoice.total.toLocaleString("en-IN")}</span>
                </div>
                {invoice.dueDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Due Date</span>
                    <span className="text-sm font-medium">{new Date(invoice.dueDate).toLocaleDateString()}</span>
                  </div>
                )}

                {error && (
                  <div className="rounded-lg bg-warning-soft p-3 text-sm text-warning">{error}</div>
                )}

                {/* Payment section */}
                {isPaid ? (
                  <div className="rounded-xl border border-success bg-success-soft p-4 text-center">
                    <CheckCircle className="w-8 h-8 text-success mx-auto mb-2" />
                    <p className="text-sm font-semibold text-success">Invoice Paid</p>
                    <p className="text-xs text-success mt-1">This invoice has been paid.</p>
                  </div>
                ) : presentation ? (
                  <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {(() => {
                        const Icon = invoice.paymentConfig ? METHOD_ICONS[invoice.paymentConfig.method] || Smartphone : Smartphone
                        return <Icon className="w-4 h-4" />
                      })()}
                      {presentation.title}
                    </div>

                    {presentation.paymentMethod === 'upi' && presentation.metadata.upiId && (
                      <>
                        <div className="flex items-center justify-between rounded-lg bg-card border border-border px-3 py-2.5">
                          <span className="text-sm font-mono text-foreground">{presentation.metadata.upiId}</span>
                          <button
                            onClick={() => handleCopy(presentation.metadata.upiId!)}
                            className="p-1.5 rounded-md hover:bg-muted transition-colors"
                            title="Copy UPI ID"
                          >
                            {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                          </button>
                        </div>
                        {presentation.button?.url && (
                          <a
                            href={presentation.button.url}
                            className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                            {presentation.button.label}
                          </a>
                        )}
                      </>
                    )}

                    {presentation.paymentMethod === 'bank' && (
                      <div className="space-y-2 rounded-lg bg-card border border-border p-3">
                        <p className="text-xs text-muted-foreground">Transfer to:</p>
                        <div className="space-y-1.5 text-sm">
                          {presentation.metadata.accountHolderName && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Account Holder</span>
                              <span className="font-medium">{presentation.metadata.accountHolderName}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Account</span>
                            <span className="font-mono font-medium">{presentation.metadata.accountNumber}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">IFSC</span>
                            <span className="font-mono font-medium">{presentation.metadata.ifsc}</span>
                          </div>
                          {presentation.metadata.bankName && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Bank</span>
                              <span className="font-medium">{presentation.metadata.bankName}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground text-center leading-relaxed">
                      {presentation.subtitle}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-warning-soft p-4 text-center">
                    <p className="text-sm text-warning font-medium">Online payment not available</p>
                    <p className="text-xs text-warning mt-1">
                      Please contact the merchant for payment instructions.
                    </p>
                  </div>
                )}

                {/* Mark as paid */}
                {!isPaid && (
                  <div className="border-t border-border pt-4">
                    <p className="text-xs text-muted-foreground text-center mb-3">
                      Already paid? Let the merchant know.
                    </p>
                    <Button
                      onClick={handleMarkPaid}
                      disabled={submitting}
                      variant="outline"
                      className="w-full"
                    >
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "I've Paid — Notify Merchant"
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
