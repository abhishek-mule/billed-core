import 'dotenv/config'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

const statements = [
  `
  CREATE TABLE IF NOT EXISTS tenant_credentials (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    erp_site_url TEXT,
    erp_api_key_encrypted TEXT NOT NULL,
    erp_api_secret_encrypted TEXT NOT NULL,
    key_version TEXT DEFAULT 'v1',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS purchases (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    purchase_invoice_number VARCHAR(100),
    supplier_id VARCHAR(255),
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
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS invoice_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    invoice_id VARCHAR(255) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    provider VARCHAR(50),
    status VARCHAR(50) NOT NULL,
    attempt INTEGER DEFAULT 1,
    provider_message_id VARCHAR(255),
    error_code VARCHAR(255),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    delivered_at TIMESTAMP,
    UNIQUE (tenant_id, invoice_id, channel)
  )
  `,
  `CREATE INDEX IF NOT EXISTS idx_invoice_notifications_tenant_created ON invoice_notifications(tenant_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_purchases_tenant_id ON purchases(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_purchases_invoice_number ON purchases(purchase_invoice_number)`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS standard_rate DECIMAL(12,2)`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS mrp DECIMAL(12,2)`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100)`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(12,2) DEFAULT 0`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_date TIMESTAMP DEFAULT NOW()`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS grand_total DECIMAL(12,2)`,
  `UPDATE products SET standard_rate = COALESCE(standard_rate, rate) WHERE standard_rate IS NULL`,
  `UPDATE invoices SET tax_amount = COALESCE(cgst, 0) + COALESCE(sgst, 0) + COALESCE(igst, 0) WHERE tax_amount IS NULL OR tax_amount = 0`,
  `UPDATE invoices SET grand_total = COALESCE(grand_total, total) WHERE grand_total IS NULL`,
]

async function main() {
  console.log('[db:align] Connected')

  try {
    for (const statement of statements) {
      await pool.query(statement)
    }
    console.log('[db:align] Schema alignment completed')
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error('[db:align] Failed', error)
  process.exit(1)
})
