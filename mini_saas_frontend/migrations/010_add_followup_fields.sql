-- 010_add_followup_fields.sql
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS follow_up_stage INTEGER DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_follow_up_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS manual_pause BOOLEAN DEFAULT false;
