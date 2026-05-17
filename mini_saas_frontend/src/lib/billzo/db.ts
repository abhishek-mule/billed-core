'use client'

import Dexie, { type Table } from 'dexie'
import type {
  Activity,
  Customer,
  DeviceToken,
  InventoryMovement,
  Invoice,
  InvoiceItem,
  Payment,
  Product,
  Purchase,
  QueueItem,
  RecoveryAttempt,
  Tenant,
  WhatsAppEvent,
} from './types'

export interface User {
  id: string
  phone: string
  email?: string
  name?: string
  createdAt: string
  updatedAt: string
}

class BillzoDB extends Dexie {
  tenants!: Table<Tenant, string>
  users!: Table<User, string>
  customers!: Table<Customer, string>
  products!: Table<Product, string>
  invoices!: Table<Invoice, string>
  invoiceItems!: Table<InvoiceItem, string>
  purchases!: Table<Purchase, string>
  inventoryMovements!: Table<InventoryMovement, string>
  payments!: Table<Payment, string>
  whatsappEvents!: Table<WhatsAppEvent, string>
  recoveryAttempts!: Table<RecoveryAttempt, string>
  queue!: Table<QueueItem, string>
  activity!: Table<Activity, string>
  deviceTokens!: Table<DeviceToken, string>
  otps!: Table<{ id: string; phone: string; hash: string; createdAt: number }, string>
  sessions!: Table<import('@/lib/billzo/auth-store').Session & { id: string }, string>

  constructor() {
    super('billzo_production_v1')
    this.version(1).stores({
      tenants: 'id, ownerUserId, updatedAt',
      users: 'id, phone, email, createdAt',
      customers: 'id, tenantId, name, phone, whatsapp_number, gstin, opt_in, lastUsedAt, updatedAt',
      products: 'id, tenantId, barcode, name, stock, updatedAt',
      invoices: 'id, tenantId, status, customerName, dueAt, nextRecoveryAt, lastWhatsAppStatus, updatedAt, syncStatus',
      invoiceItems: 'id, tenantId, invoiceId, productId, updatedAt',
      purchases: 'id, tenantId, supplier, createdAt, updatedAt, syncStatus',
      inventoryMovements: 'id, tenantId, productId, sourceType, sourceId, createdAt',
      payments: 'id, tenantId, invoiceId, provider, status, createdAt, syncStatus',
      whatsappEvents: 'id, tenantId, invoiceId, recoveryAttemptId, status, occurredAt',
      recoveryAttempts: 'id, tenantId, invoiceId, stage, status, scheduledAt, updatedAt',
      queue: 'id, tenantId, status, entity, entityId, nextAttemptAt, idempotencyKey',
      activity: 'id, tenantId, createdAt',
      deviceTokens: 'id, tenantId, fcmToken, deviceType, createdAt',
    }).version(2).stores({
      otps: 'id, phone, createdAt',
      sessions: 'id, sessionId, userId, phone, tenantId, createdAt',
    })
  }
}

let instance: BillzoDB | null = null

export function db() {
  if (!instance) instance = new BillzoDB()
  return instance
}

export function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function notifyChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('billzo:changed'))
  }
}

export interface SampleDataLoaderOptions {
  customerNames?: string[]
  customerPhones?: string[]
  productNames?: string[]
  productPrices?: number[]
  productGstRates?: number[]
}

export async function loadSampleData(
  tenantId: string,
  tenantName: string,
  ownerUserId: string,
  options?: SampleDataLoaderOptions
): Promise<void> {
  const database = db()
  const existing = await database.customers.where('tenantId').equals(tenantId).count()
  if (existing > 0) return

  const current = new Date().toISOString()
  const overdueDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()

  const customerNames = options?.customerNames ?? ['Rahul Sharma', 'Priya Patel', 'Amit Kumar']
  const customerPhones = options?.customerPhones ?? ['9876543210', '9810012300', '9820012345']
  const productNames = options?.productNames ?? ['LED Bulb 9W', 'USB Cable Type-C', 'Mobile Cover']
  const productPrices = options?.productPrices ?? [150, 299, 199]
  const productGstRates = options?.productGstRates ?? [18, 18, 12]

  const customers: Customer[] = customerNames.map((name, i) => ({
    id: uuid(),
    tenantId,
    name,
    phone: customerPhones[i] || '9876543210',
    defaultTone: 'hinglish' as const,
    lastUsedAt: current,
    invoiceCount: 0,
    createdAt: current,
    updatedAt: current,
  }))

  const products: Product[] = productNames.map((name, i) => ({
    id: uuid(),
    tenantId,
    name,
    barcode: `${1000000000000 + i}`,
    hsn: '9405',
    gstRate: productGstRates[i] ?? 18,
    stock: 15,
    lowStockAt: 5,
    salePrice: productPrices[i] ?? 100,
    purchasePrice: Math.round((productPrices[i] ?? 100) * 0.7),
    createdAt: current,
    updatedAt: current,
  }))

  const invoices: Invoice[] = customers.slice(0, 2).map((c, i) => {
    const invId = uuid()
    const dueDate = new Date(Date.now() + (i === 0 ? -2 : 5) * 24 * 60 * 60 * 1000).toISOString()
    return {
      id: invId,
      tenantId,
      customerId: c.id,
      customerName: c.name,
      customerPhone: c.phone,
      total: productPrices[i] ?? 100,
      paidAmount: i === 0 ? 0 : Math.round((productPrices[i] ?? 100) * 0.5),
      status: i === 0 ? 'overdue' : 'partial' as const,
      dueAt: dueDate,
      createdAt: current,
      updatedAt: current,
      syncStatus: 'pending' as const,
      recoveryStage: 't0_soft' as const,
      nextRecoveryAt: dueDate,
      lastWhatsAppStatus: 'queued' as const,
      reminderCount: 0 as const,
      pdfUrl: `/invoice/${invId}`,
      version: 1,
    }
  })

  const invoiceItems: InvoiceItem[] = invoices.map((inv, i) => ({
    id: uuid(),
    tenantId,
    invoiceId: inv.id,
    productId: products[i]?.id,
    name: products[i]?.name ?? 'Product',
    qty: 1,
    price: productPrices[i] ?? 100,
    gstRate: productGstRates[i] ?? 18,
    lineTotal: productPrices[i] ?? 100,
    createdAt: current,
    updatedAt: current,
  }))

  const activities: Activity[] = [
    {
      id: uuid(),
      tenantId,
      label: `Welcome! ${tenantName} is ready to use.`,
      createdAt: current,
    },
    {
      id: uuid(),
      tenantId,
      label: 'Add products and start creating invoices.',
      createdAt: current,
    },
  ]

  await database.transaction(
    'rw',
    [
      database.customers,
      database.products,
      database.invoices,
      database.invoiceItems,
      database.activity,
    ],
    async () => {
      await database.customers.bulkAdd(customers)
      await database.products.bulkAdd(products)
      await database.invoices.bulkAdd(invoices)
      await database.invoiceItems.bulkAdd(invoiceItems)
      await database.activity.bulkAdd(activities)
    }
  )
}