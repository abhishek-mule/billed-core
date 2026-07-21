"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Check, ArrowUpRight, X } from "lucide-react"
import { Button } from "@/components/billzo/Button"
import { Modal } from "@/components/billzo/Modal"

type InterestPlan = 'growth' | 'business' | 'enterprise' | null

const PLANS = [
  {
    code: 'free',
    name: 'Free',
    price: 0,
    desc: 'Perfect for trying BillZo.',
    features: [
      'Unlimited invoices',
      'Unlimited customers',
      'Payment links',
      'Dashboard',
      'Recover up to 5 overdue invoices / month',
    ],
    cta: 'Start Free',
    highlight: false,
  },
  {
    code: 'starter',
    name: 'Starter',
    price: 299,
    desc: 'Best for most merchants.',
    features: [
      'Everything in Free',
      'Automatic WhatsApp recovery',
      'Recovery Queue',
      'Payment tracking',
      'Recovery history',
      'Automatically follow up on up to 100 overdue invoices every month',
    ],
    cta: 'Start Recovering',
    highlight: true,
  },
  {
    code: 'growth',
    name: 'Growth',
    price: 499,
    desc: 'Growing business.',
    features: [
      'Everything in Starter',
      'Recover up to 250 overdue invoices / month',
      'Priority reminder processing',
      'Advanced recovery reports',
      'Faster support',
    ],
    cta: 'Request Access',
    highlight: false,
  },
  {
    code: 'business',
    name: 'Business',
    price: 1499,
    desc: 'Teams & branches.',
    features: [
      'Everything in Growth',
      'Recover 1000+ overdue invoices / month',
      'Team access',
      'Branch support',
      'Priority support',
      'Early access to new features',
    ],
    cta: 'Talk to Us',
    highlight: false,
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    price: null,
    desc: 'Custom recovery workflows.',
    features: [
      'Custom recovery capacity',
      'Dedicated onboarding',
      'SLA support',
      'Custom integrations',
      'Volume pricing',
    ],
    cta: 'Talk to Us',
    highlight: false,
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
    if (code === 'starter') return handleStarter
    if (code === 'growth') return () => openInterestModal('growth')
    if (code === 'business') return () => openInterestModal('business')
    if (code === 'enterprise') return () => openInterestModal('enterprise')
    return () => {}
  }

  const planButtonText = (code: string) => {
    if (code === 'free' && currentPlan && currentPlan !== 'starter') return 'Continue Free'
    if (code === 'starter' && currentPlan === 'pro') return 'Current Plan'
    return PLANS.find(p => p.code === code)?.cta || 'Select'
  }

  return (
    <div className="container py-8">
      <div className="mx-auto max-w-5xl text-center">
        <h1 className="text-3xl font-bold">Pricing that pays for itself</h1>
        <p className="mt-2 text-muted-foreground">
          Start free. Upgrade when you want to recover more of your stuck money.
        </p>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {PLANS.map((plan) => {
          const isCurrent = (plan.code === 'free' && currentPlan && currentPlan !== 'pro') ||
            (plan.code === 'starter' && currentPlan === 'pro')
          const isProcessing = processing && plan.code === 'starter'

          return (
            <div
              key={plan.code}
              className={`relative flex flex-col rounded-2xl border p-5 ${
                plan.highlight
                  ? 'border-primary shadow-lg dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)]'
                  : 'border-border'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground whitespace-nowrap">
                  Most Popular
                </div>
              )}

              <h3 className="text-lg font-bold">{plan.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground min-h-[2.5rem]">{plan.desc}</p>

              <div className="mt-3 flex items-baseline gap-1">
                {plan.price !== null ? (
                  <>
                    <span className="text-2xl font-bold">
                      {plan.price === 0 ? 'Free' : `₹${plan.price.toLocaleString('en-IN')}`}
                    </span>
                    {plan.price > 0 && <span className="text-xs text-muted-foreground">/month</span>}
                  </>
                ) : (
                  <span className="text-xl font-bold">Custom</span>
                )}
              </div>

              {plan.code === 'starter' && (
                <p className="mt-2 text-xs font-medium text-success">
                  Recover ₹50,000+ for less than ₹10/day
                </p>
              )}

              <ul className="mt-4 flex-1 space-y-2.5">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={planAction(plan.code)}
                disabled={isProcessing || isCurrent}
                className={`mt-5 w-full rounded-xl py-2.5 text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${
                  plan.highlight
                    ? 'bg-gradient-to-br from-primary to-success text-primary-foreground shadow-lg'
                    : plan.code === 'free'
                    ? 'border-2 border-border bg-transparent text-foreground hover:bg-secondary'
                    : 'border border-border bg-secondary text-foreground hover:bg-secondary/80'
                }`}
              >
                {isProcessing ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : isCurrent ? (
                  'Current Plan'
                ) : (
                  <span className="inline-flex items-center gap-1">
                    {planButtonText(plan.code)}
                    {plan.code !== 'free' && plan.code !== 'starter' && <ArrowUpRight className="h-3.5 w-3.5" />}
                  </span>
                )}
              </button>
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

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Prices shown in INR, excluding GST. Recovery capacity resets monthly.
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
