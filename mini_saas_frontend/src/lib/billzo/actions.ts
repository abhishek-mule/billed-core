'use client'

import { db, notifyChanged, uuid, loadSampleData } from './db'
import { createRecoveryAttempt, nextRecoveryAt, nextRecoveryStage } from './recovery'
import { scheduleBackgroundSync, syncPendingQueue } from './sync'
import { getActiveSession, getTenantId } from './tenant'
import { isPaywallBlocked, type PlanType } from './plan-limits'
import { trackEvent, events } from './analytics'
import { triggerWhatsAppNotification, triggerPushNotification } from './automation'
import type { RecoveryAttempt } from './types'
import type {
  Activity,
  BillzoSnapshot,
  Customer,
  Invoice,
  InvoiceItem,
  InventoryMovement,
  Payment,
  Product,
  QueueItem,
} from './types'

export { syncPendingQueue }
export { scheduleBackgroundSync }

const now = () => new Date().toISOString()
const todayKey = () => now().slice(0, 10)

type InvoiceWithItems = Invoice & { items: InvoiceItem[] }

export interface ActionResult<T = void> {
  success: boolean
  data?: T extends void ? never : T
  error?: string
  blocked?: 'paywall'
  blockType?: 'invoice' | 'reminder'
}

function getSession() {
  const session = getActiveSession()
  console.log('[Actions] getActiveSession:', session)
  if (!session) throw new Error('No active session. Please log in again.')
  return session
}

function getTenantIdLocal(): string | null {
  return getTenantId()
}

async function log(label: string, amount?: number, cta?: string) {
  const session = getSession()
  const activity: Activity = { id: uuid(), tenantId: session.tenantId, label, amount, cta, createdAt: now() }
  await db().activity.add(activity)
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

export async function checkPaywallAccess(action: 'invoice' | 'reminder'): Promise<ActionResult> {
  const tenantId = getTenantIdLocal()
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
    return { success: false, error: 'Paywall check failed. Please try again.', blocked: 'paywall' }
  }
}

export async function ensureBillzoReady() {
  if (typeof indexedDB === 'undefined') return

  const tenantId = getTenantIdLocal()
  const userId = localStorage.getItem('userId')
  const tenantName = localStorage.getItem('tenantName')
  if (!tenantId || !userId) return

  const tenant = await db().tenants.get(tenantId)
  if (!tenant) return

  await loadSampleData(tenantId, tenantName || 'My Shop', userId)
}

export async function getBillzoState() {
  await ensureBillzoReady()
  const session = getSession()

  const tenant = await db().tenants.get(session.tenantId)
  if (!tenant) return null

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
  const purchases = rawPurchases.map((purchase) => ({
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
  if (!product) {
    return { success: false, error: 'No products found. Please add a product first.' }
  }

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
    reminderCount: 0,
    pdfUrl: `/invoice/${invoiceId}`,
    version: 1,
  }
  try {
    const tenantId = getTenantIdLocal()
    const currentTenant = tenantId ? await db().tenants.get(tenantId) : null

    await db().transaction(
      'rw',
      [db().invoices, db().invoiceItems, db().products, db().customers, db().inventoryMovements, db().tenants, db().queue, db().activity],
      async () => {
        const latestProduct = await db().products.get(product.id)
        if (!latestProduct) {
          throw new Error('Product no longer exists.')
        }
        if (latestProduct.stock < qty) {
          throw new Error(`Not enough stock for ${latestProduct.name}. Only ${latestProduct.stock} left.`)
        }

        const stockAfter = latestProduct.stock - qty
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

        await db().invoices.add(invoice)
        await db().invoiceItems.add(item)
        await db().products.update(product.id, { stock: stockAfter, updatedAt: current })
        await db().customers.update(customer.id, { lastUsedAt: current, invoiceCount: (customer.invoiceCount || 0) + 1, updatedAt: current })
        await db().inventoryMovements.add(movement)
        if (tenantId && currentTenant) {
          await db().tenants.update(tenantId, {
            invoiceCount: (currentTenant.invoiceCount || 0) + 1,
            updatedAt: current,
          })
        }
        await enqueue('invoice', invoice.id, 'upsert', invoice)
        await enqueue('invoice_item', item.id, 'upsert', item)
        await enqueue('product', product.id, 'upsert', { ...latestProduct, stock: stockAfter, updatedAt: current })
        await log(`Invoice for ${customer.name}`, invoice.total, 'Recover')
      }
    )

    notifyChanged()
    scheduleBackgroundSync()
    return { success: true, data: { ...invoice, items: [item] } }
  } catch (error) {
    console.error('Failed to create invoice:', error)
    return { success: false, error: 'Failed to create invoice. Please try again.' }
  }
}

export async function repeatLastInvoice(): Promise<ActionResult> {
  const state = await getBillzoState()
  if (!state) return { success: false, error: 'Session not found' }

  if (state.invoices.length === 0) {
    return { success: false, error: 'No previous invoice found. Create your first invoice to use this feature.' }
  }
  if (state.products.length === 0) {
    return { success: false, error: 'No products found. Please add a product first.' }
  }
  if (state.customers.length === 0) {
    return { success: false, error: 'No customers found. Please add a customer first.' }
  }

  const last = state.invoices[0]
  const product = last?.items[0]?.productId
    ? state.products.find((p) => p.id === last.items[0].productId) || state.products[0]
    : state.products[0]
  const customer = last?.customerId
    ? state.customers.find((c) => c.id === last.customerId) || state.customers[0]
    : state.customers[0]

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
    return { success: false, error: 'Failed to mark payment. Please try again.' }
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

  const event = {
    id: uuid(),
    tenantId: invoice.tenantId,
    invoiceId: invoice.id,
    recoveryAttemptId: attempt.id,
    providerMessageId: `wamid.test.${attempt.id}`,
    status: 'sent' as const,
    occurredAt: current,
    createdAt: current,
  }
  const nextStage = nextRecoveryStage(invoice.recoveryStage)
  const nextAt = nextRecoveryAt(invoice.recoveryStage, 'sent')

  try {
    const tenantId = getTenantIdLocal()
    const currentTenant = tenantId ? await db().tenants.get(tenantId) : null

    await db().transaction(
      'rw',
      [db().invoices, db().recoveryAttempts, db().whatsappEvents, db().tenants, db().queue, db().activity],
      async () => {
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
        if (tenantId && currentTenant) {
          await db().tenants.update(tenantId, {
            invoiceCount: (currentTenant.invoiceCount || 0) + 1,
            updatedAt: current,
          })
        }
        await enqueue('recovery_attempt', attempt.id, 'send_whatsapp', attempt)
        await enqueue('whatsapp_event', event.id, 'upsert', event)
        await log(`WhatsApp sent to ${invoice.customerName}`, invoice.total - invoice.paidAmount, 'Collect')
      }
    )

    notifyChanged()
    scheduleBackgroundSync()
    return { success: true }
  } catch (error) {
    console.error('Failed to send reminder:', error)
    return { success: false, error: 'Failed to send reminder. Please try again.' }
  }
}

export async function applyWhatsAppStatus(invoice: Invoice, status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed'): Promise<ActionResult> {
  const current = now()
  const event = {
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
    return { success: false, error: 'Failed to update status. Please try again.' }
  }
}

export interface POSCartItem {
  id: string
  name: string
  qty: number
  salePrice: number
  gstRate: number
  stock: number
  lowStockAt: number
}

export async function handlePOSInvoice(
  cart: POSCartItem[],
  customerName: string,
  customerPhone: string,
  method: 'upi' | 'cash' | 'udhar'
): Promise<ActionResult> {
  if (cart.length === 0) {
    return { success: false, error: 'Cart is empty. Add items before billing.' }
  }

  const paywallCheck = await checkPaywallAccess('invoice')
  if (!paywallCheck.success && paywallCheck.blocked === 'paywall') {
    return { success: false, error: paywallCheck.error, blocked: 'paywall', blockType: paywallCheck.blockType }
  }

  const session = getSession()
  const current = now()
  const invoiceId = uuid()
  const total = cart.reduce((sum, item) => sum + item.salePrice * item.qty, 0)
  const paidAmount = method === 'udhar' ? 0 : total

  const tenantId = getTenantIdLocal()
  const currentTenant = tenantId ? await db().tenants.get(tenantId) : null
  const nextCounter = (currentTenant?.invoiceNumberCounter || 0) + 1
  const fy = (() => {
    const d = new Date(); const y = d.getFullYear(); const m = d.getMonth() + 1
    return m >= 4 ? `${y}-${(y + 1).toString().slice(2)}` : `${y - 1}-${y.toString().slice(2)}`
  })()
  const prefix = (currentTenant?.name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'BIZ'
  const invoiceNumber = `${prefix}-${fy}-${String(nextCounter).padStart(6, '0')}`

  const invoice: Invoice & { paymentMode?: string } = {
    id: invoiceId,
    tenantId: session.tenantId,
    customerId: '',
    customerName: customerName || 'Walk-in Customer',
    customerPhone: customerPhone || '',
    total,
    paidAmount,
    status: method === 'udhar' ? 'unpaid' : 'paid',
    invoiceNumber,
    dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: current,
    updatedAt: current,
    syncStatus: 'pending',
    recoveryStage: 't0_soft',
    nextRecoveryAt: current,
    lastWhatsAppStatus: 'queued',
    reminderCount: 0,
    pdfUrl: `/invoice/${invoiceId}`,
    version: 1,
    paymentMode: method,
  }

  const items: InvoiceItem[] = cart.map((item) => ({
    id: uuid(),
    tenantId: session.tenantId,
    invoiceId,
    productId: item.id,
    name: item.name,
    qty: item.qty,
    price: item.salePrice,
    gstRate: item.gstRate,
    lineTotal: item.salePrice * item.qty,
    createdAt: current,
    updatedAt: current,
  }))
  const payment: Payment | null = method === 'udhar'
    ? null
    : {
        id: uuid(),
        tenantId: session.tenantId,
        invoiceId,
        provider: method,
        amount: total,
        status: 'success',
        createdAt: current,
        updatedAt: current,
        syncStatus: 'pending',
      }

  try {
    const tenantId = getTenantIdLocal()
    const currentTenant = tenantId ? await db().tenants.get(tenantId) : null
    const appliedMovements: InventoryMovement[] = []
    const updatedProducts: Product[] = []

    await db().transaction(
      'rw',
      [db().invoices, db().invoiceItems, db().products, db().inventoryMovements, db().payments, db().tenants, db().queue, db().activity],
      async () => {
        await db().invoices.add(invoice)

        for (const item of items) {
          await db().invoiceItems.add(item)
        }
        if (payment) {
          await db().payments.add(payment)
        }

        for (const cartItem of cart) {
          const latestProduct = await db().products.get(cartItem.id)
          if (!latestProduct) {
            throw new Error(`${cartItem.name} is no longer available.`)
          }
          if (latestProduct.stock < cartItem.qty) {
            throw new Error(`Not enough stock for ${latestProduct.name}. Only ${latestProduct.stock} left.`)
          }

          const movement: InventoryMovement = {
            id: uuid(),
            tenantId: session.tenantId,
            productId: cartItem.id,
            sourceType: 'invoice',
            sourceId: invoiceId,
            qtyDelta: -cartItem.qty,
            stockAfter: latestProduct.stock - cartItem.qty,
            createdAt: current,
          }

          appliedMovements.push(movement)
          updatedProducts.push({ ...latestProduct, stock: movement.stockAfter, updatedAt: current })
          await db().products.update(movement.productId, { stock: movement.stockAfter, updatedAt: current })
          await db().inventoryMovements.add(movement)
        }

        if (tenantId && currentTenant) {
          await db().tenants.update(tenantId, {
            invoiceCount: (currentTenant.invoiceCount || 0) + 1,
            invoiceNumberCounter: nextCounter,
            updatedAt: current,
          })
        }

        await enqueue('invoice', invoice.id, 'upsert', invoice)
        for (const item of items) {
          await enqueue('invoice_item', item.id, 'upsert', item)
        }
        for (const updatedProduct of updatedProducts) {
          await enqueue('product', updatedProduct.id, 'upsert', updatedProduct)
        }
        if (payment) {
          await enqueue('payment', payment.id, 'upsert', payment)
        }
        await log(`POS sale: ${customerName || 'Walk-in'}`, total, method.toUpperCase())
      }
    )

    notifyChanged()
    scheduleBackgroundSync()

    // --- AUTOMATIONS ---
    const tenantName = (typeof localStorage !== 'undefined' ? localStorage.getItem('tenantName') : null) || 'BillZo'

    // 1. WhatsApp Invoice
    if (customerPhone && customerPhone.length >= 10) {
      triggerWhatsAppNotification({
        type: 'welcome',
        phone: customerPhone,
        ownerName: customerName,
        shopName: tenantName,
        siteUrl: `https://billzo.in/i/${invoiceId}`,
        email: 'invoice@billzo.in'
      });
    }

    // 2. Low Stock Alerts
    for (const m of appliedMovements) {
      const product = cart.find(c => c.id === m.productId);
      if (product && m.stockAfter <= product.lowStockAt) {
        // Push notification to merchant
        triggerPushNotification(session.tenantId, {
          title: 'Low Stock Alert ⚠️',
          body: `${product.name} is running low (${m.stockAfter} left). Reorder soon!`,
          type: 'low_stock'
        });

        // WhatsApp alert to merchant
        triggerWhatsAppNotification({
          type: 'lowStock',
          phone: session.phone || '', // Merchant's phone
          shopName: tenantName,
          itemName: product.name,
          currentStock: m.stockAfter,
          reorderLevel: product.lowStockAt
        });
      }
    }

    if (method !== 'udhar') {
      trackEvent(session.tenantId, events.invoice_paid, { invoiceId, total, method })
    } else {
      trackEvent(session.tenantId, events.invoice_created, { invoiceId, total, customer: customerName })
    }

    return { success: true, data: { ...invoice, items } as any }
  } catch (error) {
    console.error('Failed to create POS invoice:', error)
    return { success: false, error: 'Failed to create invoice. Please try again.' }
  }
}

