-- 067_collection_action_scheduling.sql
-- Add scheduling, policy reference, trigger type, retry tracking, and action_state
-- values (paused, expired) to collection_actions.

BEGIN;

-- ============================================================
-- 1. Scheduling and policy columns
-- ============================================================
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS template_name TEXT;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS policy_id TEXT;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS trigger_type TEXT;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 3;

-- Index for the new scheduler query pattern
CREATE INDEX IF NOT EXISTS idx_ca_scheduled_pending
  ON collection_actions(scheduled_at, attempt_count)
  WHERE status = 'scheduled' AND action_type IN ('reminder', 'promise_followup');

COMMENT ON COLUMN collection_actions.template_name IS 'Meta/WhatsApp template to use for this action';
COMMENT ON COLUMN collection_actions.policy_id IS 'The recovery policy that generated this action';
COMMENT ON COLUMN collection_actions.trigger_type IS 'DUE_DATE | PROMISE_DATE | INVOICE_CREATED | OVERDUE | MANUAL';
COMMENT ON COLUMN collection_actions.attempt_count IS 'Number of transport send attempts made';
COMMENT ON COLUMN collection_actions.max_attempts IS 'Max transport retries before marking failed (default 3)';

COMMIT;
