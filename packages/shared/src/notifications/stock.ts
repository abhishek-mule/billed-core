// ============================================================
// NOTIFICATION CONTRACT — inventory alert state (spec §4)
// ============================================================
// threshold semantics:
//   stock > threshold  → NORMAL
//   0 < stock <= threshold → LOW_STOCK
//   stock <= 0         → OUT_OF_STOCK
//
// Rule: notify on TRANSITION, never repeatedly while stock lingers below
// the threshold. The server endpoint (Phase 3) reads product_alert_cycle,
// compares getStockStatus(prev) vs getStockStatus(next), and only creates a
// notification when the state actually changes — bumping `cycle` so a later
// re-entry generates a fresh dedupe key.

import type { ProductAlertState } from './types'

export function getStockStatus(stock: number, threshold: number): ProductAlertState {
  if (stock <= 0) return 'OUT_OF_STOCK'
  if (stock <= threshold) return 'LOW_STOCK'
  return 'NORMAL'
}

export function isStockTransition(prev: ProductAlertState, next: ProductAlertState): boolean {
  return prev !== next
}

// The alert supersedes the previous one (return-to-normal closes the alert).
export const STOCK_ALERT_ORDER: ProductAlertState[] = ['NORMAL', 'LOW_STOCK', 'OUT_OF_STOCK']