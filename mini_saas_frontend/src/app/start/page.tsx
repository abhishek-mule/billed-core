'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { z } from 'zod'
import { loadRazorpay, RAZORPAY_KEY, PLANS_INR } from '@/lib/razorpay'

const shopSchema = z.object({
  shopName: z.string().min(2, 'Shop name must be at least 2 characters'),
  category: z.string().min(1, 'Please select a category'),
})

const identitySchema = z.object({
  identityType: z.enum(['gstin', 'aadhar']),
  gstin: z.string().optional(),
  aadhar: z.string().optional(),
  ownerName: z.string().min(2),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian phone number'),
  email: z.string().email(),
})

const planSchema = z.object({
  plan: z.enum(['free', 'starter', 'pro']),
})

type ShopData = z.infer<typeof shopSchema>
type IdentityData = z.infer<typeof identitySchema>

const categories = [
  'Electrical Retailer',
  'Mobile & Electronics',
  'Grocery & Kirana',
  'Pharmacy',
  'Clothing & Fashion',
  'Hardware & Tools',
  'Auto Parts',
  'Other',
]

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: '₹0',
    period: '/month',
    features: ['50 invoices/month', '1 user', 'Basic reports', 'Email support'],
    color: 'gray',
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '₹499',
    period: '/month',
    features: ['500 invoices/month', '3 users', 'E-way bills', 'WhatsApp alerts', 'Priority support'],
    color: 'indigo',
    popular: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '₹999',
    period: '/month',
    features: ['Unlimited invoices', '10 users', 'Multi-branch', 'API access', 'Dedicated support'],
    color: 'purple',
  },
]

export default function Home() {
  const [step, setStep] = useState(1)
  const [shopData, setShopData] = useState<ShopData | null>(null)
  const [identityData, setIdentityData] = useState<IdentityData | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [razorpayLoaded, setRazorpayLoaded] = useState(false)

  useEffect(() => {
    loadRazorpay().then((loaded) => setRazorpayLoaded(loaded))
  }, [])

  const handleShopSubmit = (data: ShopData) => {
    setShopData(data)
    setStep(2)
  }

  const handleIdentitySubmit = (data: IdentityData) => {
    setIdentityData(data)
    setStep(3)
  }

  const handlePlanSelect = async (planId: string) => {
    setSelectedPlan(planId)

    if (planId === 'free') {
      await completeOnboarding(planId, null)
      return
    }

    if (!razorpayLoaded) {
      alert('Payment gateway loading. Please try again.')
      return
    }

    setIsSubmitting(true)

    try {
      const orderRes = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: planId,
          shopName: shopData?.shopName,
          email: identityData?.email,
          phone: identityData?.phone,
        }),
      })

      if (!orderRes.ok) throw new Error('Failed to create order')
      const order = await orderRes.json()

      const razorpay = new (window as any).Razorpay({
        key: RAZORPAY_KEY,
        amount: order.amount,
        currency: order.currency,
        name: 'Billed',
        description: `${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan`,
        order_id: order.id,
        prefill: {
          name: identityData?.ownerName,
          email: identityData?.email,
          contact: `+91${identityData?.phone}`,
        },
        handler: async (response: any) => {
          await completeOnboarding(planId, response.razorpay_payment_id)
        },
        modal: {
          ondismiss: () => setIsSubmitting(false),
        },
      })

      razorpay.open()
    } catch (error) {
      console.error('Payment error:', error)
      alert('Payment failed. Please try again.')
      setIsSubmitting(false)
    }
  }

  const completeOnboarding = async (planId: string, paymentId: string | null) => {
    setIsSubmitting(true)
    try {
      const response = await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...shopData,
          ...identityData,
          plan: planId,
          paymentId,
        }),
      })
      if (response.ok) setStep(4)
    } catch (error) {
      console.error(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col">
      <nav className="p-6 flex items-center justify-between max-w-6xl mx-auto w-full">
        <div className="text-2xl font-bold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
          Billed
        </div>
        <div className="text-sm text-gray-400">Free Forever Plan Available</div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Start Your Free Trial</h1>
            <p className="text-gray-400">Setup in 2 minutes. No credit card required.</p>
          </div>

          <div className="flex gap-2 mb-8">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-2 flex-1 rounded-full transition-colors ${
                  s <= step ? 'bg-indigo-500' : 'bg-gray-800'
                }`}
              />
            ))}
          </div>

          <AnimatePresence mode="wait">
            {step === 1 && (
              <ShopStep key="step1" onSubmit={handleShopSubmit} />
            )}
            {step === 2 && (
              <IdentityStep
                key="step2"
                onSubmit={handleIdentitySubmit}
                onBack={() => setStep(1)}
              />
            )}
            {step === 3 && (
              <PlanStep
                key="step3"
                onSelect={handlePlanSelect}
                onBack={() => setStep(2)}
                isSubmitting={isSubmitting}
              />
            )}
            {step === 4 && (
              <SuccessStep
                key="step4"
                shopName={shopData?.shopName || ''}
                plan={selectedPlan || 'free'}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  )
}

function ShopStep({ onSubmit }: { onSubmit: (data: ShopData) => void }) {
  const [form, setForm] = useState({ shopName: '', category: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const result = shopSchema.safeParse(form)
    if (result.success) {
      onSubmit(result.data)
    } else {
      const newErrors: Record<string, string> = {}
      result.error.issues.forEach((err) => {
        if (err.path[0]) newErrors[err.path[0] as string] = err.message
      })
      setErrors(newErrors)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Shop Name</label>
          <input type="text" value={form.shopName} onChange={(e) => setForm({ ...form, shopName: e.target.value })} placeholder="e.g., Sharma Electronics" className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-800 focus:border-indigo-500 transition" />
          {errors.shopName && <p className="text-red-500 text-sm mt-1">{errors.shopName}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Business Category</label>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-800 focus:border-indigo-500 transition">
            <option value="">Select category</option>
            {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          {errors.category && <p className="text-red-500 text-sm mt-1">{errors.category}</p>}
        </div>

        <button type="submit" className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium transition">
          Continue
        </button>
      </form>
    </motion.div>
  )
}

function IdentityStep({ onSubmit, onBack }: { onSubmit: (data: IdentityData) => void; onBack: () => void }) {
  const [form, setForm] = useState({ identityType: 'gstin' as 'gstin' | 'aadhar', gstin: '', aadhar: '', ownerName: '', phone: '', email: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const result = identitySchema.safeParse(form)
    if (result.success) {
      onSubmit(result.data)
    } else {
      const newErrors: Record<string, string> = {}
      result.error.issues.forEach((err) => {
        if (err.path[0]) newErrors[err.path[0] as string] = err.message
      })
      setErrors(newErrors)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Identity Type</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="identityType" value="gstin" checked={form.identityType === 'gstin'} onChange={() => setForm({ ...form, identityType: 'gstin' })} className="accent-indigo-500" />
              GSTIN
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="identityType" value="aadhar" checked={form.identityType === 'aadhar'} onChange={() => setForm({ ...form, identityType: 'aadhar' })} className="accent-indigo-500" />
              Aadhar
            </label>
          </div>
        </div>

        {form.identityType === 'gstin' ? (
          <div>
            <label className="block text-sm font-medium mb-2">GSTIN</label>
            <input type="text" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="29ABCDE1234F1Z5" maxLength={15} className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-800 focus:border-indigo-500 transition uppercase" />
            {errors.gstin && <p className="text-red-500 text-sm mt-1">{errors.gstin}</p>}
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium mb-2">Aadhar Number</label>
            <input type="text" value={form.aadhar} onChange={(e) => setForm({ ...form, aadhar: e.target.value.replace(/\D/g, '').slice(0, 12) })} placeholder="1234 5678 9012" className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-800 focus:border-indigo-500 transition" />
            {errors.aadhar && <p className="text-red-500 text-sm mt-1">{errors.aadhar}</p>}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-2">Owner Name</label>
          <input type="text" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} placeholder="Your full name" className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-800 focus:border-indigo-500 transition" />
          {errors.ownerName && <p className="text-red-500 text-sm mt-1">{errors.ownerName}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Phone</label>
            <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="9876543210" className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-800 focus:border-indigo-500 transition" />
            {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@email.com" className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-800 focus:border-indigo-500 transition" />
            {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
          </div>
        </div>

        <div className="flex gap-4">
          <button type="button" onClick={onBack} className="flex-1 py-3 px-4 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition">Back</button>
          <button type="submit" className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium transition">Continue to Plans</button>
        </div>
      </form>
    </motion.div>
  )
}

function PlanStep({ onSelect, onBack, isSubmitting }: { onSelect: (planId: string) => void; onBack: () => void; isSubmitting: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <div className="flex gap-4">
        <button type="button" onClick={onBack} className="py-3 px-4 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition">Back</button>
        <h2 className="text-xl font-semibold flex items-center">Select Your Plan</h2>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mt-6">
        {plans.map((plan) => (
          <motion.div
            key={plan.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`relative p-6 rounded-xl border-2 cursor-pointer transition-all ${
              plan.popular
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-gray-800 bg-gray-900 hover:border-gray-700'
            }`}
            onClick={() => onSelect(plan.id)}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-500 text-xs font-medium rounded-full">
                Most Popular
              </span>
            )}
            <h3 className="text-lg font-bold">{plan.name}</h3>
            <div className="mt-2">
              <span className="text-3xl font-bold">{plan.price}</span>
              <span className="text-gray-500">{plan.period}</span>
            </div>
            <ul className="mt-4 space-y-2">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-gray-400">
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
            <button
              disabled={isSubmitting}
              className={`mt-6 w-full py-2 px-4 rounded-lg font-medium transition ${
                plan.popular ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-800 hover:bg-gray-700'
              } disabled:opacity-50`}
            >
              {isSubmitting ? 'Processing...' : plan.id === 'free' ? 'Start Free' : `Pay ${plan.price}`}
            </button>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

function SuccessStep({ shopName, plan }: { shopName: string; plan: string }) {
  const selectedPlan = plans.find((p) => p.id === plan) || plans[0]

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
      <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
        <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-3xl font-bold mb-2">Welcome to Billed!</h2>
      <p className="text-gray-400 mb-6">
        {shopName} is being set up with {selectedPlan.name} plan.
        <br />
        You'll receive login credentials via WhatsApp/Email shortly.
      </p>

      <div className="bg-gray-900 rounded-xl p-6 max-w-sm mx-auto">
        <div className="flex items-center justify-between mb-4">
          <span className="text-gray-400">Plan</span>
          <span className="font-semibold">{selectedPlan.name}</span>
        </div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-gray-400">Amount</span>
          <span className="font-semibold">{selectedPlan.price}/month</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Status</span>
          <span className="text-green-500 font-semibold">Payment Confirmed</span>
        </div>
      </div>

      <div className="mt-8 text-gray-500 text-sm">
        Need help? Contact us at support@billed.in
      </div>
    </motion.div>
  )
}
