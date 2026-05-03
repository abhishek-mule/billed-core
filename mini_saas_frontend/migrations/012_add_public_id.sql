-- 012_add_public_id.sql
-- Add public_id for secure invoice sharing
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS public_id TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_invoices_public_id ON invoices(public_id);
