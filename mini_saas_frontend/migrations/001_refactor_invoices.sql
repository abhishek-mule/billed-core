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
