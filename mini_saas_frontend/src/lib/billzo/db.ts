import Dexie, { type Table } from 'dexie'
import { getMockSession } from './tenant'
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

class BillzoDB extends Dexie {
  tenants!: Table<Tenant, string>
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
    super('billzo_offline_first_v2')
    this.version(3).stores({
      tenants: 'id, ownerUserId, updatedAt',
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

const iso = (date = new Date()) => date.toISOString()

export async function seedDemoData() {
  const database = db()
  const session = getMockSession()
  const count = await database.tenants.count()
  if (count > 0) return

  const current = new Date()
  const overdueDate = new Date(current)
  overdueDate.setDate(current.getDate() - 2)

  const tenant: Tenant = {
    id: session.tenantId,
    name: session.businessName,
    ownerUserId: session.userId,
    plan: 'test',
    paywallUnlocked: true,
    invoiceCount: 0,
    reminderCount: 0,
    createdAt: iso(current),
    updatedAt: iso(current),
  }

  const customers: Customer[] = [
    {
      id: uuid(),
      tenantId: session.tenantId,
      name: 'Ramesh',
      phone: '9876543210',
      defaultTone: 'hinglish',
      lastUsedAt: iso(current),
      invoiceCount: 8,
      createdAt: iso(current),
      updatedAt: iso(current),
    },
    {
      id: uuid(),
      tenantId: session.tenantId,
      name: 'Kirana A1',
      phone: '9810012300',
      defaultTone: 'hindi',
      lastUsedAt: iso(current),
      invoiceCount: 5,
      createdAt: iso(current),
      updatedAt: iso(current),
    },
    {
      id: uuid(),
      tenantId: session.tenantId,
      name: 'Sita Traders',
      phone: '9900011122',
      gstin: '27ABCDE1234F1Z5',
      defaultTone: 'english',
      lastUsedAt: iso(overdueDate),
      invoiceCount: 3,
      createdAt: iso(overdueDate),
      updatedAt: iso(overdueDate),
    },
  ]

  const products: Product[] = [
    {
      id: uuid(),
      tenantId: session.tenantId,
      name: 'Aashirvaad Atta 5kg',
      barcode: '8901725181222',
      hsn: '1101',
      gstRate: 5,
      stock: 4,
      lowStockAt: 6,
      salePrice: 265,
      purchasePrice: 235,
      createdAt: iso(current),
      updatedAt: iso(current),
    },
    {
      id: uuid(),
      tenantId: session.tenantId,
      name: 'Amul Taaza 1L',
      barcode: '8901262010129',
      hsn: '0401',
      gstRate: 0,
      stock: 18,
      lowStockAt: 10,
      salePrice: 68,
      purchasePrice: 62,
      createdAt: iso(current),
      updatedAt: iso(current),
    },
    {
      id: uuid(),
      tenantId: session.tenantId,
      name: 'Surf Excel 1kg',
      barcode: '8901030875126',
      hsn: '3402',
      gstRate: 18,
      stock: 2,
      lowStockAt: 5,
      salePrice: 239,
      purchasePrice: 210,
      createdAt: iso(current),
      updatedAt: iso(current),
    },
  ]

  const firstInvoiceId = uuid()
  const secondInvoiceId = uuid()
  const invoices: Invoice[] = [
    {
      id: firstInvoiceId,
      tenantId: session.tenantId,
      customerId: customers[0].id,
      customerName: customers[0].name,
      customerPhone: customers[0].phone,
      total: 530,
      paidAmount: 0,
      status: 'overdue',
      dueAt: iso(overdueDate),
      createdAt: iso(overdueDate),
      updatedAt: iso(current),
      syncStatus: 'pending',
      recoveryStage: 't24_nudge',
      nextRecoveryAt: iso(current),
      lastWhatsAppStatus: 'read',
      pdfUrl: `/invoice/${firstInvoiceId}`,
      version: 1,
    },
    {
      id: secondInvoiceId,
      tenantId: session.tenantId,
      customerId: customers[1].id,
      customerName: customers[1].name,
      customerPhone: customers[1].phone,
      total: 717,
      paidAmount: 0,
      status: 'unpaid',
      dueAt: iso(current),
      createdAt: iso(current),
      updatedAt: iso(current),
      syncStatus: 'pending',
      recoveryStage: 't0_soft',
      nextRecoveryAt: iso(current),
      lastWhatsAppStatus: 'queued',
      pdfUrl: `/invoice/${secondInvoiceId}`,
      version: 1,
    },
  ]

  const invoiceItems: InvoiceItem[] = [
    {
      id: uuid(),
      tenantId: session.tenantId,
      invoiceId: firstInvoiceId,
      productId: products[0].id,
      name: products[0].name,
      qty: 2,
      price: 265,
      gstRate: 5,
      lineTotal: 530,
      createdAt: iso(overdueDate),
      updatedAt: iso(current),
    },
    {
      id: uuid(),
      tenantId: session.tenantId,
      invoiceId: secondInvoiceId,
      productId: products[2].id,
      name: products[2].name,
      qty: 3,
      price: 239,
      gstRate: 18,
      lineTotal: 717,
      createdAt: iso(current),
      updatedAt: iso(current),
    },
  ]

  const readAttempt: RecoveryAttempt = {
    id: uuid(),
    tenantId: session.tenantId,
    invoiceId: firstInvoiceId,
    stage: 't0_soft',
    tone: 'soft',
    message: 'Namaste Ramesh, Rs 530 pending. Invoice link: /invoice/demo',
    pdfUrl: `/invoice/${firstInvoiceId}`,
    scheduledAt: iso(overdueDate),
    sentAt: iso(overdueDate),
    readAt: iso(current),
    status: 'read',
    createdAt: iso(overdueDate),
    updatedAt: iso(current),
  }

  await database.transaction(
    'rw',
    [
      database.tenants,
      database.customers,
      database.products,
      database.invoices,
      database.invoiceItems,
      database.recoveryAttempts,
      database.whatsappEvents,
      database.activity,
    ],
    async () => {
      await database.tenants.add(tenant)
      await database.customers.bulkAdd(customers)
      await database.products.bulkAdd(products)
      await database.invoices.bulkAdd(invoices)
      await database.invoiceItems.bulkAdd(invoiceItems)
      await database.recoveryAttempts.add(readAttempt)
      await database.whatsappEvents.add({
        id: uuid(),
        tenantId: session.tenantId,
        invoiceId: firstInvoiceId,
        recoveryAttemptId: readAttempt.id,
        providerMessageId: 'wamid.demo.read',
        status: 'read',
        occurredAt: iso(current),
        createdAt: iso(current),
      })
      await database.activity.bulkAdd([
        { id: uuid(), tenantId: session.tenantId, label: 'Demo tenant auto-login ready', createdAt: iso(current) },
        { id: uuid(), tenantId: session.tenantId, label: '2 unpaid invoices need recovery', amount: 1247, cta: 'Send reminders', createdAt: iso(current) },
      ])
    }
  )
}

export function notifyChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('billzo:changed'))
}
