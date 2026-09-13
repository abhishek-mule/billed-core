// ============================================================
// POS → SERVER INVENTORY REPORT (client-safe)
// ============================================================
// Dexie POS never decides "alert or not" and never constructs notification
// records. After a sale it simply REPORTS observed stock to the
// server-authoritative endpoint (POST /api/notifications/inventory), which
// owns product_alert_cycle + the alert projection. Best-effort: a failed
// report must never block or fail the sale itself.

export interface InventoryStockReport {
  productId: string
  productName: string
  stock: number
  threshold: number
}

/**
 * Collapse per-product movements into one final report per product
 * (multiple line items of the same product → single report with the last
 * stock after all depletions).
 */
export function collectInventoryReports(
  movements: { productId: string; stockAfter: number }[],
  products: { id: string; name: string; lowStockAt: number }[],
): InventoryStockReport[] {
  const byProduct = new Map<string, InventoryStockReport>()
  for (const m of movements) {
    const item = products.find((p) => p.id === m.productId)
    if (!item) continue
    const existing = byProduct.get(m.productId)
    byProduct.set(m.productId, {
      productId: m.productId,
      productName: item.name,
      stock: existing === undefined ? m.stockAfter : Math.min(existing.stock, m.stockAfter),
      threshold: item.lowStockAt,
    })
  }
  return [...byProduct.values()]
}

export async function reportInventoryStock(report: InventoryStockReport): Promise<void> {
  try {
    await fetch('/api/notifications/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    })
  } catch (err) {
    console.warn('[POS] Inventory transition report failed:', err)
  }
}