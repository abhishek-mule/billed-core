-- Multi-tenant BillZo schema
-- Run via: bunx db-migrate

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
  UNIQUE(tenant_id, phone)
);

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

-- Invoice table with ERPNext sync tracking
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  customer_id TEXT,
  customer_name TEXT NOT NULL,
  customer_gstin TEXT,
  status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINALIZED', 'VOIDED', 'CANCELLED', 'DELETED_LOGICAL')),
  
  -- Line items totals
  subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0,
  cgst NUMERIC(15, 2) NOT NULL DEFAULT 0,
  sgst NUMERIC(15, 2) NOT NULL DEFAULT 0,
  igst NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total NUMERIC(15, 2) NOT NULL DEFAULT 0,
  
  -- Ledger consistency
  line_items_json JSONB NOT NULL DEFAULT '[]',
  tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  
  -- ERPNext sync tracking
  erp_invoice_id TEXT,
  erp_sync_status TEXT DEFAULT 'PENDING' CHECK (erp_sync_status IN ('PENDING', 'SYNCED', 'FAILED', 'RETRY')),
  erp_synced_at TIMESTAMPTZ,
  erp_sync_error TEXT,
  
  -- Compliance
  gstin TEXT,
  place_of_supply TEXT,
  reverse_charge BOOLEAN DEFAULT FALSE,
  
  -- Meta
  notes TEXT,
  payment_mode TEXT,
  due_date TIMESTAMPTZ,
  invoice_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Uniqueness per tenant
  UNIQUE(tenant_id, invoice_number)
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  gstin TEXT,
  phone TEXT,
  email TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, customer_name)
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  hsn_code TEXT,
  standard_rate NUMERIC(15, 2) DEFAULT 0,
  gst_rate NUMERIC(5, 2) DEFAULT 18,
  stock_qty NUMERIC(15, 3) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, item_code)
);

-- Invoice line items
CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  hsn_code TEXT,
  quantity NUMERIC(15, 3) NOT NULL,
  rate NUMERIC(15, 2) NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  cgst NUMERIC(15, 2) NOT NULL DEFAULT 0,
  sgst NUMERIC(15, 2) NOT NULL DEFAULT 0,
  igst NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  amount NUMERIC(15, 2) NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'OTHER')),
  reference TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES tenant_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs for billing actions
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Role permissions mapping
CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  permission TEXT NOT NULL,
  UNIQUE(role, permission)
);

-- Default permissions
INSERT INTO role_permissions (id, role, permission) VALUES
  ('rp1', 'owner', 'createInvoice'),
  ('rp2', 'owner', 'deleteInvoice'),
  ('rp3', 'owner', 'editInvoice'),
  ('rp4', 'owner', 'viewInvoice'),
  ('rp5', 'owner', 'createCustomer'),
  ('rp6', 'owner', 'deleteCustomer'),
  ('rp7', 'owner', 'editCustomer'),
  ('rp8', 'owner', 'viewCustomer'),
  ('rp9', 'owner', 'createProduct'),
  ('rp10', 'owner', 'deleteProduct'),
  ('rp11', 'owner', 'editProduct'),
  ('rp12', 'owner', 'viewProduct'),
  ('rp13', 'owner', 'createPayment'),
  ('rp14', 'owner', 'deletePayment'),
  ('rp15', 'owner', 'viewPayment'),
  ('rp16', 'owner', 'viewReports'),
  ('rp17', 'owner', 'exportReports'),
  ('rp18', 'owner', 'manageUsers'),
  ('rp19', 'owner', 'manageSettings'),
  ('rp20', 'owner', 'viewSettings'),
  ('rp21', 'cashier', 'createInvoice'),
  ('rp22', 'cashier', 'viewInvoice'),
  ('rp23', 'cashier', 'createCustomer'),
  ('rp24', 'cashier', 'viewCustomer'),
  ('rp25', 'cashier', 'viewProduct'),
  ('rp26', 'cashier', 'createPayment'),
  ('rp27', 'cashier', 'viewPayment'),
  ('rp28', 'cashier', 'viewSettings'),
  ('rp29', 'accountant', 'createInvoice'),
  ('rp30', 'accountant', 'deleteInvoice'),
  ('rp31', 'accountant', 'editInvoice'),
  ('rp32', 'accountant', 'viewInvoice'),
  ('rp33', 'accountant', 'createCustomer'),
  ('rp34', 'accountant', 'deleteCustomer'),
  ('rp35', 'accountant', 'editCustomer'),
  ('rp36', 'accountant', 'viewCustomer'),
  ('rp37', 'accountant', 'createProduct'),
  ('rp38', 'accountant', 'deleteProduct'),
  ('rp39', 'accountant', 'editProduct'),
  ('rp40', 'accountant', 'viewProduct'),
  ('rp41', 'accountant', 'createPayment'),
  ('rp42', 'accountant', 'viewPayment'),
  ('rp43', 'accountant', 'viewReports'),
  ('rp44', 'accountant', 'viewSettings'),
  ('rp45', 'manager', 'viewInvoice'),
  ('rp46', 'manager', 'viewCustomer'),
  ('rp47', 'manager', 'viewProduct'),
  ('rp48', 'manager', 'viewPayment'),
  ('rp49', 'manager', 'viewReports'),
  ('rp50', 'manager', 'exportReports'),
  ('rp51', 'auditor', 'viewInvoice'),
  ('rp52', 'auditor', 'viewCustomer'),
  ('rp53', 'auditor', 'viewProduct'),
  ('rp54', 'auditor', 'viewPayment'),
  ('rp55', 'auditor', 'viewReports')
ON CONFLICT DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_phone ON tenant_users(phone);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_number ON invoices(tenant_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_erp_sync ON invoices(tenant_id, erp_sync_status);
CREATE TABLE IF NOT EXISTS invoice_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,
  invoice_id VARCHAR NOT NULL,
  channel VARCHAR NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_invoice_notifications_tenant_created ON invoice_notifications(tenant_id, created_at DESC);

-- Schema migrations table
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  rollback_sql TEXT
);

-- Invoice sequence
CREATE SEQUENCE IF NOT EXISTS invoice_seq;