'use client'

import { PackagePlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useBillzo } from './useBillzo'

const money = (value: number) => `₹${value.toLocaleString('en-IN')}`

export function Purchases() {
  const router = useRouter()
  const { state } = useBillzo()
  if (!state) return null

  return (
    <div className="space-y-8">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">Stock rises from purchase scans</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Purchases</h1>
      </header>

      <section className="space-y-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">Stock Ledger</h2>
        <div className="space-y-3">
          {state.products.map((product) => (
            <div key={product.id} className="row-card">
              <div>
                <p className="font-semibold text-foreground">{product.name}</p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Sale {money(product.salePrice)}</span>
                  <span>•</span>
                  <span>GST {product.gstRate}%</span>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 ring-1 ring-border">
                <PackagePlus className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-bold text-foreground">{product.stock}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">Purchase Scans</h2>
        {state.purchases.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white p-10 text-center shadow-sm">
            <p className="text-sm text-muted-foreground font-medium">No purchase scans recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {state.purchases.map((purchase) => (
              <div key={purchase.id} className="row-card">
                <div>
                  <p className="font-semibold text-foreground">{purchase.supplier}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{purchase.gstin || 'No GISTIN'}</span>
                    <span>•</span>
                    <span>{purchase.items.length} item{purchase.items.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <span className="font-semibold text-foreground">{money(purchase.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
