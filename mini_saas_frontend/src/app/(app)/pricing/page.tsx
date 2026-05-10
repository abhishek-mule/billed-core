"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Check, Sparkles } from "lucide-react"
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
}

export default function PricingPage() {
  const router = useRouter()
  const [state, setState] = useState<PricingState>({
    plans: [],
    loading: true,
    error: null,
    selectedPlan: null,
    processing: false,
  })

  useEffect(() => {
    fetchPlans()
  }, [])

  const fetchPlans = async () => {
    try {
      const response = await fetch("/api/payment/create-subscription")
      if (!response.ok) throw new Error("Failed to load plans")

      const data = await response.json()
      setState((prev) => ({ ...prev, plans: data.plans || [], loading: false }))
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to load plans",
        loading: false,
      }))
    }
  }

  const handleSelectPlan = async (planId: string) => {
    if (planId === "starter") {
      router.push("/dashboard")
      return
    }

    setState((prev) => ({ ...prev, selectedPlan: planId, processing: true }))

    try {
      const tenantId = localStorage.getItem("tenantId")
      const tenantName = localStorage.getItem("tenantName")

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

      if (data.mock) {
        setTimeout(() => {
          localStorage.setItem("isPaid", "true")
          router.push("/dashboard")
        }, 2000)
        return
      }

      if (data.subscriptionId && typeof window !== 'undefined' && (window as any).Razorpay) {
        const rzp = new (window as any).Razorpay({
          key: data.keyId,
          subscription_id: data.subscriptionId,
          name: "BillZo",
          description: `BillZo ${planId} Plan`,
          handler: async (response: { razorpay_subscription_id: string }) => {
            console.log("Payment successful:", response)
            localStorage.setItem("isPaid", "true")
            router.push("/dashboard")
          },
          prefill: {
            name: tenantName || "Customer",
          },
          theme: {
            color: "#146c4b",
          },
        })

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
        setState((prev) => ({
          ...prev,
          error: "Payment gateway not available",
          processing: false,
        }))
      }
    } catch (err) {
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
          <button
            onClick={fetchPlans}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Try Again
          </button>
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
          All plans include 3 invoices and 5 reminders free to try.
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
        className={`mt-6 w-full rounded-lg py-3 font-medium transition-colors ${
          isFree
            ? "border border-border hover:bg-gray-50"
            : popular
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "bg-black text-white hover:bg-gray-800"
        } disabled:opacity-50`}
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
