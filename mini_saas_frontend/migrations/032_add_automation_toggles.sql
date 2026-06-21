-- 032_add_automation_toggles.sql
-- Merchant sovereignty: control over who gets reminded and when

-- Customers: per-customer automation mode
--   full_auto — BillZo sends reminders automatically (default)
--   manual   — BillZo prepares reminders, merchant must approve
--   muted    — No reminders for this customer
ALTER TABLE customers ADD COLUMN IF NOT EXISTS automation_mode TEXT NOT NULL DEFAULT 'full_auto';

-- Invoices: per-invoice snooze controls
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_snoozed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS snooze_until TIMESTAMPTZ;
