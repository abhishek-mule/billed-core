import { pgTable, text, timestamp, boolean, numeric, integer, jsonb, uuid, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { generateId } from './db/encryption';

export const tenants = pgTable('tenants', {
  id: text('id').primaryKey().$defaultFn(() => generateId('tenant')),
  companyName: text('company_name').notNull(),
  contactPhone: text('contact_phone'), // Added for daily summary
  subdomain: text('subdomain').unique(),
  plan: text('plan').default('free'),
  subscriptionStatus: text('subscription_status').default('free'),
  trialEndsAt: timestamp('trial_ends_at'),
  isActive: boolean('is_active').default(true),
  timezone: text('timezone').default('Asia/Kolkata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  invoices: many(invoices),
  customers: many(customers),
}));

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => generateId('user')),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone').notNull(),
  role: text('role').notNull(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const usersRelations = relations(users, ({ one }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
}));

export const invoices = pgTable('invoices', {
  id: text('id').primaryKey().$defaultFn(() => generateId('inv')),
  publicId: text('public_id'),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  invoiceNumber: text('invoice_number').notNull(),
  customerId: text('customer_id'),
  customerName: text('customer_name'),
  customerGstin: text('customer_gstin'),
  status: text('status').default('DRAFT'),
  paymentStatus: text('payment_status').default('unpaid'),
  paymentAmount: numeric('payment_amount', { precision: 15, scale: 2 }).default('0'),
  waStatus: text('wa_status').default('pending'),
  manualPause: boolean('manual_pause').default(false),
  followUpStage: integer('follow_up_stage').default(0),
  lastFollowUpAt: timestamp('last_follow_up_at'),
  lastReminderAt: timestamp('last_reminder_at'),
  reminderCount: integer('reminder_count').default(0),
  pdfUrl: text('pdf_url'),
  metaMessageId: text('meta_message_id'),
  subtotal: numeric('subtotal', { precision: 15, scale: 2 }).notNull().default('0'),
  cgst: numeric('cgst', { precision: 15, scale: 2 }).notNull().default('0'),
  sgst: numeric('sgst', { precision: 15, scale: 2 }).notNull().default('0'),
  igst: numeric('igst', { precision: 15, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 15, scale: 2 }).notNull().default('0'),
  grandTotal: numeric('grand_total', { precision: 15, scale: 2 }).notNull().default('0'),
  lineItemsJson: jsonb('line_items_json').notNull().default([]),
  taxAmount: numeric('tax_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  discountAmount: numeric('discount_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  erpInvoiceId: text('erp_invoice_id'),
  erpDocname: text('erp_docname'),
  erpSyncStatus: text('erp_sync_status').default('PENDING'),
  erpSyncedAt: timestamp('erp_synced_at'),
  erpSyncError: text('erp_sync_error'),
  gstin: text('gstin'),
  placeOfSupply: text('place_of_supply'),
  reverseCharge: boolean('reverse_charge').default(false),
  notes: text('notes'),
  paymentMode: text('payment_mode'),
  dueDate: timestamp('due_date'),
  invoiceDate: timestamp('invoice_date').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [invoices.tenantId],
    references: [tenants.id],
  }),
  customer: one(customers, {
    fields: [invoices.customerId],
    references: [customers.id],
  }),
  items: many(invoiceItems),
}));

export const customers = pgTable('customers', {
  id: text('id').primaryKey().$defaultFn(() => generateId('cust')),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  customerName: text('customer_name').notNull(),
  gstin: text('gstin'),
  phone: text('phone'),
  email: text('email'),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: text('city'),
  state: text('state'),
  pincode: text('pincode'),
  udharBalance: numeric('udhar_balance', { precision: 15, scale: 2 }).default('0'),
  riskScore: integer('risk_score').default(0),
  riskLevel: text('risk_level').default('low'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const customersRelations = relations(customers, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [customers.tenantId],
    references: [tenants.id],
  }),
  invoices: many(invoices),
}));

export const payments = pgTable('payments', {
  id: text('id').primaryKey().$defaultFn(() => generateId('pay')),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  invoiceId: text('invoice_id').references(() => invoices.id),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  mode: text('mode').notNull().default('CASH'),
  status: text('status'),
  collectedVia: text('collected_via'),
  platformFee: numeric('platform_fee', { precision: 15, scale: 2 }).default('0'),
  reference: text('reference'),
  razorpayPaymentId: text('razorpay_payment_id'),
  razorpayOrderId: text('razorpay_order_id'),
  razorpaySignature: text('razorpay_signature'),
  receivedAt: timestamp('received_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const invoiceItems = pgTable('invoice_items', {
  id: text('id').primaryKey().$defaultFn(() => generateId('item')),
  invoiceId: text('invoice_id').notNull().references(() => invoices.id),
  tenantId: text('tenant_id').references(() => tenants.id),
  itemCode: text('item_code').notNull(),
  itemName: text('item_name'),
  name: text('name'),
  quantity: numeric('quantity', { precision: 15, scale: 3 }),
  qty: numeric('qty', { precision: 15, scale: 3 }),
  rate: numeric('rate', { precision: 15, scale: 2 }).notNull(),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).default('0'),
  gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).default('0'),
  cgst: numeric('cgst', { precision: 15, scale: 2 }).notNull().default('0'),
  sgst: numeric('sgst', { precision: 15, scale: 2 }).notNull().default('0'),
  igst: numeric('igst', { precision: 15, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const outbox = pgTable('outbox', {
  id: text('id').primaryKey().$defaultFn(() => generateId('out')),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status').default('PENDING'),
  retryCount: integer('retry_count').default(0),
  lastError: text('last_error'),
  lastAttemptAt: timestamp('last_attempt_at'),
  createdAt: timestamp('created_at').defaultNow(),
  processedAt: timestamp('processed_at'),
});

export const activityLogs = pgTable('activity_logs', {
  id: text('id').primaryKey().$defaultFn(() => generateId('act')),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  userId: text('user_id'),
  type: text('type'),
  action: text('action'),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const ledgerEntries = pgTable('ledger_entries', {
  id: text('id').primaryKey().$defaultFn(() => generateId('ledg')),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  customerId: text('customer_id').references(() => customers.id),
  invoiceId: text('invoice_id').references(() => invoices.id),
  type: text('type').notNull(),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  balance: numeric('balance', { precision: 15, scale: 2 }).default('0'),
  referenceId: text('reference_id'),
  referenceType: text('reference_type'),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const eventLogs = pgTable('event_logs', {
  id: text('id').primaryKey().$defaultFn(() => generateId('ev')),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  eventType: text('event_type'),
  eventName: text('event_name'), // Added for compatibility
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const failedJobs = pgTable('failed_jobs', {
  id: text('id').primaryKey().$defaultFn(() => generateId('fail')),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  queue: text('queue').notNull(),
  payload: jsonb('payload').notNull(),
  exception: text('exception'),
  errorMessage: text('error_message'), // Added for compatibility
  failedAt: timestamp('failed_at').defaultNow(),
});
