-- 057_recovery_state_machine.sql
-- Introduce explicit recovery_state on invoices for the reminder lifecycle FSM.
--
-- State machine:
--   pending → scheduled → (t0→t1→t2→t3→t4→t5) → manual_review → completed
--             ↑                                    ↑
--         paused (merchant snoozes)          disputed
--
-- Worker processes only: pending + scheduled
-- Worker ignores:         paused | manual_review | completed | disputed
--
-- This replaces the overloaded meaning of next_recovery_at IS NULL
-- (which previously meant both "never scheduled" AND "finished scheduling").

CREATE TYPE invoice_recovery_state AS ENUM (
  'pending',
  'scheduled',
  'paused',
  'manual_review',
  'completed',
  'disputed'
);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recovery_state invoice_recovery_state NOT NULL DEFAULT 'pending';

COMMENT ON COLUMN invoices.recovery_state IS 'Reminder lifecycle state machine. pending=new, scheduled=active automation, paused=merchant snoozed, manual_review=all stages exhausted, completed=settled, disputed=contested';

CREATE INDEX IF NOT EXISTS idx_invoices_recovery_state ON invoices(recovery_state);

-- Backfill existing terminal-stage invoices so the worker never picks them up again.
-- These are invoices that have exhausted all reminder stages and have no next
-- recovery scheduled — they should live in manual_review, not pending.
UPDATE invoices
SET recovery_state = 'manual_review'
WHERE recovery_stage IN ('t5_warning', 't4_final')
  AND next_recovery_at IS NULL
  AND status IN ('unpaid', 'overdue');
