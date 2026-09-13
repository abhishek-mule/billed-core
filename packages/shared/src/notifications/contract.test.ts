import { describe, it, expect } from 'vitest'
import {
  getStockStatus,
  isStockTransition,
  buildNotification,
  formatRupees,
  notificationDeepLink,
  notificationDeepLinkAbsolute,
  dedupeKeyFor,
  dedupeKeyForEvent,
  defaultNotificationPreferences,
  shouldNotify,
  NOTIFICATION_TYPE_LEVEL,
  NOTIFICATION_TYPE_CATEGORY,
  NOTIFICATION_TYPES,
} from './index'

describe('getStockStatus (spec §4 threshold semantics)', () => {
  it('classifies above-threshold as NORMAL', () => {
    expect(getStockStatus(10, 5)).toBe('NORMAL')
    expect(getStockStatus(6, 5)).toBe('NORMAL')
  })

  it('classifies 0 < stock <= threshold as LOW_STOCK', () => {
    expect(getStockStatus(5, 5)).toBe('LOW_STOCK')
    expect(getStockStatus(4, 5)).toBe('LOW_STOCK')
    expect(getStockStatus(1, 5)).toBe('LOW_STOCK')
  })

  it('classifies stock <= 0 as OUT_OF_STOCK', () => {
    expect(getStockStatus(0, 5)).toBe('OUT_OF_STOCK')
    expect(getStockStatus(-2, 5)).toBe('OUT_OF_STOCK')
  })

  it('only reports a transition when the state actually changes', () => {
    expect(isStockTransition('NORMAL', 'LOW_STOCK')).toBe(true)
    expect(isStockTransition('LOW_STOCK', 'OUT_OF_STOCK')).toBe(true)
    expect(isStockTransition('LOW_STOCK', 'LOW_STOCK')).toBe(false)
    expect(isStockTransition('NORMAL', 'NORMAL')).toBe(false)
  })
})

describe('dedupe keys (spec §12)', () => {
  it('builds entity + state-scoped keys', () => {
    expect(dedupeKeyFor('inventory.low_stock', 'product_456')).toBe('inventory.low_stock:product_456')
    expect(dedupeKeyFor('inventory.low_stock', 'product_456', 'LOW_STOCK')).toBe('inventory.low_stock:product_456:LOW_STOCK')
  })

  it('builds event-sourced keys for exactly-once transition alerts', () => {
    expect(dedupeKeyForEvent('recovery.promise_broken', 'evt_001')).toBe('recovery.promise_broken:evt:evt_001')
  })
})

describe('buildNotification (spec §7 WHAT → WHY → ACTION)', () => {
  it('builds a promise-broken critical alert for the recovery target', () => {
    const n = buildNotification({
      type: 'recovery.promise_broken',
      data: { customerName: 'Rahul Chemical', amount: 6400, targetId: 'cust_123' },
      tenantId: 'tenant_1',
    })
    expect(n.level).toBe('critical')
    expect(n.title).toBe('Rahul Chemical needs your attention')
    expect(n.body).toBe('₹6,400 overdue · promise broken')
    expect(n.action).toBe('Call customer today')
    expect(n.targetType).toBe('customer')
    expect(n.targetId).toBe('cust_123')
    expect(n.dedupeKey).toBe('recovery.promise_broken:cust_123')
  })

  it('deep links recovery to the exact customer screen', () => {
    const n = buildNotification({
      type: 'recovery.promise_broken',
      data: { customerName: 'Rahul Chemical', amount: 6400, targetId: 'cust_123' },
      tenantId: 'tenant_1',
    })
    expect(notificationDeepLink({ targetType: n.targetType, targetId: n.targetId! })).toBe('/recovery/customer/cust_123')
    expect(notificationDeepLinkAbsolute({ targetType: n.targetType, targetId: n.targetId! }, 'https://billzo.in')).toBe(
      'https://billzo.in/recovery/customer/cust_123',
    )
  })

  it('builds a low-stock attention alert for the product target', () => {
    const n = buildNotification({
      type: 'inventory.low_stock',
      data: { productName: 'PVC Pipe', stock: 4, threshold: 5, targetId: 'product_456' },
      tenantId: 'tenant_1',
    })
    expect(n.level).toBe('attention')
    expect(n.title).toBe('PVC Pipe is running low')
    expect(n.body).toBe('4 units remaining · threshold is 5')
    expect(n.action).toBe('View inventory')
    expect(n.targetType).toBe('product')
    expect(notificationDeepLink({ targetType: n.targetType, targetId: n.targetId! })).toBe('/products/product_456')
  })

  it('builds a payment-received info alert targeting the invoice', () => {
    const n = buildNotification({
      type: 'payment.received',
      data: { customerName: 'ABC Traders', amount: 2500, invoiceNumber: 'INV-1024', targetId: 'invoice_9' },
      tenantId: 'tenant_1',
    })
    expect(n.level).toBe('info')
    expect(n.title).toBe('₹2,500 received')
    expect(n.body).toBe('ABC Traders · Invoice INV-1024')
    expect(notificationDeepLink({ targetType: n.targetType, targetId: n.targetId! })).toBe('/invoices/invoice_9')
  })

  it('maps unmatched payments to the payments ledger', () => {
    const n = buildNotification({
      type: 'payment.unmatched',
      data: { amount: 3500, targetId: 'payment_77' },
      tenantId: 'tenant_1',
    })
    expect(n.level).toBe('critical')
    expect(notificationDeepLink({ targetType: n.targetType, targetId: n.targetId! })).toBe('/pulse')
  })

  it('honours an explicit dedupe override (cycle-scoped inventory re-alert)', () => {
    const n = buildNotification({
      type: 'inventory.low_stock',
      data: { productName: 'PVC Pipe', stock: 3, threshold: 5, targetId: 'product_456' },
      tenantId: 'tenant_1',
      dedupeKey: dedupeKeyFor('inventory.low_stock', 'product_456', 'LOW_STOCK:2'),
    })
    expect(n.dedupeKey).toBe('inventory.low_stock:product_456:LOW_STOCK:2')
  })

  it('builds a test notification (system category, info level, center target)', () => {
    const n = buildNotification({
      type: 'notification.test',
      data: { title: 'Test from BillZo', body: 'This is a test.', targetId: 'tenant_1' },
      tenantId: 'tenant_1',
    })
    expect(n.level).toBe('info')
    expect(NOTIFICATION_TYPE_CATEGORY['notification.test']).toBe('system')
    expect(n.action).toBe('Open Notifications')
    expect(notificationDeepLink({ targetType: n.targetType, targetId: n.targetId })).toBe('/notifications')
    expect(shouldNotify(defaultNotificationPreferences(), 'notification.test')).toBe(true)
  })

  it('renders every supported type with non-empty copy', () => {
    for (const type of NOTIFICATION_TYPES) {
      const level = NOTIFICATION_TYPE_LEVEL[type]
      const category = NOTIFICATION_TYPE_CATEGORY[type]
      expect(level).toBeTruthy()
      expect(category).toBeTruthy()
    }
  })
})

describe('formatRupees', () => {
  it('formats Indian number grouping', () => {
    expect(formatRupees(6400)).toBe('₹6,400')
    expect(formatRupees(250000)).toBe('₹2,50,000')
  })
})

describe('preferences (defaults + gate, spec §10)', () => {
  it('echoes defaults with back-in-stock off', () => {
    const p = defaultNotificationPreferences()
    expect(p.pushEnabled).toBe(true)
    expect(p.recovery).toBe(true)
    expect(p.payments).toBe(true)
    expect(p.inventory).toBe(true)
    expect(p.backInStock).toBe(false)
  })

  it('default gate passes all phase-1 types except opt-in back-in-stock', () => {
    const p = defaultNotificationPreferences()
    for (const type of NOTIFICATION_TYPES) {
      if (type === 'inventory.back_in_stock') {
        expect(shouldNotify(p, type)).toBe(false)
      } else {
        expect(shouldNotify(p, type)).toBe(true)
      }
    }
  })

  it('gates back-in-stock behind its opt-in preference', () => {
    const p = defaultNotificationPreferences()
    expect(shouldNotify(p, 'inventory.back_in_stock')).toBe(false)
    expect(shouldNotify({ ...p, backInStock: true, updatedAt: null }, 'inventory.back_in_stock')).toBe(true)
  })

  it('never blocks delivery when preferences are absent (defensive default)', () => {
    expect(shouldNotify(null, 'recovery.promise_broken')).toBe(true)
    expect(shouldNotify(undefined, 'recovery.promise_broken')).toBe(true)
  })
})