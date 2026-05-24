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
  const [recoveredAmount, setRecoveredAmount] = useState(0)
  const [invoiceCount, setInvoiceCount] = useState(0)
  const [pendingAmount, setPendingAmount] = useState(0)

  useEffect(() => {
    if (!open) return
    computeRealMetrics()
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
        const options = {
          key: data.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: data.amount,
          order_id: data.orderId,
          name: 'BillZo',
          description: plan === 'growth' ? 'BillZo Growth Plan' : 'BillZo Pro Plan',
          handler: async () => {
            await db().tenants.update(tenantId, {
              plan: plan as any,
              paywallUnlocked: true,
              subscriptionId: data.subscriptionId,
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

        if (typeof window !== 'undefined' && (window as any).Razorpay) {
          const rzp = new (window as any).Razorpay(options)
          rzp.on('payment.failed', () => setLoading(false))
          rzp.open()
        } else {
          setUpgraded(true)
          setTimeout(() => {
            onClose()
            setUpgraded(false)
          }, 2000)
        }
        return
      }

      setUpgraded(true)
      setTimeout(() => {
        onClose()
        setUpgraded(false)
      }, 2000)
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
              <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="mt-6 text-2xl font-bold text-gray-900">Upgraded!</h2>
              <p className="mt-2 text-gray-500">Redirecting...</p>
            </>
          ) : (
            <>
              {recoveredAmount >= proPrice ? (
                <>
                  <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                    <TrendingUp className="h-8 w-8 text-white" />
                  </div>

                  <h2 className="mt-6 text-2xl font-bold text-gray-900">
                    You recovered {formatINR(recoveredAmount)}
                  </h2>
                  <p className="mt-2 text-gray-600">
                    That&apos;s <span className="font-bold text-green-600">{roiMultiple}x</span> what Pro costs.
                    Keep the momentum going!
                  </p>

                  <div className="mt-6 space-y-2 text-left bg-green-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Zap className="h-4 w-4 text-green-600" />
                      <span>Unlimited invoices &amp; reminders</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Zap className="h-4 w-4 text-green-600" />
                      <span>Auto-recovery reminders</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Zap className="h-4 w-4 text-green-600" />
                      <span>Priority support</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleUpgrade('pro')}
                    disabled={loading}
                    className="mt-4 w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-medium hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        Unlock Pro for ₹299/mo
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleUpgrade('growth')}
                    disabled={loading}
                    className="mt-2 w-full py-2 text-sm text-gray-500 hover:text-gray-700 border rounded-xl"
                  >
                    Or upgrade to Growth for ₹599/mo
                  </button>
                </>
              ) : (
                <>
                  <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
                    <Sparkles className="h-8 w-8 text-white" />
                  </div>

                  <h2 className="mt-6 text-2xl font-bold text-gray-900">
                    You&apos;ve used your free {limitLabel}
                  </h2>
                  <p className="mt-2 text-gray-500">
                    You&apos;ve created {currentCount} {limitLabel} on the free plan.
                    Upgrade to keep going!
                  </p>

                  <div className="mt-6 space-y-2 text-left bg-gray-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Zap className="h-4 w-4 text-primary" />
                      <span>Unlimited invoices &amp; reminders</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Zap className="h-4 w-4 text-primary" />
                      <span>Auto-recovery reminders</span>
                    </div>
                    {pendingAmount > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Zap className="h-4 w-4 text-primary" />
                        <span>{formatINR(pendingAmount)} pending from customers</span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleUpgrade('pro')}
                    disabled={loading}
                    className="mt-4 w-full py-3 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-xl font-medium hover:from-yellow-500 hover:to-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        Unlock Pro for ₹299/mo
                      </>
                    )}
                  </button>

                  <Button
                    variant="ghost"
                    className="w-full mt-3"
                    onClick={onClose}
                  >
                    Maybe later
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}