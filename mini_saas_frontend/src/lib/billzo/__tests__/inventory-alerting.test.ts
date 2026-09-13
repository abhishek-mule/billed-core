import { describe, expect, it } from 'vitest'
import { computeInventoryAlert, getStockStatus } from '../inventory-alerting'
import { collectInventoryReports } from '../inventory-report'

describe('getStockStatus', () => {
  it('classifies stock against the threshold', () => {
    expect(getStockStatus(0, 10)).toBe('OUT_OF_STOCK')
    expect(getStockStatus(-3, 10)).toBe('OUT_OF_STOCK')
    expect(getStockStatus(1, 10)).toBe('LOW_STOCK')
    expect(getStockStatus(10, 10)).toBe('LOW_STOCK')
    expect(getStockStatus(11, 10)).toBe('NORMAL')
    expect(getStockStatus(100, 0)).toBe('NORMAL')
  })
})

describe('computeInventoryAlert', () => {
  const NORMAL = { alertState: 'NORMAL', cycle: 0 } as const

  it('does not alert when a brand-new product is NORMAL', () => {
    const d = computeInventoryAlert(NORMAL, 'NORMAL', 'p1')
    expect(d).toEqual({ status: 'NORMAL', cycle: 0, alert: null, dedupeKey: null })
  })

  it('fires low_stock ONCE when entering LOW_STOCK and opens a cycle', () => {
    const d = computeInventoryAlert(NORMAL, 'LOW_STOCK', 'p1')
    expect(d.status).toBe('LOW_STOCK')
    expect(d.cycle).toBe(1)
    expect(d.alert).toBe('inventory.low_stock')
    expect(d.dedupeKey).toBe('inventory.low_stock:p1:1')
  })

  it('fires out_of_stock when entering OUT_OF_STOCK directly', () => {
    const d = computeInventoryAlert(NORMAL, 'OUT_OF_STOCK', 'p1')
    expect(d.cycle).toBe(1)
    expect(d.alert).toBe('inventory.out_of_stock')
    expect(d.dedupeKey).toBe('inventory.out_of_stock:p1:1')
  })

  it('NEVER re-alerts while the same state lingers (several sales below threshold)', () => {
    expect(computeInventoryAlert({ alertState: 'LOW_STOCK', cycle: 1 }, 'LOW_STOCK', 'p1').alert).toBeNull()
    expect(computeInventoryAlert({ alertState: 'OUT_OF_STOCK', cycle: 1 }, 'OUT_OF_STOCK', 'p1').alert).toBeNull()
  })

  it('escalates LOW_STOCK → OUT_OF_STOCK with a distinct key in the same cycle', () => {
    const d = computeInventoryAlert({ alertState: 'LOW_STOCK', cycle: 3 }, 'OUT_OF_STOCK', 'p1')
    expect(d.status).toBe('OUT_OF_STOCK')
    expect(d.cycle).toBe(3)
    expect(d.alert).toBe('inventory.out_of_stock')
    expect(d.dedupeKey).toBe('inventory.out_of_stock:p1:3')
  })

  it('de-escalates OUT_OF_STOCK → LOW_STOCK with a distinct key in the same cycle', () => {
    const d = computeInventoryAlert({ alertState: 'OUT_OF_STOCK', cycle: 3 }, 'LOW_STOCK', 'p1')
    expect(d.status).toBe('LOW_STOCK')
    expect(d.cycle).toBe(3)
    expect(d.alert).toBe('inventory.low_stock')
    expect(d.dedupeKey).toBe('inventory.low_stock:p1:3')
  })

  it('closes the cycle on return to NORMAL (back_in_stock, same cycle)', () => {
    const d = computeInventoryAlert({ alertState: 'LOW_STOCK', cycle: 2 }, 'NORMAL', 'p1')
    expect(d.status).toBe('NORMAL')
    expect(d.cycle).toBe(2)
    expect(d.alert).toBe('inventory.back_in_stock')
    expect(d.dedupeKey).toBe('inventory.back_in_stock:p1:2')
  })

  it('bumps the cycle ONLY on re-entry after NORMAL so re-alerts get a fresh key', () => {
    const normalLingering = computeInventoryAlert({ alertState: 'LOW_STOCK', cycle: 1 }, 'LOW_STOCK', 'p1')
    expect(normalLingering.alert).toBeNull()

    const restock = computeInventoryAlert({ alertState: 'LOW_STOCK', cycle: 1 }, 'NORMAL', 'p1')
    expect(restock.alert).toBe('inventory.back_in_stock')

    const reDrop = computeInventoryAlert({ alertState: 'NORMAL', cycle: 1 }, 'LOW_STOCK', 'p1')
    expect(reDrop.cycle).toBe(2)
    expect(reDrop.dedupeKey).toBe('inventory.low_stock:p1:2')
    expect(reDrop.dedupeKey).not.toBe('inventory.low_stock:p1:1')
  })
})

describe('collectInventoryReports', () => {
  const products = [
    { id: 'p1', name: 'Chai', lowStockAt: 5 },
    { id: 'p2', name: 'Biscuit', lowStockAt: 10 },
  ]

  it('collapses multiple movements of the same product into one final report', () => {
    const movements = [
      { productId: 'p1', stockAfter: 8 },
      { productId: 'p1', stockAfter: 3 },
      { productId: 'p2', stockAfter: 12 },
    ]
    const reports = collectInventoryReports(movements, products)
    expect(reports).toEqual([
      { productId: 'p1', productName: 'Chai', stock: 3, threshold: 5 },
      { productId: 'p2', productName: 'Biscuit', stock: 12, threshold: 10 },
    ])
  })

  it('ignores movements for unknown products', () => {
    expect(collectInventoryReports([{ productId: 'ghost', stockAfter: 1 }], products)).toEqual([])
  })
})