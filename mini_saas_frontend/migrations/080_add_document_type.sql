-- 080_add_document_type.sql
-- Adds document_type column to invoices to support Tax Invoice (GST) vs Bill (non-GST).
-- Recovery engine is unchanged — it operates on outstanding_amount, not document type.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'tax_invoice';

-- Existing rows get 'tax_invoice' (safe default, no data loss)
COMMENT ON COLUMN invoices.document_type IS 'tax_invoice = GST Tax Invoice, bill = Non-GST Bill (for record & payment only)';
