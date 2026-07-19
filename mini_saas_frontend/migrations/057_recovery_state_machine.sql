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

-- NOTE: The original backfill referenced invoices.recovery_stage / next_recovery_at,
-- which were never created on the invoices table. That made this migration fail to
-- apply on a fresh database. The recovery_stage (TEXT) and next_recovery_at
-- (TIMESTAMPTZ) columns are added by migration 076, which also seeds sane defaults.
-- The terminal-stage backfill is now handled there, so it is intentionally omitted here
-- to keep 057 idempotent and applyable.
