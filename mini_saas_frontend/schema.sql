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