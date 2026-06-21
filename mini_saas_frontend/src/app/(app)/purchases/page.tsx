'use client'

import { FileText, Loader2, PackagePlus } from 'lucide-react'
import { Button } from '@/components/billzo/Button'
import { EmptyState } from '@/components/billzo/EmptyState'
import { useBillzo } from '@/components/billzo/useBillzo'
import { formatINR } from '@/lib/utils'

export default function PurchasesPage() {
  const { state, loading, error, refresh } = useBillzo()

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm text-muted-foreground">Scan supplier invoices, review OCR output, and update stock in one flow.</p>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Purchase History</p>
          <h2 className="text-2xl font-black">Recent Purchases</h2>
        </div>

        {loading ? (
          <div className="flex min-h-[160px] items-center justify-center rounded-2xl border bg-card">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => refresh()}>
              Retry
            </Button>
          </div>
        ) : !state || state.purchases.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-8 w-8" />}
            title="No recent purchases"
            description="Your scanned supplier bills will appear here once they are saved."
          />
        ) : (
          <div className="space-y-3">
            {state.purchases.slice(0, 10).map((purchase) => {
              const itemCount = purchase.items.length
              const itemPreview = purchase.items.slice(0, 3).map((item) => item.name).filter(Boolean).join(', ')

              return (
                <div key={purchase.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-base font-black">{purchase.supplier || 'Unknown Supplier'}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(purchase.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black">{formatINR(purchase.amount || 0)}</p>
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        {purchase.syncStatus}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-sm">
                    <PackagePlus className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">
                      {itemCount} {itemCount === 1 ? 'item' : 'items'}
                    </span>
                  </div>

                  {itemPreview && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {itemPreview}
                      {itemCount > 3 ? '...' : ''}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
