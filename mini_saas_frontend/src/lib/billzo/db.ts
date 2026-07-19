'use client'

import Dexie, { type Table } from 'dexie'
import type {
  Activity,
  Customer,
  CustomerPromise,
  DeviceToken,
  InventoryMovement,
  Invoice,
  InvoiceItem,
  Payment,
  Product,
  Purchase,
  QueueItem,
  RecoveryAttempt,
  RecoveryCase,
  RecoveryAttribution,
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
  recoveryCases!: Table<RecoveryCase, string>
  recoveryAttributions!: Table<RecoveryAttribution, string>
  promises!: Table<CustomerPromise, string>
  queue!: Table<QueueItem, string>
  activity!: Table<Activity, string>
  deviceTokens!: Table<DeviceToken, string>
  otps!: Table<{ id: string; phone: string; hash: string; createdAt: number }, string>
  sessions!: Table<import('@/lib/billzo/auth-store').Session & { id: string }, string>

  constructor() {
    super('billzo_production_v1')
    this.version(1).stores({
      tenants: 'id, ownerUserId, createdAt, updatedAt',
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
    })
    this.version(2).stores({
      otps: 'id, phone, createdAt',
      sessions: 'id, sessionId, userId, phone, tenantId, createdAt',
    })
    this.version(3).stores({
      tenants: 'id, ownerUserId, createdAt, updatedAt',
    })
    this.version(4).stores({
      queue: 'id, tenantId, status, [tenantId+status], entity, entityId, nextAttemptAt, idempotencyKey',
    })
    this.version(5).stores({
      customers: 'id, tenantId, name, phone, whatsapp_number, gstin, opt_in, automationMode, lastUsedAt, updatedAt',
      invoices: 'id, tenantId, status, customerName, dueAt, nextRecoveryAt, lastWhatsAppStatus, lastReminderAt, isSnoozed, updatedAt, syncStatus',
    })
    this.version(6).stores({
      promises: 'id, tenantId, customerId, status, dueDate, createdAt',
    })
    this.version(7).stores({
      recoveryCases: 'id, tenantId, customerId, recoveryStateV2, attentionScore, updatedAt',
      recoveryAttributions: 'id, tenantId, invoiceId, createdAt',
    })
    this.version(8).stores({
      invoices: 'id, tenantId, customerId, status, customerName, dueAt, nextRecoveryAt, lastWhatsAppStatus, lastReminderAt, isSnoozed, updatedAt, syncStatus',
    })
  }
}

let instance: BillzoDB | null = null

export function db() {
  if (typeof indexedDB === 'undefined') {
    throw new Error('db() is only available in the browser (IndexedDB not found)')
  }
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

