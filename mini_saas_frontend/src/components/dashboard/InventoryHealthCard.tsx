import { Package, AlertTriangle, TrendingDown, ExternalLink } from 'lucide-react'
import { formatINR } from '@/lib/api-client'
import Link from 'next/link'

interface LowStockItem {
  id: string
  name: string
  stock: number
  unit: string
  rate: number
}

interface SlowMovingItem {
  id: string
  name: string
  stock: number
  unit: string
  daysSinceSale: number | null
  lastSoldDate: string | null
}

interface InventoryHealthCardProps {
  lowStockItems: LowStockItem[]
  slowMovingItems: SlowMovingItem[]
}

export function InventoryHealthCard({
  lowStockItems,
  slowMovingItems
}: InventoryHealthCardProps) {
  const hasLowStock = lowStockItems.length > 0
  const hasSlowMoving = slowMovingItems.length > 0

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Package className="h-4 w-4" />
          Inventory Health
        </h3>
        <Link 
          href="/merchant/products" 
          className="text-xs text-primary font-medium inline-flex items-center gap-1 hover:underline"
        >
          Manage <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {!hasLowStock && !hasSlowMoving && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Inventory is healthy
        </div>
      )}

      <div className="space-y-3">
        {/* Low stock items */}
        {hasLowStock && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-warning" />
              Low Stock Alert
            </div>
            <div className="space-y-2">
              {lowStockItems.slice(0, 4).map(item => (
                <div 
                  key={item.id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-warning/5 border border-warning/20"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.stock} {item.unit} remaining • {formatINR(item.rate)}
                    </div>
                  </div>
                  <div className="text-right ml-2">
                    <div className="text-xs text-warning font-semibold">Reorder soon</div>
                    <Link 
                      href={`/merchant/products/${item.id}`}
                      className="text-[10px] text-primary hover:underline"
                    >
                      Manage
                    </Link>
                  </div>
                </div>
              ))}
              {lowStockItems.length > 4 && (
                <div className="text-center text-xs text-muted-foreground">
                  +{lowStockItems.length - 4} more items
                </div>
              )}
            </div>
          </div>
        )}

        {/* Slow-moving items */}
        {hasSlowMoving && (
          <div className={`mt-4 pt-4 border-t border-border ${hasLowStock ? '' : ''}`}>
            <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
              <TrendingDown className="h-3 w-3 text-muted-foreground" />
              Not sold recently
            </div>
            <div className="space-y-2">
              {slowMovingItems.slice(0, 3).map(item => (
                <div key={item.id} className="text-xs text-muted-foreground">
                  <div className="font-medium text-foreground">{item.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span>{item.stock} {item.unit} in stock</span>
                    <span>•</span>
                    <span>
                      {item.daysSinceSale ? `Last sold ${item.daysSinceSale} days ago` : 'Never sold'}
                    </span>
                  </div>
                </div>
              ))}
              {slowMovingItems.length > 3 && (
                <div className="text-xs text-muted-foreground">
                  +{slowMovingItems.length - 3} more items
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}