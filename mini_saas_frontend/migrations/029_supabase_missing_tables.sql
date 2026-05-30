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
