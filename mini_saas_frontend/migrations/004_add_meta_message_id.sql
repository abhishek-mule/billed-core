-- 004_add_meta_message_id.sql
-- Store meta_message_id for webhook correlation
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS meta_message_id TEXT;
CREATE INDEX IF NOT EXISTS idx_invoices_meta_message_id ON invoices(meta_message_id);
