-- ============================================================
-- Merchant Override — Rule #9
-- ============================================================
-- When the decision engine blocks a reminder, the merchant can
-- override the block. This records WHY they overrode so the
-- system can learn from human judgment.
--
-- Override expires after 24h (or after the next send).
-- ============================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS override_send BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS override_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS override_reason TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS override_warning_acked BOOLEAN NOT NULL DEFAULT false;
