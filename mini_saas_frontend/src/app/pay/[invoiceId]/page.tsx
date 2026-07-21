"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2, CheckCircle, XCircle, ArrowLeft, CreditCard } from "lucide-react"
import { Button } from "@/components/billzo/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/billzo/Card"

interface InvoiceInfo {
  id: string
  invoiceNumber: string
  total: number
  status: string
  customerName: string
  customerPhone: string
  description: string
  dueDate: string
}

type PageState = "loading" | "ready" | "processing" | "success" | "error"

export default function PayInvoicePage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = params.invoiceId as string

  const [state, setState] = useState<PageState>("loading")
  const [error, setError] = useState<string | null>(null)
  const [invoice, setInvoice] = useState<InvoiceInfo | null>(null)
  const [razorpayLoaded, setRazorpayLoaded] = useState(false)

  useEffect(() => {
    loadRazorpayScript()
    fetchInvoice()
  }, [])

  const loadRazorpayScript = () => {
    if (document.querySelector('script[src*="razorpay"]')) {
      const checkLoaded = setInterval(() => {
        if (typeof window !== "undefined" && (window as any).Razorpay) {
          setRazorpayLoaded(true)
          clearInterval(checkLoaded)
        }
      }, 500)
      return () => clearInterval(checkLoaded)
    }
    const script = document.createElement("script")
    script.src = "https://checkout.razorpay.com/v1/checkout.js"
    script.async = true
    script.onload = () => setRazorpayLoaded(true)
    script.onerror = () => setError("Failed to load payment gateway")
    document.body.appendChild(script)
  }

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
        customerPhone: data.customer_phone || "",
        description: data.description || `Invoice ${data.invoice_number || data.id.slice(-8)}`,
        dueDate: data.due_date || "",
      })
      setState("ready")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice")
      setState("error")
    }
  }

  const handlePay = useCallback(async () => {
    if (!invoice || !razorpayLoaded || !(window as any).Razorpay) {
      setError("Payment gateway not ready. Please refresh.")
      return
    }

    setState("processing")
    setError(null)

    try {
      const orderRes = await fetch("/api/payment/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          invoiceId: invoice.id,
          amount: invoice.total,
          customerName: invoice.customerName,
          customerPhone: invoice.customerPhone,
        }),
      })

      const orderData = await orderRes.json()
      if (!orderRes.ok || orderData.error) {
        throw new Error(orderData.error || "Failed to create order")
      }

      const rzp = new (window as any).Razorpay({
        key: orderData.key_id,
        order_id: orderData.order_id,
        amount: orderData.amount,
        currency: orderData.currency || "INR",
        name: invoice.customerName,
        description: invoice.description,
        prefill: {
          name: invoice.customerName,
          contact: invoice.customerPhone,
        },
        theme: { color: "#0d9488" },
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          setState("processing")
          const verifyRes = await fetch("/api/payment/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              invoiceId: invoice.id,
              amount: invoice.total,
            }),
          })

          const verifyData = await verifyRes.json()
          if (!verifyRes.ok || verifyData.error) {
            throw new Error(verifyData.error || "Payment verification failed")
          }

          setState("success")
        },
        modal: {
          ondismiss: () => {
            setState("ready")
          },
        },
      })

      rzp.on("payment.failed", (response: { error: { description: string } }) => {
        setError(`Payment failed: ${response.error.description}`)
        setState("ready")
      })

      rzp.open()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed")
      setState("ready")
    }
  }, [invoice, razorpayLoaded])

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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

  if (state === "success") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-success-soft">
          <CheckCircle className="h-8 w-8 text-success" />
        </div>
        <div className="text-center">
          <h1 className="text-lg font-bold text-foreground">Payment Successful</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your payment of <span className="font-semibold">₹{invoice?.total.toLocaleString("en-IN")}</span> has been processed.
          </p>
        </div>
        <Button onClick={() => router.push("/dashboard")}>Go to Dashboard</Button>
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
            <CardTitle>Pay Invoice</CardTitle>
          </CardHeader>
          <CardContent>
            {invoice && (
              <div className="space-y-4">
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
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <span className="text-sm font-medium capitalize">{invoice.status}</span>
                </div>

                {error && (
                  <div className="rounded-lg bg-warning-soft p-3 text-sm text-warning">{error}</div>
                )}

                <Button
                  onClick={handlePay}
                  disabled={state === "processing" || !razorpayLoaded}
                  className="w-full"
                  size="lg"
                >
                  {state === "processing" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <CreditCard className="h-5 w-5" />
                      Pay ₹{invoice.total.toLocaleString("en-IN")}
                    </>
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Secured by Razorpay
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
