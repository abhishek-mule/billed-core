-- 011_add_payment_attribution.sql
ALTER TABLE payments ADD COLUMN IF NOT EXISTS collected_via TEXT DEFAULT 'manual' CHECK (collected_via IN ('manual', 'auto'));
