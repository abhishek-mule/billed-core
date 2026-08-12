"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Check, ArrowUpRight, X, ChevronDown } from "lucide-react"
import { Button } from "@/components/billzo/Button"
import { Modal } from "@/components/billzo/Modal"
import { PLAN_LIMITS, isUnlimited } from "@/lib/billzo/plan-limits"

type InterestPlan = 'growth' | 'business' | 'enterprise' | null

// Single source of truth: reminder counts come from plan-limits so the
// advertised allowance can never drift from what the worker enforces.
const reminderFeature = (planCode: keyof typeof PLAN_LIMITS): string => {
  const limit = PLAN_LIMITS[planCode].reminders
  return isUnlimited(limit)
    ? 'Unlimited recovery reminders'
    : `${limit} recovery reminders / month`
}

const PLANS = [
  {
    code: 'free',
    name: 'Free',
    price: 0,
    desc: 'Everything you need to start recovering money today.',
    features: [
      reminderFeature('starter'),
      'Unlimited invoices & customers',
      'UPI payment links & QR codes',
      'Manual recovery queue',
      'Payment tracking & ledger',
    ],
    cta: 'Start Recovering Free',
    highlight: false,
  },
  {
    code: 'pro',
    name: 'Pro',
    price: 299,
    desc: 'Automate collections and recover money 3x faster.',
    features: [
      reminderFeature('pro'),
      'Automated WhatsApp payment reminders',
      'Smart Recovery Queue & Priority engine',
      'WhatsApp delivery & read receipts',
      'Payment promise tracking & broken promise alerts',
    ],
    cta: 'Upgrade to Pro (₹299/mo)',
    highlight: true,
  },
]

export default function PricingPage() {
  const router = useRouter()
  const [currentPlan, setCurrentPlan] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [razorpayLoaded, setRazorpayLoaded] = useState(false)
  const [interestPlan, setInterestPlan] = useState<InterestPlan>(null)
  const [interestPhone, setInterestPhone] = useState('')
  const [interestNote, setInterestNote] = useState('')
  const [interestSubmitted, setInterestSubmitted] = useState(false)
  const [interestError, setInterestError] = useState('')
  const [interestSubmitting, setInterestSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMe()
    loadRazorpayScript()
  }, [])

  const loadRazorpayScript = () => {
    if (document.querySelector('script[src*="razorpay"]')) {
      const check = setInterval(() => {
        if (typeof window !== 'undefined' && (window as any).Razorpay) {
          setRazorpayLoaded(true)
          clearInterval(check)
        }
      }, 500)
      return () => clearInterval(check)
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => setRazorpayLoaded(true)
    script.onerror = () => null
    document.body.appendChild(script)
  }

  const fetchMe = async () => {
    try {
      const res = await fetch('/api/me', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setCurrentPlan(data.plan)
      }
    } catch {
      /* non-fatal */
    }
  }

  const getCookie = (name: string): string | null => {
    if (typeof document === 'undefined') return null
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
    return match ? match[2] : null
  }

  const handleFree = () => {
    router.push('/dashboard')
  }

  const handleStarter = async () => {
    setProcessing(true)
    setError(null)

    try {
      const tenantId = getCookie('bz_tenant') || ''
      const tenantName = getCookie('bz_tenant_name') || ''

      const res = await fetch('/api/payment/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, tenantName, plan: 'pro' }),
      })

      const data = await res.json()
      if (data.error) throw new Error(data.error)

      if (data.mode === 'order') {
        if (!razorpayLoaded || !(window as any).Razorpay) {
          throw new Error('Payment gateway not ready. Please refresh.')
        }
        const rzp = new (window as any).Razorpay({
          key: data.keyId,
          order_id: data.orderId,
          name: 'BillZo',
          description: 'BillZo Starter',
          handler: async (resp: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
            try {
              await fetch('/api/subscriptions/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  subscriptionId: data.subscriptionId,
                  razorpay_payment_id: resp.razorpay_payment_id,
                  razorpay_signature: resp.razorpay_signature,
                  razorpay_order_id: resp.razorpay_order_id,
                }),
              })
              router.push('/dashboard')
            } catch {
              setError('Verification failed. Please contact support.')
              setProcessing(false)
            }
          },
          prefill: { name: tenantName || 'Customer' },
          theme: { color: '#0d9488' },
        })
        rzp.on('payment.failed', (r: { error: { description: string } }) => {
          setError(`Payment failed: ${r.error.description}`)
          setProcessing(false)
        })
        rzp.open()
        return
      }

      if (data.shortUrl) {
        window.location.href = data.shortUrl
        return
      }

      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start payment')
      setProcessing(false)
    }
  }

  const openInterestModal = (plan: InterestPlan) => {
    setInterestPlan(plan)
    setInterestPhone('')
    setInterestNote('')
    setInterestSubmitted(false)
    setInterestError('')
  }

  const submitInterest = async () => {
    const tenantId = getCookie('bz_tenant') || ''
    if (!interestPhone || interestPhone.length < 10) {
      setInterestError('Valid phone number required')
      return
    }
    setInterestSubmitting(true)
    setInterestError('')

    try {
      const res = await fetch('/api/merchant-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          phone: interestPhone,
          plan: interestPlan,
          note: interestNote || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to submit')

      setInterestSubmitted(true)
    } catch (err) {
      setInterestError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setInterestSubmitting(false)
    }
  }

  const planAction = (code: string) => {
    if (code === 'free') return handleFree
    return handleStarter
  }

  const planButtonText = (code: string) => {
    if (code === 'free') return currentPlan === 'free' || !currentPlan ? 'Current Plan' : 'Use Free Version'
    if (code === 'pro' && currentPlan === 'pro') return 'Current Plan'
    return 'Start 7-Day Free Trial'
  }

  return (
    <div className="container py-8 max-w-4xl mx-auto">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Recover more money. Pay only after you see results.
        </h1>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto">
          Start recovering for free today. Upgrade to automate follow-ups when you see the value.
        </p>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {PLANS.map((plan) => {
          const isCurrent = (plan.code === 'free' && (!currentPlan || currentPlan === 'free' || currentPlan === 'starter')) ||
            (plan.code === 'pro' && currentPlan === 'pro')
          const isProcessing = processing && plan.code === 'pro'

          return (
            <div
              key={plan.code}
              className={`relative flex flex-col rounded-2xl border p-6 transition-all ${
                plan.highlight
                  ? 'border-teal-500/80 bg-teal-500/[0.03] shadow-lg ring-1 ring-teal-500/20'
                  : 'border-border bg-card'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-teal-600 px-3 py-0.5 text-[11px] font-bold text-white uppercase tracking-wider shadow-sm">
                  Recommended for Merchants
                </div>
              )}

              <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground min-h-[2.5rem] leading-relaxed">{plan.desc}</p>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-black text-foreground">
                  {plan.price === 0 ? '₹0' : `₹${plan.price.toLocaleString('en-IN')}`}
                </span>
                {plan.price > 0 && <span className="text-xs font-medium text-muted-foreground">/month</span>}
              </div>

              {plan.code === 'pro' && (
                <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-700 dark:text-emerald-300 space-y-1">
                  <p className="font-bold">⚡ Average merchant recovers ₹15,000–₹50,000/month</p>
                  <p className="text-[11px] opacity-90 font-normal">BillZo costs only ₹299/month (~₹10/day)</p>
                </div>
              )}

              <ul className="mt-5 flex-1 space-y-2.5">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-foreground/90 font-medium">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={planAction(plan.code)}
                disabled={isProcessing || isCurrent}
                className={`mt-6 w-full rounded-xl py-3 text-sm font-bold transition-all active:scale-[0.98] ${
                  plan.highlight
                    ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-md hover:shadow-lg disabled:opacity-60'
                    : 'border-2 border-border bg-card hover:bg-muted text-foreground disabled:opacity-60'
                }`}
              >
                {isProcessing ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : isCurrent ? (
                  'Current Plan'
                ) : (
                  <span className="inline-flex items-center justify-center gap-1.5">
                    {planButtonText(plan.code)}
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                )}
              </button>

              {plan.code === 'pro' && !isCurrent && (
                <p className="mt-2 text-[11px] text-center text-muted-foreground">
                  Starts with 7-day free trial · Cancel anytime
                </p>
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="mx-auto mt-4 max-w-md rounded-lg bg-warning-soft p-3 text-center text-sm text-warning">
          {error}
        </div>
      )}

      <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-border bg-secondary/40 p-6">
        <h2 className="text-lg font-semibold">Why BillZo pays for itself</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The average shop recovers more in the first week than a year of Starter costs.
          You only pay to automate what you&apos;d otherwise chase by hand.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          <li className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-success" /> No setup fees</li>
          <li className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-success" /> Cancel anytime</li>
          <li className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-success" /> Annual billing saves ~20%</li>
          <li className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-success" /> Data export always yours</li>
        </ul>
      </div>

      <div className="mx-auto mt-10 max-w-3xl">
        <h2 className="text-center text-lg font-semibold">Frequently Asked Questions</h2>
        <div className="mt-4 space-y-4">
          <details className="group rounded-xl border border-border bg-card p-4">
            <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-foreground">
              What is an overdue recovery?
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">
              An overdue recovery is when BillZo automatically follows up with a customer who
              hasn&apos;t paid on time. Each reminder you send counts toward your monthly
              reminder capacity — one invoice might need 1 reminder or 5 to collect.
            </p>
          </details>
          <details className="group rounded-xl border border-border bg-card p-4">
            <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-foreground">
              Do unused reminders roll over?
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">
              No. Reminder capacity resets at the start of each billing cycle. Upgrade to a
              higher plan if you regularly need more.
            </p>
          </details>
          <details className="group rounded-xl border border-border bg-card p-4">
            <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-foreground">
              Can I upgrade anytime?
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">
              Yes. Upgrades take effect immediately and you&apos;re only charged the prorated
              difference for the rest of the month. Downgrades apply at the next billing cycle.
            </p>
          </details>
          <details className="group rounded-xl border border-border bg-card p-4">
            <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-foreground">
              Can I cancel anytime?
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">
              Absolutely. Cancel from Settings and your plan stays active until the end of the
              billing period. Your data is always yours to export.
            </p>
          </details>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Prices shown in INR, excluding GST. Reminder capacity resets monthly.
      </p>

      <Modal
        open={interestPlan !== null}
        onClose={() => setInterestPlan(null)}
        title={interestPlan ? `Interested in ${interestPlan.charAt(0).toUpperCase() + interestPlan.slice(1)}?` : ''}
        size="sm"
      >
        {interestSubmitted ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-success-soft p-3 text-center text-sm font-medium text-success">
              Thanks! We&apos;ll contact you soon.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone Number *</label>
              <input
                type="tel"
                value={interestPhone}
                onChange={e => setInterestPhone(e.target.value)}
                placeholder="98XXXXXXXX"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tell us about your business (optional)</label>
              <textarea
                value={interestNote}
                onChange={e => setInterestNote(e.target.value)}
                placeholder="Multiple branches, need more reminders, team access..."
                rows={3}
                className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            {interestError && (
              <div className="text-xs text-destructive">{interestError}</div>
            )}
            <Button
              onClick={submitInterest}
              disabled={interestSubmitting}
              className="w-full"
            >
              {interestSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Request Access'
              )}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
