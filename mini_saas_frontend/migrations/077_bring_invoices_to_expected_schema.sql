-- 077_bring_invoices_to_expected_schema.sql
-- Append-only migration (per "never rewrite old migrations" policy) that brings
-- the LIVE invoices table up to what the application code actually requires.
--
-- Audit (integration test against production Supabase) found the live invoices
-- table was missing columns that existing migrations (003, 005, 006, 028, 046,
-- 055, 057) were supposed to create but were never applied to the cloud DB.
-- This caused runtime failures for any path that writes these columns.
--
-- Every statement is IF NOT EXISTS / idempotent so it is safe to (re)run and
-- cannot conflict with later environments where the columns already exist.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_url TEXT;
COMMENT ON COLUMN invoices.pdf_url IS 'URL of the generated invoice PDF.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;
COMMENT ON COLUMN invoices.last_reminder_at IS 'Timestamp of the last reminder sent for this invoice.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;
COMMENT ON COLUMN invoices.reminder_count IS 'Number of reminders sent for this invoice.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'partial'));
COMMENT ON COLUMN invoices.payment_status IS 'Payment state derived from paid_amount vs total.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(15,2) DEFAULT 0;
COMMENT ON COLUMN invoices.payment_amount IS 'Amount paid against this invoice.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sync_status TEXT;
COMMENT ON COLUMN invoices.sync_status IS 'Local/offline sync state for the Dexie->Supabase sync layer.';

-- The invoice_recovery_state ENUM was defined in migration 057, which was
-- never applied to this database. Create it idempotently so the column can
-- reference it. (Safe no-op where 057 already ran.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_recovery_state') THEN
    CREATE TYPE invoice_recovery_state AS ENUM (
      'pending', 'scheduled', 'paused', 'manual_review', 'completed', 'disputed'
    );
  END IF;
END $$;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recovery_state invoice_recovery_state NOT NULL DEFAULT 'pending';
COMMENT ON COLUMN invoices.recovery_state IS 'Reminder lifecycle state machine (backfilled by this migration).';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
COMMENT ON COLUMN invoices.version IS 'Optimistic-concurrency version used by the upsert/sync path.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS lifecycle_status TEXT;
COMMENT ON COLUMN invoices.lifecycle_status IS 'Payment lifecycle status (initiated, captured, failed, refunded).';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source_id TEXT;
COMMENT ON COLUMN invoices.source_id IS 'Identifier of the source system / channel that created the payment.';

-- Backfill recovery_state for existing rows based on their payment status.
-- (recovery_state was just added with a NOT NULL DEFAULT 'pending', so this
-- only upgrades already-paid invoices to 'completed'.)
UPDATE invoices
SET recovery_state = 'completed'
WHERE status IN ('paid', 'partial')
  AND recovery_state = 'pending';

-- udhar_balance (customer credit/Udhar ledger) was defined on `customers` in
-- migration 007, which was also never applied here. Add it idempotently.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS udhar_balance NUMERIC(15,2) DEFAULT 0;
COMMENT ON COLUMN customers.udhar_balance IS 'Running Udhar (credit) balance for the customer.';
