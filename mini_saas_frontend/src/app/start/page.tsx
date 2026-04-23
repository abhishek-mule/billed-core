'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { z } from 'zod'
import { loadRazorpay, RAZORPAY_KEY } from '@/lib/razorpay'
import { Icon, Icons } from '@/components/Icons'

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

type ShopData = z.infer<typeof shopSchema>
type IdentityData = z.infer<typeof identitySchema>

const categories = [
{ id: 'electrical', name: 'Electrical Retailer', icon: 'bolt' },

  { id: 'mobile', name: 'Mobile & Electronics', icon: 'phone' },

  { id: 'other', name: 'Other', icon: 'box' },
]

const plans = [
  { id: 'free', name: 'Free', price: '₹0', period: 'forever', color: 'slate', features: ['50 invoices/month', '1 user', 'Basic reports'] },
  { id: 'starter', name: 'Starter', price: '₹499', period: '/month', color: 'indigo', popular: true, features: ['500 invoices/month', '3 users', 'E-way bills', 'WhatsApp alerts'] },
  { id: 'pro', name: 'Pro', price: '₹999', period: '/month', color: 'violet', features: ['Unlimited invoices', '10 users', 'Multi-branch', 'API access'] },
]

const stepTitles = ['Tell us about your shop', 'Verify your identity', 'Choose your plan', 'All set!']

export default function StartPage() {
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
      const orderRes = await fetch('/api/createorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId, shopName: shopData?.shopName, email: identityData?.email, phone: identityData?.phone }),
      })

      if (!orderRes.ok) {
        const err = await orderRes.json()
        alert(`Error: ${err.error || err.details || 'Failed to create order'}`)
        setIsSubmitting(false)
        return
      }
      const order = await orderRes.json()

      const razorpay = new (window as any).Razorpay({
        key: RAZORPAY_KEY,
        amount: order.amount,
        currency: order.currency,
        name: 'BillZo',
        description: `${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan`,
        order_id: order.id,
        prefill: { name: identityData?.ownerName, email: identityData?.email, contact: `+91${identityData?.phone}` },
        handler: async (response: any) => await completeOnboarding(planId, response.razorpay_payment_id),
        modal: { ondismiss: () => setIsSubmitting(false) },
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
        body: JSON.stringify({ ...shopData, ...identityData, plan: planId, paymentId }),
      })
      if (response.ok) setStep(4)
    } catch (error) {
      console.error(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white">
      <motion.div 
        initial={{ opacity: 0, y: -20 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0b]/80 backdrop-blur-xl border-b border-white/5"
      >
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">Z</span>
            </div>
            <span className="font-semibold text-lg">BillZo</span>
          </div>
          <div className="text-sm text-gray-500">India's smartest billing</div>
        </div>
      </motion.div>

      <div className="pt-24 pb-12 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 text-indigo-400 text-sm font-medium mb-6">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              Free forever plan available
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              {stepTitles[step - 1]}
            </h1>
            <p className="text-gray-400 text-lg max-w-md mx-auto">
              {step === 1 && 'Set up your shop in under 2 minutes'}
              {step === 2 && 'Verify your business identity'}
              {step === 3 && 'Pick the plan that fits your needs'}
              {step === 4 && 'Your billing suite is ready'}
            </p>
          </motion.div>

          <div className="flex items-center justify-center gap-2 mb-12">
            {[1, 2, 3, 4].map((s, i) => (
              <motion.div
                key={s}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center"
              >
                <div className={`w-3 h-3 rounded-full transition-all durations ${
                  s < step ? 'bg-indigo-500 w-8' : s === step ? 'bg-indigo-500 w-3' : 'bg-gray-800'
                }`} />
                {s < 4 && (
                  <div className={`w-12 h-0.5 transition-all ${s < step ? 'bg-indigo-500' : 'bg-gray-800'}`} />
                )}
              </motion.div>
            ))}
          </div>

          <div className="max-w-xl mx-auto">
            <AnimatePresence mode="wait">
              {step === 1 && <ShopStep key="step1" onSubmit={handleShopSubmit} />}
              {step === 2 && <IdentityStep key="step2" onSubmit={handleIdentitySubmit} onBack={() => setStep(1)} />}
              {step === 3 && <PlanStep key="step3" onSelect={handlePlanSelect} onBack={() => setStep(2)} isSubmitting={isSubmitting} />}
              {step === 4 && <SuccessStep key="step4" shopName={shopData?.shopName || ''} plan={selectedPlan || 'free'} />}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <footer className="py-8 text-center text-gray-600 text-sm">
        By continuing, you agree to our Terms of Service
      </footer>
    </div>
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
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Shop Name</label>
          <input
            type="text"
            value={form.shopName}
            onChange={(e) => setForm({ ...form, shopName: e.target.value })}
            placeholder="e.g., Sharma Electronics"
            className="w-full px-4 py-4 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500/50 focus:bg-white/10 transition-all outline-none text-lg placeholder:text-gray-600"
          />
          {errors.shopName && <p className="text-red-400 text-sm">{errors.shopName}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Business Category</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {categories.map((cat) => (
              <motion.button
                key={cat.id}
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setForm({ ...form, category: cat.id })}
                className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 ${
                  form.category === cat.id
                    ? 'bg-indigo-500/20 border-indigo-500 text-white'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:border-white/20'
                }`}
              >
                <Icon name={cat.icon as keyof typeof Icons} size={24} />
                <span className="text-xs font-medium">{cat.name}</span>
              </motion.button>
            ))}
          </div>
          {errors.category && <p className="text-red-400 text-sm">{errors.category}</p>}
        </div>

        <motion.button
          type="submit"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="w-full py-4 px-6 bg-white text-black font-semibold rounded-xl hover:bg-gray-100 transition-colors text-lg"
        >
          Continue
        </motion.button>
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
        <div className="flex gap-3">
          {[
            { id: 'gstin', label: 'GSTIN', desc: 'Business registration' },
            { id: 'aadhar', label: 'Aadhar', desc: 'Personal identity' },
          ].map((type) => (
            <motion.button
              key={type.id}
              type="button"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => setForm({ ...form, identityType: type.id as 'gstin' | 'aadhar' })}
              className={`flex-1 p-4 rounded-xl border transition-all ${
                form.identityType === type.id
                  ? 'bg-indigo-500/20 border-indigo-500'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="font-medium">{type.label}</div>
              <div className="text-xs text-gray-500">{type.desc}</div>
            </motion.button>
          ))}
        </div>

        {form.identityType === 'gstin' ? (
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">GSTIN Number</label>
            <input
              type="text"
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase().slice(0, 15) })}
              placeholder="29ABCDE1234F1Z5"
              maxLength={15}
              className="w-full px-4 py-4 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500/50 transition-all outline-none uppercase tracking-wider font-mono"
            />
            {errors.gstin && <p className="text-red-400 text-sm">{errors.gstin}</p>}
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Aadhar Number</label>
            <input
              type="text"
              value={form.aadhar}
              onChange={(e) => setForm({ ...form, aadhar: e.target.value.replace(/\D/g, '').slice(0, 12) })}
              placeholder="1234 5678 9012"
              className="w-full px-4 py-4 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500/50 transition-all outline-none font-mono text-lg tracking-widest"
            />
            {errors.aadhar && <p className="text-red-400 text-sm">{errors.aadhar}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Owner Name</label>
            <input
              type="text"
              value={form.ownerName}
              onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
              placeholder="Your name"
              className="w-full px-4 py-4 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500/50 transition-all outline-none"
            />
            {errors.ownerName && <p className="text-red-400 text-sm">{errors.ownerName}</p>}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
              placeholder="9876543210"
              className="w-full px-4 py-4 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500/50 transition-all outline-none font-mono"
            />
            {errors.phone && <p className="text-red-400 text-sm">{errors.phone}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@email.com"
            className="w-full px-4 py-4 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500/50 transition-all outline-none"
          />
          {errors.email && <p className="text-red-400 text-sm">{errors.email}</p>}
        </div>

        <div className="flex gap-3">
          <motion.button
            type="button"
            onClick={onBack}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="flex-1 py-4 px-6 bg-white/5 border border-white/10 text-white font-medium rounded-xl hover:bg-white/10 transition-colors"
          >
            Back
          </motion.button>
          <motion.button
            type="submit"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="flex-1 py-4 px-6 bg-white text-black font-semibold rounded-xl hover:bg-gray-100 transition-colors text-lg"
          >
            Continue
          </motion.button>
        </div>
      </form>
    </motion.div>
  )
}

function PlanStep({ onSelect, onBack, isSubmitting }: { onSelect: (planId: string) => void; onBack: () => void; isSubmitting: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <div className="space-y-4">
        {plans.map((plan, index) => (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => onSelect(plan.id)}
            className={`relative p-6 rounded-2xl border transition-all cursor-pointer group ${
              plan.popular
                ? 'bg-gradient-to-br from-indigo-500/20 to-violet-500/10 border-indigo-500/50 hover:border-indigo-400'
                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
            }`}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-indigo-500 to-violet-500 text-xs font-medium rounded-full text-white">
                Most Popular
              </span>
            )}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <div className="mt-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-gray-500 ml-1">{plan.period}</span>
                </div>
              </div>
              <ul className="space-y-1">
                {plan.features.slice(0, 3).map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-gray-400">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
            <div className={`mt-4 py-3 rounded-xl text-center font-medium transition-all ${
              plan.popular
                ? 'bg-indigo-600 text-white group-hover:bg-indigo-500'
                : 'bg-white/10 text-white group-hover:bg-white/20'
            }`}>
              {isSubmitting ? 'Processing...' : plan.id === 'free' ? 'Start Free' : `Pay ₹${plan.price}/mo`}
            </div>
          </motion.div>
        ))}
      </div>
      <motion.button
        type="button"
        onClick={onBack}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className="w-full mt-4 py-3 text-gray-500 hover:text-white transition-colors"
      >
        ← Back
      </motion.button>
    </motion.div>
  )
}

function SuccessStep({ shopName, plan }: { shopName: string; plan: string }) {
  const selectedPlan = plans.find((p) => p.id === plan) || plans[0]

  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring' }}
        className="w-24 h-24 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mx-auto mb-6"
      >
        <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </motion.div>
      
      <h2 className="text-3xl font-bold mb-2">Welcome to BillZo!</h2>
      <p className="text-gray-400 mb-4">
        {shopName} ready with {selectedPlan.name} plan
      </p>
<p className="text-indigo-400 text-sm mb-6 flex items-center gap-2">
          <Icon name="activity" size={16} /> Create your first invoice to get started →
        </p>

      <div className="bg-white/5 rounded-2xl p-6 max-w-sm mx-auto border border-white/10">
        <div className="flex items-center justify-between py-3 border-b border-white/10">
          <span className="text-gray-400">Shop</span>
          <span className="font-medium">{shopName}</span>
        </div>
        <div className="flex items-center justify-between py-3 border-b border-white/10">
          <span className="text-gray-400">Plan</span>
          <span className="font-medium">{selectedPlan.name}</span>
        </div>
        <div className="flex items-center justify-between py-3">
          <span className="text-gray-400">Status</span>
          <span className="text-green-400 font-medium">Active</span>
        </div>
      </div>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => window.location.href = '/merchant/invoice/new'}
        className="mt-8 w-full py-4 bg-white text-black font-semibold rounded-xl hover:bg-gray-100 transition-colors text-lg"
      >
        Create First Invoice →
      </motion.button>
    </motion.div>
  )
}