-- 008_add_credit_control.sql
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(15,2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_mode TEXT DEFAULT 'soft' CHECK (credit_mode IN ('soft', 'hard'));
