'use client'

import { useRouter } from 'next/navigation'
import { Plus, Search, ShoppingBag, Store } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function PurchasesPage() {
  const router = useRouter()

  const purchases = [
    { id: 'PUR-001', supplier: 'Wholesale Mart', amount: '₹8,500', date: 'Today', status: 'PROCESSED' },
    { id: 'PUR-002', supplier: 'A1 Electronics', amount: '₹12,400', date: 'Yesterday', status: 'PROCESSED' },
  ]

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Purchases</h1>
          <p className="text-sm text-muted-foreground mt-1">Track supplier bills and inventory</p>
        </div>
        <button 
          onClick={() => router.push('/purchases/new')}
          className="btn-base bg-secondary text-secondary-foreground shadow-sm px-4 py-2 text-sm"
        >
          <Plus className="w-4 h-4 mr-2" /> Manual Entry
        </button>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input 
          type="text" 
          placeholder="Search purchases..." 
          className="input-base pl-9 border-none shadow-sm"
        />
      </div>

      <div className="space-y-3">
        {purchases.map((purchase) => (
          <div key={purchase.id} className="card-base p-4 flex items-center justify-between hover:border-primary/30 cursor-pointer transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">{purchase.supplier}</p>
                <p className="text-xs text-muted-foreground">{purchase.id} • {purchase.date}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-foreground">{purchase.amount}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider mt-0.5 text-muted-foreground">
                {purchase.status}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
