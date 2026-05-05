import { db, notifyChanged, seedDemoData, uuid } from './db'
import { createRecoveryAttempt, nextRecoveryAt, nextRecoveryStage } from './recovery'
import { scheduleBackgroundSync, syncPendingQueue } from './sync'
import { getMockSession } from './tenant'
import type {
  Activity,
  BillzoSnapshot,
  Customer,
  InventoryMovement,
  Invoice,
  InvoiceItem,
  Payment,
  Product,
  Purchase,
  QueueItem,
  WhatsAppEvent,
} from './types'

export { syncPendingQueue }

const todayKey = () => new Date().toISOString().slice(0, 10)
const now = () => new Date().toISOString()

type InvoiceWithItems = Invoice & { items: InvoiceItem[] }
type PurchaseWithItems = Purchase & { items: InvoiceItem[] }

function enqueue(entity: QueueItem['entity'], entityId: string, action: QueueItem['action'], payload: unknown) {
  const session = getMockSession()
  const current = now()
  const idempotencyKey = `${session.tenantId}:${entity}:${entityId}:${action}`
  return db().queue.put({
    id: uuid(),
    tenantId: session.tenantId,
    entity,
    entityId,
    action,
    payload,
    createdAt: current,
    updatedAt: current,
    attempts: 0,
    nextAttemptAt: current,
    status: 'pending',
    idempotencyKey,
    conflictPolicy: entity === 'payment' || entity === 'whatsapp_event' ? 'server_authority' : 'latest_write_wins',
  })
}

async function log(label: string, amount?: number, cta?: string) {
  const session = getMockSession()
  const activity: Activity = { id: uuid(), tenantId: session.tenantId, label, amount, cta, createdAt: now() }
  await db().activity.add(activity)
}

export async function ensureBillzoReady() {
  if (typeof indexedDB === 'undefined') return
  localStorage.setItem('billzo_mock_login', JSON.stringify(getMockSession()))
  await seedDemoData()
}

export async function getBillzoState() {
  await ensureBillzoReady()
  const session = getMockSession()
  const [tenant, customers, products, rawInvoices, invoiceItems, rawPurchases, inventoryMovements, payments, whatsappEvents, recoveryAttempts, queue, activity] =
    await Promise.all([
      db().tenants.get(session.tenantId),
      db().customers.where('tenantId').equals(session.tenantId).reverse().sortBy('lastUsedAt'),
      db().products.where('tenantId').equals(session.tenantId).toArray(),
      db().invoices.where('tenantId').equals(session.tenantId).reverse().sortBy('createdAt'),
      db().invoiceItems.where('tenantId').equals(session.tenantId).toArray(),
      db().purchases.where('tenantId').equals(session.tenantId).reverse().sortBy('createdAt'),
      db().inventoryMovements.where('tenantId').equals(session.tenantId).reverse().sortBy('createdAt'),
      db().payments.where('tenantId').equals(session.tenantId).reverse().sortBy('createdAt'),
      db().whatsappEvents.where('tenantId').equals(session.tenantId).reverse().sortBy('occurredAt'),
      db().recoveryAttempts.where('tenantId').equals(session.tenantId).reverse().sortBy('createdAt'),
      db().queue.where('tenantId').equals(session.tenantId).toArray(),
      db().activity.where('tenantId').equals(session.tenantId).reverse().sortBy('createdAt'),
    ])

  const invoices: InvoiceWithItems[] = rawInvoices.map((invoice) => ({
    ...invoice,
    items: invoiceItems.filter((item) => item.invoiceId === invoice.id),
  }))
  const purchases: PurchaseWithItems[] = rawPurchases.map((purchase) => ({
    ...purchase,
    items: invoiceItems.filter((item) => item.invoiceId === purchase.id),
  }))

  const snapshot: BillzoSnapshot = {
    pendingAmount: invoices.filter((i) => i.status !== 'paid').reduce((sum, i) => sum + i.total - i.paidAmount, 0),
    overdueCount: invoices.filter((i) => i.status === 'overdue').length,
    lowStockCount: products.filter((p) => p.stock <= p.lowStockAt).length,
    collectedToday: payments
      .filter((payment) => payment.status === 'success' && payment.createdAt.startsWith(todayKey()))
      .reduce((sum, payment) => sum + payment.amount, 0),
    invoiceCount: invoices.length,
    queueCount: queue.filter((q) => q.status !== 'synced').length,
    failedQueueCount: queue.filter((q) => q.status === 'failed' || q.status === 'conflict').length,
    readReminderCount: whatsappEvents.filter((event) => event.status === 'read').length,
  }

  return {
    session,
    tenant,
    customers,
    products,
    invoices,
    invoiceItems,
    purchases,
    inventoryMovements,
    payments,
    whatsappEvents,
    recoveryAttempts,
    queue,
    activity,
    snapshot,
  }
}

export async function createQuickInvoice(customer: Customer, product: Product, qty = 1) {
  const session = getMockSession()
  const current = now()
  const invoiceId = uuid()
  const item: InvoiceItem = {
    id: uuid(),
    tenantId: session.tenantId,
    invoiceId,
    productId: product.id,
    name: product.name,
    qty,
    price: product.salePrice,
    gstRate: product.gstRate,
    lineTotal: qty * product.salePrice,
    createdAt: current,
    updatedAt: current,
  }
  const invoice: Invoice = {
    id: invoiceId,
    tenantId: session.tenantId,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    total: item.lineTotal,
    paidAmount: 0,
    status: 'unpaid',
    dueAt: current,
    createdAt: current,
    updatedAt: current,
    syncStatus: 'pending',
    recoveryStage: 't0_soft',
    nextRecoveryAt: current,
    lastWhatsAppStatus: 'queued',
    pdfUrl: `/invoice/${invoiceId}`,
    version: 1,
  }
  const stockAfter = Math.max(0, product.stock - qty)
  const movement: InventoryMovement = {
    id: uuid(),
    tenantId: session.tenantId,
    productId: product.id,
    sourceType: 'invoice',
    sourceId: invoice.id,
    qtyDelta: -qty,
    stockAfter,
    createdAt: current,
  }

  await db().transaction(
    'rw',
    [db().invoices, db().invoiceItems, db().products, db().customers, db().inventoryMovements, db().queue, db().activity],
    async () => {
      await db().invoices.add(invoice)
      await db().invoiceItems.add(item)
      await db().products.update(product.id, { stock: stockAfter, updatedAt: current })
      await db().customers.update(customer.id, { lastUsedAt: current, invoiceCount: customer.invoiceCount + 1, updatedAt: current })
      await db().inventoryMovements.add(movement)
      await enqueue('invoice', invoice.id, 'upsert', invoice)
      await enqueue('invoice_item', item.id, 'upsert', item)
      await enqueue('inventory_movement', movement.id, 'upsert', movement)
      await log(`Invoice made for ${customer.name}`, invoice.total, 'Recover')
    }
  )
  notifyChanged()
  scheduleBackgroundSync()
  return { ...invoice, items: [item] }
}

export async function repeatLastInvoice() {
  const state = await getBillzoState()
  const last = state.invoices[0]
  const product = state.products.find((p) => p.id === last?.items[0]?.productId) || state.products[0]
  const customer = state.customers.find((c) => c.id === last?.customerId) || state.customers[0]
  return createQuickInvoice(customer, product, last?.items[0]?.qty || 1)
}

export async function markPaid(invoice: Invoice, amount = invoice.total - invoice.paidAmount) {
  const current = now()
  const paidAmount = Math.min(invoice.total, invoice.paidAmount + amount)
  const status = paidAmount >= invoice.total ? 'paid' : 'partial'
  const payment: Payment = {
    id: uuid(),
    tenantId: invoice.tenantId,
    invoiceId: invoice.id,
    provider: 'cash',
    amount,
    status: 'success',
    createdAt: current,
    updatedAt: current,
    syncStatus: 'pending',
  }

  await db().transaction('rw', [db().invoices, db().payments, db().queue, db().activity], async () => {
    await db().invoices.update(invoice.id, {
      status,
      paidAmount,
      updatedAt: current,
      syncStatus: 'pending',
      nextRecoveryAt: status === 'paid' ? '' : current,
      recoveryStage: status === 'partial' ? 't0_soft' : invoice.recoveryStage,
      version: invoice.version + 1,
    })
    await db().payments.add(payment)
    await enqueue('invoice', invoice.id, 'upsert', { ...invoice, status, paidAmount, updatedAt: current, version: invoice.version + 1 })
    await enqueue('payment', payment.id, 'upsert', payment)
    await log(status === 'paid' ? `Marked paid: ${invoice.customerName}` : `Partial paid: ${invoice.customerName}`, amount)
  })
  notifyChanged()
  scheduleBackgroundSync()
}

export async function sendReminder(invoice: Invoice) {
  const attempt = createRecoveryAttempt(invoice)
  const current = now()
  const event: WhatsAppEvent = {
    id: uuid(),
    tenantId: invoice.tenantId,
    invoiceId: invoice.id,
    recoveryAttemptId: attempt.id,
    providerMessageId: `wamid.test.${attempt.id}`,
    status: 'sent',
    occurredAt: current,
    createdAt: current,
  }
  const nextStage = nextRecoveryStage(invoice.recoveryStage)
  const nextAt = nextRecoveryAt(invoice.recoveryStage, 'sent')

  await db().transaction('rw', [db().invoices, db().recoveryAttempts, db().whatsappEvents, db().queue, db().activity], async () => {
    await db().recoveryAttempts.add({ ...attempt, status: 'sent', sentAt: current, updatedAt: current })
    await db().whatsappEvents.add(event)
    await db().invoices.update(invoice.id, {
      lastWhatsAppStatus: 'sent',
      recoveryStage: nextStage,
      nextRecoveryAt: nextAt,
      updatedAt: current,
      syncStatus: 'pending',
      version: invoice.version + 1,
    })
    await enqueue('recovery_attempt', attempt.id, 'send_whatsapp', attempt)
    await enqueue('whatsapp_event', event.id, 'upsert', event)
    await log(`WhatsApp sent to ${invoice.customerName}`, invoice.total - invoice.paidAmount, 'Collect')
  })
  notifyChanged()
  scheduleBackgroundSync()
  return `https://wa.me/91${invoice.customerPhone}?text=${encodeURIComponent(attempt.message)}`
}

export async function applyWhatsAppStatus(invoice: Invoice, status: WhatsAppEvent['status']) {
  const current = now()
  const event: WhatsAppEvent = {
    id: uuid(),
    tenantId: invoice.tenantId,
    invoiceId: invoice.id,
    status,
    occurredAt: current,
    createdAt: current,
  }

  await db().transaction('rw', [db().invoices, db().whatsappEvents, db().queue, db().activity], async () => {
    await db().whatsappEvents.add(event)
    await db().invoices.update(invoice.id, {
      lastWhatsAppStatus: status,
      nextRecoveryAt: nextRecoveryAt(invoice.recoveryStage, status),
      updatedAt: current,
    })
    await enqueue('whatsapp_event', event.id, 'upsert', event)
    await log(`WhatsApp ${status}: ${invoice.customerName}`, invoice.total - invoice.paidAmount)
  })
  notifyChanged()
  scheduleBackgroundSync()
}

export async function createPurchaseFromScan(overrides?: Partial<Purchase>) {
  const session = getMockSession()
  const state = await getBillzoState()
  const product = state.products[0]
  const current = now()
  const purchase: Purchase = {
    id: uuid(),
    tenantId: session.tenantId,
    supplier: overrides?.supplier || 'Shree Distributor',
    gstin: overrides?.gstin || '27ABCDE1234F1Z5',
    amount: overrides?.amount || 2820,
    source: 'scan',
    createdAt: current,
    updatedAt: current,
    syncStatus: 'pending',
    version: 1,
  }
  const item: InvoiceItem = {
    id: uuid(),
    tenantId: session.tenantId,
    invoiceId: purchase.id,
    productId: product.id,
    name: product.name,
    qty: 10,
    price: product.purchasePrice,
    gstRate: product.gstRate,
    lineTotal: 10 * product.purchasePrice,
    createdAt: current,
    updatedAt: current,
  }
  const stockAfter = product.stock + item.qty
  const movement: InventoryMovement = {
    id: uuid(),
    tenantId: session.tenantId,
    productId: product.id,
    sourceType: 'purchase',
    sourceId: purchase.id,
    qtyDelta: item.qty,
    stockAfter,
    createdAt: current,
  }

  await db().transaction('rw', [db().purchases, db().invoiceItems, db().products, db().inventoryMovements, db().queue, db().activity], async () => {
    await db().purchases.add(purchase)
    await db().invoiceItems.add(item)
    await db().products.update(product.id, { stock: stockAfter, updatedAt: current })
    await db().inventoryMovements.add(movement)
    await enqueue('purchase', purchase.id, 'upsert', purchase)
    await enqueue('invoice_item', item.id, 'upsert', item)
    await enqueue('inventory_movement', movement.id, 'upsert', movement)
    await log(`Purchase scanned: ${purchase.supplier}`, purchase.amount, 'Stock updated')
  })
  notifyChanged()
  scheduleBackgroundSync()
  return { ...purchase, items: [item] }
}

export async function simulateRazorpay(invoice: Invoice, outcome: 'success' | 'failure') {
  if (outcome === 'success') return markPaid(invoice)
  const current = now()
  const payment: Payment = {
    id: uuid(),
    tenantId: invoice.tenantId,
    invoiceId: invoice.id,
    provider: 'razorpay_test',
    amount: invoice.total - invoice.paidAmount,
    status: 'failed',
    createdAt: current,
    updatedAt: current,
    syncStatus: 'pending',
  }
  await db().transaction('rw', [db().payments, db().queue, db().activity], async () => {
    await db().payments.add(payment)
    await enqueue('payment', payment.id, 'razorpay_test', payment)
    await log(`Razorpay test failed: ${invoice.customerName}`, payment.amount, 'Retry')
  })
  notifyChanged()
  scheduleBackgroundSync()
}

export async function unlockPaywallWithRazorpayTest(outcome: 'success' | 'failure') {
  const session = getMockSession()
  const current = now()
  const payment: Payment = {
    id: uuid(),
    tenantId: session.tenantId,
    provider: 'razorpay_test',
    providerPaymentId: `pay_test_${uuid()}`,
    amount: 999,
    status: outcome === 'success' ? 'success' : 'failed',
    createdAt: current,
    updatedAt: current,
    syncStatus: 'pending',
  }

  await db().transaction('rw', [db().tenants, db().payments, db().queue, db().activity], async () => {
    await db().payments.add(payment)
    await enqueue('payment', payment.id, 'razorpay_test', payment)
    if (outcome === 'success') {
      await db().tenants.update(session.tenantId, { paywallUnlocked: true, plan: 'growth', updatedAt: current })
      const tenant = await db().tenants.get(session.tenantId)
      await enqueue('tenant', session.tenantId, 'upsert', { ...tenant, paywallUnlocked: true, plan: 'growth', updatedAt: current })
      await log('Razorpay test unlocked Growth plan', payment.amount)
    } else {
      await log('Razorpay test payment failed', payment.amount, 'Retry')
    }
  })
  notifyChanged()
  scheduleBackgroundSync()
}
