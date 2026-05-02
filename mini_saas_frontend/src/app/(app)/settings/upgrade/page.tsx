'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Zap, CreditCard } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function UpgradePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const plans = [
    { id: 'starter', name: 'Starter', price: '₹499', features: ['Unlimited Invoices', 'GST Compliance', 'Inventory Tracking'] },
    { id: 'pro', name: 'Pro', price: '₹999', features: ['Everything in Starter', 'Priority WhatsApp Support', 'Multi-user Access', 'Advanced Analytics'] },
  ]

  const handleUpgrade = async (plan: string) => {
    setLoading(true)
    
    // 1. Create order
    const orderRes = await fetch('/api/createorder', {
      method: 'POST',
      body: JSON.stringify({ plan, shopName: 'Sharma Electronics' })
    })
    const order = await orderRes.json()

    // 2. Open Razorpay (Mocking for now as we don't have RAZORPAY_KEY in client)
    alert(`Upgrading to ${plan}. Mock Razorpay for Order ID: ${order.id}`)
    
    setTimeout(() => {
      setLoading(false)
      router.push('/settings')
    }, 1000)
  }

  return (
    <div className="min-h-screen bg-background pb-12 animate-fade-in md:pl-20 lg:pl-64">
      <header className="sticky top-0 bg-background/80 backdrop-blur-md border-b border-border h-16 flex items-center px-4">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-muted active:scale-95 transition-all">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <h1 className="ml-3 text-base font-black tracking-tight text-foreground uppercase tracking-widest">Upgrade to Pro</h1>
      </header>

      <div className="p-4 max-w-sm mx-auto space-y-6">
        {plans.map(plan => (
          <div key={plan.id} className="card-base p-6 border-2 border-primary/20 space-y-6">
            <div>
              <p className="text-sm font-bold text-muted-foreground uppercase">{plan.name}</p>
              <p className="text-4xl font-black text-primary tracking-tighter mt-1">{plan.price}<span className="text-base text-muted-foreground">/mo</span></p>
            </div>
            <ul className="space-y-3">
              {plan.features.map(f => (
                <li key={f} className="flex items-center gap-3 text-xs font-bold text-foreground">
                  <CheckCircle2 className="w-4 h-4 text-success" /> {f}
                </li>
              ))}
            </ul>
            <button 
              onClick={() => handleUpgrade(plan.id)}
              disabled={loading}
              className="w-full py-4 bg-primary text-primary-foreground font-black uppercase tracking-widest rounded-xl shadow-glow disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Choose Plan'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
