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
