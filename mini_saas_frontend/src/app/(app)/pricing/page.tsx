"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Check, Sparkles } from "lucide-react"
import { Button } from "@/components/billzo/Button"

interface PlanInfo {
  code: string
  name: string
  monthlyPrice: number
  annualPrice: number
  features: string[]
  purchasable: boolean
  highlighted?: boolean
}

interface PricingState {
  plans: PlanInfo[]
  loading: boolean
  error: string | null
  selectedPlan: string | null
  processing: boolean
  razorpayLoaded: boolean
  currentPlan: string | null
}

const OUTCOME_COPY: Record<string, string> = {
  starter: "See your stuck money for free. Start collecting.",
  pro: "Automate reminders and recover faster — pay only when it works.",
  business: "Run recovery across branches with analytics and exports.",
  enterprise: "Custom recovery at scale with priority support.",
}

export default function PricingPage() {
  const router = useRouter()
  const [state, setState] = useState<PricingState>({
    plans: [],
    loading: true,
    error: null,
    selectedPlan: null,
    processing: false,
    razorpayLoaded: false,
    currentPlan: null,
  })

  useEffect(() => {
    fetchPlans()
    fetchMe()
    loadRazorpayScript()
  }, [])

  const loadRazorpayScript = () => {
    if (document.querySelector('script[src*="razorpay"]')) {
      const checkLoaded = setInterval(() => {
        if (typeof window !== "undefined" && (window as any).Razorpay) {
          setState((prev) => ({ ...prev, razorpayLoaded: true }))
          clearInterval(checkLoaded)
        }
      }, 500)
      return () => clearInterval(checkLoaded)
    }
    const script = document.createElement("script")
    script.src = "https://checkout.razorpay.com/v1/checkout.js"
    script.async = true
    script.onload = () => setState((prev) => ({ ...prev, razorpayLoaded: true }))
    script.onerror = () => console.warn("Razorpay script failed to load")
    document.body.appendChild(script)
  }

  const fetchPlans = async () => {
    try {
      const res = await fetch("/api/plans", { cache: "no-store" })
      if (!res.ok) throw new Error("Failed to load plans")
      const data = await res.json()
      setState((prev) => ({ ...prev, plans: data.plans ?? [], loading: false }))
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load plans",
      }))
    }
  }

  const fetchMe = async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        setState((prev) => ({ ...prev, currentPlan: data.plan }))
      }
    } catch {
      /* non-fatal */
    }
  }

  const handleSelectPlan = async (plan: PlanInfo) => {
    if (plan.code === "starter") {
      router.push("/dashboard")
      return
    }
    if (!plan.purchasable) {
      // Enterprise — route to sales, no checkout
      setState((prev) => ({ ...prev, error: "Enterprise is custom-priced. Our team will reach out." }))
      return
    }

    setState((prev) => ({ ...prev, selectedPlan: plan.code, processing: true, error: null }))

    try {
      const tenantId = getCookie("bz_tenant") || ""
      const tenantName = getCookie("bz_tenant_name") || ""

      const response = await fetch("/api/payment/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, tenantName, plan: plan.code }),
      })

      const data = await response.json()
      if (data.error) throw new Error(data.error)

      // Order-mode: open Razorpay checkout, then verify server-side.
      if (data.mode === "order") {
        if (!state.razorpayLoaded || !(window as any).Razorpay) {
          throw new Error("Payment gateway not ready. Please refresh.")
        }
        const rzp = new (window as any).Razorpay({
          key: data.keyId,
          order_id: data.orderId,
          name: "BillZo",
          description: `BillZo ${plan.name}`,
          handler: async (resp: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
            await verifyPayment(data.subscriptionId, resp.razorpay_payment_id, resp.razorpay_signature, resp.razorpay_order_id)
          },
          prefill: { name: tenantName || "Customer" },
          theme: { color: "#0d9488" },
        })
        rzp.on("payment.failed", (r: { error: { description: string } }) => {
          setState((prev) => ({ ...prev, error: `Payment failed: ${r.error.description}`, processing: false }))
        })
        rzp.open()
        return
      }

      // Subscription-mode: redirect to Razorpay hosted page.
      if (data.shortUrl) {
        window.location.href = data.shortUrl
        return
      }

      // Fallback: just activate (webhook will confirm)
      router.push("/dashboard")
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to start payment",
        processing: false,
      }))
    }
  }

  const verifyPayment = async (
    subscriptionId: string,
    paymentId: string,
    signature: string,
    orderId: string,
  ) => {
    try {
      await fetch("/api/subscriptions/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subscriptionId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature,
          razorpay_order_id: orderId,
        }),
      })
      router.push("/dashboard")
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Verification failed",
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

  const freePlan = state.plans.find((p) => p.code === "starter")
  const paidPlans = state.plans.filter((p) => p.code !== "starter")

  return (
    <div className="container py-8">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-3xl font-bold">Pricing that pays for itself</h1>
        <p className="mt-2 text-muted-foreground">
          Start free. Upgrade when you want to recover more of your stuck money.
        </p>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {freePlan && (
          <PlanCard
            plan={freePlan}
            selected={state.selectedPlan === freePlan.code}
            processing={state.processing}
            onSelect={() => handleSelectPlan(freePlan)}
            isFree
            outcome={OUTCOME_COPY[freePlan.code]}
            isCurrent={state.currentPlan === freePlan.code}
          />
        )}

        {paidPlans.map((plan) => (
          <PlanCard
            key={plan.code}
            plan={plan}
            selected={state.selectedPlan === plan.code}
            processing={state.processing}
            onSelect={() => handleSelectPlan(plan)}
            popular={plan.highlighted}
            outcome={OUTCOME_COPY[plan.code]}
            isCurrent={state.currentPlan === plan.code}
          />
        ))}
      </div>

      <div className="mt-10 mx-auto max-w-3xl rounded-2xl border border-border bg-secondary/40 p-6">
        <h2 className="text-lg font-semibold">Why BillZo pays for itself</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The average shop recovers more in the first week than a year of Pro costs.
          You only pay to automate what you&apos;d otherwise chase by hand.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          <li className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-success" /> No setup fees</li>
          <li className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-success" /> Cancel anytime</li>
          <li className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-success" /> Annual billing saves ~20%</li>
          <li className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-success" /> Data export always yours</li>
        </ul>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Prices shown in INR, excluding GST. Annual plans available at checkout soon.
      </p>
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
  outcome,
  isCurrent,
}: {
  plan: PlanInfo
  selected: boolean
  processing: boolean
  onSelect: () => void
  isFree?: boolean
  popular?: boolean
  outcome?: string
  isCurrent?: boolean
}) {
  const formatPrice = (price: number) => (price === 0 ? "Free" : `₹${price.toLocaleString("en-IN")}`)

  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 ${
        popular ? "border-primary shadow-lg dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)]" : "border-border"
      }`}
    >
      {popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
          Most Popular
        </div>
      )}

      <h3 className="text-xl font-bold">{plan.name}</h3>

      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-bold">{formatPrice(plan.monthlyPrice)}</span>
        {plan.monthlyPrice > 0 && <span className="text-muted-foreground">/month</span>}
      </div>

      {outcome && <p className="mt-2 text-sm text-muted-foreground">{outcome}</p>}

      <ul className="mt-6 flex-1 space-y-3">
        {plan.features.map((feature, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-success" />
            {feature}
          </li>
        ))}
      </ul>

      <button
        onClick={onSelect}
        disabled={processing || isCurrent}
        className={`mt-6 w-full rounded-xl py-3 font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${
          isFree
            ? "border-2 border-border bg-transparent text-foreground hover:bg-secondary"
            : "bg-gradient-to-br from-primary to-success text-primary-foreground shadow-lg"
        }`}
      >
        {processing && selected ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        ) : isCurrent ? (
          "Current Plan"
        ) : isFree ? (
          "Continue Free"
        ) : plan.purchasable ? (
          `Get ${plan.name}`
        ) : (
          "Contact Sales"
        )}
      </button>
    </div>
  )
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"))
  return match ? match[2] : null
}
