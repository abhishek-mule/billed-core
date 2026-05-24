export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict' | 'dead_letter'
export type InvoiceStatus = 'paid' | 'partial' | 'unpaid' | 'overdue'
export type RecoveryStage = 't0_soft' | 't24_nudge' | 't72_strong' | 't5_warning'
export type WhatsAppStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received'
export type ConflictPolicy = 'latest_write_wins' | 'server_authority'

export type TenantWhatsAppConfig = {
  gupshupApiKey?: string
  gupshupAppName?: string
  sourceNumber?: string
  autoSend: boolean
  paymentLinkEnabled: boolean
  paymentLinkExpiry: number
  optInMessage?: string
  templateNames: {
    invoice?: string
    reminderGentle?: string
    reminderFirm?: string
    receipt?: string
    udharGentle?: string
    udharFirm?: string
  }
}

export type BankDetails = {
  bankName?: string
  accountNumber?: string
  ifsc?: string
  accountHolder?: string
}

export type Tenant = {
  id: string
  name: string
  ownerUserId: string
  phone?: string
  email?: string
  address?: string
  upiId?: string
  gstin?: string
  pan?: string
  bankDetails?: BankDetails
  whiteLabel: boolean
  autoMode: boolean
  plan: 'starter' | 'growth' | 'pro'
  paywallUnlocked: boolean
  invoiceCount: number
  reminderCount: number
  invoiceNumberCounter?: number
  subscriptionId?: string
  subscriptionStatus?: string
  cancelledAt?: string
  whatsappConfig?: TenantWhatsAppConfig
  createdAt: string
  updatedAt: string
}

export type DeviceToken = {
  id: string
  tenantId: string
  fcmToken: string
  deviceType: 'android' | 'ios' | 'web'
  createdAt: string
}

export type Customer = {
  id: string
  tenantId: string
  name: string
  phone: string
  whatsapp_number?: string
  gstin?: string
  preferredLanguage?: 'hindi' | 'hinglish' | 'english'
  defaultTone: 'hindi' | 'english' | 'hinglish'
  opt_in: boolean
  opt_in_at?: string
  address?: string
  email?: string
  notes?: string
  lastUsedAt: string
  invoiceCount: number
  createdAt: string
  updatedAt: string
}

export type CustomerImportRow = {
  name: string
  phone: string
  whatsapp_number?: string
  gstin?: string
  email?: string
}

export type BulkImportResult = {
  created: number
  updated: number
  skipped: { row: CustomerImportRow; reason: string }[]
  errors: { row: CustomerImportRow; error: string }[]
}

export type Product = {
  id: string
  tenantId: string
  name: string
  barcode?: string
  hsn?: string
  gstRate: number
  stock: number
  lowStockAt: number
  salePrice: number
  purchasePrice: number
  unit?: string
  createdAt: string
  updatedAt: string
}

export type InvoiceItem = {
  id: string
  tenantId: string
  invoiceId: string
  productId?: string
  name: string
  qty: number
  price: number
  hsn?: string
  gstRate: number
  lineTotal: number
  createdAt: string
  updatedAt: string
}

export type Invoice = {
  id: string
  tenantId: string
  customerId: string
  customerName: string
  customerPhone: string
  total: number
  paidAmount: number
  status: InvoiceStatus
  invoiceNumber?: string
  dueAt: string
  createdAt: string
  updatedAt: string
  syncStatus: SyncStatus
  recoveryStage: RecoveryStage
  nextRecoveryAt: string
  lastWhatsAppStatus: WhatsAppStatus
  lastWhatsAppAt?: string
  reminderCount: number
  pdfUrl: string
  paymentLinkId?: string
  paymentLinkUrl?: string
  paymentLinkExpiry?: string
  version: number
}

export type Purchase = {
  id: string
  tenantId: string
  supplier: string
  gstin?: string
  amount: number
  source: 'scan' | 'repeat'
  createdAt: string
  updatedAt: string
  syncStatus: SyncStatus
  version: number
}

export type InventoryMovement = {
  id: string
  tenantId: string
  productId: string
  sourceType: 'invoice' | 'purchase' | 'correction'
  sourceId: string
  qtyDelta: number
  stockAfter: number
  createdAt: string
}

export type Payment = {
  id: string
  tenantId: string
  invoiceId?: string
  provider: 'cash' | 'upi' | 'razorpay_test'
  providerPaymentId?: string
  amount: number
  status: 'success' | 'failed' | 'pending'
  createdAt: string
  updatedAt: string
  syncStatus: SyncStatus
}

export type WhatsAppEvent = {
  id: string
  tenantId: string
  invoiceId?: string
  customerId?: string
  phone?: string
  messageType?: string
  failureReason?: string
  error?: string
  recoveryAttemptId?: string
  providerMessageId?: string
  status: WhatsAppStatus
  syncStatus?: SyncStatus
  occurredAt: string
  createdAt: string
}

export type RecoveryAttempt = {
  id: string
  tenantId: string
  invoiceId: string
  stage: RecoveryStage
  tone: 'soft' | 'nudge' | 'strong' | 'warning'
  message: string
  pdfUrl: string
  scheduledAt: string
  sentAt?: string
  readAt?: string
  status: WhatsAppStatus
  createdAt: string
  updatedAt: string
}

export type QueueItem = {
  id: string
  tenantId: string
  entity:
    | 'tenant'
    | 'customer'
    | 'product'
    | 'invoice'
    | 'invoice_item'
    | 'purchase'
    | 'inventory_movement'
    | 'payment'
    | 'whatsapp_event'
    | 'recovery_attempt'
  entityId: string
  action: 'upsert' | 'delete' | 'send_whatsapp' | 'razorpay_test'
  payload: unknown
  createdAt: string
  updatedAt: string
  attempts: number
  nextAttemptAt: string
  status: SyncStatus
  lastError?: string
  idempotencyKey: string
  conflictPolicy: ConflictPolicy
}

export type Activity = {
  id: string
  tenantId: string
  label: string
  amount?: number
  cta?: string
  createdAt: string
}

export type BillzoSnapshot = {
  pendingAmount: number
  overdueCount: number
  lowStockCount: number
  collectedToday: number
  invoiceCount: number
  queueCount: number
  failedQueueCount: number
  readReminderCount: number
}
