"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Crown, IndianRupee, TrendingUp, ArrowUpRight, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { db } from "@/lib/billzo/db"
import { getCookie } from "@/lib/cookies"
import { PLAN_LIMITS } from "@/lib/billzo/plan-limits"

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Starter",
  growth: "Growth",
  business: "Business",
  enterprise: "Enterprise",
}

const PLAN_PRICES: Record<string, string> = {
  starter: "₹299",
  pro: "₹299",
  growth: "₹499",
  business: "₹1,499",
  enterprise: "Custom",
}

const RECOVERY_LIMITS: Record<string, number> = {
  starter: 100,
  pro: 100,
  growth: 250,
  business: 1000,
  enterprise: -1,
}

export default function BillingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState("starter")
  const [planLabel, setPlanLabel] = useState("Starter")
  const [recovered, setRecovered] = useState<number | null>(null)
  const [usageCount, setUsageCount] = useState(0)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [nextBilling, setNextBilling] = useState<string>("")

  useEffect(() => {
    const load = async () => {
      try {
        const tenantId = getCookie("bz_tenant")
        if (!tenantId) { router.push("/auth"); return }

        const tenant = await db().tenants.get(tenantId)
        const planCode = (tenant?.plan || "starter") as string
        setPlan(planCode)
        setPlanLabel(PLAN_LABELS[planCode] || "Starter")

        setNextBilling("28 Aug 2026")

        Promise.all([
          fetch("/api/recovery/queue").then(r => r.json()).then(d => {
            const amt = d?.recoveredThisMonth ?? d?.recoveredAttributed ?? null
            setRecovered(amt)
          }).catch(() => {}),

          db().invoices?.toArray().then(invoices => {
            const count = (invoices || []).filter((i: any) =>
              i.status === "sent" || i.status === "overdue"
            ).length
            setUsageCount(count)
          }).catch(() => {}),
        ])
      } catch {} finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  const limit = RECOVERY_LIMITS[plan] ?? 100
  const pct = limit > 0 ? Math.min(100, Math.round((usageCount / limit) * 100)) : 0
  const remaining = limit > 0 ? Math.max(0, limit - usageCount) : -1

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/50 pb-8">
        <div className="max-w-2xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4">
          <div className="h-8 w-48 bg-card border border-border rounded-lg animate-pulse" />
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-card border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/50 pb-8">
      <div className="max-w-2xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-5">

        <div className="flex items-center gap-3">
          <Link href="/settings" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ChevronLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Subscription & Usage</h1>
            <p className="text-sm text-muted-foreground">Your plan, recovery usage, and billing</p>
          </div>
        </div>

        {/* Current Plan */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{planLabel}</p>
                <p className="text-xs text-muted-foreground">{PLAN_PRICES[plan]}/month</p>
              </div>
            </div>
            <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-success-soft text-success border border-success">
              Active
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border pt-3">
            <IndianRupee className="w-3 h-3" />
            Next billing: {nextBilling}
          </div>
        </div>

        {/* Recovery Impact */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Recovered
            </p>
            <p className="text-2xl font-bold text-success mt-1">
              {recovered !== null ? `₹${recovered.toLocaleString("en-IN")}` : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">this month</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Active Recovery</p>
            <p className="text-2xl font-bold text-foreground mt-1">{usageCount}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">invoices under follow-up</p>
          </div>
        </div>

        {/* Recovery Capacity */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Recovery Capacity</p>
            <button onClick={() => setShowUpgrade(true)} className="text-xs font-medium text-primary hover:underline">
              Upgrade
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-sm font-bold text-foreground whitespace-nowrap">
              {usageCount} / {limit > 0 ? limit : "∞"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {remaining > 0
              ? `${remaining} remaining this billing period`
              : remaining === 0
              ? "Limit reached — upgrade for more capacity"
              : "Unlimited recoveries"}
          </p>
        </div>

        {/* Upgrade prompt */}
        {showUpgrade && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">Need more recovery capacity?</p>
            <p className="text-xs text-muted-foreground">
              Upgrade to a higher plan and recover more of your stuck money every month.
            </p>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-colors"
            >
              Upgrade Plan
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* Billing History */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-3">
          <p className="text-sm font-semibold text-foreground">Billing History</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground">July 2026</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              </div>
              <span className="text-sm font-medium text-foreground">₹299</span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground">June 2026</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              </div>
              <span className="text-sm font-medium text-foreground">₹299</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
