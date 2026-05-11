import { db, notifyChanged, seedDemoData, uuid } from './db'
import { createRecoveryAttempt, nextRecoveryAt, nextRecoveryStage } from './recovery'
import { scheduleBackgroundSync, syncPendingQueue } from './sync'
import { getActiveSession, getTenantId } from './tenant'
import { isPaywallBlocked, type PlanType } from './plan-limits'
import type { RecoveryAttempt } from './types'
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

export interface ActionResult<T = void> {
  success: boolean
  data?: T extends void ? never : T
  error?: string
  blocked?: 'paywall'
  blockType?: 'invoice' | 'reminder'
}

function getSession() {
  const tenantId = getTenantId()
  if (!tenantId) {
    return getActiveSession()
  }
  return getActiveSession()
}

async function incrementUsage(action: 'invoice' | 'reminder'): Promise<void> {
  const tenantId = getTenantId()
  if (!tenantId) return

  try {
    await fetch('/api/paywall/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, action }),
    })
  } catch {
    console.warn('Failed to sync usage to server')
  }
}

function enqueue(entity: QueueItem['entity'], entityId: string, action: QueueItem['action'], payload: unknown) {
  const session = getSession()
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
  const session = getSession()
  const activity: Activity = { id: uuid(), tenantId: session.tenantId, label, amount, cta, createdAt: now() }
  await db().activity.add(activity)
}

export async function checkPaywallAccess(action: 'invoice' | 'reminder'): Promise<ActionResult> {
  const tenantId = getTenantId()
  if (!tenantId) {
    return { success: true }
  }

  try {
    const tenant = await db().tenants.get(tenantId)
    if (!tenant) {
      return { success: true }
    }

    const plan = (tenant.plan || 'starter') as PlanType
    const paywall = isPaywallBlocked(tenant.invoiceCount || 0, tenant.reminderCount || 0, plan)

    if (paywall.blocked && paywall.type) {
      return {
        success: false,
        blocked: 'paywall',
        blockType: paywall.type,
        error: `You've reached your ${paywall.type} limit. Upgrade to Pro for unlimited access.`,
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Paywall check failed:', error)
    return { success: true }
  }
}

export async function ensureBillzoReady() {
  if (typeof indexedDB === 'undefined') return

  const tenantId = getTenantId()
  if (!tenantId) {
    return
  }

  await seedDemoData()
}

export async function getBillzoState() {
  await ensureBillzoReady()
  const session = getSession()

  const tenant = await db().tenants.get(session.tenantId)
  if (!tenant) {
    return null
  }

  const [customers, products, rawInvoices, invoiceItems, rawPurchases, inventoryMovements, payments, whatsappEvents, recoveryAttempts, queue, activity] =
    await Promise.all([
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

export async function createQuickInvoice(customer: Customer, product: Product, qty = 1): Promise<ActionResult<InvoiceWithItems | undefined>> {
  const paywallCheck = await checkPaywallAccess('invoice')
  if (!paywallCheck.success && paywallCheck.blocked === 'paywall') {
    return { success: false, error: paywallCheck.error, blocked: 'paywall', blockType: paywallCheck.blockType }
  }

  const session = getSession()
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

  try {
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

    const tenantId = getTenantId()
    if (tenantId) {
      await db().tenants.update(tenantId, {
        invoiceCount: (await db().tenants.get(tenantId))!.invoiceCount + 1,
        updatedAt: current,
      })
    }

    await incrementUsage('invoice')
    notifyChanged()
    scheduleBackgroundSync()

    return { success: true, data: { ...invoice, items: [item] } }
  } catch (error) {
    console.error('Failed to create invoice:', error)
    return { success: false, error: 'Failed to create invoice' }
  }
}

export async function repeatLastInvoice(): Promise<ActionResult> {
  const state = await getBillzoState()
  if (!state) {
    return { success: false, error: 'Session not found' }
  }

  const last = state.invoices[0]
  const product = state.products.find((p) => p.id === last?.items[0]?.productId) || state.products[0]
  const customer = state.customers.find((c) => c.id === last?.customerId) || state.customers[0]

  if (!product || !customer) {
    return { success: false, error: 'No products or customers found' }
  }

  const result = await createQuickInvoice(customer, product, last?.items[0]?.qty || 1)
  if (!result.success) {
    return { success: false, error: result.error, blocked: result.blocked, blockType: result.blockType }
  }
  return { success: true }
}

export async function markPaid(invoice: Invoice, amount = invoice.total - invoice.paidAmount): Promise<ActionResult> {
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

  try {
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
    return { success: true }
  } catch (error) {
    console.error('Failed to mark paid:', error)
    return { success: false, error: 'Failed to mark payment' }
  }
}

export async function sendReminder(invoice: Invoice): Promise<ActionResult> {
  const paywallCheck = await checkPaywallAccess('reminder')
  if (!paywallCheck.success && paywallCheck.blocked === 'paywall') {
    return paywallCheck
  }

  const current = now()

  let attempt: RecoveryAttempt
  try {
    const { createRecoveryAttemptWithAI } = await import('./recovery')
    attempt = await createRecoveryAttemptWithAI(invoice, invoice.recoveryStage, {
      language: 'hinglish',
      businessName: localStorage.getItem('tenantName') || 'BillZo',
    })
  } catch {
    const { createRecoveryAttempt } = await import('./recovery')
    attempt = createRecoveryAttempt(invoice)
  }

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

  try {
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

    const tenantId = getTenantId()
    if (tenantId) {
      await db().tenants.update(tenantId, {
        reminderCount: ((await db().tenants.get(tenantId))?.reminderCount || 0) + 1,
        updatedAt: current,
      })
    }

    await incrementUsage('reminder')
    notifyChanged()
    scheduleBackgroundSync()

    return { success: true }
  } catch (error) {
    console.error('Failed to send reminder:', error)
    return { success: false, error: 'Failed to send reminder' }
  }
}

export async function applyWhatsAppStatus(invoice: Invoice, status: WhatsAppEvent['status']): Promise<ActionResult> {
  const current = now()
  const event: WhatsAppEvent = {
    id: uuid(),
    tenantId: invoice.tenantId,
    invoiceId: invoice.id,
    status,
    occurredAt: current,
    createdAt: current,
  }

  try {
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
    return { success: true }
  } catch (error) {
    console.error('Failed to apply WhatsApp status:', error)
    return { success: false, error: 'Failed to update status' }
  }
}

export async function createPurchaseFromScan(overrides?: Partial<Purchase>): Promise<ActionResult> {
  const session = getSession()
  const state = await getBillzoState()
  if (!state || state.products.length === 0) {
    return { success: false, error: 'No products found' }
  }

  const product = state.products[0]
  const current = now()
  const purchase: Purchase = {
    id: uuid(),
    tenantId: session.tenantId,
    supplier: overrides?.supplier || 'Supplier',
    gstin: overrides?.gstin || '',
    amount: overrides?.amount || 0,
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
    qty: 1,
    price: product.purchasePrice,
    gstRate: product.gstRate,
    lineTotal: product.purchasePrice,
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

  try {
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
    return { success: true }
  } catch (error) {
    console.error('Failed to create purchase:', error)
    return { success: false, error: 'Failed to create purchase' }
  }
}
