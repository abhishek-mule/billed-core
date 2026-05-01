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