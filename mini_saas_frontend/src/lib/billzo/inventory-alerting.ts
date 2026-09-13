// ============================================================
// INVENTORY TRANSITION ENGINE (server-authoritative, spec §4)
// ============================================================
// The POS client only REPORTS observed stock; this engine — running on the
// server (POST /api/notifications/inventory) — decides whether a state
// transition occurred and what to project. `/notifications` table + migration
// `product_alert_cycle` hold the persistent transition truth.
//
// Rules:
//   * notify ONLY on state transitions (NORMAL → LOW_STOCK → OUT_OF_STOCK), never
//     while a state lingers (several sales below threshold ≍ ONE alert).
//   * `cycle` is bumped ONLY when RE-ENTERING an attention state after NORMAL,
//     so a restock + re-drop produces a fresh dedupe key (`<type>:<product>:<cycle>`)
//     instead of being swallowed as a same-state duplicate (migration 095 comment).
//   * returns to NORMAL close the cycle and may project back_in_stock (opt-in).

import { getStockStatus, type ProductAlertState } from '@billzo/shared'

export type InventoryAlertType = 'inventory.low_stock' | 'inventory.out_of_stock' | 'inventory.back_in_stock'

export interface ProductAlertCycleState {
  alertState: ProductAlertState
  cycle: number
}

export interface InventoryAlertDecision {
  /** Post-transition state to persist in product_alert_cycle. */
  status: ProductAlertState
  /** Cycle to persist. */
  cycle: number
  /** Alert to project, or null when nothing changed (never re-alert while lingering). */
  alert: InventoryAlertType | null
  /** Cycle-scoped dedupe key, unique per transition into a state. */
  dedupeKey: string | null
}

function alertKey(type: InventoryAlertType, productId: string, cycle: number): string {
  return `${type}:${productId}:${cycle}`
}

export function computeInventoryAlert(
  prev: ProductAlertCycleState,
  next: ProductAlertState,
  productId: string,
): InventoryAlertDecision {
  if (prev.alertState === next) {
    return { status: next, cycle: prev.cycle, alert: null, dedupeKey: null }
  }

  // Entering an attention state opens a NEW cycle.
  if (prev.alertState === 'NORMAL') {
    const cycle = prev.cycle + 1
    const alert: InventoryAlertType =
      next === 'OUT_OF_STOCK' ? 'inventory.out_of_stock' : 'inventory.low_stock'
    return { status: next, cycle, alert, dedupeKey: alertKey(alert, productId, cycle) }
  }

  // Return to normal closes the cycle (back_in_stock is opt-in via prefs).
  if (next === 'NORMAL') {
    return {
      status: 'NORMAL',
      cycle: prev.cycle,
      alert: 'inventory.back_in_stock',
      dedupeKey: alertKey('inventory.back_in_stock', productId, prev.cycle),
    }
  }

  // Moving within attention states (LOW ↔ OUT): same cycle, new state alert.
  const alert: InventoryAlertType =
    next === 'OUT_OF_STOCK' ? 'inventory.out_of_stock' : 'inventory.low_stock'
  return { status: next, cycle: prev.cycle, alert, dedupeKey: alertKey(alert, productId, prev.cycle) }
}

export { getStockStatus, type ProductAlertState }