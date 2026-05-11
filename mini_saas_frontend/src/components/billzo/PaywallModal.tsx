"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, X, Lock, Loader2, Check, TrendingUp, Zap, ArrowRight } from "lucide-react"
import { db } from "@/lib/billzo/db"

const formatINR = (n: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(n)

interface PaywallModalProps {
  type: "invoice" | "reminder"
  open: boolean
  onClose: () => void
  currentCount: number
  limit: number
  recoveredAmount?: number
}

export function PaywallModal({ type, open, onClose, currentCount, limit, recoveredAmount = 0 }: PaywallModalProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [upgraded, setUpgraded] = useState(false)

  if (!open) return null

  const handleUpgrade = async () => {
    setLoading(true)

    try {
      const tenantId = localStorage.getItem("tenantId")
      if (!tenantId) {
        router.push("/login")
        return
      }

      await new Promise(resolve => setTimeout(resolve, 1500))

      await db().tenants.update(tenantId, {
        plan: "pro",
        paywallUnlocked: true,
        updatedAt: new Date().toISOString(),
      })

      localStorage.setItem("isPaid", "true")
      setUpgraded(true)

      setTimeout(() => {
        onClose()
        setUpgraded(false)
      }, 1500)

    } catch (error) {
      console.error("Upgrade failed:", error)
      alert("Upgrade failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleUpgradeGrowth = async () => {
    setLoading(true)
    try {
      const tenantId = localStorage.getItem("tenantId")
      if (!tenantId) return

      await new Promise(resolve => setTimeout(resolve, 1500))
      await db().tenants.update(tenantId, {
        plan: "growth",
        paywallUnlocked: true,
        updatedAt: new Date().toISOString(),
      })
      localStorage.setItem("isPaid", "true")
      setUpgraded(true)
      setTimeout(() => {
        onClose()
        setUpgraded(false)
      }, 1500)
    } catch (error) {
      console.error("Upgrade failed:", error)
    } finally {
      setLoading(false)
    }
  }

  const roiMultiple = recoveredAmount > 0 ? Math.floor(recoveredAmount / 299) : 0
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
              {recoveredAmount > 0 ? (
                <>
                  <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                    <TrendingUp className="h-8 w-8 text-white" />
                  </div>

                  <h2 className="mt-6 text-2xl font-bold text-gray-900">
                    You recovered {formatINR(recoveredAmount)}
                  </h2>
                  <p className="mt-2 text-gray-600">
                    That's <span className="font-bold text-green-600">{roiMultiple}x</span> what Pro costs.
                    Keep the momentum going!
                  </p>

                  <div className="mt-6 space-y-2 text-left bg-green-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Zap className="h-4 w-4 text-green-600" />
                      <span>Unlimited invoices &amp; reminders</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Zap className="h-4 w-4 text-green-600" />
                      <span>Auto-recovery mode</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Zap className="h-4 w-4 text-green-600" />
                      <span>Priority support</span>
                    </div>
                  </div>

                  <button
                    onClick={handleUpgrade}
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
                    onClick={handleUpgradeGrowth}
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
                      <span>Auto-recovery mode</span>
                    </div>
                  </div>

                  <button
                    onClick={handleUpgrade}
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

                  <button
                    onClick={onClose}
                    className="mt-3 w-full py-2 text-sm text-gray-500 hover:text-gray-700"
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