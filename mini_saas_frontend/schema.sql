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
  status VARCHAR(50) DEFAULT 'PENDING',
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
  session_id VARCHAR(255),
  quantity DECIMAL(12,3),
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- WhatsApp message tracking
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) REFERENCES tenants(invoice_id),
  invoice_id VARCHAR(255) REFERENCES invoices(id),
  phone VARCHAR(20),
  message_type VARCHAR(50) DEFAULT 'INVOICE',
  status VARCHAR(50) DEFAULT 'PENDING',
  whatsapp_message_id VARCHAR(255),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  delivered_at TIMESTAMP
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
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_invoice_id ON whatsapp_messages(invoice_id);