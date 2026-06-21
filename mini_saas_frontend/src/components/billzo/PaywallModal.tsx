"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, X, Lock, Loader2, Check, TrendingUp, Zap } from "lucide-react"
import { Button } from "@/components/billzo/Button"
import { db } from "@/lib/billzo/db"
import { formatINR } from "@/lib/utils"
import { getCookie } from "@/lib/cookies"

interface PaywallModalProps {
  type: "invoice" | "reminder"
  open: boolean
  onClose: () => void
  currentCount: number
  limit: number
}

export function PaywallModal({ type, open, onClose, currentCount, limit }: PaywallModalProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [upgraded, setUpgraded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recoveredAmount, setRecoveredAmount] = useState(0)
  const [invoiceCount, setInvoiceCount] = useState(0)
  const [pendingAmount, setPendingAmount] = useState(0)

  useEffect(() => {
    if (!open) return
    setError(null)
    computeRealMetrics()
    if (!(window as any).Razorpay) {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      document.body.appendChild(script)
    }
  }, [open])

  async function computeRealMetrics() {
    const tenantId = getCookie('bz_tenant')
    if (!tenantId) return

    try {
      const invoices = await db().invoices.where('tenantId').equals(tenantId).toArray()

      const paidInvoices = invoices.filter((inv: any) => inv.status === 'paid' || inv.paidAmount > 0)
      const totalRecovered = paidInvoices.reduce((sum: number, inv: any) => sum + (inv.paidAmount || 0), 0)
      const totalPending = invoices
        .filter((inv: any) => inv.status !== 'paid' && inv.status !== 'partial')
        .reduce((sum: number, inv: any) => sum + ((inv.total || 0) - (inv.paidAmount || 0)), 0)

      setRecoveredAmount(totalRecovered)
      setInvoiceCount(invoices.length)
      setPendingAmount(totalPending)
    } catch (err) {
      console.error('Failed to compute metrics:', err)
    }
  }

  if (!open) return null

  const handleUpgrade = async (plan: 'pro' | 'growth') => {
    setLoading(true)
    try {
      const tenantId = getCookie('bz_tenant')
      if (!tenantId) {
        router.push("/auth")
        return
      }

      const response = await fetch("/api/payment/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, plan }),
      })

      const data = await response.json()

      if (data.orderId) {
        if (typeof window === 'undefined' || !(window as any).Razorpay) {
          await new Promise<void>((resolve) => {
            const check = () => {
              if ((window as any).Razorpay) { resolve(); return }
              const script = document.querySelector('script[src*="checkout.razorpay"]')
              if (!script) {
                const s = document.createElement('script')
                s.src = 'https://checkout.razorpay.com/v1/checkout.js'
                s.async = true
                s.onload = () => resolve()
                document.body.appendChild(s)
              } else {
                setTimeout(check, 300)
              }
            }
            check()
          })
        }

        const options = {
          key: data.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: data.amount,
          order_id: data.orderId,
          name: 'BillZo',
          description: plan === 'growth' ? 'BillZo Growth Plan' : 'BillZo Pro Plan',
          handler: async () => {
            await fetch("/api/payment/upgrade", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ plan }),
            })
            await db().tenants.update(tenantId, {
              plan: plan as any,
              paywallUnlocked: true,
              updatedAt: new Date().toISOString(),
            })
            setUpgraded(true)
            setTimeout(() => {
              onClose()
              setUpgraded(false)
            }, 2000)
          },
          modal: {
            ondismiss: () => setLoading(false)
          }
        }

        const rzp = new (window as any).Razorpay(options)
        rzp.on('payment.failed', () => setLoading(false))
        rzp.open()
        return
      }

      setError(data.error || 'Payment gateway error. Please try again.')
    } catch (error) {
      console.error("Upgrade failed:", error)
      alert("Upgrade failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const proPrice = 299
  const roiMultiple = recoveredAmount >= proPrice ? Math.floor(recoveredAmount / proPrice) : 0
  const limitLabel = type === 'invoice' ? 'invoices' : 'reminders'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100"
        >
          <X className="h-5 w-5 text-gray-400" />
        </button>

        <div className="p-8 text-center">
          {upgraded ? (
            <>
              <div className="mx-auto w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
                <Check className="h-8 w-8 text-success" />
              </div>
              <h2 className="mt-6 text-2xl font-bold text-foreground">Plan Activated!</h2>
              <p className="mt-2 text-muted-foreground">Redirecting to your premium dashboard...</p>
            </>
          ) : (
            <>
              {error && (
                <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              {recoveredAmount >= proPrice ? (
                <>
                  <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="h-8 w-8 text-primary" />
                  </div>

                  <h2 className="mt-6 text-2xl font-bold tracking-tight text-foreground">
                    You recovered {formatINR(recoveredAmount)}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    That&apos;s <span className="font-bold text-primary">{roiMultiple}x</span> what Pro costs.
                    Unlock unlimited potential.
                  </p>

                  <div className="mt-8 space-y-3 text-left bg-muted/40 rounded-xl p-5 border border-border">
                    <div className="flex items-center gap-3 text-xs font-semibold text-foreground">
                      <Zap className="h-4 w-4 text-primary" />
                      <span>Unlimited invoices &amp; reminders</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-semibold text-foreground">
                      <Zap className="h-4 w-4 text-primary" />
                      <span>Automated recovery workflow</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-semibold text-foreground">
                      <Zap className="h-4 w-4 text-primary" />
                      <span>Priority support & insights</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleUpgrade('pro')}
                    disabled={loading}
                    className="mt-6 w-full py-3.5 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                  >
                    {loading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        Unlock Pro • ₹299/mo
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleUpgrade('growth')}
                    disabled={loading}
                    className="mt-3 w-full py-2.5 text-xs font-bold text-muted-foreground hover:text-foreground border border-border rounded-xl transition-colors"
                  >
                    Switch to Growth • ₹599/mo
                  </button>
                </>
              ) : (
                <>
                  <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-8 w-8 text-primary" />
                  </div>

                  <h2 className="mt-6 text-2xl font-bold tracking-tight text-foreground">
                    Expand your limits
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    You&apos;ve processed {currentCount} {limitLabel} on the free plan.
                    Upgrade to continue growing.
                  </p>

                  <div className="mt-8 space-y-3 text-left bg-muted/40 rounded-xl p-5 border border-border">
                    <div className="flex items-center gap-3 text-xs font-semibold text-foreground">
                      <Zap className="h-4 w-4 text-primary" />
                      <span>Unlimited invoices &amp; reminders</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-semibold text-foreground">
                      <Zap className="h-4 w-4 text-primary" />
                      <span>Automated recovery reminders</span>
                    </div>
                    {pendingAmount > 0 && (
                      <div className="flex items-center gap-3 text-xs font-semibold text-foreground">
                        <Zap className="h-4 w-4 text-primary" />
                        <span>Recover {formatINR(pendingAmount)} from customers</span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleUpgrade('pro')}
                    disabled={loading}
                    className="mt-6 w-full py-3.5 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                  >
                    {loading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        Unlock Pro • ₹299/mo
                      </>
                    )}
                  </button>

                  <button
                    onClick={onClose}
                    className="mt-3 w-full py-2.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Maybe later
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}