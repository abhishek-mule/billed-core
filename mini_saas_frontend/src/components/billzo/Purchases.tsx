'use client'

import { PackagePlus, ScanLine } from 'lucide-react'
import { createPurchaseFromScan } from '@/lib/billzo/actions'
import { useBillzo } from './useBillzo'

const money = (value: number) => `Rs ${value.toLocaleString('en-IN')}`

export function Purchases() {
  const { state } = useBillzo()
  if (!state) return null

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Stock rises from purchase scans</p>
        <h1 className="text-2xl font-black">Purchases</h1>
      </header>

      <button className="action-tile bg-foreground text-white" onClick={() => createPurchaseFromScan()}>
        <ScanLine className="h-6 w-6" />
        <span>Scan Purchase</span>
      </button>

      <section className="space-y-3">
        <h2 className="section-label">Stock Ledger</h2>
        {state.products.map((product) => (
          <div key={product.id} className="row-card">
            <div>
              <p className="font-black">{product.name}</p>
              <p className="text-sm font-bold text-muted-foreground">Sale {money(product.salePrice)} - GST {product.gstRate}%</p>
            </div>
            <div className="flex items-center gap-3">
              <PackagePlus className="h-4 w-4 text-muted-foreground" />
              <span className="text-lg font-black">{product.stock}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="section-label">Purchase Scans</h2>
        {state.purchases.length === 0 ? (
          <div className="rounded-lg border bg-white p-5 text-sm font-bold text-muted-foreground">No purchase scans yet.</div>
        ) : state.purchases.map((purchase) => (
          <div key={purchase.id} className="row-card">
            <div>
              <p className="font-black">{purchase.supplier}</p>
              <p className="text-sm font-bold text-muted-foreground">{purchase.gstin} - {purchase.items.length} item</p>
            </div>
            <span className="font-black">{money(purchase.amount)}</span>
          </div>
        ))}
      </section>
    </div>
  )
}
