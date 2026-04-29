-- Multi-tenant BillZo schema with RLS policies
-- Run via: bunx db-migrate

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  subdomain TEXT UNIQUE,
  plan TEXT DEFAULT 'free',
  is_active BOOLEAN DEFAULT true,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on tenants
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Tenants can only see their own tenant (admins see all)
CREATE POLICY "tenants_select" ON tenants FOR SELECT
  USING (true);

CREATE POLICY "tenants_update" ON tenants FOR UPDATE
  USING (id IN (SELECT DISTINCT tenant_id FROM tenant_users WHERE phone = current_setting('app.current_user_phone', true)));

CREATE POLICY "tenants_insert" ON tenants FOR INSERT
  WITH CHECK (true);

-- Tenant users (staff accounts)
CREATE TABLE IF NOT EXISTS tenant_users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'accountant', 'cashier', 'manager', 'auditor')),
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, phone),
  CONSTRAINT tenant_users_phone_length CHECK (char_length(phone) >= 10)
);

ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_users_select" ON tenant_users FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY "tenant_users_insert" ON tenant_users FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY "tenant_users_update" ON tenant_users FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Encrypted ERPNext credentials per tenant
CREATE TABLE IF NOT EXISTS tenant_credentials (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  erp_site_url TEXT,
  erp_api_key_encrypted TEXT NOT NULL,
  erp_api_secret_encrypted TEXT NOT NULL,
  key_version TEXT DEFAULT 'v1',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tenant_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_credentials_select" ON tenant_credentials FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY "tenant_credentials_insert" ON tenant_credentials FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY "tenant_credentials_update" ON tenant_credentials FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Invoice table with ERPNext sync tracking
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_name TEXT,
  customer_phone TEXT,
  customer_gstin TEXT,
  place_of_supply TEXT,
  subtotal NUMERIC(15,2) DEFAULT 0,
  cgst_amount NUMERIC(15,2) DEFAULT 0,
  sgst_amount NUMERIC(15,2) DEFAULT 0,
  igst_amount NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) NOT NULL,
  erp_docname TEXT,
  erp_sync_status TEXT DEFAULT 'PENDING' CHECK (erp_sync_status IN ('PENDING', 'SYNCED', 'FAILED', 'RETRY')),
  erp_sync_error TEXT,
  erp_synced_at TIMESTAMPTZ,
  items JSONB DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, invoice_number)
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select" ON invoices FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY "invoices_insert" ON invoices FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY "invoices_update" ON invoices FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Invoice items
CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  item_name TEXT,
  hsn_code TEXT,
  quantity NUMERIC(10,3) NOT NULL,
  rate NUMERIC(15,2) NOT NULL,
  gst_rate NUMERIC(5,2) DEFAULT 0,
  cgst_amount NUMERIC(15,2) DEFAULT 0,
  sgst_amount NUMERIC(15,2) DEFAULT 0,
  igst_amount NUMERIC(15,2) DEFAULT 0,
  amount NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_items_select" ON invoice_items FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY "invoice_items_insert" ON invoice_items FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

-- Products/Items table
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  hsn_code TEXT,
  category TEXT,
  gst_rate NUMERIC(5,2) DEFAULT 18,
  unit TEXT DEFAULT 'pc',
  price NUMERIC(15,2) DEFAULT 0,
  cost NUMERIC(15,2) DEFAULT 0,
  opening_stock NUMERIC(10,3) DEFAULT 0,
  reorder_level NUMERIC(10,3) DEFAULT 0,
  barcode TEXT,
  aliases TEXT[],
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, item_code),
  UNIQUE(tenant_id, barcode) WHERE barcode IS NOT NULL
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select" ON products FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY "products_insert" ON products FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY "products_update" ON products FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Parties (customers/suppliers)
CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  gstin TEXT,
  address TEXT,
  type TEXT NOT NULL CHECK (type IN ('customer', 'supplier', 'both')),
  opening_balance NUMERIC(15,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, phone)
);

ALTER TABLE parties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parties_select" ON parties FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY "parties_insert" ON parties FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY "parties_update" ON parties FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Audit logs for billing actions
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

-- Role permissions mapping
CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  permission TEXT NOT NULL,
  UNIQUE(role, permission)
);

INSERT INTO role_permissions (id, role, permission) VALUES
  ('rp1', 'owner', 'all'),
  ('rp2', 'accountant', 'createInvoice'),
  ('rp3', 'accountant', 'viewInvoice'),
  ('rp4', 'accountant', 'editInvoice'),
  ('rp5', 'accountant', 'viewCustomer'),
  ('rp6', 'accountant', 'viewProduct'),
  ('rp7', 'accountant', 'viewPayment'),
  ('rp8', 'accountant', 'viewReports'),
  ('rp9', 'cashier', 'createInvoice'),
  ('rp10', 'cashier', 'viewInvoice'),
  ('rp11', 'cashier', 'viewCustomer'),
  ('rp12', 'cashier', 'viewProduct'),
  ('rp13', 'cashier', 'viewPayment'),
  ('rp14', 'manager', 'createInvoice'),
  ('rp15', 'manager', 'viewInvoice'),
  ('rp16', 'manager', 'editInvoice'),
  ('rp17', 'manager', 'createCustomer'),
  ('rp18', 'manager', 'viewCustomer'),
  ('rp19', 'manager', 'createProduct'),
  ('rp20', 'manager', 'viewProduct'),
  ('rp21', 'manager', 'editProduct'),
  ('rp22', 'manager', 'viewPayment'),
  ('rp23', 'manager', 'viewReports'),
  ('rp24', 'manager', 'viewStaff'),
  ('rp50', 'auditor', 'viewInvoice'),
  ('rp51', 'auditor', 'viewCustomer'),
  ('rp52', 'auditor', 'viewProduct'),
  ('rp53', 'auditor', 'viewPayment'),
  ('rp54', 'auditor', 'viewReports')
ON CONFLICT DO NOTHING;

-- Sessions table for multi-device logout
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions_select" ON sessions FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY "sessions_insert" ON sessions FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY "sessions_update" ON sessions FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Invoice notifications (WhatsApp, SMS)
CREATE TABLE IF NOT EXISTS invoice_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  provider VARCHAR,
  status VARCHAR NOT NULL,
  attempt INTEGER DEFAULT 1,
  provider_message_id VARCHAR,
  error_code VARCHAR,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  UNIQUE(tenant_id, invoice_id, channel)
);

ALTER TABLE invoice_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_notifications_select" ON invoice_notifications FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY "invoice_notifications_insert" ON invoice_notifications FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_phone ON tenant_users(phone);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_number ON invoices(tenant_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_erp_sync ON invoices(tenant_id, erp_sync_status);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_notifications_tenant_created ON invoice_notifications(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active) WHERE is_active = true;

-- Schema migrations table
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  rollback_sql TEXT
);

-- Function to set tenant context
CREATE OR REPLACE FUNCTION set_tenant_context(tenant_id TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_tenant_id', tenant_id, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current tenant ID
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS TEXT AS $$
BEGIN
  RETURN current_setting('app.current_tenant_id', true);
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant usage on schema to all roles
GRANT USAGE ON SCHEMA public TO billzo_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO billzo_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO billzo_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO billzo_user;