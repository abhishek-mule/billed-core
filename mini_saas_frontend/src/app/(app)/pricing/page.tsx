"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Check, Sparkles } from "lucide-react"
import { Button } from "@/components/billzo/Button"
import type { PlanType } from "@/lib/billzo/plan-limits"

interface PlanInfo {
  id: string
  name: string
  price: number
  currency: string
  features: string[]
}

interface PricingState {
  plans: PlanInfo[]
  loading: boolean
  error: string | null
  selectedPlan: string | null
  processing: boolean
  razorpayLoaded: boolean
}

const PLAN_FEATURES = {
  starter: ['3 invoices', '3 reminders', 'Basic dashboard'],
  pro: ['Unlimited invoices', 'Unlimited reminders', 'Auto recovery', 'Priority support'],
  growth: ['Everything in Pro', 'Multi-user', 'Analytics dashboard', 'Custom branding'],
} as const

export default function PricingPage() {
  const router = useRouter()
  const [state, setState] = useState<PricingState>({
    plans: [],
    loading: true,
    error: null,
    selectedPlan: null,
    processing: false,
    razorpayLoaded: false,
  })

  useEffect(() => {
    fetchPlans()
    loadRazorpayScript()
  }, [])

  const loadRazorpayScript = () => {
    if (document.querySelector('script[src*="razorpay"]')) {
      const checkLoaded = setInterval(() => {
        if (typeof window !== 'undefined' && (window as any).Razorpay) {
          setState(prev => ({ ...prev, razorpayLoaded: true }))
          clearInterval(checkLoaded)
        }
      }, 500)
      return () => clearInterval(checkLoaded)
    }

    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => {
      console.log('Razorpay script loaded')
      setState(prev => ({ ...prev, razorpayLoaded: true }))
    }
    script.onerror = () => {
      console.warn('Razorpay script failed to load - will use demo mode')
    }
    document.body.appendChild(script)
  }

  const fetchPlans = () => {
    setState((prev) => ({
      ...prev,
      plans: [
        { id: 'starter', name: 'Free', price: 0, currency: 'INR', features: [...PLAN_FEATURES.starter] },
        { id: 'pro', name: 'Pro', price: 29900, currency: 'INR', features: [...PLAN_FEATURES.pro] },
        { id: 'growth', name: 'Growth', price: 59900, currency: 'INR', features: [...PLAN_FEATURES.growth] },
      ],
      loading: false,
    }))
  }

  const handleSelectPlan = async (planId: string) => {
    if (planId === "starter") {
      router.push("/dashboard")
      return
    }

    setState((prev) => ({ ...prev, selectedPlan: planId, processing: true, error: null }))

    try {
      function getCookie(name: string) {
      if (typeof document === 'undefined') return null
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
      return match ? match[2] : null
    }
    const tenantId = getCookie('bz_tenant') || ''
    const tenantName = getCookie('bz_tenant_name') || ''

      const response = await fetch("/api/payment/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          tenantName,
          plan: planId as "pro" | "growth",
        }),
      })

      const data = await response.json()
      console.log('Subscription API response:', data)

      if (data.error) {
        throw new Error(data.error)
      }

      if (data.mock || data.subscriptionId?.startsWith('sub_demo_')) {
        setTimeout(() => {
          
          if (tenantId) {
            import("@/lib/billzo/db").then(({ db }) => {
              db().tenants.update(tenantId, { plan: planId as PlanType, paywallUnlocked: true, updatedAt: new Date().toISOString() })
            })
          }
          router.push("/dashboard")
        }, 2000)
        return
      }

      const rzpOptions: Record<string, unknown> = {
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: "BillZo",
        description: `BillZo ${planId} Plan`,
        handler: async (response: { razorpay_subscription_id: string }) => {
          console.log("Payment successful:", response)
          
          if (tenantId) {
            import("@/lib/billzo/db").then(({ db }) => {
              db().tenants.update(tenantId, { plan: planId as PlanType, paywallUnlocked: true, updatedAt: new Date().toISOString() })
            })
          }
          router.push("/dashboard")
        },
        prefill: {
          name: tenantName || "Customer",
        },
        theme: {
          color: "#146c4b",
        },
      }

      if (typeof window !== 'undefined' && (window as any).Razorpay) {
        const rzp = new (window as any).Razorpay(rzpOptions)
        rzp.on("payment.failed", (response: { error: { description: string } }) => {
          console.error("Payment failed:", response.error.description)
          setState((prev) => ({
            ...prev,
            error: `Payment failed: ${response.error.description}`,
            processing: false,
          }))
        })
        rzp.open()
      } else {
        throw new Error("Razorpay not loaded. Please refresh and try again.")
      }
    } catch (err) {
      console.error('Payment error:', err)
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to start payment",
        processing: false,
      }))
    }
  }

  if (state.loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-destructive">{state.error}</p>
          <Button onClick={fetchPlans} className="mt-4">
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  const freePlan = state.plans.find((p) => p.id === "starter")
  const paidPlans = state.plans.filter((p) => p.id !== "starter")

  return (
    <div className="container py-8">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-3xl font-bold">Choose Your Plan</h1>
        <p className="mt-2 text-muted-foreground">
          Start free, upgrade when you&apos;re ready to grow
        </p>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {freePlan && (
          <PlanCard
            plan={freePlan}
            selected={state.selectedPlan === freePlan.id}
            processing={state.processing}
            onSelect={() => handleSelectPlan(freePlan.id)}
            isFree
          />
        )}

        {paidPlans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            selected={state.selectedPlan === plan.id}
            processing={state.processing}
            onSelect={() => handleSelectPlan(plan.id)}
            popular={plan.id === "pro"}
          />
        ))}
      </div>

      <div className="mt-8 text-center">
        <p className="text-sm text-muted-foreground">
          All plans include 3 invoices and 3 reminders free to try.
          <br />
          Upgrade anytime for unlimited access.
        </p>
      </div>
    </div>
  )
}

function PlanCard({
  plan,
  selected,
  processing,
  onSelect,
  isFree,
  popular,
}: {
  plan: PlanInfo
  selected: boolean
  processing: boolean
  onSelect: () => void
  isFree?: boolean
  popular?: boolean
}) {
  const formatPrice = (price: number) => {
    if (price === 0) return "Free"
    return `₹${(price / 100).toLocaleString("en-IN")}`
  }

  return (
    <div
      className={`relative rounded-2xl border p-6 ${
        popular ? "border-primary shadow-lg" : "border-border"
      }`}
    >
      {popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
          Most Popular
        </div>
      )}

      <h3 className="text-xl font-bold">{plan.name}</h3>

      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-bold">{formatPrice(plan.price)}</span>
        {plan.price > 0 && (
          <span className="text-muted-foreground">/month</span>
        )}
      </div>

      <ul className="mt-6 space-y-3">
        {plan.features.map((feature, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-success" />
            {feature}
          </li>
        ))}
      </ul>

        <button
          onClick={onSelect}
          disabled={processing}
          className={`mt-6 w-full rounded-xl py-3 font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${
            isFree
              ? "border-2 border-border bg-transparent text-foreground hover:bg-secondary"
              : "bg-gradient-to-br from-primary to-emerald-600 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/30"
          }`}
        >
        {processing && selected ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        ) : isFree ? (
          "Continue Free"
        ) : (
          `Get ${plan.name}`
        )}
      </button>
    </div>
  )
}
