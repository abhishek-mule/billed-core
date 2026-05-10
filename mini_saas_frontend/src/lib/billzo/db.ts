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

  constructor() {
    super('billzo_production_v1')
    this.version(1).stores({
      tenants: 'id, ownerUserId, updatedAt',
      users: 'id, phone, email, createdAt',
      customers: 'id, tenantId, name, phone, lastUsedAt, updatedAt',
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

export async function seedDemoData() {
  const database = db()
  const count = await database.tenants.count()
  if (count > 0) return

  const tenantId = localStorage.getItem('tenantId')
  const businessName = localStorage.getItem('tenantName')

  if (!tenantId) return

  const current = new Date()
  const overdueDate = new Date(current)
  overdueDate.setDate(current.getDate() - 2)

  const tenant: Tenant = {
    id: tenantId,
    name: businessName || 'My Shop',
    ownerUserId: localStorage.getItem('userId') || '',
    plan: 'starter',
    paywallUnlocked: false,
    invoiceCount: 0,
    reminderCount: 0,
    createdAt: current.toISOString(),
    updatedAt: current.toISOString(),
  }

  const customers: Customer[] = [
    {
      id: uuid(),
      tenantId,
      name: 'Customer A',
      phone: '9876543210',
      defaultTone: 'hinglish',
      lastUsedAt: current.toISOString(),
      invoiceCount: 0,
      createdAt: current.toISOString(),
      updatedAt: current.toISOString(),
    },
    {
      id: uuid(),
      tenantId,
      name: 'Customer B',
      phone: '9810012300',
      defaultTone: 'hindi',
      lastUsedAt: current.toISOString(),
      invoiceCount: 0,
      createdAt: current.toISOString(),
      updatedAt: current.toISOString(),
    },
  ]

  const products: Product[] = [
    {
      id: uuid(),
      tenantId,
      name: 'Sample Product 1',
      barcode: '1234567890123',
      hsn: '1234',
      gstRate: 18,
      stock: 10,
      lowStockAt: 5,
      salePrice: 100,
      purchasePrice: 80,
      createdAt: current.toISOString(),
      updatedAt: current.toISOString(),
    },
    {
      id: uuid(),
      tenantId,
      name: 'Sample Product 2',
      barcode: '1234567890124',
      hsn: '1234',
      gstRate: 12,
      stock: 5,
      lowStockAt: 8,
      salePrice: 200,
      purchasePrice: 160,
      createdAt: current.toISOString(),
      updatedAt: current.toISOString(),
    },
  ]

  await database.transaction(
    'rw',
    [
      database.tenants,
      database.customers,
      database.products,
      database.activity,
    ],
    async () => {
      await database.tenants.add(tenant)
      await database.customers.bulkAdd(customers)
      await database.products.bulkAdd(products)
      await database.activity.add({
        id: uuid(),
        tenantId,
        label: 'Welcome to BillZo! Start by creating your first invoice.',
        createdAt: current.toISOString(),
      })
    }
  )
}

export function notifyChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('billzo:changed'))
  }
}
