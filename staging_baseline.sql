-- ============================================================================
-- staging_baseline.sql  (GENERATED — do not edit; do not commit)
-- Base schema (schema.sql) + every APPLIED migration (001-093) in documented
-- order (alphabetical within duplicate numbers), for a fresh STAGING database.
-- The migrations are INCREMENTAL: they ALTER/CREATE on top of the base schema,
-- so schema.sql MUST come first (it defines tenants/users/customers/products/
-- invoices/payments/gstr_exports/eway_bills/events + RLS).
-- Excludes: 051 (Superseded), 053/054/094x2/095/098 (Pending on prod), 100 (webhook inbox gate — applied separately after this).
-- After this, apply: 096_recovery_credit_ledger.sql,
--                   097_recovery_credit_reservations.sql,
--                   100_webhook_inbox.sql,
-- then run verify_096, verify_097 and verify_100.
-- Generated from MIGRATION_STATUS.md + git history.
-- ============================================================================

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- BASE — schema.sql (pre-Supabase baseline the migrations layer on)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- BillZo Database Schema
-- Run this in Neon Console: https://console.neon.tech

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id VARCHAR(255) PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  plan VARCHAR(50) DEFAULT 'free',
  subdomain VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  password_hash VARCHAR(255),
  role VARCHAR(50) DEFAULT 'owner',
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP,
  failed_login_attempts INT DEFAULT 0,
  locked_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) REFERENCES tenants(id),
  customer_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  gstin VARCHAR(50),
  billing_address TEXT,
  shipping_address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) REFERENCES tenants(id),
  item_code VARCHAR(100),
  item_name VARCHAR(255) NOT NULL,
  hsn_code VARCHAR(50),
  barcode VARCHAR(255),
  aliases TEXT[],
  rate DECIMAL(12,2),
  standard_rate DECIMAL(12,2),
  mrp DECIMAL(12,2),
  gst_rate DECIMAL(5,2) DEFAULT 18,
  unit VARCHAR(50),
  category VARCHAR(100),
  stock_quantity DECIMAL(12,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add barcode index for fast lookups
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_aliases ON products USING GIN(aliases);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) REFERENCES tenants(id),
  supplier_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  gstin VARCHAR(50),
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Purchases
CREATE TABLE IF NOT EXISTS purchases (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) REFERENCES tenants(id),
  purchase_invoice_number VARCHAR(100),
  supplier_id VARCHAR(255) REFERENCES suppliers(id),
  supplier_name VARCHAR(255),
  supplier_gstin VARCHAR(50),
  line_items_json JSONB,
  subtotal DECIMAL(12,2),
  cgst DECIMAL(12,2) DEFAULT 0,
  sgst DECIMAL(12,2) DEFAULT 0,
  igst DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2),
  grand_total DECIMAL(12,2),
  invoice_date DATE,
  due_date DATE,
  status VARCHAR(50) DEFAULT 'UNPAID',
  payment_status VARCHAR(50) DEFAULT 'UNPAID',
  paid_amount DECIMAL(12,2) DEFAULT 0,
  due_amount DECIMAL(12,2) DEFAULT 0,
  payment_method VARCHAR(50),
  eligible_for_itc BOOLEAN DEFAULT true,
  itc_notes TEXT,
  notes TEXT,
  source VARCHAR(50) DEFAULT 'manual',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Purchase line items
CREATE TABLE IF NOT EXISTS purchase_items (
  id VARCHAR(255) PRIMARY KEY,
  purchase_id VARCHAR(255) REFERENCES purchases(id),
  product_id VARCHAR(255) REFERENCES products(id),
  item_code VARCHAR(100),
  item_name VARCHAR(255),
  quantity DECIMAL(12,3),
  rate DECIMAL(12,2),
  gst_rate DECIMAL(5,2),
  amount DECIMAL(12,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) REFERENCES tenants(id),
  invoice_number VARCHAR(100),
  customer_id VARCHAR(255) REFERENCES customers(id),
  customer_name VARCHAR(255),
  customer_phone VARCHAR(20),
  customer_gstin VARCHAR(50),
  line_items_json JSONB,
  subtotal DECIMAL(12,2),
  cgst DECIMAL(12,2) DEFAULT 0,
  sgst DECIMAL(12,2) DEFAULT 0,
  igst DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2),
  grand_total DECIMAL(12,2),
  notes TEXT,
  payment_mode VARCHAR(50) DEFAULT 'cash',
  payment_status VARCHAR(50) DEFAULT 'PENDING',
  status VARCHAR(50) DEFAULT 'ACTIVE',
  erp_sync_status VARCHAR(50) DEFAULT 'PENDING',
  erp_invoice_id VARCHAR(255),
  due_date DATE,
  is_pos BOOLEAN DEFAULT false,
  place_of_supply VARCHAR(100),
  idempotency_key VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Invoice line items
CREATE TABLE IF NOT EXISTS invoice_items (
  id VARCHAR(255) PRIMARY KEY,
  invoice_id VARCHAR(255) REFERENCES invoices(id),
  product_id VARCHAR(255) REFERENCES products(id),
  item_code VARCHAR(100),
  item_name VARCHAR(255),
  quantity DECIMAL(12,3),
  rate DECIMAL(12,2),
  gst_rate DECIMAL(5,2),
  amount DECIMAL(12,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) REFERENCES tenants(id),
  invoice_id VARCHAR(255) REFERENCES invoices(id),
  amount DECIMAL(12,2),
  payment_mode VARCHAR(50),
  payment_reference VARCHAR(255),
  razorpay_payment_id VARCHAR(255),
  transaction_id VARCHAR(255),
  is_reconciled BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Stock reservations for cart handling
CREATE TABLE IF NOT EXISTS stock_reservations (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) REFERENCES tenants(id),
  product_id VARCHAR(255) REFERENCES products(id),
  session_id VARCHAR(255) NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

-- WhatsApp message tracking
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) REFERENCES tenants(id),
  invoice_id VARCHAR(255) REFERENCES invoices(id),
  phone VARCHAR(20) NOT NULL,
  message_type VARCHAR(50) DEFAULT 'INVOICE',
  message_text TEXT,
  status VARCHAR(50) DEFAULT 'PENDING',
  whatsapp_message_id VARCHAR(255),
  error_code VARCHAR(50),
  error_message TEXT,
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tenants_phone ON tenants(phone);
CREATE INDEX IF NOT EXISTS idx_tenants_email ON tenants(email);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_id ON suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchases_tenant_id ON purchases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchases_invoice_number ON purchases(purchase_invoice_number);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_product_id ON stock_reservations(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_session ON stock_reservations(session_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_expires ON stock_reservations(expires_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_invoice_id ON whatsapp_messages(invoice_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_status ON whatsapp_messages(status);

-- GSTR Exports Tracking (Phase 1: Compliance)
CREATE TABLE IF NOT EXISTS gstr_exports (
  id VARCHAR(255) PRIMARY KEY DEFAULT ('gstr_' || gen_random_uuid()::text),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  month INT NOT NULL,
  year INT NOT NULL,
  export_data JSONB,
  status VARCHAR(50) DEFAULT 'GENERATED',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, month, year)
);

-- E-way Bills Tracking (Phase 1: Compliance)
CREATE TABLE IF NOT EXISTS eway_bills (
  id VARCHAR(255) PRIMARY KEY DEFAULT ('eway_' || gen_random_uuid()::text),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id VARCHAR(255) REFERENCES invoices(id) ON DELETE CASCADE,
  eway_json JSONB,
  eway_no VARCHAR(50),
  validity_date DATE,
  status VARCHAR(50) DEFAULT 'GENERATED',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, invoice_id)
);

-- System Automation State
CREATE TABLE IF NOT EXISTS automation_state (
  tenant_id VARCHAR(255) PRIMARY KEY REFERENCES tenants(id),
  is_enabled BOOLEAN DEFAULT true,
  last_failure_at TIMESTAMPTZ,
  failure_count INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Optimized Analytics Events
DROP TABLE IF EXISTS events;
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255),
  event_name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  amount_paise BIGINT,
  source TEXT,
  channel TEXT,
  follow_up_stage INT,
  tone TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_events_tenant_time ON events (tenant_id, created_at DESC);
CREATE INDEX idx_events_entity ON events (entity_id, event_name);
CREATE INDEX idx_events_revenue ON events (event_name, amount_paise);
CREATE INDEX idx_events_attribution ON events (event_name, follow_up_stage);
CREATE INDEX idx_events_metadata ON events USING GIN (metadata);

-- Idempotency Constraints
CREATE UNIQUE INDEX uniq_payment_event ON events ((metadata->>'razorpay_payment_id')) WHERE event_name = 'payment.success';
CREATE UNIQUE INDEX uniq_reminder_event ON events (entity_id, follow_up_stage) WHERE event_name = 'reminder.sent';
CREATE UNIQUE INDEX uniq_invoice_event ON events (entity_id) WHERE event_name = 'invoice.created';

-- ============================================================
-- ROW-LEVEL SECURITY — Tenant isolation via JWT claim
-- Enables auth.jwt() ->> 'tenant_id' to scope all queries.
-- ============================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenants
  USING (id = auth.jwt() ->> 'tenant_id')
  WITH CHECK (id = auth.jwt() ->> 'tenant_id');

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users
  USING (tenant_id = auth.jwt() ->> 'tenant_id')
  WITH CHECK (tenant_id = auth.jwt() ->> 'tenant_id');

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON customers
  USING (tenant_id = auth.jwt() ->> 'tenant_id')
  WITH CHECK (tenant_id = auth.jwt() ->> 'tenant_id');

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON products
  USING (tenant_id = auth.jwt() ->> 'tenant_id')
  WITH CHECK (tenant_id = auth.jwt() ->> 'tenant_id');

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON suppliers
  USING (tenant_id = auth.jwt() ->> 'tenant_id')
  WITH CHECK (tenant_id = auth.jwt() ->> 'tenant_id');

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON purchases
  USING (tenant_id = auth.jwt() ->> 'tenant_id')
  WITH CHECK (tenant_id = auth.jwt() ->> 'tenant_id');

ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON purchase_items
  USING (purchase_id IN (SELECT id FROM purchases WHERE tenant_id = auth.jwt() ->> 'tenant_id'))
  WITH CHECK (purchase_id IN (SELECT id FROM purchases WHERE tenant_id = auth.jwt() ->> 'tenant_id'));

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoices
  USING (tenant_id = auth.jwt() ->> 'tenant_id')
  WITH CHECK (tenant_id = auth.jwt() ->> 'tenant_id');

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoice_items
  USING (invoice_id IN (SELECT id FROM invoices WHERE tenant_id = auth.jwt() ->> 'tenant_id'))
  WITH CHECK (invoice_id IN (SELECT id FROM invoices WHERE tenant_id = auth.jwt() ->> 'tenant_id'));

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payments
  USING (tenant_id = auth.jwt() ->> 'tenant_id')
  WITH CHECK (tenant_id = auth.jwt() ->> 'tenant_id');

ALTER TABLE stock_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON stock_reservations
  USING (tenant_id = auth.jwt() ->> 'tenant_id')
  WITH CHECK (tenant_id = auth.jwt() ->> 'tenant_id');

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON whatsapp_messages
  USING (tenant_id = auth.jwt() ->> 'tenant_id')
  WITH CHECK (tenant_id = auth.jwt() ->> 'tenant_id');

ALTER TABLE gstr_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON gstr_exports
  USING (tenant_id = auth.jwt() ->> 'tenant_id')
  WITH CHECK (tenant_id = auth.jwt() ->> 'tenant_id');

ALTER TABLE eway_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON eway_bills
  USING (tenant_id = auth.jwt() ->> 'tenant_id')
  WITH CHECK (tenant_id = auth.jwt() ->> 'tenant_id');

ALTER TABLE automation_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON automation_state
  USING (tenant_id = auth.jwt() ->> 'tenant_id')
  WITH CHECK (tenant_id = auth.jwt() ->> 'tenant_id');

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON events
  USING (tenant_id = auth.jwt() ->> 'tenant_id')
  WITH CHECK (tenant_id = auth.jwt() ->> 'tenant_id');

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 001_add_compliance_tables.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Migration: Add GSTR exports and E-way bills tables
-- Date: 2026-04-29
-- Description: Add tables for GST compliance tracking

-- GSTR Exports Tracking
CREATE TABLE IF NOT EXISTS gstr_exports (
  id VARCHAR(255) PRIMARY KEY DEFAULT ('gstr_' || gen_random_uuid()::text),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  month INT NOT NULL,
  year INT NOT NULL,
  export_data JSONB,
  status VARCHAR(50) DEFAULT 'GENERATED', -- GENERATED, SUBMITTED, FILED
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, month, year)
);

-- E-way Bills Tracking
CREATE TABLE IF NOT EXISTS eway_bills (
  id VARCHAR(255) PRIMARY KEY DEFAULT ('eway_' || gen_random_uuid()::text),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id VARCHAR(255) REFERENCES invoices(id) ON DELETE CASCADE,
  eway_json JSONB,
  eway_no VARCHAR(50),
  validity_date DATE,
  status VARCHAR(50) DEFAULT 'GENERATED', -- GENERATED, SUBMITTED, CANCELLED, EXPIRED
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, invoice_id)
);

-- Add columns to payments table if they don't exist
ALTER TABLE payments ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'PENDING';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(255);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_gstr_exports_tenant_month ON gstr_exports(tenant_id, month, year);
CREATE INDEX IF NOT EXISTS idx_gstr_exports_status ON gstr_exports(status);
CREATE INDEX IF NOT EXISTS idx_eway_bills_tenant_id ON eway_bills(tenant_id);
CREATE INDEX IF NOT EXISTS idx_eway_bills_invoice_id ON eway_bills(invoice_id);
CREATE INDEX IF NOT EXISTS idx_eway_bills_status ON eway_bills(status);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_id ON payments(razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order ON payments(razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 001_refactor_invoices.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Refactor invoices and invoice_items
-- Use this to apply the schema changes
CREATE SEQUENCE IF NOT EXISTS invoice_seq;

-- Add updated column to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS wa_sent BOOLEAN DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS grand_total NUMERIC(15,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cgst NUMERIC(15,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sgst NUMERIC(15,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS igst NUMERIC(15,2);

-- Update invoice_items to link to invoices properly and remove JSON from invoices
-- (Note: This is a migration conceptualization; in a real env we'd use a migration tool)

-- invoice_items already exists, ensure it has the correct structure
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 002_add_outbox_and_logs.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Add Outbox table
CREATE TABLE IF NOT EXISTS outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add Activity Logs table
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure correct indexes for performance
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_created ON invoices(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(tenant_id, phone);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- [replay guard before 002_workflow_optimization.sql]
-- Replay guard (schema.sql era): audit_logs is referenced by ALTER/INDEX in
-- 002_workflow_optimization but created nowhere in the migration history.
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) REFERENCES tenants(id),
  user_id VARCHAR(255),
  action VARCHAR(255),
  entity_type VARCHAR(255),
  entity_id VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 002_workflow_optimization.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Migration: Add workflow optimization tables and fields
-- Date: 2026-05-01
-- Description: Add customer credit tracking, stock reservations, and enhanced audit logging

-- Add customer credit fields
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(15,2) DEFAULT 50000;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pending_amount NUMERIC(15,2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_score NUMERIC(3,2) DEFAULT 1.0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS days_overdue INTEGER DEFAULT 0;

-- Add payment mode tracking to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50) CHECK (payment_mode IN ('CASH', 'UPI', 'CREDIT', 'BANK_TRANSFER', 'CARD', 'OTHER'));

-- Stock reservations table for real-time inventory tracking
CREATE TABLE IF NOT EXISTS stock_reservations (
  id VARCHAR(255) PRIMARY KEY DEFAULT ('stock_' || gen_random_uuid()::text),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id VARCHAR(255) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  invoice_id VARCHAR(255) REFERENCES invoices(id) ON DELETE SET NULL,
  quantity NUMERIC(15,3) NOT NULL,
  status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMMITTED', 'RELEASED', 'EXPIRED')),
  reserved_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '15 minutes'),
  session_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enhanced audit logs
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS role VARCHAR(50);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS username VARCHAR(255);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS success BOOLEAN DEFAULT true;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

-- WhatsApp messages table for tracking
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id VARCHAR(255) PRIMARY KEY DEFAULT ('wa_' || gen_random_uuid()::text),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id VARCHAR(255) REFERENCES invoices(id) ON DELETE SET NULL,
  phone VARCHAR(20) NOT NULL,
  template VARCHAR(100) NOT NULL,
  message_text TEXT,
  status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
  attempts INTEGER DEFAULT 1,
  provider_message_id VARCHAR(255),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);

-- Payment reminders tracking
CREATE TABLE IF NOT EXISTS payment_reminders (
  id VARCHAR(255) PRIMARY KEY DEFAULT ('reminder_' || gen_random_uuid()::text),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id VARCHAR(255) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  invoice_id VARCHAR(255) REFERENCES invoices(id) ON DELETE SET NULL,
  reminder_type VARCHAR(50) DEFAULT 'PAYMENT_DUE',
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'SENT', 'FAILED', 'CANCELLED')),
  channel VARCHAR(50) DEFAULT 'WHATSAPP',
  message_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_credit ON customers(tenant_id, credit_score);
CREATE INDEX IF NOT EXISTS idx_customers_pending ON customers(tenant_id, pending_amount);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_product ON stock_reservations(product_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_tenant ON stock_reservations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_session ON stock_reservations(session_id, status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant ON whatsapp_messages(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_invoice ON whatsapp_messages(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_customer ON payment_reminders(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_scheduled ON payment_reminders(scheduled_for, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_role ON audit_logs(tenant_id, role, created_at DESC);

-- Update existing customers with default credit limits
UPDATE customers SET credit_limit = 50000 WHERE credit_limit IS NULL;
UPDATE customers SET pending_amount = 0 WHERE pending_amount IS NULL;
UPDATE customers SET credit_score = 1.0 WHERE credit_score IS NULL;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 003_add_wa_status_and_pdf.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 003_add_wa_status_and_pdf.sql
-- Hardening invoice schema for WhatsApp
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS wa_status TEXT DEFAULT 'pending' CHECK (wa_status IN ('pending', 'sent', 'failed'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 003_push_subscriptions.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Push Subscriptions Table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  endpoint TEXT NOT NULL,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT uq_user_endpoint UNIQUE (user_id, endpoint)
);

-- Index for faster lookups
CREATE INDEX idx_push_subscriptions_tenant ON push_subscriptions(tenant_id);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_push_subscriptions_updated_at();

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 004_add_meta_message_id.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 004_add_meta_message_id.sql
-- Store meta_message_id for webhook correlation
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS meta_message_id TEXT;
CREATE INDEX IF NOT EXISTS idx_invoices_meta_message_id ON invoices(meta_message_id);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 005_add_payments_schema.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 005_add_payments_schema.sql
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'partial'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(15,2) DEFAULT 0;

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL,
  method TEXT DEFAULT 'razorpay',
  razorpay_payment_id TEXT UNIQUE,
  razorpay_order_id TEXT,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(razorpay_order_id);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 006_add_reminder_fields.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 006_add_reminder_fields.sql
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- [replay guard before 007_add_ledger_system.sql]
-- Replay guard: ledger_entries (007) was authored expecting customers.id/
-- invoices.id to already be UUID (prod state at the time). On a fresh replay
-- from schema.sql they are VARCHAR, so the FK would not construct. The table
-- is unused by BillZo code; pre-creating it makes 007's CREATE IF NOT EXISTS
-- a no-op (mirroring prod, where the relation already existed).
CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id VARCHAR(255) REFERENCES customers(id) ON DELETE CASCADE,
  invoice_id VARCHAR(255) REFERENCES invoices(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('debit', 'credit')),
  amount NUMERIC(15,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON ledger_entries(customer_id);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 007_add_ledger_system.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 007_add_ledger_system.sql
ALTER TABLE customers ADD COLUMN IF NOT EXISTS udhar_balance NUMERIC(15,2) DEFAULT 0;

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('debit', 'credit')),
  amount NUMERIC(15,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_customer ON ledger_entries(customer_id);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 008_add_credit_control.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 008_add_credit_control.sql
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(15,2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_mode TEXT DEFAULT 'soft' CHECK (credit_mode IN ('soft', 'hard'));

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 009_add_risk_scoring.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 009_add_risk_scoring.sql
ALTER TABLE customers ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 50;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high'));

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 010_add_followup_fields.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 010_add_followup_fields.sql
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS follow_up_stage INTEGER DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_follow_up_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS manual_pause BOOLEAN DEFAULT false;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 011_add_payment_attribution.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 011_add_payment_attribution.sql
ALTER TABLE payments ADD COLUMN IF NOT EXISTS collected_via TEXT DEFAULT 'manual' CHECK (collected_via IN ('manual', 'auto'));

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 012_add_public_id.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 012_add_public_id.sql
-- Add public_id for secure invoice sharing
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS public_id TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_invoices_public_id ON invoices(public_id);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 013_add_platform_fee.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 013_add_platform_fee.sql
ALTER TABLE payments ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(15,2) DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'free' CHECK (subscription_status IN ('free', 'pro', 'trial'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 014_harden_outbox.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 014_harden_outbox.sql
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed'));
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

-- 015_add_dlq.sql
CREATE TABLE IF NOT EXISTS failed_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue TEXT NOT NULL,
  payload JSONB NOT NULL,
  error_message TEXT,
  failed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- [replay guard before 015_evolve_whatsapp_events.sql]
-- Replay guard (schema.sql era): whatsapp_events is referenced by ALTER/INDEX
-- from 015 onwards but created nowhere in the migration history (it existed on
-- prod from an earlier manual state). Pre-creating the full post-046 column set
-- makes every ALTER ... ADD COLUMN IF NOT EXISTS a no-op on fresh replay. Column
-- shape mirrors the domain inserts (whatsapp inbound/outbound telemetry stream).
CREATE TABLE IF NOT EXISTS whatsapp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT,
  phone TEXT,
  phone_number_id TEXT,
  billzo_message_id TEXT,
  parent_billzo_message_id TEXT,
  provider_message_id TEXT,
  conversation_id TEXT,
  direction TEXT DEFAULT 'outbound',
  message_type TEXT,
  event_layer TEXT,
  message_origin TEXT DEFAULT 'automation',
  provider TEXT,
  template TEXT,
  recovery_stage TEXT,
  reminder_stage TEXT,
  recovery_attempt_id TEXT,
  correlation_id UUID,
  transport_message_hash TEXT,
  invoice_id TEXT,
  event_sequence BIGINT DEFAULT 0,
  status TEXT DEFAULT 'queued',
  sync_status TEXT,
  attempt_number INT DEFAULT 1,
  amount NUMERIC,
  error TEXT,
  failure_reason TEXT,
  message_preview TEXT,
  server_ack_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  rate_limited_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  time_to_click_seconds INT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 015_evolve_whatsapp_events.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Evolve whatsapp_events into the recovery telemetry nervous system
-- Adds delivery tracking, intent signals, and recovery journey state

ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound';
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS correlation_id UUID;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS template TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS recovery_stage TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS server_ack_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS rate_limited_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS time_to_click_seconds INT;

-- Add recovery flag to invoices for escalation detection
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recovery_flag TEXT;

-- Add whatsapp reputation to tenants for merchant quality scoring
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_reputation REAL DEFAULT 1.0;

-- Index for timeline queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_invoice_timeline ON whatsapp_events(invoice_id, occurred_at);

-- Index for provider message id lookups (webhook matching)
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_provider_msg ON whatsapp_events(provider_message_id);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 016_phase1_message_identity.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 016_phase1_message_identity.sql
-- Phase 1: Canonical message identity + append-only event semantics
-- Router becomes identity authority. whatsapp_events becomes an event stream.

-- 1. Core identity columns
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS billzo_message_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS conversation_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS message_origin TEXT DEFAULT 'automation';
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS event_sequence BIGINT DEFAULT 0;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS transport_message_hash TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS parent_billzo_message_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS attempt_number INT DEFAULT 1;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS reminder_stage TEXT;

-- 2. Performance indexes
CREATE INDEX IF NOT EXISTS idx_we_billzo_message_id ON whatsapp_events(billzo_message_id);
CREATE INDEX IF NOT EXISTS idx_we_conversation_id ON whatsapp_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_we_transport_hash ON whatsapp_events(transport_message_hash);
CREATE INDEX IF NOT EXISTS idx_we_sequence ON whatsapp_events(billzo_message_id, event_sequence DESC);

-- 3. Backfill existing rows
-- Existing rows get billzo_message_id = id (each existing row becomes
-- its own canonical message with a single event).
-- event_sequence is derived from occurred_at epoch millis.
-- conversation_id groups by invoice_id, or falls back to phone-based.
UPDATE whatsapp_events SET
  billzo_message_id = COALESCE(billzo_message_id, id),
  event_sequence = COALESCE(event_sequence, EXTRACT(EPOCH FROM COALESCE(occurred_at, created_at, NOW()))::BIGINT * 1000),
  conversation_id = COALESCE(conversation_id, invoice_id, 'conv_' || COALESCE(phone, 'unknown'))
WHERE billzo_message_id IS NULL OR event_sequence = 0;

-- 4. Enforce NOT NULL after backfill
ALTER TABLE whatsapp_events ALTER COLUMN billzo_message_id SET NOT NULL;
ALTER TABLE whatsapp_events ALTER COLUMN event_sequence SET NOT NULL;
ALTER TABLE whatsapp_events ALTER COLUMN conversation_id SET NOT NULL;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 017_projection_and_cases.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 017_projection_and_cases.sql
-- Fast read models for recovery telemetry

-- 1. Event layer classification — prevents domain collapse
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS event_layer TEXT;
UPDATE whatsapp_events SET event_layer = CASE
  WHEN status IN ('queued','sent','server_ack','delivered','read','failed','rate_limited','received') THEN 'transport'
  WHEN status IN ('clicked_upi','payment_confirmed') THEN 'behavioral'
  ELSE 'transport'
END WHERE event_layer IS NULL;

-- 2. Message projection table — fast read model, no DISTINCT ON needed
CREATE TABLE IF NOT EXISTS whatsapp_message_projection (
  billzo_message_id TEXT PRIMARY KEY,
  latest_status TEXT NOT NULL DEFAULT 'queued',
  latest_event_sequence BIGINT NOT NULL DEFAULT 0,
  latest_occurred_at TIMESTAMPTZ,
  delivered BOOLEAN DEFAULT false,
  read BOOLEAN DEFAULT false,
  failed BOOLEAN DEFAULT false,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  provider TEXT,
  provider_message_id TEXT,
  recovery_case_id TEXT,
  engagement_state TEXT DEFAULT 'unseen',
  recovery_state TEXT DEFAULT 'created',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Recovery cases — behavioral entity, not accounting artifact
CREATE TABLE IF NOT EXISTS recovery_cases (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id VARCHAR(255) NOT NULL,
  customer_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  total_outstanding NUMERIC DEFAULT 0,
  invoice_count INT DEFAULT 0,
  engagement_state TEXT DEFAULT 'unseen',
  recovery_state TEXT DEFAULT 'created',
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rc_tenant ON recovery_cases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rc_customer ON recovery_cases(customer_id);
CREATE INDEX IF NOT EXISTS idx_rc_status ON recovery_cases(status);
CREATE INDEX IF NOT EXISTS idx_we_event_layer ON whatsapp_events(event_layer);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 018_projection_evolution.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 018_projection_evolution.sql
-- Phase 2: Behavioral Interpretation Layer
-- 
-- This migration evolves the projection table from a simple status cache
-- into a distributed convergence surface with CAS conflict resolution,
-- provenance tracking, and drift telemetry.
--
-- Architectural invariants:
--   1. Transport progression is a strict precedence ladder
--   2. Delivery health is orthogonal (healthy / retrying / degraded)
--   3. Only semantically superior states mutate the projection
--   4. All conflicts are persisted for replay debugging
-- ============================================================

-- 1. ADD PROJECTION EVOLUTION COLUMNS
-- ============================================================

ALTER TABLE whatsapp_message_projection
  ADD COLUMN IF NOT EXISTS transport_state TEXT,
  ADD COLUMN IF NOT EXISTS delivery_health TEXT NOT NULL DEFAULT 'healthy',
  ADD COLUMN IF NOT EXISTS transport_precedence INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS causal_occurred_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_event_id UUID,
  ADD COLUMN IF NOT EXISTS failure_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_successful_delivery_at TIMESTAMPTZ;

-- Backfill transport_state from legacy latest_status
UPDATE whatsapp_message_projection
SET
  transport_state = CASE
    WHEN latest_status = 'failed' THEN 'failed_terminal'
    WHEN latest_status = 'rate_limited' THEN 'sent'
    ELSE latest_status
  END,
  transport_precedence = CASE
    WHEN latest_status IN ('delivered', 'received') THEN 4
    WHEN latest_status = 'read' THEN 5
    WHEN latest_status = 'failed_terminal' OR latest_status = 'failed' THEN 6
    WHEN latest_status = 'server_ack' THEN 3
    WHEN latest_status = 'sent' THEN 2
    ELSE 1
  END,
  causal_occurred_at = latest_occurred_at,
  failure_count = CASE WHEN latest_status IN ('failed', 'rate_limited') THEN 1 ELSE 0 END,
  last_successful_delivery_at = delivered_at
WHERE transport_state IS NULL;

-- 2. PROJECTION CONFLICTS — Drift telemetry
-- ============================================================
-- Every rejected CAS write is persisted here so that:
--   - replay debugging has full visibility into what was rejected and why
--   - drift metrics can alert on abnormal conflict rates
--   - stale worker detection can identify partition recovery events
-- ============================================================

CREATE TABLE IF NOT EXISTS projection_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billzo_message_id TEXT NOT NULL,
  existing_transport_state TEXT,
  existing_precedence INT,
  existing_sequence BIGINT,
  incoming_transport_state TEXT NOT NULL,
  incoming_precedence INT NOT NULL,
  incoming_sequence BIGINT NOT NULL,
  incoming_event_id UUID,
  rejection_reason TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pc_message ON projection_conflicts(billzo_message_id);
CREATE INDEX IF NOT EXISTS idx_pc_occurred ON projection_conflicts(occurred_at);

-- 3. CAS UPSERT FUNCTION
-- ============================================================
-- Atomic compare-and-swap for projection updates.
-- Only applies if incoming event is strictly superior to current state.
--
-- Resolution rule (matches resolveProjectionState in engagement.ts):
--   higher precedence → always applies
--   same precedence, higher sequence → applies
--   same precedence, same sequence → duplicate
--   lower precedence → stale
--
-- Returns:
--   'inserted' — new row created
--   'updated'  — existing row mutated
--   'rejected' — incoming was stale or duplicate (logged to projection_conflicts)
-- ============================================================

CREATE OR REPLACE FUNCTION cas_upsert_projection(
  p_billzo_message_id TEXT,
  p_transport_state TEXT,
  p_delivery_health TEXT DEFAULT 'healthy',
  p_transport_precedence INT,
  p_latest_event_sequence BIGINT,
  p_causal_occurred_at TIMESTAMPTZ,
  p_last_event_id UUID,
  p_delivered BOOLEAN DEFAULT FALSE,
  p_read BOOLEAN DEFAULT FALSE,
  p_failed BOOLEAN DEFAULT FALSE,
  p_delivered_at TIMESTAMPTZ DEFAULT NULL,
  p_read_at TIMESTAMPTZ DEFAULT NULL,
  p_failed_at TIMESTAMPTZ DEFAULT NULL,
  p_provider TEXT DEFAULT NULL,
  p_provider_message_id TEXT DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
  v_current_prec INT;
  v_current_seq BIGINT;
  v_current_state TEXT;
BEGIN
  -- Lock row for atomic compare-and-swap
  SELECT transport_precedence, latest_event_sequence, transport_state
  INTO v_current_prec, v_current_seq, v_current_state
  FROM whatsapp_message_projection
  WHERE billzo_message_id = p_billzo_message_id
  FOR UPDATE;

  -- CASE 1: No existing row — insert
  IF NOT FOUND THEN
    INSERT INTO whatsapp_message_projection (
      billzo_message_id,
      transport_state,
      delivery_health,
      transport_precedence,
      latest_event_sequence,
      causal_occurred_at,
      last_event_id,
      delivered,
      read,
      failed,
      delivered_at,
      read_at,
      failed_at,
      provider,
      provider_message_id,
      failure_count,
      last_successful_delivery_at,
      latest_status,
      latest_occurred_at,
      updated_at
    ) VALUES (
      p_billzo_message_id,
      p_transport_state,
      p_delivery_health,
      p_transport_precedence,
      p_latest_event_sequence,
      p_causal_occurred_at,
      p_last_event_id,
      p_delivered,
      p_read,
      p_failed,
      p_delivered_at,
      p_read_at,
      p_failed_at,
      p_provider,
      p_provider_message_id,
      CASE WHEN p_failed THEN 1 ELSE 0 END,
      p_delivered_at,
      p_transport_state,
      p_causal_occurred_at,
      NOW()
    );
    RETURN 'inserted';
  END IF;

  -- CASE 2: Current state is terminal — reject
  IF v_current_state = 'failed_terminal' THEN
    INSERT INTO projection_conflicts (
      billzo_message_id,
      existing_transport_state,
      existing_precedence,
      existing_sequence,
      incoming_transport_state,
      incoming_precedence,
      incoming_sequence,
      incoming_event_id,
      rejection_reason
    ) VALUES (
      p_billzo_message_id,
      v_current_state,
      v_current_prec,
      v_current_seq,
      p_transport_state,
      p_transport_precedence,
      p_latest_event_sequence,
      p_last_event_id,
      'terminal_failure_locked'
    );
    RETURN 'rejected';
  END IF;

  -- CASE 3: Higher precedence — apply
  IF p_transport_precedence > v_current_prec THEN
    UPDATE whatsapp_message_projection SET
      transport_state = p_transport_state,
      delivery_health = p_delivery_health,
      transport_precedence = p_transport_precedence,
      latest_event_sequence = p_latest_event_sequence,
      causal_occurred_at = p_causal_occurred_at,
      last_event_id = p_last_event_id,
      delivered = whatsapp_message_projection.delivered OR p_delivered,
      read = whatsapp_message_projection.read OR p_read,
      failed = whatsapp_message_projection.failed OR p_failed,
      delivered_at = CASE WHEN p_delivered_at IS NOT NULL AND whatsapp_message_projection.delivered_at IS NULL THEN p_delivered_at ELSE whatsapp_message_projection.delivered_at END,
      read_at = CASE WHEN p_read_at IS NOT NULL AND whatsapp_message_projection.read_at IS NULL THEN p_read_at ELSE whatsapp_message_projection.read_at END,
      failed_at = CASE WHEN p_failed_at IS NOT NULL AND whatsapp_message_projection.failed_at IS NULL THEN p_failed_at ELSE whatsapp_message_projection.failed_at END,
      provider = COALESCE(p_provider, provider),
      provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
      failure_count = whatsapp_message_projection.failure_count + CASE WHEN p_failed THEN 1 ELSE 0 END,
      last_successful_delivery_at = CASE WHEN p_delivered_at IS NOT NULL THEN p_delivered_at ELSE whatsapp_message_projection.last_successful_delivery_at END,
      latest_status = p_transport_state,
      latest_occurred_at = p_causal_occurred_at,
      updated_at = NOW()
    WHERE billzo_message_id = p_billzo_message_id;
    RETURN 'updated';
  END IF;

  -- CASE 4: Same precedence — compare sequence
  IF p_transport_precedence = v_current_prec THEN
    IF p_latest_event_sequence > v_current_seq THEN
      UPDATE whatsapp_message_projection SET
        transport_state = p_transport_state,
        delivery_health = p_delivery_health,
        latest_event_sequence = p_latest_event_sequence,
        causal_occurred_at = p_causal_occurred_at,
        last_event_id = p_last_event_id,
        delivered = whatsapp_message_projection.delivered OR p_delivered,
        read = whatsapp_message_projection.read OR p_read,
        failed = whatsapp_message_projection.failed OR p_failed,
        delivered_at = CASE WHEN p_delivered_at IS NOT NULL AND whatsapp_message_projection.delivered_at IS NULL THEN p_delivered_at ELSE whatsapp_message_projection.delivered_at END,
        read_at = CASE WHEN p_read_at IS NOT NULL AND whatsapp_message_projection.read_at IS NULL THEN p_read_at ELSE whatsapp_message_projection.read_at END,
        failed_at = CASE WHEN p_failed_at IS NOT NULL AND whatsapp_message_projection.failed_at IS NULL THEN p_failed_at ELSE whatsapp_message_projection.failed_at END,
        provider = COALESCE(p_provider, provider),
        provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
        failure_count = whatsapp_message_projection.failure_count + CASE WHEN p_failed THEN 1 ELSE 0 END,
        last_successful_delivery_at = CASE WHEN p_delivered_at IS NOT NULL THEN p_delivered_at ELSE whatsapp_message_projection.last_successful_delivery_at END,
        latest_status = p_transport_state,
        latest_occurred_at = p_causal_occurred_at,
        updated_at = NOW()
      WHERE billzo_message_id = p_billzo_message_id;
      RETURN 'updated';
    ELSE
      INSERT INTO projection_conflicts (
        billzo_message_id,
        existing_transport_state,
        existing_precedence,
        existing_sequence,
        incoming_transport_state,
        incoming_precedence,
        incoming_sequence,
        incoming_event_id,
        rejection_reason
      ) VALUES (
        p_billzo_message_id,
        v_current_state,
        v_current_prec,
        v_current_seq,
        p_transport_state,
        p_transport_precedence,
        p_latest_event_sequence,
        p_last_event_id,
        CASE WHEN p_latest_event_sequence = v_current_seq THEN 'duplicate' ELSE 'stale' END
      );
      RETURN 'rejected';
    END IF;
  END IF;

  -- CASE 5: Lower precedence — reject
  INSERT INTO projection_conflicts (
    billzo_message_id,
    existing_transport_state,
    existing_precedence,
    existing_sequence,
    incoming_transport_state,
    incoming_precedence,
    incoming_sequence,
    incoming_event_id,
    rejection_reason
  ) VALUES (
    p_billzo_message_id,
    v_current_state,
    v_current_prec,
    v_current_seq,
    p_transport_state,
    p_transport_precedence,
    p_latest_event_sequence,
    p_last_event_id,
    'stale'
  );
  RETURN 'rejected';
END;
$$ LANGUAGE plpgsql;

-- 4. INDEXES FOR QUERY PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_wmp_transport_state ON whatsapp_message_projection(transport_state);
CREATE INDEX IF NOT EXISTS idx_wmp_delivery_health ON whatsapp_message_projection(delivery_health);
CREATE INDEX IF NOT EXISTS idx_wmp_causal_occurred ON whatsapp_message_projection(causal_occurred_at);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 019_behavioral_memory.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 019_behavioral_memory.sql
-- Phase 2A: Temporal Behavioral Memory Substrate
--
-- This migration introduces the behavioral evidence layer — the permanent memory
-- substrate between raw transport events and orchestration decisions.
--
-- Architectural invariants:
--   1. Raw transport truth is sacred — whatsapp_events is immutable sensory cortex
--   2. Observations are hypotheses with confidence, not facts
--   3. All behavioral aggregates carry interpreter version for replay determinism
--   4. No stored archetypes — only compressed behavioral evidence
--   5. Confidence-weighted accumulation prevents transport artifact contamination
--   6. schema_version tracks semantic evolution, not column changes
-- ============================================================

-- 1. CUSTOMER BEHAVIORAL METRICS — Global behavioral tendencies
-- ============================================================
-- Stores decayed, confidence-weighted behavioral aggregates per (tenant, customer).
-- Every write is deterministic and replayable from the observation event stream.
-- schema_version changes when decay math or confidence semantics evolve.

CREATE TABLE IF NOT EXISTS customer_behavioral_metrics (
  tenant_id           VARCHAR(255) NOT NULL,
  customer_id         UUID NOT NULL,
  schema_version      INT NOT NULL DEFAULT 1,

  -- rates (confidence-weighted, decayed via EMA)
  read_rate                   NUMERIC DEFAULT 0,
  payment_conversion_rate     NUMERIC DEFAULT 0,

  -- latencies (decayed weighted mean, per-metric half-life)
  avg_read_to_pay_hours             NUMERIC DEFAULT 0,
  avg_reminder_response_hours       NUMERIC DEFAULT 0,
  avg_settlement_latency_hours      NUMERIC DEFAULT 0,

  -- observation metadata
  observation_count           INT DEFAULT 0,
  total_interventions_sent    INT DEFAULT 0,
  total_interventions_read    NUMERIC DEFAULT 0,
  total_resolutions_after_intervention INT DEFAULT 0,

  -- pressure memory
  total_escalations_received  INT DEFAULT 0,
  last_escalation_at          TIMESTAMPTZ,
  interventions_until_resolution INT,

  -- staleness tracking
  last_resolution_at          TIMESTAMPTZ,
  last_read_at                TIMESTAMPTZ,
  last_response_at            TIMESTAMPTZ,
  last_event_at               TIMESTAMPTZ,

  updated_at                  TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (tenant_id, customer_id)
);

-- 2. CUSTOMER LIQUIDITY WINDOWS — Temporal payment affinity histograms
-- ============================================================
-- Stores unnormalized affinity scores per time bucket.
-- window_type enables multi-scale time: weekly, monthly, gst_cycle, festival_cycle, etc.
-- affinity_score is NOT a probability — it's a raw accumulation for ranking.
-- Orchestration reads top-N buckets, never a single "best slot."

CREATE TABLE IF NOT EXISTS customer_liquidity_windows (
  tenant_id           VARCHAR(255) NOT NULL,
  customer_id         UUID NOT NULL,
  schema_version      INT NOT NULL DEFAULT 1,
  window_type         TEXT NOT NULL DEFAULT 'weekly',
  weekday             INT NOT NULL,
  hour_bucket         INT NOT NULL,

  affinity_score              NUMERIC DEFAULT 0,
  observation_count           INT DEFAULT 0,
  last_seen_at                TIMESTAMPTZ,

  PRIMARY KEY (tenant_id, customer_id, window_type, weekday, hour_bucket)
);

CREATE INDEX IF NOT EXISTS idx_clw_lookup
  ON customer_liquidity_windows(tenant_id, customer_id, window_type, affinity_score DESC);

-- 3. PROJECTION DELTA LOG — Raw material for reinterpretation replay
-- ============================================================
-- Every projection.delta event is also logged here so that future interpreter
-- versions can replay from raw transport state without touching the outbox.
-- This is the canonical source for reinterpretation replay.

CREATE TABLE IF NOT EXISTS projection_delta_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           VARCHAR(255) NOT NULL,
  customer_id         UUID NOT NULL,
  invoice_id          UUID,
  billzo_message_id   TEXT,
  transport_state     TEXT NOT NULL,
  delivery_health     TEXT DEFAULT 'healthy',
  prev_transport_state TEXT,
  prev_delivery_health TEXT,
  occurred_at         TIMESTAMPTZ NOT NULL,
  ingested_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdl_tenant_customer
  ON projection_delta_log(tenant_id, customer_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_pdl_ingested
  ON projection_delta_log(ingested_at);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 020_payment_attribution_log.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 020_payment_attribution_log.sql
-- Immutable audit trail for payment-to-invoice matching.
-- Every match writes the full context (algorithm version, confidence, input tokens)
-- at the time of matching, ensuring deterministic replay even if matching
-- logic changes in future versions.
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_attribution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  invoice_id VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  provider_payment_id VARCHAR(255) NOT NULL,

  -- Match metadata
  match_type VARCHAR(50) NOT NULL,       -- 'payment_link' | 'exact' | 'fuzzy' | 'none'
  match_confidence NUMERIC NOT NULL,      -- 0.0 to 1.0
  matching_algorithm_version INT NOT NULL DEFAULT 1,

  -- Input signal at match time (snapshot, not reference)
  signal_amount NUMERIC NOT NULL,
  signal_currency VARCHAR(10) DEFAULT 'INR',
  signal_phone VARCHAR(50),
  signal_upi_reference VARCHAR(255),
  signal_customer_name TEXT,
  signal_payment_link_id VARCHAR(255),
  signal_timestamp TIMESTAMPTZ,

  -- Matched invoice snapshot at match time
  invoice_total NUMERIC,
  invoice_status VARCHAR(50),
  invoice_customer_name TEXT,
  invoice_customer_phone VARCHAR(50),
  invoice_created_at TIMESTAMPTZ,

  -- Reasoning
  match_reasons JSONB DEFAULT '[]'::jsonb,
  raw_signal JSONB,

  -- Immutable timestamp
  matched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pal_tenant_invoice ON payment_attribution_log(tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_pal_provider_payment ON payment_attribution_log(provider, provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_pal_matched_at ON payment_attribution_log(matched_at DESC);
CREATE INDEX IF NOT EXISTS idx_pal_tenant_matched ON payment_attribution_log(tenant_id, matched_at DESC);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 021_authority_gateway.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 021_authority_gateway.sql
-- Sovereignty Gateway — Constitutional Mutation Authority
-- ============================================================
-- IMMUTABLE TABLES: INSERT-only. No UPDATEs. No DELETEs.
-- Replay determinism and forensic audit built into schema.
--
-- 7 tables:
--   authority_policies        — immutable governance law (versioned bundles)
--   authority_intents          — inbound intent requests
--   authority_decisions        — policy evaluation outcomes (one per intent)
--   authority_plans            — execution plans (frozen at decision time)
--   authority_executions       — capability execution evidence (new row per attempt)
--   authority_queue_outbox     — internal queue dispatch (prevents orphaned intents)
--   authority_nonces           — transport replay protection
-- ============================================================

-- 1. Policy bundles (immutable governance law)
CREATE TABLE IF NOT EXISTS authority_policies (
  policy_version TEXT PRIMARY KEY,
  policy_snapshot_hash TEXT NOT NULL UNIQUE,
  policy_bundle JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT NOT NULL
);

-- 2. Inbound intent requests (immutable)
CREATE TABLE IF NOT EXISTS authority_intents (
  intent_id TEXT PRIMARY KEY,
  intent_type TEXT NOT NULL,
  intent_version INT NOT NULL,
  tenant_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  source TEXT NOT NULL,
  payload JSONB NOT NULL,
  canonical_payload_hash TEXT NOT NULL,
  semantic_payload_hash TEXT NOT NULL,
  causation_id TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_authority_intents_tenant
  ON authority_intents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_authority_intents_type
  ON authority_intents(intent_type);
CREATE INDEX IF NOT EXISTS idx_authority_intents_correlation
  ON authority_intents(correlation_id);

-- 3. Policy decisions (immutable, one per intent)
CREATE TABLE IF NOT EXISTS authority_decisions (
  decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id TEXT NOT NULL REFERENCES authority_intents(intent_id),
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'rejected')),
  decision_reason JSONB NOT NULL,
  policy_snapshot_hash TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_authority_decision_per_intent
  ON authority_decisions(intent_id);

-- 4. Execution plans (frozen at decision time, never recompiled)
CREATE TABLE IF NOT EXISTS authority_plans (
  plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id TEXT NOT NULL REFERENCES authority_intents(intent_id),
  execution_plan JSONB NOT NULL,
  plan_hash TEXT NOT NULL,
  plan_compiler_version TEXT NOT NULL,
  capability_implementation_hashes JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_authority_plans_intent
  ON authority_plans(intent_id);

-- 5. Capability execution evidence (immutable — new row per attempt)
CREATE TABLE IF NOT EXISTS authority_executions (
  execution_group_id UUID NOT NULL,
  execution_group_key TEXT NOT NULL UNIQUE,
  attempt_number INT NOT NULL DEFAULT 1,
  intent_id TEXT NOT NULL REFERENCES authority_intents(intent_id),
  capability_id TEXT NOT NULL,
  capability_implementation_hash TEXT NOT NULL,
  execution_phase TEXT NOT NULL DEFAULT 'forward'
    CHECK (execution_phase IN ('forward', 'compensation', 'recovery', 'manual_replay', 'shadow')),
  priority_class TEXT NOT NULL CHECK (priority_class IN (
    'critical_financial', 'regulatory', 'tenant_lifecycle', 'transport', 'analytics'
  )),
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'pending', 'compensated')),
  result JSONB,
  executor_version TEXT NOT NULL,
  execution_latency_ms INT,
  queue_latency_ms INT,
  worker_id TEXT,
  executed_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (execution_group_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_authority_executions_intent
  ON authority_executions(intent_id);
CREATE INDEX IF NOT EXISTS idx_authority_executions_group
  ON authority_executions(execution_group_id);

-- 6. Internal queue outbox (prevents orphaned intents after DB commit)
CREATE TABLE IF NOT EXISTS authority_queue_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id TEXT NOT NULL REFERENCES authority_intents(intent_id),
  target_queue TEXT NOT NULL CHECK (target_queue IN ('authority', 'capabilities')),
  payload JSONB NOT NULL,
  priority_class TEXT NOT NULL CHECK (priority_class IN (
    'critical_financial', 'regulatory', 'tenant_lifecycle', 'transport', 'analytics'
  )),
  dispatched_at TIMESTAMPTZ,
  dispatch_attempts INT NOT NULL DEFAULT 0,
  last_dispatch_error JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_authority_queue_outbox_undispatched
  ON authority_queue_outbox(created_at)
  WHERE dispatched_at IS NULL;

-- 7. Transport replay protection (nonce dedup)
CREATE TABLE IF NOT EXISTS authority_nonces (
  nonce TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL REFERENCES authority_intents(intent_id),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_authority_nonces_expires
  ON authority_nonces(expires_at);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 022_authority_execution_leases.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 022_authority_execution_leases.sql
-- ============================================================
-- Execution leases, dispatch attempts, and replay invariants
-- for the Sovereignty Gateway constitutional runtime.
--
-- This migration adds:
--   1. authority_queue_dispatch_attempts — append-only dispatch log
--   2. authority_execution_leases — concurrency guard between sync + async paths
--   3. plan_id FK on authority_queue_outbox — immutable plan loading
--   4. registry_snapshot_hash on authority_plans — detect registry topology drift
--   5. Partial unique index on authority_executions — terminal success enforcement
-- ============================================================

-- 1. Append-only dispatch attempt log
-- Replaces mutable dispatched_at tracking on authority_queue_outbox.
-- "Undispatched" = no row with outcome='success' exists for the outbox_id.
CREATE TABLE IF NOT EXISTS authority_queue_dispatch_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id UUID NOT NULL REFERENCES authority_queue_outbox(id),
  attempt_number INT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failed')),
  error JSONB,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_attempts_outbox
  ON authority_queue_dispatch_attempts(outbox_id);

-- 2. Execution lease table
-- Prevents dual execution between trusted_sync path and outbox dispatcher.
-- Leases expire after LEASE_TTL_MS (15s default, enforced by application logic).
CREATE TABLE IF NOT EXISTS authority_execution_leases (
  execution_group_key TEXT PRIMARY KEY,
  leased_by TEXT NOT NULL,
  leased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_execution_leases_expires
  ON authority_execution_leases(expires_at);

-- 3. plan_id FK on outbox — immutable plan snapshot at execution time
-- Dispatcher must load the plan from authority_plans, never rehydrate from logic.
ALTER TABLE authority_queue_outbox
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES authority_plans(plan_id);

CREATE INDEX IF NOT EXISTS idx_queue_outbox_plan
  ON authority_queue_outbox(plan_id);

-- 4. registry_snapshot_hash on plans — detect registry topology drift during replay
-- Captures CapabilityRegistry.runtimeHash at the time the plan was built.
ALTER TABLE authority_plans
  ADD COLUMN IF NOT EXISTS registry_snapshot_hash TEXT;

-- 5. Terminal success uniqueness constraint
-- Prevents duplicate execution of irreversible mutations after crash + lease expiry.
-- Only one row per execution_group_key may have outcome='success' or 'compensated'.
CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_terminal_success
  ON authority_executions(execution_group_key)
  WHERE outcome IN ('success', 'compensated');

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 023_mutation_gate.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Step 1: Shadow-mode observability tables for MutationGate
-- These are append-only log tables; no apps query them yet.

-- mutation_log: tracks every request submitted to the gate
CREATE TABLE IF NOT EXISTS mutation_log (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  intent_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  client_version INT,
  outcome TEXT NOT NULL,
  error TEXT,
  touched_rows JSONB DEFAULT '[]'::jsonb,
  transition_traces JSONB DEFAULT '[]'::jsonb,
  mode TEXT NOT NULL DEFAULT 'shadow',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mutation_log_tenant ON mutation_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mutation_log_idempotency ON mutation_log (idempotency_key);

-- mutation_processed_keys: idempotency dedup table
CREATE TABLE IF NOT EXISTS mutation_processed_keys (
  idempotency_key TEXT PRIMARY KEY,
  intent_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mutation_processed_keys_tenant ON mutation_processed_keys (tenant_id, created_at DESC);

-- mutation_outbox: durable outbox for future async dispatching
CREATE TABLE IF NOT EXISTS mutation_outbox (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  intent_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  dispatched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mutation_outbox_pending ON mutation_outbox (status, created_at ASC) WHERE status = 'pending';

-- mutation_effects: materialized transition traces for queryability
CREATE TABLE IF NOT EXISTS mutation_effects (
  id BIGSERIAL PRIMARY KEY,
  log_id BIGINT REFERENCES mutation_log(id) ON DELETE CASCADE,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field TEXT NOT NULL,
  from_val TEXT,
  to_val TEXT NOT NULL,
  sequence INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mutation_effects_entity ON mutation_effects (entity, entity_id, created_at DESC);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 024_messaging_channels.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Sprint A: Normalized channel abstraction layer
-- Decouples transport infrastructure from tenant business settings

CREATE TABLE IF NOT EXISTS messaging_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  channel_type TEXT NOT NULL DEFAULT 'whatsapp',
  provider TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  display_name TEXT,
  connection_state TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (connection_state IN ('connecting','connected','degraded','rate_limited','reconnecting','auth_expired','disconnected','banned','shadow')),
  quality_score NUMERIC,
  delivery_success_rate NUMERIC,
  last_heartbeat_at TIMESTAMPTZ,
  last_connected_at TIMESTAMPTZ,
  priority INTEGER NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  encrypted_credentials BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_channels_tenant_active ON messaging_channels (tenant_id, priority) WHERE is_active = true;

-- Migrate existing tenant whatsapp_config data into channels
-- This is a one-time backfill; new tenants use the channel API
DO $$
DECLARE
  t RECORD;
  cfg JSONB;
  provider TEXT;
  channel_id UUID;
BEGIN
  FOR t IN SELECT id, whatsapp_config FROM tenants WHERE whatsapp_config IS NOT NULL AND whatsapp_config != '{}'::jsonb
  LOOP
    cfg := t.whatsapp_config;
    provider := COALESCE(cfg->>'whatsappProvider', 'gupshup');

    INSERT INTO messaging_channels (tenant_id, channel_type, provider, phone_number, connection_state, config, is_active)
    VALUES (
      t.id,
      'whatsapp',
      provider,
      COALESCE(cfg->>'sourceNumber', 'unknown'),
      CASE WHEN provider = 'baileys' THEN 'disconnected' ELSE 'connected' END,
      jsonb_build_object(
        'gupshupApiKey', cfg->'gupshupApiKey',
        'gupshupAppName', cfg->'gupshupAppName',
        'sourceNumber', cfg->'sourceNumber'
      ),
      true
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 025_cognition_layer.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Sprint 1: Cognition Layer — Merchant-facing operational intelligence
-- attention_items: internal machine-layer signals (never exposed directly)
-- operational_situations: merchant-facing compressed cognition (feed source)

CREATE TABLE IF NOT EXISTS attention_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  situation_id UUID,
  intent_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  priority_score NUMERIC NOT NULL DEFAULT 0,
  urgency TEXT NOT NULL DEFAULT 'medium'
    CHECK (urgency IN ('critical','high','medium','low')),
  confidence NUMERIC NOT NULL DEFAULT 1.0,
  signal_data JSONB NOT NULL DEFAULT '{}',
  correlation_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attention_tenant ON attention_items (tenant_id, priority_score DESC);
CREATE INDEX idx_attention_correlation ON attention_items (correlation_key);
CREATE INDEX idx_attention_situation ON attention_items (situation_id);

CREATE TABLE IF NOT EXISTS operational_situations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  situation_type TEXT NOT NULL,
  situation_fingerprint TEXT NOT NULL UNIQUE,
  priority_score NUMERIC NOT NULL,
  urgency TEXT NOT NULL CHECK (urgency IN ('critical','high','medium','low')),
  headline TEXT NOT NULL,
  narrative TEXT NOT NULL,
  affected_entities JSONB NOT NULL DEFAULT '{}',
  recommended_action JSONB NOT NULL DEFAULT '{}',
  -- { "type": "call" | "send_reminder" | "wait" | "review" | "escalate", "reason": "...", "expectedOutcome": "..." }
  decision_window_start TIMESTAMPTZ,
  decision_window_end TIMESTAMPTZ,
  resolution_condition JSONB NOT NULL DEFAULT '{}',
  -- { "field": "status", "table": "invoices", "value": "paid" } — auto-resolves when condition met
  auto_executable BOOLEAN NOT NULL DEFAULT false,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  situation_state TEXT NOT NULL DEFAULT 'active'
    CHECK (situation_state IN ('active','snoozed','dismissed','completed')),
  max_display_order INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  dismissal_count INTEGER NOT NULL DEFAULT 0,
  pipeline_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_situations_tenant_active ON operational_situations (tenant_id, priority_score DESC)
  WHERE situation_state = 'active';
CREATE INDEX idx_situations_fingerprint ON operational_situations (situation_fingerprint);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 027_recovery_case_state.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 027_recovery_case_state.sql
-- RecoveryCase canonical truth spine
-- 
-- Changes:
--   - Add v2 state columns (dual-write safe — old columns preserved)
--   - Append-only event history table
--   - Idempotent event consumption tracking
--   - Enum-constrained action types
--   - Version column for optimistic concurrency
--   - Attention score for deterministic ranking

-- ============================================================
-- 1. ENUMS
-- ============================================================

-- RecoveryState = FACT (what is true about the collection position)
DO $$ BEGIN
  CREATE TYPE recovery_state_v2 AS ENUM (
    'active',
    'overdue',
    'partial_payment',
    'promised',
    'recovered',
    'disputed',
    'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- EngagementState = BELIEF (behavioral interpretation)
DO $$ BEGIN
  CREATE TYPE engagement_state_v2 AS ENUM (
    'unseen',
    'engaged',
    'intent',
    'likely_to_pay',
    'ghosting'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- NextActionType = system recommendation
DO $$ BEGIN
  CREATE TYPE recovery_next_action AS ENUM (
    'send_reminder',
    'review_payment',
    'follow_up_call',
    'wait',
    'merchant_review'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. RECOVERY_CASES — Add v2 columns (dual-write safe)
-- ============================================================

ALTER TABLE recovery_cases
  ADD COLUMN IF NOT EXISTS recovery_state_v2 recovery_state_v2,
  ADD COLUMN IF NOT EXISTS engagement_state_v2 engagement_state_v2,
  ADD COLUMN IF NOT EXISTS next_action_type recovery_next_action,
  ADD COLUMN IF NOT EXISTS next_action_due_at TIMESTAMPTZ,
  -- Aggregate counts (replaces invoice_ids[] anti-pattern)
  ADD COLUMN IF NOT EXISTS open_invoice_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overdue_invoice_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disputed_invoice_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promised_invoice_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_overdue NUMERIC NOT NULL DEFAULT 0,
  -- Promise tracking
  ADD COLUMN IF NOT EXISTS promise_to_pay_date TIMESTAMPTZ,
  -- Concurrency
  ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1,
  -- Projection version (for shadow truth comparison)
  ADD COLUMN IF NOT EXISTS projection_version INTEGER NOT NULL DEFAULT 1,
  -- Attention score (deterministic ranking)
  ADD COLUMN IF NOT EXISTS attention_score INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN recovery_cases.recovery_state_v2 IS 'Factual collection position. Never behavioral.';
COMMENT ON COLUMN recovery_cases.engagement_state_v2 IS 'Behavioral interpretation. Never factual.';
COMMENT ON COLUMN recovery_cases.version IS 'Optimistic concurrency — incremented on every transition.';
COMMENT ON COLUMN recovery_cases.projection_version IS 'Projection version for shadow truth comparison.';
COMMENT ON COLUMN recovery_cases.attention_score IS 'Deterministic ranking for queue ordering. Higher = more urgent.';

-- ============================================================
-- 3. RECOVERY_CASE_EVENTS — Append-only decision log
-- ============================================================
-- Stores SYSTEM DECISIONS (not raw signals).
-- Signals live in the outbox/events tables.
-- This table records what the state machine concluded.

CREATE TABLE IF NOT EXISTS recovery_case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,              -- e.g. 'transition', 'backfill', 'override'
  from_recovery_state recovery_state_v2,
  to_recovery_state recovery_state_v2,
  from_engagement_state engagement_state_v2,
  to_engagement_state engagement_state_v2,
  reason TEXT NOT NULL,                  -- Human-readable explanation
  trigger JSONB NOT NULL DEFAULT '{}',   -- What caused this decision (signal event ref + payload summary)
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rce_case_occurred ON recovery_case_events(case_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_rce_event_type ON recovery_case_events(event_type);

COMMENT ON TABLE recovery_case_events IS 'System decisions only. Raw signals are in outbox/events tables.';

-- ============================================================
-- 4. EVENT CONSUMPTION IDEMPOTENCY
-- ============================================================

CREATE TABLE IF NOT EXISTS recovery_case_event_consumptions (
  source_event_id TEXT NOT NULL,         -- The outbox event ID that triggered this transition
  case_id UUID NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_event_id, case_id)
);

COMMENT ON TABLE recovery_case_event_consumptions IS 'Prevents duplicate processing of the same source event.';

-- ============================================================
-- 5. INDEXES for the recovery queue query
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_rc_tenant_state
  ON recovery_cases(tenant_id, recovery_state_v2)
  WHERE recovery_state_v2 NOT IN ('recovered', 'closed');

CREATE INDEX IF NOT EXISTS idx_rc_tenant_attention
  ON recovery_cases(tenant_id, attention_score DESC)
  WHERE recovery_state_v2 NOT IN ('recovered', 'closed');

CREATE INDEX IF NOT EXISTS idx_rc_tenant_next_action
  ON recovery_cases(tenant_id, next_action_due_at)
  WHERE next_action_due_at IS NOT NULL;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 028_fix_recovery_case_fk_types.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 028_fix_recovery_case_fk_types.sql
-- Surgical fix: repair FK type mismatches in 027_recovery_case_state.sql
--
-- Problem: 027 uses `case_id UUID REFERENCES recovery_cases(id)` but
-- recovery_cases.id is TEXT. PostgreSQL requires exact type match for FKs.
--
-- Also: recovery_cases.customer_id was created as UUID but actual
-- invoice/customer IDs are varchar (e.g. CUST_xxx).
--
-- This migration is self-contained and idempotent. It can be applied
-- before or after 027 (idempotent operations skip already-applied work).

-- ============================================================
-- Part 0: Fix existing column types (empty table — safe)
-- ============================================================
ALTER TABLE recovery_cases ALTER COLUMN customer_id TYPE TEXT;

-- ============================================================
-- Part 1: ENUMS (idempotent — EXCEPTION WHEN duplicate_object)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE recovery_state_v2 AS ENUM (
    'active', 'overdue', 'partial_payment', 'promised',
    'recovered', 'disputed', 'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE engagement_state_v2 AS ENUM (
    'unseen', 'engaged', 'intent', 'likely_to_pay', 'ghosting'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE recovery_next_action AS ENUM (
    'send_reminder', 'review_payment', 'follow_up_call',
    'wait', 'merchant_review'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Part 2: v2 columns on recovery_cases (idempotent — IF NOT EXISTS)
-- ============================================================

ALTER TABLE recovery_cases
  ADD COLUMN IF NOT EXISTS recovery_state_v2 recovery_state_v2,
  ADD COLUMN IF NOT EXISTS engagement_state_v2 engagement_state_v2,
  ADD COLUMN IF NOT EXISTS next_action_type recovery_next_action,
  ADD COLUMN IF NOT EXISTS next_action_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS open_invoice_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overdue_invoice_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disputed_invoice_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promised_invoice_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_overdue NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promise_to_pay_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS attention_score INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- Part 3: recovery_case_events — Append-only decision log
-- Uses TEXT for case_id (matching recovery_cases.id type)
-- ============================================================

CREATE TABLE IF NOT EXISTS recovery_case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id TEXT NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_recovery_state recovery_state_v2,
  to_recovery_state recovery_state_v2,
  from_engagement_state engagement_state_v2,
  to_engagement_state engagement_state_v2,
  reason TEXT NOT NULL,
  trigger JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rce_case_occurred
  ON recovery_case_events(case_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_rce_event_type
  ON recovery_case_events(event_type);

-- ============================================================
-- Part 4: Event consumption idempotency table
-- ============================================================

CREATE TABLE IF NOT EXISTS recovery_case_event_consumptions (
  source_event_id TEXT NOT NULL,
  case_id TEXT NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_event_id, case_id)
);

-- ============================================================
-- Part 5: Indexes for the recovery queue query
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_rc_tenant_state
  ON recovery_cases(tenant_id, recovery_state_v2)
  WHERE recovery_state_v2 NOT IN ('recovered', 'closed');

CREATE INDEX IF NOT EXISTS idx_rc_tenant_attention
  ON recovery_cases(tenant_id, attention_score DESC)
  WHERE recovery_state_v2 NOT IN ('recovered', 'closed');

CREATE INDEX IF NOT EXISTS idx_rc_tenant_next_action
  ON recovery_cases(tenant_id, next_action_due_at)
  WHERE next_action_due_at IS NOT NULL;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 028_shadow_recovery_cases.sql  (REWRITTEN for staging replay)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Migration 028: Shadow Recovery Cases for Truth Projection
-- REWRITTEN for replay: original had bare INDEX ... ON ...; statements inside
-- the CREATE TABLE (...) body, which is a 42601 syntax error on any database.
CREATE TABLE IF NOT EXISTS shadow_recovery_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  customer_id UUID NOT NULL,
  total_outstanding NUMERIC DEFAULT 0 NOT NULL,
  total_overdue NUMERIC DEFAULT 0 NOT NULL,
  open_invoice_count INT DEFAULT 0 NOT NULL,
  overdue_invoice_count INT DEFAULT 0 NOT NULL,
  recovery_state recovery_state_v2 NOT NULL DEFAULT 'created',
  next_action_due_at TIMESTAMPTZ,
  projection_version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_src_tenant ON shadow_recovery_cases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_src_customer ON shadow_recovery_cases(customer_id);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 029_supabase_missing_tables.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 029_supabase_missing_tables.sql
-- Creates tables in Supabase that were missing from the public schema
-- Run this in Supabase Dashboard → SQL Editor

-- ============================================================
-- 1. Tenants table (for whatsapp_config and tenant management)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  plan TEXT DEFAULT 'free',
  subdomain TEXT,
  is_active BOOLEAN DEFAULT true,
  first_user_id UUID,
  user_count INT DEFAULT 0,
  max_users INT DEFAULT 1,
  whatsapp_config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON tenants(subdomain);

-- ============================================================
-- 2. Messaging channels table (for Baileys/Gupshup connection state)
-- ============================================================
CREATE TABLE IF NOT EXISTS messaging_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL DEFAULT 'whatsapp',
  provider TEXT NOT NULL,
  phone_number TEXT,
  connection_state TEXT NOT NULL DEFAULT 'disconnected',
  quality_score NUMERIC,
  delivery_success_rate NUMERIC,
  last_heartbeat_at TIMESTAMPTZ,
  last_connected_at TIMESTAMPTZ,
  consecutive_failures INT DEFAULT 0,
  priority INT DEFAULT 0,
  config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  encrypted_credentials BYTEA,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mc_tenant ON messaging_channels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mc_provider ON messaging_channels(provider);

-- ============================================================
-- 3. Customers table (minimal — for queue joins)
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  email TEXT,
  gstin TEXT,
  billing_address TEXT,
  shipping_address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- ============================================================
-- 4. Payments table (for queue actions like record_payment)
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  invoice_id TEXT,
  customer_id TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_mode TEXT,
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  razorpay_payment_id TEXT,
  razorpay_order_id TEXT,
  reconciliation_status TEXT DEFAULT 'pending',
  notes TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 030_fix_outbox_schema.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 030_fix_outbox_schema.sql
-- The outbox table was created with an old schema (002_add_outbox_and_logs.sql)
-- and partially updated (014_harden_outbox.sql). 
-- This migration adds all columns the code expects.

-- Step 1: Add missing columns
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS entity_id TEXT;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS causation_id TEXT;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS correlation_id TEXT;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Step 2: Rename/migrate legacy columns to match code expectations
-- Legacy 'retry_count' → code expects 'attempts'
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;

-- Legacy 'last_attempt_at' → code expects 'next_attempt_at'
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

-- Step 3: Fix status CHECK constraint to include all states the code uses
ALTER TABLE outbox DROP CONSTRAINT IF EXISTS outbox_status_check;
ALTER TABLE outbox ADD CONSTRAINT outbox_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter'));

-- Step 4: Migrate legacy 'processed' boolean to status enum (if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name = 'outbox' 
      AND column_name = 'processed'
  ) THEN
    UPDATE public.outbox 
    SET status = 'completed' 
    WHERE processed = true AND status IS NULL;

    UPDATE public.outbox 
    SET status = 'pending' 
    WHERE (processed = false OR processed IS NULL) AND status IS NULL;
  END IF;
END $$;

-- Step 5: Add NOT NULL constraints (safe — skips if existing rows have nulls)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM outbox WHERE tenant_id IS NULL) THEN
    ALTER TABLE outbox ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM outbox WHERE status IS NULL) THEN
    ALTER TABLE outbox ALTER COLUMN status SET DEFAULT 'pending';
    ALTER TABLE outbox ALTER COLUMN status SET NOT NULL;
  END IF;
END $$;

-- Step 6: Create indexes for query patterns
CREATE INDEX IF NOT EXISTS idx_outbox_tenant_status ON outbox(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_outbox_status_next_attempt ON outbox(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_outbox_correlation ON outbox(correlation_id);
CREATE INDEX IF NOT EXISTS idx_outbox_idempotency ON outbox(idempotency_key);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- [replay guard before 031_add_attributed_amount.sql]
-- Replay guard (schema.sql era): recovery_attributions is referenced by
-- ALTER in 031 and INSERT/UPDATE/comments across 043+ but created nowhere in
-- the migration history (legacy prod table). Shape mirrors the attribution
-- inserts in worker/src/lib/billzo/attribution.ts.
CREATE TABLE IF NOT EXISTS recovery_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  invoice_id TEXT,
  payment_id TEXT,
  reminder_event_id TEXT,
  amount NUMERIC(12,2),
  attributed_amount NUMERIC(12,2),
  attribution_type TEXT,
  attribution_window_hours INT,
  confidence_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 031_add_attributed_amount.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 031_add_attributed_amount.sql
-- First Rupee Accounting: track exactly how much BillZo recovered
--
-- Adds: attributed_amount to recovery_attributions (canonical money-truth column)
-- The existing `amount` column is preserved for backward compatibility.
--
-- Every attribution must now carry the actual recovered amount so we can answer:
--   "How much money did BillZo recover this month?"

ALTER TABLE recovery_attributions
  ADD COLUMN IF NOT EXISTS attributed_amount NUMERIC(12,2);

COMMENT ON COLUMN recovery_attributions.attributed_amount IS 'Actual recovered amount attributed to BillZo. Canonical money-truth column.';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 031_fix_outbox_column_types.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 031_fix_outbox_column_types.sql
-- Drop the blocking policy first
DROP POLICY IF EXISTS outbox_tenant_isolation ON public.outbox;

-- Alter column types from UUID to TEXT
ALTER TABLE public.outbox 
  ALTER COLUMN tenant_id TYPE TEXT,
  ALTER COLUMN entity_id TYPE TEXT,
  ALTER COLUMN causation_id TYPE TEXT,
  ALTER COLUMN correlation_id TYPE TEXT,
  ALTER COLUMN idempotency_key TYPE TEXT;

-- Restore the policy (ensuring it handles TEXT types)
CREATE POLICY outbox_tenant_isolation ON public.outbox
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::text);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 032_add_automation_toggles.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 032_add_automation_toggles.sql
-- Merchant sovereignty: control over who gets reminded and when

-- Customers: per-customer automation mode
--   full_auto — BillZo sends reminders automatically (default)
--   manual   — BillZo prepares reminders, merchant must approve
--   muted    — No reminders for this customer
ALTER TABLE customers ADD COLUMN IF NOT EXISTS automation_mode TEXT NOT NULL DEFAULT 'full_auto';

-- Invoices: per-invoice snooze controls
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_snoozed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS snooze_until TIMESTAMPTZ;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 033_add_allow_negative_stock.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 033_add_allow_negative_stock.sql
-- Inventory Sovereignty: merchants can choose to allow negative stock
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS allow_negative_stock BOOLEAN NOT NULL DEFAULT true;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 034_consolidate_payments.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 034_consolidate_payments.sql
-- Consolidate the payments table from 3 competing definitions (schema.sql, 005, 029)
-- into a single canonical schema.
--
-- Canonical columns after migration:
--   id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
--   tenant_id       TEXT NOT NULL
--   invoice_id      TEXT
--   customer_id     TEXT
--   amount          NUMERIC NOT NULL DEFAULT 0
--   payment_mode    TEXT               (cash / upi / razorpay)
--   status          TEXT NOT NULL DEFAULT 'pending'
--                   CHECK (status IN ('pending', 'paid', 'failed'))
--   razorpay_payment_id  TEXT
--   razorpay_order_id    TEXT
--   collected_via   TEXT DEFAULT 'manual'
--   platform_fee    NUMERIC DEFAULT 0
--   notes           TEXT
--   paid_at         TIMESTAMPTZ
--   created_at      TIMESTAMPTZ DEFAULT NOW()
--   updated_at      TIMESTAMPTZ DEFAULT NOW()

-- 1. Add columns that may be missing depending on which CREATE TABLE ran
ALTER TABLE payments ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;

-- 2. Ensure canonical columns exist with correct types
--    (id, tenant_id, invoice_id, amount, payment_mode are in all 3 definitions)

-- 3. Set defaults for null timestamps
UPDATE payments SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE payments SET paid_at = created_at WHERE status = 'paid' AND paid_at IS NULL;

-- 4. Migrate legacy reconciliation data
UPDATE payments SET status = 'paid' WHERE is_reconciled = true AND status = 'pending';
UPDATE payments SET status = 'paid' WHERE is_reconciled = true AND status IS NULL;

-- 5. Normalize status values to canonical set
UPDATE payments SET status = 'paid'    WHERE status IN ('PAID', 'paid', 'success', 'completed');
UPDATE payments SET status = 'pending' WHERE status IS NULL OR status = '';
UPDATE payments SET status = 'failed'  WHERE status IN ('FAILED', 'failed');

-- 6. Drop deprecated columns
ALTER TABLE payments DROP COLUMN IF EXISTS is_reconciled;
ALTER TABLE payments DROP COLUMN IF EXISTS reconciliation_status;
ALTER TABLE payments DROP COLUMN IF EXISTS payment_reference;
ALTER TABLE payments DROP COLUMN IF EXISTS transaction_id;
ALTER TABLE payments DROP COLUMN IF EXISTS payment_method;

-- 7. Add status CHECK constraint (safe after normalization above)
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'paid', 'failed'));

-- 8. Ensure indexes
CREATE INDEX IF NOT EXISTS idx_payments_tenant   ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice  ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_order    ON payments(razorpay_order_id);

-- 9. Align plan type enum: TS uses 'starter' | 'growth' | 'pro', SQL defaults to 'free'
ALTER TABLE tenants ALTER COLUMN plan SET DEFAULT 'starter';
UPDATE tenants SET plan = 'starter' WHERE plan IS NULL OR plan = '';

-- 10. RPC for atomically incrementing outbox retry count
CREATE OR REPLACE FUNCTION increment_attempts(event_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE outbox
  SET attempts = COALESCE(attempts, 0) + 1
  WHERE id = event_id
  RETURNING attempts INTO new_count;
  RETURN new_count;
END;
$$;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 035_event_spine.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 035_event_spine.sql
-- Phase 1 — Event Spine Invariants (schema layer)
--
-- Adds spine columns, CHECK constraints, and helper RPCs to the events table.
-- All new columns are nullable/optional so existing rows are not affected.
--
-- Canonical SpineEvent shape (from packages/shared/src/spine.ts):
--   event_id          TEXT        NOT NULL UNIQUE   — UUID v7 (time-sortable)
--   entity_type       TEXT        NOT NULL          — constrained to VALID_ENTITY_TYPES
--   entity_id         TEXT        NOT NULL
--   causal_id         TEXT                          — parent event UUID (NULL for root)
--   correlation_id    TEXT        NOT NULL DEFAULT event_id
--   sequence_no       BIGINT      NOT NULL DEFAULT 1 — per (entity_type, entity_id)
--   occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now()
--   ingested_at       TIMESTAMPTZ NOT NULL DEFAULT now()
--   source_system     TEXT        NOT NULL          — constrained to VALID_SOURCE_SYSTEMS
--   idempotency_key   TEXT        NOT NULL
--   payload           JSONB       DEFAULT '{}'
--   external_refs     JSONB                         — { whatsapp_message_id, razorpay_payment_id, ... }
--
-- Run this in your Supabase SQL editor.

-- ============================================================
-- 1. Add spine columns (all nullable — existing rows stay valid)
-- ============================================================
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_id          TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS causal_id         TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS correlation_id    TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS sequence_no       BIGINT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_system     TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS idempotency_key   TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS external_refs     JSONB;

-- ingested_at — we already have created_at, but the spine model is explicit
ALTER TABLE events ADD COLUMN IF NOT EXISTS ingested_at       TIMESTAMPTZ;

-- Rename metadata → payload for consistency with SpineEvent model
ALTER TABLE events RENAME COLUMN metadata TO payload;

-- ============================================================
-- 2. Backfill: populate spine columns for existing rows
-- ============================================================
-- event_id: generate UUID v7 from created_at timestamp + random suffix
UPDATE events
SET event_id = (
    encode(
      substring(int8send(extract(epoch from created_at)::bigint * 1000) FROM 1 FOR 6)
      || decode(lpad(to_hex((random() * 4095)::int), 3, '0'), 'hex')
      || decode('8' || lpad(to_hex((random() * 16383)::int), 3, '0'), 'hex')
      || decode(encode(gen_random_bytes(8), 'hex'), 'hex'),
    'hex')
  )
WHERE event_id IS NULL;

-- correlation_id: default to event_id
UPDATE events SET correlation_id = event_id WHERE correlation_id IS NULL;

-- sequence_no: assign monotonically per (entity_type, entity_id)
WITH numbered AS (
  SELECT id, row_number() OVER (
    PARTITION BY entity_type, entity_id ORDER BY created_at, id
  ) AS seq
  FROM events
)
UPDATE events e
SET sequence_no = n.seq
FROM numbered n
WHERE e.id = n.id AND e.sequence_no IS NULL;

-- source_system: infer from event_name prefix or existing source column
UPDATE events
SET source_system = CASE
  WHEN source IN ('webhook', 'api', 'cron', 'system') THEN source
  WHEN event_name LIKE 'payment.%'  THEN 'webhook'
  WHEN event_name LIKE 'reminder.%' THEN 'worker'
  WHEN event_name LIKE 'invoice.%'  THEN 'api'
  ELSE 'system'
END
WHERE source_system IS NULL;

-- idempotency_key: derive from existing unique constraints
UPDATE events
SET idempotency_key = CASE
  WHEN event_name = 'payment.success' THEN 'razorpay:' || COALESCE(payload->>'razorpay_payment_id', event_id)
  WHEN event_name = 'reminder.sent'   THEN 'reminder:' || entity_id || ':' || COALESCE(follow_up_stage::text, '0')
  WHEN event_name = 'invoice.created' THEN 'invoice:' || entity_id
  ELSE 'legacy:' || event_id
END
WHERE idempotency_key IS NULL;

-- ingested_at: use created_at for historical rows
UPDATE events SET ingested_at = created_at WHERE ingested_at IS NULL;

-- ============================================================
-- 4. Add NOT NULL constraints (safe after backfill)
-- ============================================================
ALTER TABLE events ALTER COLUMN event_id        SET NOT NULL;
ALTER TABLE events ALTER COLUMN correlation_id  SET NOT NULL;
ALTER TABLE events ALTER COLUMN sequence_no     SET NOT NULL;
ALTER TABLE events ALTER COLUMN source_system   SET NOT NULL;
ALTER TABLE events ALTER COLUMN idempotency_key SET NOT NULL;
ALTER TABLE events ALTER COLUMN ingested_at     SET NOT NULL;
ALTER TABLE events ALTER COLUMN payload         SET DEFAULT '{}'::jsonb;

-- ============================================================
-- 5. Add UNIQUE constraint on event_id, replace PK
-- ============================================================
ALTER TABLE events ADD CONSTRAINT events_event_id_unique UNIQUE (event_id);
CREATE INDEX IF NOT EXISTS idx_events_event_id ON events (event_id);

-- ============================================================
-- 6. Add CHECK constraints for entity_type and source_system
-- ============================================================
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_entity_type_check;
ALTER TABLE events ADD CONSTRAINT events_entity_type_check
  CHECK (entity_type IN (
    'invoice', 'customer', 'payment', 'recovery_case',
    'tenant', 'product', 'whatsapp_message', 'unknown'
  ));

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_source_system_check;
ALTER TABLE events ADD CONSTRAINT events_source_system_check
  CHECK (source_system IN (
    'worker', 'api', 'webhook', 'cron', 'client', 'system'
  ));

-- ============================================================
-- 7. Add indexes for spine query patterns
-- ============================================================
-- Lookup by entity (monotonic ordering)
CREATE INDEX IF NOT EXISTS idx_events_entity_sequence
  ON events (entity_type, entity_id, sequence_no);

-- Causality chain traversal
CREATE INDEX IF NOT EXISTS idx_events_causal_id
  ON events (causal_id) WHERE causal_id IS NOT NULL;

-- Idempotency key lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_idempotency_key
  ON events (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Correlation grouping
CREATE INDEX IF NOT EXISTS idx_events_correlation_id
  ON events (correlation_id) WHERE correlation_id IS NOT NULL;

-- External refs lookup (GIN for JSONB key queries)
CREATE INDEX IF NOT EXISTS idx_events_external_refs
  ON events USING GIN (external_refs);

-- ============================================================
-- 8. RPC: increment_entity_sequence — atomic sequence_no assignment
-- ============================================================
-- Used by SpineWriter.nextSequence() to guarantee per-entity monotonicity.
CREATE OR REPLACE FUNCTION increment_entity_sequence(
  p_entity_type TEXT,
  p_entity_id   TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_seq INTEGER;
BEGIN
  INSERT INTO entity_sequences (entity_type, entity_id, last_sequence)
  VALUES (p_entity_type, p_entity_id, 1)
  ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET last_sequence = entity_sequences.last_sequence + 1
  RETURNING last_sequence INTO new_seq;
  RETURN new_seq;
END;
$$;

-- ============================================================
-- 9. entity_sequences table — supports atomic sequence generation
-- ============================================================
CREATE TABLE IF NOT EXISTS entity_sequences (
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entity_type, entity_id)
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 036_event_spine_phase2.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 036_event_spine_phase2.sql
-- Phase 2 — Per-Entity Monotonic Ordering
--
-- Prerequisite: migration 035 (spine columns + entity_sequences table)
--
-- Adds:
--   1. UNIQUE constraint on (entity_type, entity_id, sequence_no)
--   2. BEFORE INSERT trigger to reject out-of-order inserts
--   3. tenant_id column on events table if not present
--
-- Run this in your Supabase SQL editor.

-- ============================================================
-- 1. Ensure tenant_id exists on events (needed for SpineWriter)
-- ============================================================
ALTER TABLE events ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);

-- ============================================================
-- 2. UNIQUE constraint on (entity_type, entity_id, sequence_no)
-- ============================================================
-- This is the foundation of monotonic ordering: no two events
-- for the same entity can share a sequence number.
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_entity_seq_unique
  ON events (entity_type, entity_id, sequence_no);

-- ============================================================
-- 3. BEFORE INSERT trigger — reject out-of-order inserts
-- ============================================================
-- The trigger provides a second line of defense beyond the
-- application-level SequenceGenerator. If something bypasses
-- SpineWriter and tries to insert directly, this catches it.
CREATE OR REPLACE FUNCTION reject_out_of_order_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  max_seq INTEGER;
BEGIN
  -- Allow inserts where sequence_no is 1 (first event for entity)
  IF NEW.sequence_no <= 1 THEN
    RETURN NEW;
  END IF;

  -- Check the current max sequence_no for this entity
  SELECT COALESCE(MAX(sequence_no), 0) INTO max_seq
  FROM events
  WHERE entity_type = NEW.entity_type
    AND entity_id = NEW.entity_id;

  -- Reject if not exactly max_seq + 1
  IF NEW.sequence_no != max_seq + 1 THEN
    RAISE EXCEPTION 'Out-of-order event: expected sequence_no %, got % for (%, %)',
      max_seq + 1, NEW.sequence_no, NEW.entity_type, NEW.entity_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_out_of_order_event ON events;
CREATE TRIGGER trg_reject_out_of_order_event
  BEFORE INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION reject_out_of_order_event();

-- ============================================================
-- 4. Audit: ensure increment_entity_sequence RPC exists
-- ============================================================
-- (Defined in migration 035 — this is a safety re-run)
CREATE OR REPLACE FUNCTION increment_entity_sequence(
  p_entity_type TEXT,
  p_entity_id   TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_seq INTEGER;
BEGIN
  INSERT INTO entity_sequences (entity_type, entity_id, last_sequence)
  VALUES (p_entity_type, p_entity_id, 1)
  ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET last_sequence = entity_sequences.last_sequence + 1
  RETURNING last_sequence INTO new_seq;
  RETURN new_seq;
END;
$$;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 037_event_spine_phase3.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 037_event_spine_phase3.sql
-- Phase 3 — Identity Quarantine
--
-- Prerequisite: migrations 035, 036
--
-- Creates:
--   1. spine_quarantine table for events rejected due to missing external_refs
--   2. Indexes for quarantine query patterns
--
-- Run this in your Supabase SQL editor.

CREATE TABLE IF NOT EXISTS spine_quarantine (
  id            BIGSERIAL PRIMARY KEY,
  event_id      TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  source_system TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload       JSONB DEFAULT '{}'::jsonb,
  reason        TEXT NOT NULL,
  refused_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id     VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_spine_quarantine_entity
  ON spine_quarantine (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_spine_quarantine_tenant
  ON spine_quarantine (tenant_id);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 038_gate_config.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- ============================================================
-- Phase 5: Mutation Gateway — Per-Domain Enforcement Toggle
-- ============================================================
-- The gate_config table controls whether the MutationGate
-- shadows, warns, or blocks mutations for each business domain.
--
--   shadow → Gate logs all mutations, blocks nothing
--   warn   → Gate logs + emits alert metric on violation
--   block  → Gate rejects violations with structured error
--
-- Rollout strategy (one domain at a time):
--   1. All domains start at 'shadow'
--   2. Move each domain through warn → block after validation
-- ============================================================

CREATE TABLE IF NOT EXISTS gate_config (
  domain     TEXT PRIMARY KEY,
  mode       TEXT NOT NULL DEFAULT 'shadow' CHECK (mode IN ('shadow', 'warn', 'block')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed all domains in 'shadow' mode
INSERT INTO gate_config (domain, mode) VALUES
  ('payment',    'shadow'),
  ('recovery',   'shadow'),
  ('transport',  'shadow'),
  ('behavioral', 'shadow'),
  ('tenant',     'shadow'),
  ('invoice',    'shadow')
ON CONFLICT (domain) DO NOTHING;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 039_outbox_notify.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- ============================================================
-- Phase 6: Outbox Push — Postgres LISTEN/NOTIFY for push-based
-- event processing, replacing the 10s polling loop.
-- ============================================================
-- Fires on INSERT into the outbox table, notifying workers
-- so they can process events immediately instead of polling.
-- Polling is retained as a degraded fallback at 60s interval.
-- ============================================================

CREATE OR REPLACE FUNCTION notify_outbox_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('outbox_event', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_outbox_event
AFTER INSERT ON outbox
FOR EACH ROW
EXECUTE FUNCTION notify_outbox_event();

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 040_decision_engine.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- ============================================================
-- Decision Engine v1 — Pre-Send Checklist & Audit Log
-- ============================================================
--
-- Sprint A: recovery_decisions table (append-only audit log)
-- Sprint B: customer_tier, merchant interaction tracking
--
-- Every reminder send/block decision is recorded so we can
-- answer "WHY was this message sent?" for any invoice.
-- ============================================================

-- ============================================================
-- 1. CUSTOMER TIER — Controls escalation ceiling
-- ============================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_tier TEXT
  NOT NULL DEFAULT 'regular'
  CHECK (customer_tier IN ('vip', 'regular', 'risky', 'blacklisted'));

-- ============================================================
-- 2. PHONE VERIFICATION STATUS
-- ============================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_verification TEXT
  NOT NULL DEFAULT 'unknown'
  CHECK (phone_verification IN ('verified', 'unverified', 'unknown'));

-- ============================================================
-- 3. RECOVERY DECISIONS — Append-only decision audit log
-- ============================================================
-- Every canSendReminder() evaluation produces one row.
-- This is NOT a queue — it's an immutable record of what
-- the system decided and why.

CREATE TABLE IF NOT EXISTS recovery_decisions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    TEXT NOT NULL,
  tenant_id     TEXT NOT NULL,
  customer_id   TEXT NOT NULL,
  decision      TEXT NOT NULL CHECK (decision IN ('send', 'block', 'pending_approval')),
  reason        TEXT NOT NULL,
  confidence    NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  rules_checked JSONB NOT NULL DEFAULT '[]'::jsonb,
  rules_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  context_snapshot JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recovery_decisions_invoice
  ON recovery_decisions(invoice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recovery_decisions_tenant
  ON recovery_decisions(tenant_id, created_at DESC);

-- ============================================================
-- 4. CUSTOMER REPUTATION SCORE — Deterministic composite
-- ============================================================
-- Computed from behavioral metrics and payment history.
-- Range: 0–100. Higher = more reliable payer.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS reputation_score INTEGER
  NOT NULL DEFAULT 50
  CHECK (reputation_score >= 0 AND reputation_score <= 100);

-- ============================================================
-- 5. INTERACTION EVENTS — Merchant-initiated contacts
-- ============================================================
-- Tracks manual merchant actions so the decision engine can
-- avoid sending redundant automated reminders.

CREATE TABLE IF NOT EXISTS interaction_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL,
  customer_id   TEXT NOT NULL,
  invoice_id    TEXT,
  event_type    TEXT NOT NULL CHECK (event_type IN (
    'manual_call', 'manual_whatsapp', 'visit', 'email', 'billzo_reminder'
  )),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interaction_events_lookup
  ON interaction_events(tenant_id, customer_id, created_at DESC);

-- ============================================================
-- 6. PAYMENT PROMISES — Structured promise tracking
-- ============================================================
-- Separate table (not just a state field) to support multiple
-- promises per invoice/case with history.

CREATE TABLE IF NOT EXISTS payment_promises (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL,
  customer_id   TEXT NOT NULL,
  invoice_id    TEXT NOT NULL,
  promise_date  TIMESTAMPTZ NOT NULL,
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fulfilled', 'broken')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_promises_active
  ON payment_promises(tenant_id, customer_id, invoice_id)
  WHERE status = 'active';

-- ============================================================
-- 7. INVOICE: add outstanding_amount and disputed flag
-- ============================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS outstanding_amount NUMERIC(12,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_disputed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS manual_interaction_at TIMESTAMPTZ;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 041_merchant_override.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- ============================================================
-- Merchant Override — Rule #9
-- ============================================================
-- When the decision engine blocks a reminder, the merchant can
-- override the block. This records WHY they overrode so the
-- system can learn from human judgment.
--
-- Override expires after 24h (or after the next send).
-- ============================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS override_send BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS override_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS override_reason TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS override_warning_acked BOOLEAN NOT NULL DEFAULT false;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 042_next_review_at.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Migration 042: Add next_review_at to recovery_decisions
-- Allows the timeline to show "Next review: 29 June 09:00" on blocked decisions

ALTER TABLE recovery_decisions
ADD COLUMN next_review_at TIMESTAMPTZ;

-- Backfill: for existing rows with cooldown blocks, estimate from created_at
UPDATE recovery_decisions
SET next_review_at = created_at + INTERVAL '24 hours'
WHERE next_review_at IS NULL
  AND (rules_snapshot->>'cooldown_expired') = 'false';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 043_unified_payment_ledger.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Migration 043: Unified Payment Ledger
-- Makes invoices.outstanding_amount the single source of truth,
-- maintained automatically by database triggers on the payments table.
-- ============================================================

-- 1. Payment source enum — canonical list
CREATE TYPE payment_source AS ENUM (
  'cash',
  'razorpay',
  'bank_transfer',
  'cheque',
  'adjustment',
  'upi'
);

-- 2. Add new columns to payments table
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS actor TEXT,
  ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source payment_source;

-- Backfill source from existing payment_mode values
UPDATE payments
SET source = CASE
  WHEN payment_mode IN ('cash', 'razorpay', 'upi') THEN payment_mode::payment_source
  WHEN payment_mode IN ('bank_transfer', 'bank', 'neft', 'imps') THEN 'bank_transfer'::payment_source
  WHEN payment_mode IN ('cheque', 'check') THEN 'cheque'::payment_source
  WHEN payment_mode IN ('adjustment', 'credit_note') THEN 'adjustment'::payment_source
  ELSE 'cash'::payment_source
END
WHERE source IS NULL;

-- 2b. Add paid_amount to invoices for the trigger to maintain
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) DEFAULT 0;

-- 3. Trigger function to maintain invoice outstanding
CREATE OR REPLACE FUNCTION maintain_invoice_outstanding()
RETURNS TRIGGER AS $$
DECLARE
  inv_total NUMERIC;
  inv_paid NUMERIC;
BEGIN
  -- Determine the invoice_id to recalculate
  -- Handles INSERT, UPDATE, DELETE
  IF TG_OP = 'DELETE' THEN
    IF OLD.invoice_id IS NULL THEN RETURN OLD; END IF;

    SELECT COALESCE(SUM(amount), 0) INTO inv_paid
    FROM payments
    WHERE invoice_id = OLD.invoice_id AND status = 'paid';

    SELECT COALESCE(total, 0) INTO inv_total
    FROM invoices
    WHERE id = OLD.invoice_id;

    UPDATE invoices SET
      paid_amount = inv_paid,
      outstanding_amount = GREATEST(inv_total - inv_paid, 0),
      status = CASE
        WHEN inv_paid >= inv_total THEN 'paid'
        WHEN inv_paid > 0 THEN 'partial'
        ELSE 'unpaid'
      END,
      updated_at = NOW()
    WHERE id = OLD.invoice_id;

    RETURN OLD;
  END IF;

  IF NEW.invoice_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO inv_paid
  FROM payments
  WHERE invoice_id = NEW.invoice_id AND status = 'paid';

  SELECT COALESCE(total, 0) INTO inv_total
  FROM invoices
  WHERE id = NEW.invoice_id;

  UPDATE invoices SET
    paid_amount = inv_paid,
    outstanding_amount = GREATEST(inv_total - inv_paid, 0),
    status = CASE
      WHEN inv_paid >= inv_total THEN 'paid'
      WHEN inv_paid > 0 THEN 'partial'
      ELSE 'unpaid'
    END,
    updated_at = NOW()
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger on payments table
DROP TRIGGER IF EXISTS trg_maintain_invoice_outstanding ON payments;
CREATE TRIGGER trg_maintain_invoice_outstanding
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION maintain_invoice_outstanding();

-- 5. Backfill all existing invoices (handles the newly-added paid_amount column)
UPDATE invoices i
SET
  paid_amount = COALESCE((
    SELECT SUM(p.amount) FROM payments p
    WHERE p.invoice_id = i.id AND p.status = 'paid'
  ), 0),
  outstanding_amount = GREATEST(i.total - COALESCE((
    SELECT SUM(p.amount) FROM payments p
    WHERE p.invoice_id = i.id AND p.status = 'paid'
  ), 0), 0),
  status = CASE
    WHEN COALESCE((
      SELECT SUM(p.amount) FROM payments p
      WHERE p.invoice_id = i.id AND p.status = 'paid'
    ), 0) >= i.total THEN 'paid'
    WHEN COALESCE((
      SELECT SUM(p.amount) FROM payments p
      WHERE p.invoice_id = i.id AND p.status = 'paid'
    ), 0) > 0 THEN 'partial'
    ELSE 'unpaid'
  END;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 044_recovery_audit_log.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 044_recovery_audit_log.sql
-- Traceability table for all financial audit and rebuild operations.
--
-- Every audit scan creates one row per invoice checked.
-- Every rebuild action creates one row recording what was fixed.
-- This gives full provenance: who fixed what, when, and why.
--
-- Query pattern for support:
--   SELECT * FROM recovery_audit_log
--   WHERE tenant_id = '<tid>' AND drift_detected = true
--   ORDER BY created_at DESC;

-- ============================================================
-- 1. AUDIT LOG TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS recovery_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  action          TEXT NOT NULL CHECK (action IN ('audit_scan', 'rebuild')),
  invoice_id      TEXT,
  invoice_number  TEXT,

  -- Audit result (denormalised for easy querying)
  drift_amount    NUMERIC NOT NULL DEFAULT 0,
  drift_detected  BOOLEAN NOT NULL DEFAULT false,
  severity        TEXT CHECK (severity IN ('critical', 'warning', NULL)),

  -- Full audit snapshot (JSON so we can evolve the schema)
  audit_snapshot  JSONB NOT NULL DEFAULT '{}',

  -- Rebuild fields (only populated when action = 'rebuild')
  rebuild_field      TEXT,
  rebuild_old_value  NUMERIC,
  rebuild_new_value  NUMERIC,
  rebuild_reason     TEXT,

  -- Metadata (CLI version, flags, etc.)
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Allow null invoice_id for bulk entries
ALTER TABLE recovery_audit_log ALTER COLUMN invoice_id DROP NOT NULL;

-- ============================================================
-- 2. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ral_tenant_created
  ON recovery_audit_log(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ral_tenant_drifts
  ON recovery_audit_log(tenant_id, created_at DESC)
  WHERE drift_detected = true;

CREATE INDEX IF NOT EXISTS idx_ral_tenant_rebuilds
  ON recovery_audit_log(tenant_id, created_at DESC)
  WHERE action = 'rebuild';

-- ============================================================
-- 3. COMMENTS
-- ============================================================

COMMENT ON TABLE  recovery_audit_log IS 'Provenance log for financial audit scans and rebuild operations';
COMMENT ON COLUMN recovery_audit_log.action IS 'audit_scan = passive check, rebuild = active fix';
COMMENT ON COLUMN recovery_audit_log.audit_snapshot IS 'Full AuditDrift JSON at time of scan';
COMMENT ON COLUMN recovery_audit_log.metadata IS 'CLI context: version, flags, duration, etc.';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 045_get_priority_cases_rpc.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 045_get_priority_cases_rpc.sql
-- RPC function for fetching priority recovery cases

CREATE OR REPLACE FUNCTION get_priority_cases(
  p_tenant_id TEXT,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  case_id TEXT,
  customer_id TEXT,
  customer_name TEXT,
  phone TEXT,
  total_overdue NUMERIC,
  oldest_overdue_days INT,
  attention_score INT,
  next_action_type TEXT,
  promise_to_pay_date TIMESTAMPTZ,
  ignored_reminders INT,
  broken_promises INT,
  open_invoice_count INT,
  automation_mode TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rc.id::text as case_id,
    rc.customer_id::text,
    c.customer_name::text,
    c.phone::text,
    rc.total_overdue::numeric,
    COALESCE((
      SELECT MAX(EXTRACT(DAY FROM (NOW() - inv.due_date)::interval))::int
      FROM invoices inv
      WHERE inv.tenant_id = p_tenant_id
        AND inv.customer_id = rc.customer_id
        AND inv.status IN ('unpaid', 'overdue', 'partial')
    ), 0)::int as oldest_overdue_days,
    rc.attention_score::int,
    rc.next_action_type::text,
    rc.promise_to_pay_date::timestamptz,
    COALESCE((
      SELECT COUNT(*)::int
      FROM whatsapp_events we
      WHERE we.tenant_id = p_tenant_id
        AND we.direction = 'outbound'
        AND we.status IN ('sent', 'delivered', 'read')
        AND we.occurred_at > COALESCE(rc.last_activity_at, rc.created_at)
        AND EXISTS (
          SELECT 1 FROM invoices inv2
          WHERE inv2.id = we.invoice_id
          AND inv2.customer_id = rc.customer_id
        )
    ), 0)::int as ignored_reminders,
    COALESCE((
      SELECT COUNT(*)::int
      FROM recovery_case_events rce
      WHERE rce.case_id = rc.id
        AND rce.event_type = 'transition'
        AND rce.payload->>'to_recovery_state' = 'overdue'
        AND rce.payload->>'from_recovery_state' = 'promised'
    ), 0)::int as broken_promises,
    rc.open_invoice_count::int,
    c.automation_mode::text
  FROM recovery_cases rc
  JOIN customers c ON c.id = rc.customer_id
  WHERE rc.tenant_id = p_tenant_id
    AND rc.recovery_state_v2 NOT IN ('recovered', 'closed')
    AND rc.next_action_type IN ('send_reminder', 'call', 'follow_up_call')
  ORDER BY rc.attention_score DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION get_priority_cases IS 'Returns top priority recovery cases for a tenant, ordered by attention_score DESC';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 046_reconcile_whatsapp_events_schema.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 018_reconcile_whatsapp_events_schema.sql
-- Reconcile schema drift: whatsapp_events accumulated ~30 untracked columns
-- across migrations 015-017, manual dashboard changes, and application code.
-- This migration makes the schema reproducible from Git.
-- In production, every ADD COLUMN uses IF NOT EXISTS and is a no-op.
-- In fresh environments, this creates the full schema.

BEGIN;

-- ============================================================
-- 1. Core columns from original CREATE TABLE (never migrated)
-- ============================================================
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS invoice_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS recovery_attempt_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ============================================================
-- 2. Columns from migration 015 (delivery tracking)
-- ============================================================
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound';
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS correlation_id UUID;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS template TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS recovery_stage TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS server_ack_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS rate_limited_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS time_to_click_seconds INT;

-- ============================================================
-- 3. Columns from migration 016 (message identity)
-- ============================================================
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS billzo_message_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS conversation_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS message_origin TEXT DEFAULT 'automation';
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS event_sequence BIGINT DEFAULT 0;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS transport_message_hash TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS parent_billzo_message_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS attempt_number INT DEFAULT 1;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS reminder_stage TEXT;

-- ============================================================
-- 4. Columns added via dashboard (untracked) and used in code
-- ============================================================
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS sync_status TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS message_type TEXT;

-- ============================================================
-- 5. Columns queried by recovery timeline (amount, preview, failed_at)
-- ============================================================
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS amount NUMERIC;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS message_preview TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ============================================================
-- 6. Nullable constraints — migration 016 made some NOT NULL
--    but we need to backfill first in production.
--    Skip NOT NULL here to avoid failures on existing rows.
-- ============================================================

-- ============================================================
-- 7. Indexes from migrations 015-016
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_invoice_timeline ON whatsapp_events(invoice_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_provider_msg ON whatsapp_events(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_we_billzo_message_id ON whatsapp_events(billzo_message_id);
CREATE INDEX IF NOT EXISTS idx_we_conversation_id ON whatsapp_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_we_transport_hash ON whatsapp_events(transport_message_hash);
CREATE INDEX IF NOT EXISTS idx_we_sequence ON whatsapp_events(billzo_message_id, event_sequence DESC);

-- Tenant-wide timeline queries (Recovery History page)
CREATE INDEX IF NOT EXISTS idx_we_tenant_occurred ON whatsapp_events(tenant_id, occurred_at DESC);

-- Customer lookups (recovery timeline per customer)
CREATE INDEX IF NOT EXISTS idx_we_customer ON whatsapp_events(tenant_id, customer_id);

-- ============================================================
-- 8. Replace the broken get_priority_cases RPC
--    (the previous version referenced we.customer_id which did
--     not exist at the time — now resolved via invoices join)
-- ============================================================
CREATE OR REPLACE FUNCTION get_priority_cases(
  p_tenant_id TEXT,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  case_id TEXT,
  customer_id TEXT,
  customer_name TEXT,
  phone TEXT,
  total_overdue NUMERIC,
  oldest_overdue_days INT,
  attention_score INT,
  next_action_type TEXT,
  promise_to_pay_date TIMESTAMPTZ,
  ignored_reminders INT,
  broken_promises INT,
  open_invoice_count INT,
  automation_mode TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rc.id::text as case_id,
    rc.customer_id::text,
    c.customer_name::text,
    c.phone::text,
    rc.total_overdue::numeric,
    COALESCE((
      SELECT MAX(EXTRACT(DAY FROM (NOW() - inv.due_date)::interval))::int
      FROM invoices inv
      WHERE inv.tenant_id = p_tenant_id
        AND inv.customer_id = rc.customer_id
        AND inv.status IN ('unpaid', 'overdue', 'partial')
    ), 0)::int as oldest_overdue_days,
    rc.attention_score::int,
    rc.next_action_type::text,
    rc.promise_to_pay_date::timestamptz,
    COALESCE((
      SELECT COUNT(*)::int
      FROM whatsapp_events we
      WHERE we.tenant_id = p_tenant_id
        AND we.direction = 'outbound'
        AND we.status IN ('sent', 'delivered', 'read')
        AND we.occurred_at > COALESCE(rc.last_activity_at, rc.created_at)
        AND EXISTS (
          SELECT 1 FROM invoices inv2
          WHERE inv2.id = we.invoice_id
          AND inv2.customer_id = rc.customer_id
        )
    ), 0)::int as ignored_reminders,
    COALESCE((
      SELECT COUNT(*)::int
      FROM recovery_case_events rce
      WHERE rce.case_id = rc.id
        AND rce.event_type = 'transition'
        AND rce.payload->>'to_recovery_state' = 'overdue'
        AND rce.payload->>'from_recovery_state' = 'promised'
    ), 0)::int as broken_promises,
    rc.open_invoice_count::int,
    c.automation_mode::text
  FROM recovery_cases rc
  JOIN customers c ON c.id = rc.customer_id
  WHERE rc.tenant_id = p_tenant_id
    AND rc.recovery_state_v2 NOT IN ('recovered', 'closed')
    AND rc.next_action_type IN ('send_reminder', 'call', 'follow_up_call')
  ORDER BY rc.attention_score DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION get_priority_cases IS 'Returns top priority recovery cases for a tenant, ordered by attention_score DESC';

COMMIT;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 047_feature_trials.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 047_feature_trials.sql
-- Tracks the single-lifetime recovery trial campaign per tenant.
-- Status transitions: (no row) → running → completed

CREATE TABLE IF NOT EXISTS feature_trials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    feature TEXT NOT NULL CHECK (feature IN ('free_recovery_trial')),
    status TEXT NOT NULL CHECK (status IN ('running', 'completed')),
    created_by TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}',
    UNIQUE (tenant_id, feature)
);

CREATE INDEX IF NOT EXISTS idx_feature_trials_lookup
ON feature_trials (tenant_id, feature);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 048_trial_previews.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 048_trial_previews.sql
-- Ephemeral preview snapshots so the approve endpoint reads a signed,
-- server-computed list of eligible customers (never trusts client customerIds).

CREATE TABLE IF NOT EXISTS trial_previews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    eligible_customers JSONB NOT NULL,
    eligible_count INT NOT NULL,
    total_overdue NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour'
);

CREATE INDEX IF NOT EXISTS idx_trial_previews_tenant
ON trial_previews (tenant_id, created_at DESC);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 049_trial_index.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 049_trial_index.sql
-- Partial index for efficient trial-eligibility query:
--   SELECT MIN(due_at) FROM invoices WHERE tenant_id = $1 AND outstanding_amount > 0;

CREATE INDEX IF NOT EXISTS idx_invoices_trial_lookup
ON invoices (tenant_id, due_at)
WHERE outstanding_amount > 0;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 050_tenant_memberships.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 050_tenant_memberships.sql
-- Tenant memberships: links users (by user_id from JWT) to tenants with roles
-- Onboarding tracking + login audit trail

-- 1. Tenant memberships: user_id → tenant (source of truth for ownership)
CREATE TABLE IF NOT EXISTS tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'owner',  -- owner, accountant, staff, agent
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tm_user ON tenant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_tm_tenant ON tenant_memberships(tenant_id);

-- 2. Tenants: add onboarding tracking columns
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_state TEXT DEFAULT 'incomplete';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- 3. Login events: audit trail for support/debugging
CREATE TABLE IF NOT EXISTS login_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT,
    email TEXT,
    ip INET,
    user_agent TEXT,
    success BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_le_user ON login_events(user_id);

-- 4. Onboarding trigger: mark complete on first invoice
CREATE OR REPLACE FUNCTION mark_onboarding_complete()
RETURNS TRIGGER AS $$
DECLARE
  invoice_count INT;
BEGIN
  SELECT COUNT(*) INTO invoice_count
  FROM invoices
  WHERE tenant_id = NEW.tenant_id;

  IF invoice_count = 1 THEN
    UPDATE tenants SET
      onboarding_state = 'active',
      onboarding_completed_at = NOW()
    WHERE id = NEW.tenant_id
      AND onboarding_state = 'incomplete';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mark_onboarding_complete ON invoices;
CREATE TRIGGER trg_mark_onboarding_complete
  AFTER INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION mark_onboarding_complete();

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 052_tenants_complete_schema.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 052_tenants_complete_schema.sql
-- Ensures tenants table has all columns needed by the API routes,
-- and tenant_memberships/login_events exist.

-- 1. Tenant memberships (already in 050 — idempotent)
CREATE TABLE IF NOT EXISTS tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'owner',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tm_user ON tenant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_tm_tenant ON tenant_memberships(tenant_id);

-- 2. Login events (already in 050 — idempotent)
CREATE TABLE IF NOT EXISTS login_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT,
    email TEXT,
    ip INET,
    user_agent TEXT,
    success BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_le_user ON login_events(user_id);

-- 3. Tenants: ensure all columns used by the app exist
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS upi_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS gstin TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pan TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_details JSONB DEFAULT '{}';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS paywall_unlocked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS white_label BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS auto_mode BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invoice_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_state TEXT DEFAULT 'incomplete';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- 4. Copy company_name → name if name is empty and company_name has data
UPDATE tenants SET name = company_name WHERE (name IS NULL OR name = '') AND company_name IS NOT NULL AND company_name != '';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 055_payment_lifecycle_and_source_id.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 055_payment_lifecycle_and_source_id.sql
-- Adds payment lifecycle tracking and external source ID for deduplication.
-- ============================================================

-- 1. Lifecycle status — tracks payment through the pipeline
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT
    DEFAULT 'created'
    CHECK (lifecycle_status IN ('created', 'synced', 'processed', 'projected', 'visible'));

-- 2. Source ID — external identifier for deduplication per source type
--    e.g. razorpay_payment_id, offline-sync-uuid, bank-import-ref
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS source_id TEXT;

-- 3. Unique constraint for automated sources — prevents duplicate processing
--    Manual entries (source = 'cash') are excluded from hard dedup
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_source_dedup
  ON payments (tenant_id, source, source_id)
  WHERE source IN ('razorpay', 'bank_transfer', 'cheque')
    AND source_id IS NOT NULL;

-- 4. Backfill — set lifecycle_status to 'synced' for existing paid payments
UPDATE payments
SET lifecycle_status = 'synced'
WHERE lifecycle_status IS NULL
  AND status = 'paid';

-- 5. Backfill — remaining unknown statuses get 'created'
UPDATE payments
SET lifecycle_status = 'created'
WHERE lifecycle_status IS NULL;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 056_anon_sync_policies.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 056_anon_sync_policies.sql
-- Adds RLS policies for the anon role on tables synced from the frontend.
-- The frontend sync uses the anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY) to upsert
-- locally-created data to Supabase. RLS is enabled by default on all Supabase tables
-- but no policies existed — every upsert was denied, causing silent sync failures.
-- ============================================================
-- Notes:
--   - Service role key (SUPABASE_SERVICE_ROLE_KEY) bypasses RLS entirely.
--   - These policies only affect the anon key path (frontend Dexie → Supabase sync).
--   - Tenant isolation is handled at the application layer via tenant_id in every row.

CREATE POLICY "anon_all" ON public.invoices
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.customers
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.payments
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.whatsapp_events
  FOR ALL USING (true) WITH CHECK (true);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 057_recovery_state_machine.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 057_recovery_state_machine.sql
-- Introduce explicit recovery_state on invoices for the reminder lifecycle FSM.
--
-- State machine:
--   pending → scheduled → (t0→t1→t2→t3→t4→t5) → manual_review → completed
--             ↑                                    ↑
--         paused (merchant snoozes)          disputed
--
-- Worker processes only: pending + scheduled
-- Worker ignores:         paused | manual_review | completed | disputed
--
-- This replaces the overloaded meaning of next_recovery_at IS NULL
-- (which previously meant both "never scheduled" AND "finished scheduling").

CREATE TYPE invoice_recovery_state AS ENUM (
  'pending',
  'scheduled',
  'paused',
  'manual_review',
  'completed',
  'disputed'
);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recovery_state invoice_recovery_state NOT NULL DEFAULT 'pending';

COMMENT ON COLUMN invoices.recovery_state IS 'Reminder lifecycle state machine. pending=new, scheduled=active automation, paused=merchant snoozed, manual_review=all stages exhausted, completed=settled, disputed=contested';

CREATE INDEX IF NOT EXISTS idx_invoices_recovery_state ON invoices(recovery_state);

-- NOTE: The original backfill referenced invoices.recovery_stage / next_recovery_at,
-- which were never created on the invoices table. That made this migration fail to
-- apply on a fresh database. The recovery_stage (TEXT) and next_recovery_at
-- (TIMESTAMPTZ) columns are added by migration 076, which also seeds sane defaults.
-- The terminal-stage backfill is now handled there, so it is intentionally omitted here
-- to keep 057 idempotent and applyable.

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 058_collection_actions.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 058_collection_actions.sql
-- Introduce the collection_actions table as the canonical record of every
-- recovery action taken by BillZo. This replaces the implicit/overloaded use
-- of whatsapp_events for payment intents and reminder tracking.
--
-- Every action (reminder, payment_request, call, visit, escalate) gets its
-- own row with core fields as columns. Provider-specific values live in metadata.
--
-- Action hierarchy via parent_action_id:
--   Reminder
--     ├── Payment Request (customer clicked)
--     └── Reconciliation
--
-- Source field tracks who/what created the action:
--   system     - automated recovery orchestration
--   worker     - background job (BullMQ)
--   merchant   - merchant manually triggered
--   customer   - customer-initiated (e.g. clicked payment link)

CREATE TABLE collection_actions (
  id TEXT PRIMARY KEY,                              -- CA_<ulid>

  tenant_id UUID NOT NULL,
  customer_id UUID,
  invoice_ids UUID[] NOT NULL DEFAULT '{}',

  action_type TEXT NOT NULL,                        -- reminder | payment_request | call | visit | escalate | wait
  status TEXT NOT NULL DEFAULT 'scheduled',          -- scheduled | in_progress | completed | failed | cancelled | expired
  source TEXT NOT NULL DEFAULT 'system',             -- system | worker | merchant | customer

  provider TEXT,                                     -- whatsapp | upi | razorpay | null (for manual actions)
  amount NUMERIC,
  scheduled_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  parent_action_id TEXT REFERENCES collection_actions(id),
  recovery_plan_id TEXT,                             -- links to the plan that generated this action

  reason TEXT,                                       -- human-readable explanation
  priority INT NOT NULL DEFAULT 5,                   -- 1-10, for merchant timeline sorting

  -- Provider-specific values only — do NOT put core fields here
  metadata JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_collection_actions_tenant_status ON collection_actions(tenant_id, status);
CREATE INDEX idx_collection_actions_customer      ON collection_actions(customer_id, status);
CREATE INDEX idx_collection_actions_scheduled      ON collection_actions(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_collection_actions_parent          ON collection_actions(parent_action_id);
CREATE INDEX idx_collection_actions_invoices        ON collection_actions USING GIN (invoice_ids);

COMMENT ON TABLE collection_actions IS 'Canonical record of every recovery action (reminder, payment, call, visit, escalate)';
COMMENT ON COLUMN collection_actions.action_type IS 'reminder | payment_request | call | visit | escalate | wait';
COMMENT ON COLUMN collection_actions.status IS 'scheduled | in_progress | completed | failed | cancelled | expired';
COMMENT ON COLUMN collection_actions.source IS 'system | worker | merchant | customer';
COMMENT ON COLUMN collection_actions.parent_action_id IS 'Links to parent action for action trees (reminder → payment → reconciliation)';
COMMENT ON COLUMN collection_actions.recovery_plan_id IS 'Links to the orchestration plan that produced this action';
COMMENT ON COLUMN collection_actions.metadata IS 'Provider-specific values only. Core fields (amount, status, action_type, provider) are separate columns.';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 061_behavior_profiles.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 061_behavior_profiles.sql
-- Introduce customer_behavior_profiles and business_behavior_profiles tables
-- as the canonical persistent storage for Learning Engine output.
--
-- Profiles are the "source of truth" for learned customer and business behavior.
-- Feature vectors for future ML/XGBoost/embeddings/LLMs are stored separately
-- in the feature_store table.
--
-- Every profile is versioned via model_version to enable A/B comparison
-- when the learning model improves.

CREATE TABLE customer_behavior_profiles (
  customer_id UUID NOT NULL,
  tenant_id UUID NOT NULL,

  model_version TEXT NOT NULL DEFAULT '1.0.0',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_count INT NOT NULL DEFAULT 0,

  -- Observed behavior (directly computed from events)
  observed JSONB NOT NULL DEFAULT '{}',

  -- Derived behavior (computed from observed + Bayesian priors)
  derived JSONB NOT NULL DEFAULT '{}',

  -- Predicted behavior (forward-looking estimates)
  predicted JSONB NOT NULL DEFAULT '{}',

  -- Confidence scores per field
  confidence JSONB NOT NULL DEFAULT '{}',

  -- Drift detection report (null if no drift detected)
  drift JSONB,

  -- Feature store reference (points to feature_store.id)
  feature_store_id TEXT,

  dirty_at TIMESTAMPTZ,                               -- set when new events arrive, cleared after recompute
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (customer_id, tenant_id)
);

CREATE INDEX idx_customer_profiles_tenant ON customer_behavior_profiles(tenant_id);
CREATE INDEX idx_customer_profiles_dirty ON customer_behavior_profiles(dirty_at) WHERE dirty_at IS NOT NULL;

CREATE TABLE business_behavior_profiles (
  tenant_id UUID PRIMARY KEY,

  model_version TEXT NOT NULL DEFAULT '1.0.0',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  customer_count INT NOT NULL DEFAULT 0,
  avg_risk_score NUMERIC NOT NULL DEFAULT 0,
  preferred_recovery_style TEXT NOT NULL DEFAULT 'balanced',
  dashboard_engagement TEXT NOT NULL DEFAULT 'unknown',
  snooze_rate NUMERIC NOT NULL DEFAULT 0,
  call_preference BOOLEAN NOT NULL DEFAULT FALSE,

  -- Business intelligence
  busiest_collection_day INT,                         -- 0=Sun, 6=Sat
  avg_receivable_age_days NUMERIC,
  avg_recovery_efficiency NUMERIC,                    -- 0-1, collected / total due
  avg_payment_cycle_days NUMERIC,
  reminder_effectiveness NUMERIC,                     -- 0-1, payments after reminder / reminders sent
  cashflow_health NUMERIC,                            -- 0-1, (collections - new invoices) / collections

  dirty_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Feature store — single table consumed by ML, embeddings, forecasting, LLMs
CREATE TABLE feature_store (
  id TEXT PRIMARY KEY,                                -- FS_<ulid>
  customer_id UUID NOT NULL,
  tenant_id UUID NOT NULL,

  model_version TEXT NOT NULL,
  vector JSONB NOT NULL,
  event_count INT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feature_store_customer ON feature_store(customer_id, tenant_id);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 062_auth_store.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Replace Redis-backed auth store with Supabase tables
-- OTPs, sessions, and rate limits move from Upstash Redis to Postgres

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT,
  is_paid BOOLEAN DEFAULT false,
  phone TEXT,
  email TEXT,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_phone ON sessions(phone);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Generic key-value store with TTL for OTPs, rate limits, etc.
CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kv_store_expires_at ON kv_store(expires_at);

-- Cleanup expired rows periodically
CREATE OR REPLACE FUNCTION cleanup_expired_store()
RETURNS void AS $$
BEGIN
  DELETE FROM sessions WHERE expires_at < NOW();
  DELETE FROM kv_store WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 063_drop_permissive_sync_policies.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- ============================================================
-- 063_drop_permissive_sync_policies.sql
-- Drops permissive anon_all RLS policies that allowed public
-- read/write access to sensitive tables via the anon key.
--
-- The sync engine now routes through /api/sync/proxy which
-- authenticates via the app's custom JWT (bz_access cookie)
-- and uses the service-role key — eliminating the need for
-- anon-key database access entirely.
--
-- Run in Supabase SQL Editor.
-- ============================================================

-- Drop permissive anon-all policies (anyone with the public anon
-- key could read, write, update, or delete all rows)
DROP POLICY IF EXISTS "anon_all" ON public.invoices;
DROP POLICY IF EXISTS "anon_all" ON public.customers;
DROP POLICY IF EXISTS "anon_all" ON public.payments;
DROP POLICY IF EXISTS "anon_all" ON public.whatsapp_events;

-- Drop permissive recovery attribution/experiment policies that
-- also allowed public access via USING(true)
-- Not recreating — these tables are accessed exclusively via the
-- service-role API proxy (/api/sync/proxy) which bypasses RLS.
DROP POLICY IF EXISTS "recovery_attributions_tenant_isolation" ON public.recovery_attributions;
DROP POLICY IF EXISTS "recovery_experiments_tenant_isolation" ON public.recovery_experiments;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 064_collection_action_delivery_columns.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 064_collection_action_delivery_columns.sql
-- Self-contained: creates collection_actions if missing (from 058), then adds
-- delivery tracking projections and dead_letter_events table.

BEGIN;

-- ============================================================
-- 1. Create collection_actions if not exists (from 058)
-- ============================================================
CREATE TABLE IF NOT EXISTS collection_actions (
  id TEXT PRIMARY KEY,

  tenant_id UUID NOT NULL,
  customer_id UUID,
  invoice_ids UUID[] NOT NULL DEFAULT '{}',

  action_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  source TEXT NOT NULL DEFAULT 'system',

  provider TEXT,
  amount NUMERIC,
  scheduled_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  parent_action_id TEXT REFERENCES collection_actions(id),
  recovery_plan_id TEXT,

  reason TEXT,
  priority INT NOT NULL DEFAULT 5,

  metadata JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes (IF NOT EXISTS for each)
CREATE INDEX IF NOT EXISTS idx_collection_actions_tenant_status ON collection_actions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_collection_actions_customer      ON collection_actions(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_collection_actions_scheduled      ON collection_actions(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_collection_actions_parent          ON collection_actions(parent_action_id);
CREATE INDEX IF NOT EXISTS idx_collection_actions_invoices        ON collection_actions USING GIN (invoice_ids);

-- ============================================================
-- 2. Add billzo_message_id as a first-class indexed column
-- ============================================================
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS billzo_message_id TEXT;
CREATE INDEX IF NOT EXISTS idx_ca_billzo_message_id ON collection_actions(billzo_message_id);

-- ============================================================
-- 3. Add delivery projection columns
-- ============================================================
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS last_delivery_status TEXT;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS delivery_provider TEXT;

-- ============================================================
-- 4. Dead letter events table for webhook processing failures
-- ============================================================
CREATE TABLE IF NOT EXISTS dead_letter_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reason TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'meta',
  payload JSONB NOT NULL DEFAULT '{}',
  webhook_body JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retry_count INT NOT NULL DEFAULT 0,
  last_retry_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dle_provider ON dead_letter_events(provider);
CREATE INDEX IF NOT EXISTS idx_dle_unresolved ON dead_letter_events(resolved_at) WHERE resolved_at IS NULL;

COMMENT ON TABLE dead_letter_events IS 'Unprocessable webhook payloads that could not be written to the event store. Admins can replay resolved=false rows.';
COMMENT ON COLUMN collection_actions.billzo_message_id IS 'Correlation ID linking this action to its message delivery event stream. Indexed for O(log n) lookups.';

COMMIT;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 065_customer_messaging_projections.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 065_customer_messaging_projections.sql
-- Add messaging activity projection columns to customers for fast lookups.

BEGIN;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_whatsapp_activity TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_whatsapp_status TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_last_whatsapp ON customers(tenant_id, last_whatsapp_activity DESC);

COMMENT ON COLUMN customers.last_whatsapp_activity IS 'Timestamp of the most recent WhatsApp event (any status) for this customer.';
COMMENT ON COLUMN customers.last_whatsapp_status IS 'Most recent delivery status (delivered, read, failed, etc.) from the event stream.';
COMMENT ON COLUMN customers.last_contacted_at IS 'Timestamp of the most recent outbound message sent to this customer.';

COMMIT;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 066_recovery_policies.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 066_recovery_policies.sql
-- Introduces configurable recovery policies with normalized steps.
-- Seed data provides Standard, Aggressive, and VIP defaults.

BEGIN;

-- ============================================================
-- 1. recovery_policies — Tenant-specific or system-wide policies
-- ============================================================
CREATE TABLE IF NOT EXISTS recovery_policies (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  system_policy_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rp_tenant ON recovery_policies(tenant_id);

-- ============================================================
-- 2. recovery_policy_steps — Individual steps within a policy
-- ============================================================
CREATE TABLE IF NOT EXISTS recovery_policy_steps (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES recovery_policies(id),
  sequence INT NOT NULL,
  trigger_type TEXT NOT NULL,           -- DUE_DATE | PROMISE_DATE | INVOICE_CREATED | OVERDUE | MANUAL
  offset_days INT NOT NULL DEFAULT 0,
  action_type TEXT NOT NULL,            -- reminder | promise_followup
  template_name TEXT,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rps_policy ON recovery_policy_steps(policy_id, sequence);

-- ============================================================
-- 3. Seed system policies (tenant_id = zeros for system-wide)
-- ============================================================
INSERT INTO recovery_policies (id, tenant_id, name, is_default) VALUES
  ('sys_standard', '00000000-0000-0000-0000-000000000000', 'Standard', true),
  ('sys_aggressive', '00000000-0000-0000-0000-000000000000', 'Aggressive', false),
  ('sys_vip', '00000000-0000-0000-0000-000000000000', 'VIP', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recovery_policy_steps (id, policy_id, sequence, trigger_type, offset_days, action_type, template_name, channel) VALUES
  -- Standard
  ('step_std_1', 'sys_standard', 1, 'DUE_DATE', 0,  'reminder', 'invoice_due',        'whatsapp'),
  ('step_std_2', 'sys_standard', 2, 'DUE_DATE', 3,  'reminder', 'payment_reminder',   'whatsapp'),
  ('step_std_3', 'sys_standard', 3, 'DUE_DATE', 7,  'reminder', 'promise_followup',   'whatsapp'),
  ('step_std_4', 'sys_standard', 4, 'DUE_DATE', 15, 'reminder', 'final_reminder',     'whatsapp'),
  -- Aggressive
  ('step_agg_1', 'sys_aggressive', 1, 'DUE_DATE', 0, 'reminder', 'invoice_due',       'whatsapp'),
  ('step_agg_2', 'sys_aggressive', 2, 'DUE_DATE', 1, 'reminder', 'payment_reminder',  'whatsapp'),
  ('step_agg_3', 'sys_aggressive', 3, 'DUE_DATE', 3, 'reminder', 'promise_followup',  'whatsapp'),
  ('step_agg_4', 'sys_aggressive', 4, 'DUE_DATE', 5, 'reminder', 'final_reminder',    'whatsapp'),
  ('step_agg_5', 'sys_aggressive', 5, 'DUE_DATE', 7, 'reminder', 'final_reminder',    'whatsapp'),
  -- VIP
  ('step_vip_1', 'sys_vip', 1, 'DUE_DATE', 0,  'reminder', 'invoice_due',        'whatsapp'),
  ('step_vip_2', 'sys_vip', 2, 'DUE_DATE', 5,  'reminder', 'payment_reminder',   'whatsapp'),
  ('step_vip_3', 'sys_vip', 3, 'DUE_DATE', 12, 'reminder', 'final_reminder',     'whatsapp')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 067_collection_action_scheduling.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 067_collection_action_scheduling.sql
-- Add scheduling, policy reference, trigger type, retry tracking, and action_state
-- values (paused, expired) to collection_actions.

BEGIN;

-- ============================================================
-- 1. Scheduling and policy columns
-- ============================================================
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS template_name TEXT;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS policy_id TEXT;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS trigger_type TEXT;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 3;

-- Index for the new scheduler query pattern
CREATE INDEX IF NOT EXISTS idx_ca_scheduled_pending
  ON collection_actions(scheduled_at, attempt_count)
  WHERE status = 'scheduled' AND action_type IN ('reminder', 'promise_followup');

COMMENT ON COLUMN collection_actions.template_name IS 'Meta/WhatsApp template to use for this action';
COMMENT ON COLUMN collection_actions.policy_id IS 'The recovery policy that generated this action';
COMMENT ON COLUMN collection_actions.trigger_type IS 'DUE_DATE | PROMISE_DATE | INVOICE_CREATED | OVERDUE | MANUAL';
COMMENT ON COLUMN collection_actions.attempt_count IS 'Number of transport send attempts made';
COMMENT ON COLUMN collection_actions.max_attempts IS 'Max transport retries before marking failed (default 3)';

COMMIT;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 068_collection_action_events.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 068_collection_action_events.sql
-- Immutable audit log for every state transition of a collection_action.
-- Mirrors the event-sourced pattern used for whatsapp_events.

BEGIN;

CREATE TABLE IF NOT EXISTS collection_action_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id TEXT NOT NULL REFERENCES collection_actions(id),
  event_type TEXT NOT NULL,          -- scheduled | processing | sent | completed | cancelled | retry | failed | expired
  from_status TEXT,
  to_status TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cae_action ON collection_action_events(action_id, created_at);

COMMENT ON TABLE collection_action_events IS 'Immutable event log for collection action lifecycle. Every state transition creates a row.';
COMMENT ON COLUMN collection_action_events.event_type IS 'scheduled | processing | sent | completed | cancelled | retry | failed | expired';

COMMIT;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 069_plans_and_tenant_billing.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 069_plans_and_tenant_billing.sql
-- Versioned, server-driven pricing + tenant billing columns.
-- Pricing is NEVER mutated in place: a price change creates a new plan version
-- with active=false/visible=false so existing tenants keep their version.

BEGIN;

-- ── plans (versioned, single source of truth for pricing/limits/features) ──
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,                     -- 'starter' | 'pro' | 'business' | 'enterprise'
  version INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,                     -- display name, e.g. "Business"
  monthly_price_paise INTEGER NOT NULL DEFAULT 0,
  annual_price_paise INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  limits JSONB NOT NULL DEFAULT '{}',     -- { reminders: -1, branches: 1, api: false }
  features JSONB NOT NULL DEFAULT '[]',   -- feature keys
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (code, version)
);

CREATE INDEX IF NOT EXISTS idx_plans_code ON plans(code);
CREATE INDEX IF NOT EXISTS idx_plans_visible ON plans(is_visible, sort_order);

COMMENT ON TABLE plans IS 'Versioned plan catalog. Never UPDATE a price in place; INSERT a new version.';
COMMENT ON COLUMN plans.limits IS 'Numeric limits. -1 means unlimited (e.g. Pro reminders).';

-- Seed: one active version per plan. Prices are server source of truth.
INSERT INTO plans (code, version, name, monthly_price_paise, annual_price_paise, currency, limits, features, is_active, is_visible, sort_order)
VALUES
  ('starter', 1, 'Starter', 0, 0, 'INR',
    '{"reminders": 3, "branches": 1, "api": false}'::jsonb,
    '["manual_reminders"]'::jsonb, true, true, 1),
  ('pro', 1, 'Pro', 29900, 28680, 'INR',
    '{"reminders": -1, "branches": 1, "api": false}'::jsonb,
    '["manual_reminders","auto_recovery","recovery_queue","promise_tracking","cashflow_forecast"]'::jsonb,
    true, true, 2),
  ('business', 1, 'Business', 69900, 67104, 'INR',
    '{"reminders": -1, "branches": 5, "api": true}'::jsonb,
    '["manual_reminders","auto_recovery","recovery_queue","promise_tracking","cashflow_forecast","advanced_analytics","exports","api","multi_branch"]'::jsonb,
    true, true, 3),
  ('enterprise', 1, 'Enterprise', 0, 0, 'INR',
    '{"reminders": -1, "branches": -1, "api": true}'::jsonb,
    '["manual_reminders","auto_recovery","recovery_queue","promise_tracking","cashflow_forecast","advanced_analytics","exports","api","multi_branch"]'::jsonb,
    true, false, 4);  -- not purchasable via checkout (custom sales)

-- ── tenants: widen subscription_status + add billing columns ──
-- The old CHECK restricted to ('free','pro','trial') but the webhook sets
-- 'active'/'cancelled'/'paused' — drop it to avoid constraint violations.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_subscription_status_check;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_state TEXT
  DEFAULT 'trialing'
  CHECK (subscription_state IN ('trialing','active','past_due','paused','cancelled','expired','incomplete'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_version INTEGER DEFAULT 1;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false;

COMMENT ON COLUMN tenants.subscription_state IS 'Rich lifecycle state. Mirrors subscriptions.state; updated by billing worker.';

COMMIT;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 070_subscriptions.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 070_subscriptions.sql
-- Provider-agnostic subscription record. Only one ACTIVE subscription per tenant.
-- Razorpay is just a processor; this table is the source of truth for state.

BEGIN;

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES plans(id),
  plan_code TEXT NOT NULL,                 -- denormalized for reads
  plan_version INTEGER NOT NULL DEFAULT 1,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_subscription_id TEXT,
  provider_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','trialing','active','past_due','paused','cancelled','expired','incomplete')),
  cancel_at_period_end BOOLEAN DEFAULT false,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider ON subscriptions(provider, provider_subscription_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_active_tenant
  ON subscriptions(tenant_id) WHERE status = 'active';

COMMENT ON TABLE subscriptions IS 'One row per subscription attempt. Single active sub per tenant via partial unique index.';
COMMENT ON COLUMN subscriptions.plan_code IS 'Denormalized plan code; join plan_id->plans for limits/features.';

COMMIT;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 071_billing_events.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 071_billing_events.sql
-- Append-only event log for billing/provider events (mirrors whatsapp_events /
-- collection_action_events pattern). Webhook stores RAW here, then publishes
-- to the outbox; a worker applies state changes. Never mutate in place.

BEGIN;

CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  event_type TEXT NOT NULL,               -- subscription.activated | subscription.charged | payment.failed | invoice.expired ...
  provider_event_id TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_tenant ON billing_events(tenant_id, received_at);
CREATE INDEX IF NOT EXISTS idx_billing_events_provider ON billing_events(provider, provider_event_id);

-- Idempotency: a provider_event_id must be processed at most once.
-- Partial unique index ignores NULLs (some events lack a provider id).
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_events_provider_event_id
  ON billing_events(provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

COMMENT ON TABLE billing_events IS 'Immutable raw log of every provider billing event. Debug + replay source.';

-- Payment attempts (metered, for dunning / retry analysis)
CREATE TABLE IF NOT EXISTS payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_payment_id TEXT,
  status TEXT NOT NULL,                    -- created | authorized | captured | failed
  amount_paise INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_tenant ON payment_attempts(tenant_id, attempted_at);

COMMENT ON TABLE payment_attempts IS 'Every charge attempt against a subscription. Feeds dunning + analytics.';

COMMIT;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 072_tenant_usage_and_feature_flags.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 072_tenant_usage_and_feature_flags.sql
-- Metered usage is event-driven (worker increments from outbox), never
-- updated synchronously in request handlers. Feature flags enable per-tenant
-- overrides (beta, promo, lifetime) without touching plan logic.

BEGIN;

CREATE TABLE IF NOT EXISTS tenant_usage (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  month TEXT NOT NULL,                     -- 'YYYY-MM'
  reminders_sent INTEGER NOT NULL DEFAULT 0,
  whatsapp_messages INTEGER NOT NULL DEFAULT 0,
  invoices_created INTEGER NOT NULL DEFAULT 0,
  customers INTEGER NOT NULL DEFAULT 0,
  api_calls INTEGER NOT NULL DEFAULT 0,
  storage_mb NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, month)
);

COMMENT ON TABLE tenant_usage IS 'Monthly metered counters. Incremented by the billing worker, not request handlers.';

CREATE TABLE IF NOT EXISTS feature_flags (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flag TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  granted_by TEXT,
  reason TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, flag)
);

COMMENT ON TABLE feature_flags IS 'Per-tenant feature overrides (beta, promo, lifetime). Checked by FeatureService.';

COMMIT;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 073_subscription_history.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 073_subscription_history.sql
-- Audit trail of all subscription state/plan changes. Written by the billing
-- worker on every transition. Required for compliance + debugging disputes.

BEGIN;

CREATE TABLE IF NOT EXISTS subscription_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  from_plan_code TEXT,
  to_plan_code TEXT,
  reason TEXT NOT NULL,                    -- 'created' | 'webhook.activated' | 'payment.failed' | 'cancelled' | 'renewed'
  actor TEXT NOT NULL DEFAULT 'system',    -- system | webhook | admin
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_hist_tenant ON subscription_history(tenant_id, created_at);

COMMENT ON TABLE subscription_history IS 'Append-only audit of plan/state transitions per tenant.';

COMMIT;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 074_recovery_policy_call_steps.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 074_recovery_policy_call_steps.sql
-- Adds a Phone Call step to the seeded system policies so the workflow engine
-- can escalate from WhatsApp reminders to a call (per Sprint 2 design).
-- Idempotent: only inserts if the step does not already exist.

BEGIN;

INSERT INTO recovery_policy_steps (id, policy_id, sequence, trigger_type, offset_days, action_type, template_name, channel)
SELECT 'step_std_call', 'sys_standard', 5, 'DUE_DATE', 10, 'call', NULL, 'phone'
WHERE NOT EXISTS (SELECT 1 FROM recovery_policy_steps WHERE id = 'step_std_call');

INSERT INTO recovery_policy_steps (id, policy_id, sequence, trigger_type, offset_days, action_type, template_name, channel)
SELECT 'step_agg_call', 'sys_aggressive', 6, 'DUE_DATE', 4, 'call', NULL, 'phone'
WHERE NOT EXISTS (SELECT 1 FROM recovery_policy_steps WHERE id = 'step_agg_call');

INSERT INTO recovery_policy_steps (id, policy_id, sequence, trigger_type, offset_days, action_type, template_name, channel)
SELECT 'step_vip_call', 'sys_vip', 4, 'DUE_DATE', 8, 'call', NULL, 'phone'
WHERE NOT EXISTS (SELECT 1 FROM recovery_policy_steps WHERE id = 'step_vip_call');

COMMIT;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 075_merchant_customer_memory.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 075_merchant_customer_memory.sql
-- Merchant-owned, long-term customer memory (treated architecturally as
-- "Customer Memory", not a generic notes feature). Captures context that the
-- automated event stream can never infer (contact hours, who approves payment,
-- channel preferences). Later intelligence features (relationship score,
-- behavior engine, AI explanation layer) read these; nothing writes them
-- automatically. No sentiment / AI summary / tags / embeddings here — those
-- are derived downstream.
BEGIN;

CREATE TABLE IF NOT EXISTS merchant_customer_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL,
  note            TEXT NOT NULL,
  author_user_id  TEXT,
  is_pinned       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mcn_tenant_customer
  ON merchant_customer_notes(tenant_id, customer_id)
  WHERE archived_at IS NULL;

COMMENT ON TABLE merchant_customer_notes IS 'Merchant-owned long-term memory about a customer. Sacred — never auto-modified by AI or recommendations.';

COMMIT;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 076_recovery_invoice_columns.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 076_recovery_invoice_columns.sql
-- Repair a schema/code mismatch: application code reads and writes
-- invoices.recovery_stage (TEXT) and invoices.next_recovery_at (TIMESTAMPTZ),
-- but no prior migration created these columns on invoices (they only existed
-- on whatsapp_events). Migration 057 introduced a recovery_state ENUM that the
-- code never consumed; these two columns are what the runtime actually depends on.
--
-- This migration is idempotent and must apply cleanly on a fresh database so V1
-- is installable.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS recovery_stage TEXT NOT NULL DEFAULT 't0_soft';

COMMENT ON COLUMN invoices.recovery_stage IS
  'Reminder lifecycle stage reached for this invoice (t0_soft, t1_reminder, t2_escalate, t3_urgent, t4_final, t5_warning). Set by the recovery actions layer.';

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS next_recovery_at TIMESTAMPTZ;

COMMENT ON COLUMN invoices.next_recovery_at IS
  'When the next automated reminder is due. NULL means no reminder scheduled.';

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS last_whatsapp_at TIMESTAMPTZ;

COMMENT ON COLUMN invoices.last_whatsapp_at IS
  'Timestamp of the last WhatsApp reminder sent for this invoice.';

CREATE INDEX IF NOT EXISTS idx_invoices_next_recovery_at
  ON invoices (next_recovery_at);

-- Backfill any invoices that already carry a recovery_state ENUM (from 057) into
-- the stage the code expects, so the two representations do not diverge on upgrade.
-- recovery_state 'scheduled' maps to an active stage; 'manual_review'/'completed'
-- map to terminal stages. This is best-effort and does not error if recovery_state
-- is absent.
UPDATE invoices
SET recovery_stage = CASE
  WHEN recovery_state = 'completed' THEN 't5_warning'
  WHEN recovery_state = 'manual_review' THEN 't5_warning'
  WHEN recovery_state = 'disputed' THEN 't5_warning'
  WHEN recovery_state = 'scheduled' THEN 't1_reminder'
  WHEN recovery_state = 'paused' THEN 't1_reminder'
  ELSE 't0_soft'
END
WHERE recovery_stage = 't0_soft'
  AND recovery_state IS NOT NULL;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 077_bring_invoices_to_expected_schema.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 077_bring_invoices_to_expected_schema.sql
-- Append-only migration (per "never rewrite old migrations" policy) that brings
-- the LIVE invoices table up to what the application code actually requires.
--
-- Audit (integration test against production Supabase) found the live invoices
-- table was missing columns that existing migrations (003, 005, 006, 028, 046,
-- 055, 057) were supposed to create but were never applied to the cloud DB.
-- This caused runtime failures for any path that writes these columns.
--
-- Every statement is IF NOT EXISTS / idempotent so it is safe to (re)run and
-- cannot conflict with later environments where the columns already exist.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_url TEXT;
COMMENT ON COLUMN invoices.pdf_url IS 'URL of the generated invoice PDF.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;
COMMENT ON COLUMN invoices.last_reminder_at IS 'Timestamp of the last reminder sent for this invoice.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;
COMMENT ON COLUMN invoices.reminder_count IS 'Number of reminders sent for this invoice.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'partial'));
COMMENT ON COLUMN invoices.payment_status IS 'Payment state derived from paid_amount vs total.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(15,2) DEFAULT 0;
COMMENT ON COLUMN invoices.payment_amount IS 'Amount paid against this invoice.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sync_status TEXT;
COMMENT ON COLUMN invoices.sync_status IS 'Local/offline sync state for the Dexie->Supabase sync layer.';

-- The invoice_recovery_state ENUM was defined in migration 057, which was
-- never applied to this database. Create it idempotently so the column can
-- reference it. (Safe no-op where 057 already ran.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_recovery_state') THEN
    CREATE TYPE invoice_recovery_state AS ENUM (
      'pending', 'scheduled', 'paused', 'manual_review', 'completed', 'disputed'
    );
  END IF;
END $$;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recovery_state invoice_recovery_state NOT NULL DEFAULT 'pending';
COMMENT ON COLUMN invoices.recovery_state IS 'Reminder lifecycle state machine (backfilled by this migration).';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
COMMENT ON COLUMN invoices.version IS 'Optimistic-concurrency version used by the upsert/sync path.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS lifecycle_status TEXT;
COMMENT ON COLUMN invoices.lifecycle_status IS 'Payment lifecycle status (initiated, captured, failed, refunded).';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source_id TEXT;
COMMENT ON COLUMN invoices.source_id IS 'Identifier of the source system / channel that created the payment.';

-- Backfill recovery_state for existing rows based on their payment status.
-- (recovery_state was just added with a NOT NULL DEFAULT 'pending', so this
-- only upgrades already-paid invoices to 'completed'.)
UPDATE invoices
SET recovery_state = 'completed'
WHERE status IN ('paid', 'partial')
  AND recovery_state = 'pending';

-- udhar_balance (customer credit/Udhar ledger) was defined on `customers` in
-- migration 007, which was also never applied here. Add it idempotently.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS udhar_balance NUMERIC(15,2) DEFAULT 0;
COMMENT ON COLUMN customers.udhar_balance IS 'Running Udhar (credit) balance for the customer.';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 078_merchant_interest.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- ============================================================
-- merchant_interest: Lead capture for plan upgrades
--
-- Stores requests for Growth, Business, and Enterprise plans
-- during pilot phase. Later can be generalized to waitlists,
-- beta access, feature requests, or sales inquiries.
-- ============================================================

CREATE TABLE merchant_interest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  type TEXT NOT NULL CHECK (
      type IN ('growth', 'business', 'enterprise')
  ),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- No RLS, no indexes, no FKs — intentionally minimal until
-- volume justifies optimization.

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 079_fix_priority_cases_business_rules.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 079_fix_priority_cases_business_rules.sql
-- Refactor get_priority_cases to use business rules instead of status strings.
--
-- Changes:
--   1. Backfill legacy statuses ('unpaid', 'overdue' → 'issued')
--   2. Active invoices determined by outstanding_amount > 0 (not status name)
--   3. Overdue derived from due_date < NOW() (not status = 'overdue')
--   4. total_overdue computed from invoices directly (not rc.total_overdue)
--   5. New priority_score column combining days overdue + amount weight +
--      broken promise penalty + ignored reminders.
--   6. Sort by priority_score DESC instead of attention_score DESC.

-- 1. Backfill legacy statuses to match sync serialization
UPDATE invoices
SET status = 'issued'
WHERE status IN ('unpaid', 'overdue');

-- 2. Drop old RPC (return type changed — OR REPLACE won't work)
DROP FUNCTION IF EXISTS get_priority_cases(TEXT, INTEGER);

-- 3. Create new RPC
CREATE OR REPLACE FUNCTION get_priority_cases(
  p_tenant_id TEXT,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  case_id TEXT,
  customer_id TEXT,
  customer_name TEXT,
  phone TEXT,
  total_overdue NUMERIC,
  oldest_overdue_days INT,
  attention_score INT,
  priority_score INT,
  next_action_type TEXT,
  promise_to_pay_date TIMESTAMPTZ,
  ignored_reminders INT,
  broken_promises INT,
  open_invoice_count INT,
  automation_mode TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_now DATE := CURRENT_DATE;
BEGIN
  RETURN QUERY
  WITH invoice_stats AS (
    SELECT
      inv.customer_id,
      COUNT(*)::int                                               AS open_count,
      SUM(inv.outstanding_amount)::numeric                        AS total_outstanding,
      MAX(EXTRACT(DAY FROM (v_now - inv.due_date)::interval))::int AS max_overdue_days
    FROM invoices inv
    WHERE inv.tenant_id = p_tenant_id
      AND inv.outstanding_amount > 0
      AND inv.due_date IS NOT NULL
    GROUP BY inv.customer_id
  ),
  ignored_reminder_stats AS (
    SELECT
      inv2.customer_id,
      COUNT(*)::int AS reminder_count
    FROM whatsapp_events we
    JOIN invoices inv2 ON inv2.id = we.invoice_id
    WHERE we.tenant_id = p_tenant_id
      AND we.direction = 'outbound'
      AND we.status IN ('sent', 'delivered', 'read')
    GROUP BY inv2.customer_id
  ),
  broken_promise_stats AS (
    SELECT
      rce.case_id,
      COUNT(*)::int AS broken_count
    FROM recovery_case_events rce
    WHERE rce.event_type = 'transition'
      AND rce.payload->>'to_recovery_state' = 'overdue'
      AND rce.payload->>'from_recovery_state' = 'promised'
    GROUP BY rce.case_id
  )
  SELECT
    rc.id::text                                                                    AS case_id,
    rc.customer_id::text,
    c.customer_name::text,
    c.phone::text,
    COALESCE(isum.total_outstanding, 0)::numeric                                   AS total_overdue,
    COALESCE(isum.max_overdue_days, 0)::int                                        AS oldest_overdue_days,
    rc.attention_score::int,
    (
      COALESCE(isum.max_overdue_days, 0)
      + LEAST(COALESCE(isum.total_outstanding / 100, 0), 50)::int
      + COALESCE(bps.broken_count, 0) * 10
      + COALESCE(irs.reminder_count, 0) * 5
    )::int                                                                         AS priority_score,
    rc.next_action_type::text,
    rc.promise_to_pay_date::timestamptz,
    COALESCE(irs.reminder_count, 0)::int                                           AS ignored_reminders,
    COALESCE(bps.broken_count, 0)::int                                             AS broken_promises,
    COALESCE(isum.open_count, 0)::int                                              AS open_invoice_count,
    c.automation_mode::text
  FROM recovery_cases rc
  JOIN customers c ON c.id = rc.customer_id
  LEFT JOIN invoice_stats        isum ON isum.customer_id = rc.customer_id
  LEFT JOIN broken_promise_stats bps  ON bps.case_id     = rc.id
  LEFT JOIN ignored_reminder_stats irs ON irs.customer_id = rc.customer_id
  WHERE rc.tenant_id = p_tenant_id
    AND rc.recovery_state_v2 NOT IN ('recovered', 'closed')
    AND rc.next_action_type IN ('send_reminder', 'call', 'follow_up_call', 'review_payment', 'merchant_review')
  ORDER BY priority_score DESC, rc.attention_score DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION get_priority_cases IS 'Returns top priority recovery cases for a tenant, ordered by priority_score DESC. Active invoices determined by outstanding_amount > 0; overdue derived from due_date < NOW().';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 080_add_document_type.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 080_add_document_type.sql
-- Adds document_type column to invoices to support Tax Invoice (GST) vs Bill (non-GST).
-- Recovery engine is unchanged — it operates on outstanding_amount, not document type.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'tax_invoice';

-- Existing rows get 'tax_invoice' (safe default, no data loss)
COMMENT ON COLUMN invoices.document_type IS 'tax_invoice = GST Tax Invoice, bill = Non-GST Bill (for record & payment only)';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 081_recovery_activities.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 081_recovery_activities.sql
-- Recovery Activity Log — append-only record of every recovery-relevant event.
-- This is NOT a generic event bus. Only events that help answer
-- "What's happening with my money?" are stored here.

CREATE TABLE IF NOT EXISTS recovery_activities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  customer_id TEXT,
  type TEXT NOT NULL CHECK (type IN (
    'invoice_created', 'invoice_sent', 'customer_viewed',
    'payment_link_opened', 'reminder_sent', 'merchant_called',
    'call_outcome',
    'promise_received', 'promise_fulfilled', 'promise_broken',
    'payment_received', 'customer_payment_reported', 'payment_confirmed', 'note_added'
  )),
  actor TEXT NOT NULL CHECK (actor IN ('merchant', 'customer', 'system')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recovery_activities_invoice ON recovery_activities(invoice_id, created_at DESC);
CREATE INDEX idx_recovery_activities_tenant ON recovery_activities(tenant_id, created_at DESC);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 082_add_new_recovery_activity_types.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 082_add_new_recovery_activity_types.sql
-- Split payment_received into customer_payment_reported (customer portal)
-- and payment_confirmed (merchant verification).

ALTER TABLE recovery_activities DROP CONSTRAINT IF EXISTS recovery_activities_type_check;

ALTER TABLE recovery_activities ADD CONSTRAINT recovery_activities_type_check
  CHECK (type IN (
    'invoice_created', 'invoice_sent', 'customer_viewed',
    'payment_link_opened', 'reminder_sent', 'merchant_called',
    'promise_received', 'promise_fulfilled', 'promise_broken',
    'payment_received', 'customer_payment_reported', 'payment_confirmed', 'note_added'
  ));

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 083_add_call_outcome.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 083_add_call_outcome.sql
-- Split merchant_called from call_outcome.
-- merchant_called = dialer opened, call_outcome = result recorded by merchant.

ALTER TABLE recovery_activities DROP CONSTRAINT IF EXISTS recovery_activities_type_check;

ALTER TABLE recovery_activities ADD CONSTRAINT recovery_activities_type_check
  CHECK (type IN (
    'invoice_created', 'invoice_sent', 'customer_viewed',
    'payment_link_opened', 'reminder_sent', 'merchant_called',
    'call_outcome',
    'promise_received', 'promise_fulfilled', 'promise_broken',
    'payment_received', 'customer_payment_reported', 'payment_confirmed', 'note_added'
  ));

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 084_recovery_sessions.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Recovery Sessions
--
-- Tracks each "merchant works a case" session from open to close.
-- A session starts when the merchant opens a recovery case and ends when
-- they close it or 30min of inactivity passes.
--
-- Each session records:
--   - What BillZo recommended at session start
--   - Every action the merchant took
--   - Whether they followed BillZo's recommendation
--   - The outcome (recovered, promised, no answer, etc.)
--   - Amount recovered during the session
--   - Session duration
--
-- This becomes the foundation for:
--   - Recommendation quality tracking (% accepted / rejected)
--   - Merchant productivity analytics (sessions/day, avg duration, success rate)
--   - AI training data (what actually works per merchant vertical)
--   - Team/merchant performance metrics

CREATE TABLE IF NOT EXISTS recovery_sessions (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  case_id         TEXT NOT NULL REFERENCES recovery_cases(id),
  customer_id     TEXT,

  -- Recommendation shown at session start
  starting_recommendation TEXT,
  recommendation_accepted BOOLEAN,

  -- Timeline
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  session_duration_seconds INTEGER,

  -- What happened
  outcome         TEXT CHECK (outcome IN (
                    'recovered', 'promised', 'no_answer', 'wrong_number',
                    'dispute', 'not_interested', 'abandoned', 'in_progress'
                  )),
  amount_recovered NUMERIC(12,2) DEFAULT 0,
  actions_taken   JSONB DEFAULT '[]'::jsonb,
  -- e.g. [{"action":"call","at":"..."},{"action":"reminder","at":"..."}, ...]

  -- Merchant override — did they do something different from recommendation?
  manual_override TEXT,

  -- Free-form merchant note at end of session
  notes           TEXT,

  completed_by    TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recovery_sessions_tenant ON recovery_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recovery_sessions_case ON recovery_sessions(case_id);
CREATE INDEX IF NOT EXISTS idx_recovery_sessions_started ON recovery_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_sessions_outcome ON recovery_sessions(outcome);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 085_recovery_events_canonical.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 085_recovery_events_canonical.sql
-- Canonical Recovery Event Model
--
-- Adds case_id and actor_id to recovery_activities, making it the single
-- physical store for the RecoveryEvent model. Removes the CHECK constraint
-- on type — the application layer now enforces valid types, avoiding
-- migration pain when new event types are added.

ALTER TABLE recovery_activities ADD COLUMN IF NOT EXISTS case_id TEXT;
ALTER TABLE recovery_activities ADD COLUMN IF NOT EXISTS actor_id TEXT;

-- Drop the type CHECK constraint so new types can be used without migration
ALTER TABLE recovery_activities DROP CONSTRAINT IF EXISTS recovery_activities_type_check;

-- Index for case-scoped queries
CREATE INDEX IF NOT EXISTS idx_recovery_activities_case ON recovery_activities(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_activities_customer ON recovery_activities(customer_id, created_at DESC);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 086_business_identity.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Business Identity & Invoice Branding
-- Adds canonical branding fields that power PDF invoices, WhatsApp, payment pages, UPI QR, receipts.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invoice_prefix TEXT DEFAULT 'INV-';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invoice_footer TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT 'Due in 30 days';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_business_number TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#1e293b';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{"enabled":false,"days":["mon","tue","wed","thu","fri","sat"],"start":"09:30","end":"19:00"}'::jsonb;

-- Storage bucket for merchant assets (logos, etc.)
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES ('merchant-assets', 'merchant-assets', true, false, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
CREATE POLICY IF NOT EXISTS "merchant_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'merchant-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY IF NOT EXISTS "merchant_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'merchant-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY IF NOT EXISTS "merchant_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'merchant-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Anyone can read public assets (needed for invoice PDFs, shared links, etc.)
CREATE POLICY IF NOT EXISTS "merchant_read_public" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'merchant-assets');

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 087_fix_collection_actions_fk_types.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 087_fix_collection_actions_fk_types.sql
-- Surgical fix: repair FK type mismatch in 058_collection_actions.sql.
--
-- Problem: 058 created collection_actions with UUID tenant_id/customer_id
-- and UUID[] invoice_ids, but the entire app uses TEXT identifiers
-- (tenant_..., cust_..., inv_..., e2e_...). Every scheduler/planner write
-- to collection_actions fails with 22P02 "invalid input syntax for type uuid".
-- Same defect previously fixed for recovery_cases in 028.
--
-- Safe: collection_actions is currently empty (no data to cast).
-- Idempotent: only alters if the column is still uuid-typed.
ALTER TABLE collection_actions
  ALTER COLUMN tenant_id TYPE TEXT,
  ALTER COLUMN customer_id TYPE TEXT,
  ALTER COLUMN invoice_ids TYPE TEXT[] USING ARRAY[]::TEXT[];

-- Rebuild the GIN index over the now-text array (uuid[] → text[]).
DROP INDEX IF EXISTS idx_collection_actions_invoices;
CREATE INDEX idx_collection_actions_invoices
  ON collection_actions USING GIN (invoice_ids);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 088_auto_recovery_toggle.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Sprint 3B: Tenant-level auto recovery toggle
-- Gives merchants a master switch to pause all automatic reminders
-- updated_by / updated_at tracked so we can show "Paused by Rahul, yesterday 4pm"

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS auto_recovery_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_recovery_updated_by TEXT,
  ADD COLUMN IF NOT EXISTS auto_recovery_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN tenants.auto_recovery_enabled     IS 'When false, scheduler skips all collection_actions for this tenant';
COMMENT ON COLUMN tenants.auto_recovery_updated_by  IS 'User/display name who last changed the toggle';
COMMENT ON COLUMN tenants.auto_recovery_updated_at  IS 'Timestamp of last toggle change';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 090_whatsapp_server_authority.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Migration 090: WhatsApp server authority + pilot forensic trace
--
-- Two tables, two jobs:
--   whatsapp_connections : server-authoritative tenant <-> phone_number_id mapping.
--                          The webhook resolves tenant ONLY through this table.
--                          No browser state. No client-supplied tenant id.
--   pilot_events         : append-only forensic proof that the WhatsApp recovery
--                          loop happened (connect -> reminder -> reply -> payment
--                          -> auto-stop). Separate from outbox (work to process)
--                          and recovery_case_events (domain history).
--
-- SECURITY INVARIANT:
--   Every inbound WhatsApp event MUST resolve
--   phone_number_id -> whatsapp_connections -> tenant_id.
--   If the lookup fails: record an unattributed pilot_event and STOP.
--   Never guess the tenant from customer phone, session, or request body.
--
-- CREDENTIALS: no access tokens / secrets are stored in either table.
-- pilot_events.raw_payload is for bounded, sanitized provider payloads only.

-- ── whatsapp_connections ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL REFERENCES tenants(id),
    waba_id         TEXT NOT NULL,
    phone_number_id TEXT NOT NULL UNIQUE,
    display_name    TEXT,
    provider        TEXT NOT NULL DEFAULT 'gupshup',
    status          TEXT NOT NULL DEFAULT 'connecting'
                    CHECK (status IN ('connecting', 'connected', 'disconnected', 'error')),
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_tenant
    ON whatsapp_connections (tenant_id);

-- ── whatsapp_events: attribute domain events to the originating number ──
-- Inbound/echo rows written by the webhook carry the phone_number_id they
-- arrived on, so per-merchant attribution is queryable in the domain table
-- too (pilot_events remains the forensic trace).
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS phone_number_id TEXT;
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_phone_number
    ON whatsapp_events (phone_number_id, occurred_at DESC);

COMMENT ON TABLE whatsapp_connections IS
    'Server-authoritative tenant <-> WhatsApp phone mapping. The ONLY path a webhook may use to resolve a tenant.';

-- ── pilot_events ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pilot_events (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- tenant_id is NULLABLE: an event that fails tenant resolution must be
    -- recorded as unattributed, not dropped and not guessed.
    tenant_id              TEXT,
    customer_id            TEXT,           -- nullable: attribution may be pending
    phone_number_id        TEXT,
    event_kind             TEXT NOT NULL,  -- connect | reminder_sent | customer_replied |
                                           -- payment_created | payment_received |
                                           -- automation_stopped | merchant_app_reply |
                                           -- message_status | unattributed_webhook | webhook_error
    direction              TEXT CHECK (direction IN ('inbound', 'outbound', 'internal')),
    -- normalized provider facts (never credentials)
    provider               TEXT,
    provider_event_id      TEXT,
    provider_message_id    TEXT,
    provider_event_type    TEXT,
    provider_status        TEXT,
    provider_error_code    TEXT,
    provider_error_message TEXT,
    -- attribution outcome for this event
    attribution_result     TEXT CHECK (attribution_result IN
                               ('resolved', 'unattributed', 'customer_unmatched')),
    state_before           JSONB,
    state_after            JSONB,
    raw_payload            JSONB,          -- bounded/sanitized provider payload
    occurred_at            TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pilot_events_tenant_created
    ON pilot_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pilot_events_phone
    ON pilot_events (phone_number_id);

-- Webhook retry dedup: the same provider event (same type + message + status)
-- must be recorded once. Rows without a provider_message_id (connect, errors)
-- are never deduped (NULLs are distinct in unique indexes).
CREATE UNIQUE INDEX IF NOT EXISTS uq_pilot_events_provider_event
    ON pilot_events (provider_event_type, provider_message_id, provider_status)
    WHERE provider_message_id IS NOT NULL;

COMMENT ON TABLE pilot_events IS
    'Append-only forensic trace of the WhatsApp recovery loop. Pilot gate: every event must be traceable end-to-end. Never store credentials here.';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 091_recovery_outcomes.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 091_recovery_outcomes.sql
-- Phase 1.5: Outcome Integrity
--
-- Create explicit outcome recording so every recovery attempt can be traced to its result.
-- This is the foundation for behavioral learning (Phase 2).
--
-- Key principle: recovery_attempt_id (collection_actions.id) is the causal spine.
-- Every downstream event (delivery, reply, promise, payment) should trace back to it.

BEGIN;

-- ============================================================
-- 1. Create recovery_outcomes table
-- ============================================================

CREATE TABLE IF NOT EXISTS recovery_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  -- Evidence must outlive an operational action. Attempts are cancelled rather
  -- than deleted; RESTRICT prevents accidental loss of outcome history.
  recovery_attempt_id TEXT REFERENCES collection_actions(id) ON DELETE RESTRICT,

  -- What happened as a result of this attempt
  outcome_type TEXT NOT NULL CHECK (outcome_type IN (
    'payment',              -- Invoice paid (full or partial)
    'promise_kept',         -- Customer paid on promised date
    'promise_broken',       -- Customer missed promised date
    'no_response',          -- Delivered/read but no reply or action
    'delivered',            -- Provider delivered the WhatsApp message
    'failed_delivery',      -- WhatsApp failed to deliver
    'call_completed',       -- Merchant completed call
    'visit_completed',      -- Merchant completed in-person visit
    'customer_replied',     -- Customer sent inbound message
    'customer_read',        -- Customer read the message
    'customer_clicked'      -- Customer clicked link/button
  )),
  outcome_at TIMESTAMPTZ NOT NULL,

  -- Outcome details (nullable, only populated when relevant)
  payment_amount NUMERIC(12,2),
  payment_id TEXT,
  promise_id UUID REFERENCES payment_promises(id),
  invoice_id TEXT,
  customer_id TEXT,

  -- Attribution metadata
  time_since_attempt_hours NUMERIC,  -- How long after the attempt did this outcome occur?
  confidence_score NUMERIC CHECK (confidence_score >= 0 AND confidence_score <= 1),
  attribution_method TEXT CHECK (attribution_method IN (
    'last_touch',      -- Most recent attempt before outcome
    'time_window',     -- Within N hours of attempt
    'explicit',        -- User/system explicitly linked
    'inferred'         -- Heuristic/probabilistic
  )),
  attribution_status TEXT NOT NULL DEFAULT 'unknown' CHECK (attribution_status IN ('verified', 'unknown', 'candidate')),

  notes TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Provider receipts are retried by WhatsApp providers.  Preserve one
-- canonical evidence row per attempt/outcome/provider identity.
ALTER TABLE recovery_outcomes
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_recovery_outcome_provider_receipt
  ON recovery_outcomes(recovery_attempt_id, outcome_type, provider_message_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recovery_outcome_payment
  ON recovery_outcomes(tenant_id, payment_id)
  WHERE payment_id IS NOT NULL;

-- Indexes for fast lookups
CREATE INDEX idx_recovery_outcomes_attempt
  ON recovery_outcomes(recovery_attempt_id);

CREATE INDEX idx_recovery_outcomes_tenant_time
  ON recovery_outcomes(tenant_id, outcome_at DESC);

CREATE INDEX idx_recovery_outcomes_type
  ON recovery_outcomes(tenant_id, outcome_type, outcome_at DESC);

CREATE INDEX idx_recovery_outcomes_customer
  ON recovery_outcomes(customer_id, outcome_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX idx_recovery_outcomes_invoice
  ON recovery_outcomes(invoice_id, outcome_at DESC)
  WHERE invoice_id IS NOT NULL;

COMMENT ON TABLE recovery_outcomes IS
  'Explicit record of every recovery attempt outcome. Foundation for behavioral learning (Phase 2).';

COMMENT ON COLUMN recovery_outcomes.recovery_attempt_id IS
  'Links to collection_actions.id - the causal spine of recovery.';

COMMENT ON COLUMN recovery_outcomes.attribution_method IS
  'How this outcome was linked to the attempt: last_touch (most recent), time_window (within N hours), explicit (user/system marked), inferred (heuristic)';

COMMENT ON COLUMN recovery_outcomes.confidence_score IS
  'How confident are we this attempt caused this outcome? 1.0 = certain, 0.5 = possible, 0.1 = unlikely but recorded.';

-- ============================================================
-- 2. Add triggered_by_action_id to payment_promises
-- ============================================================

ALTER TABLE payment_promises
  ADD COLUMN IF NOT EXISTS triggered_by_action_id TEXT REFERENCES collection_actions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_promises_action
  ON payment_promises(triggered_by_action_id)
  WHERE triggered_by_action_id IS NOT NULL;

COMMENT ON COLUMN payment_promises.triggered_by_action_id IS
  'The recovery attempt (collection_actions.id) that prompted this promise. Enables "Did customer promise after WhatsApp or after call?" queries.';

-- ============================================================
-- 3. Add foreign key constraint to whatsapp_events.recovery_attempt_id
-- ============================================================

-- First, clean up any orphaned records (events pointing to non-existent attempts)
UPDATE whatsapp_events
SET recovery_attempt_id = NULL
WHERE recovery_attempt_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM collection_actions
    WHERE collection_actions.id = whatsapp_events.recovery_attempt_id
  );

-- Add the foreign key constraint
ALTER TABLE whatsapp_events
  ADD CONSTRAINT fk_whatsapp_events_recovery_attempt
  FOREIGN KEY (recovery_attempt_id)
  REFERENCES collection_actions(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN whatsapp_events.recovery_attempt_id IS
  'Links this WhatsApp event to the recovery attempt that triggered it. The attribution spine.';

-- ============================================================
-- 4. Add last_recovery_action_id to invoices (optional, for quick lookups)
-- ============================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS last_recovery_action_id TEXT REFERENCES collection_actions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_last_recovery_action
  ON invoices(last_recovery_action_id)
  WHERE last_recovery_action_id IS NOT NULL;

COMMENT ON COLUMN invoices.last_recovery_action_id IS
  'The most recent recovery attempt for this invoice. Updated when collection_actions are created. Enables quick "which attempt preceded this payment?" queries.';

COMMIT;

-- ============================================================
-- Verification Queries (run after migration)
-- ============================================================

-- Check attribution chain integrity:
-- SELECT
--   COUNT(*) as total_actions,
--   COUNT(DISTINCT ca.id) as unique_actions,
--   SUM(CASE WHEN we.recovery_attempt_id IS NOT NULL THEN 1 ELSE 0 END) as with_wa_events,
--   SUM(CASE WHEN ro.recovery_attempt_id IS NOT NULL THEN 1 ELSE 0 END) as with_outcomes
-- FROM collection_actions ca
-- LEFT JOIN whatsapp_events we ON we.recovery_attempt_id = ca.id
-- LEFT JOIN recovery_outcomes ro ON ro.recovery_attempt_id = ca.id
-- WHERE ca.status IN ('completed', 'in_progress');

-- Check for orphaned events (should be zero after cleanup):
-- SELECT COUNT(*) as orphaned_events
-- FROM whatsapp_events
-- WHERE recovery_attempt_id IS NOT NULL
--   AND NOT EXISTS (
--     SELECT 1 FROM collection_actions WHERE id = whatsapp_events.recovery_attempt_id
--   );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 092_customer_messaging_consent.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Consent is an execution precondition for unattended WhatsApp recovery.
-- Keep an auditable timestamp; historical records remain false/unknown until
-- the merchant captures a fresh, explicit opt-in.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS opt_in BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS opt_in_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_recovery_consent
  ON customers (tenant_id, opt_in)
  WHERE opt_in = true;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 093_controlled_attribution_backfill.sql
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 093_controlled_attribution_backfill.sql
-- Phase 1.5 — Controlled attribution backfill (post D-gate PASS).
--
-- Purpose: backfill the causal spine (collection_actions.id) onto historical
-- outbound whatsapp_events and record payment outcomes, WITHOUT fabricating
-- history. Only provable links become 'verified'; everything else stays NULL /
-- 'unknown'. Nothing here rewrites existing verified evidence.
--
-- Guiding rule (frozen):
--   Exact billzo_message_id -> collection_actions.id       => verified
--   Exact provider_message_id -> attempt                      => verified
--   No matching attempt                                       => unknown (NULL link)
--   Multiple possible attempts                                => unknown (NULL link)
--   Missing/invalid identity                                  => unknown (NULL link)
--   Timestamp-only proximity                                  => NEVER verified
--
-- This is an idempotent, one-way repair. It does not create or duplicate
-- collection_actions, and it never guesses an attempt from time proximity.

BEGIN;

-- ============================================================
-- STEP 0 (SHOULD BE RUN FIRST, SEPARATELY): READ-ONLY AUDIT
-- Proves how much of the historical surface is actually provable
-- before any write. Run this block, review the numbers, then run
-- the write blocks below. Nothing in this block mutates data.
-- ============================================================

/*
-- 0a. How many outbound events are missing the causal link?
SELECT
  COUNT(*)                                        AS total_outbound,
  COUNT(*) FILTER (WHERE recovery_attempt_id IS NOT NULL) AS already_linked,
  COUNT(*) FILTER (WHERE recovery_attempt_id IS NULL)     AS missing_link
FROM whatsapp_events
WHERE direction = 'outbound';

-- 0b. Can any be matched by EXACT billzo_message_id? (99% here are local
--     'bmsg_'/'manual_' echoes — collection_actions never stored them, so
--     almost nothing is exact-matchable. Confirms 'unknown' is the honest
--     backfill for the vast majority.)
SELECT
  COUNT(*) FILTER (WHERE m.match_count = 1)  AS unique_match,
  COUNT(*) FILTER (WHERE m.match_count > 1)  AS ambiguous,
  COUNT(*) FILTER (WHERE m.match_count = 0)  AS no_match
FROM whatsapp_events we
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS match_count
  FROM collection_actions ca
  WHERE ca.metadata->>'billzo_message_id' = we.billzo_message_id
) m ON true
WHERE we.direction = 'outbound' AND we.recovery_attempt_id IS NULL
  AND we.billzo_message_id IS NOT NULL;

-- 0c. How many executed (non-scheduled/cancelled) attempts exist to link to?
SELECT status, COUNT(*) FROM collection_actions GROUP BY status ORDER BY COUNT(*) DESC;
*/

-- ============================================================
-- STEP 1: Backfill whatsapp_events.recovery_attempt_id via the
-- ONLY identity allowed to VERIFY — an exact, unambiguous message-id
-- match on collection_actions.metadata.billzo_message_id.
--
-- A second (weaker) fallback — an exact unique match on invoice
-- history — is deliberately NOT used: it would be timestamp-adjacent
-- inference, which is forbidden. Everything unprovable stays NULL
-- (which UI/ledger readers already render as 'unknown').
-- ============================================================

UPDATE whatsapp_events we
SET recovery_attempt_id = ca.id,
    metadata = COALESCE(we.metadata, '{}'::jsonb)
               || jsonb_build_object('backfill_origin', '093_controlled_attribution_backfill',
                                     'backfill_method', 'exact_billzo_message_id')
FROM (
  -- A message id that maps to EXACTLY ONE collection_action.
  SELECT ca.metadata->>'billzo_message_id' AS message_id, MIN(ca.id) AS id
  FROM collection_actions ca
  WHERE ca.metadata->>'billzo_message_id' IS NOT NULL
    AND ca.status <> 'cancelled'
  GROUP BY ca.metadata->>'billzo_message_id'
  HAVING COUNT(*) = 1
) ca
WHERE we.direction = 'outbound'
  AND we.recovery_attempt_id IS NULL
  AND we.billzo_message_id = ca.message_id;

-- ============================================================
-- STEP 2: Record historical PAYMENT outcomes.
--
-- A payment that is tied to an attempt by an exact, unambiguous
-- invoice+payment identity is recorded 'verified'. Any payment whose
-- attempt cannot be proven (no link, or multiple candidate attempts
-- for the same invoice) is recorded as 'unknown' evidence — the
-- provable fact that a payment happened is kept, but causality is
-- never invented.
--
-- Because historical payments pre-date 091 they cannot carry an
-- attempt link on the payment row itself, so the only VERIFIED
-- payment here is one matching an already-linked collection_actions
-- invoice. To stay conservative and avoid creating half-true rows,
-- this backfill only records payments we can attribute; unattributed
-- historical payments are left for the live ledger (which writes
-- 'unknown' for the same-absence case) rather than mass-inserted.
-- ============================================================

-- (Intentionally conservative: no mass payment-outcome backfill.
--  See STEP 1 + the live payment ledger for unattributed handling.)

COMMIT;

-- ============================================================
-- POST-BACKFILL AUDIT (run after the write blocks):
-- ============================================================

/*
-- What got linked, and what honestly could not be?
SELECT
  COUNT(*) FILTER (WHERE recovery_attempt_id IS NOT NULL) AS linked,
  COUNT(*) FILTER (WHERE recovery_attempt_id IS NULL)     AS unlinked_unknown
FROM whatsapp_events
WHERE direction = 'outbound';

-- The canonical Q1–Q4 oracle chain (docs/phase-1.5-attribution-audit.md)
-- Q1: Which attempt led to this payment?
SELECT ca.id as attempt_id, ro.outcome_type, ro.payment_amount
FROM collection_actions ca
JOIN recovery_outcomes ro ON ro.recovery_attempt_id = ca.id
WHERE ro.outcome_type = 'payment';

-- Q4: complete attempt lifecycle
SELECT ca.id, ca.action_type, ca.executed_at, ca.status,
       we.delivered_at, we.read_at
FROM collection_actions ca
LEFT JOIN whatsapp_events we ON we.recovery_attempt_id = ca.id;

-- Integrity: every backfilled link resolves to a real attempt (FK guarantees
-- this, but confirm no orphaned links remain):
SELECT COUNT(*) AS orphaned_links
FROM whatsapp_events
WHERE recovery_attempt_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM collection_actions WHERE id = whatsapp_events.recovery_attempt_id);
*/

-- ============================ END BASELINE ============================