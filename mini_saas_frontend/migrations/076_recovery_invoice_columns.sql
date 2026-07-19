-- 076_recovery_invoice_columns.sql
-- Repair a schema/code mismatch: application code reads and writes
-- invoices.recovery_stage (TEXT) and invoices.next_recovery_at (TIMESTAMPTZ),
-- but no prior migration created these columns on invoices (they only existed
-- on whatsapp_events). Migration 057 introduced a recovery_state ENUM that the
-- code never consumed; these two columns are what the runtime actually depends on.
--
-- This migration is idempotent and must apply cleanly on a fresh database so V1
-- is installable.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS recovery_stage TEXT NOT NULL DEFAULT 't0_soft';

COMMENT ON COLUMN invoices.recovery_stage IS
  'Reminder lifecycle stage reached for this invoice (t0_soft, t1_reminder, t2_escalate, t3_urgent, t4_final, t5_warning). Set by the recovery actions layer.';

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS next_recovery_at TIMESTAMPTZ;

COMMENT ON COLUMN invoices.next_recovery_at IS
  'When the next automated reminder is due. NULL means no reminder scheduled.';

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS last_whatsapp_at TIMESTAMPTZ;

COMMENT ON COLUMN invoices.last_whatsapp_at IS
  'Timestamp of the last WhatsApp reminder sent for this invoice.';

CREATE INDEX IF NOT EXISTS idx_invoices_next_recovery_at
  ON invoices (next_recovery_at);

-- Backfill any invoices that already carry a recovery_state ENUM (from 057) into
-- the stage the code expects, so the two representations do not diverge on upgrade.
-- recovery_state 'scheduled' maps to an active stage; 'manual_review'/'completed'
-- map to terminal stages. This is best-effort and does not error if recovery_state
-- is absent.
UPDATE invoices
SET recovery_stage = CASE
  WHEN recovery_state = 'completed' THEN 't5_warning'
  WHEN recovery_state = 'manual_review' THEN 't5_warning'
  WHEN recovery_state = 'disputed' THEN 't5_warning'
  WHEN recovery_state = 'scheduled' THEN 't1_reminder'
  WHEN recovery_state = 'paused' THEN 't1_reminder'
  ELSE 't0_soft'
END
WHERE recovery_stage = 't0_soft'
  AND recovery_state IS NOT NULL;
