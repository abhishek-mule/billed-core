-- 027_recovery_case_state.sql
-- RecoveryCase canonical truth spine
-- 
-- Changes:
--   - Add v2 state columns (dual-write safe — old columns preserved)
--   - Append-only event history table
--   - Idempotent event consumption tracking
--   - Enum-constrained action types
--   - Version column for optimistic concurrency
--   - Attention score for deterministic ranking

-- ============================================================
-- 1. ENUMS
-- ============================================================

-- RecoveryState = FACT (what is true about the collection position)
DO $$ BEGIN
  CREATE TYPE recovery_state_v2 AS ENUM (
    'active',
    'overdue',
    'partial_payment',
    'promised',
    'recovered',
    'disputed',
    'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- EngagementState = BELIEF (behavioral interpretation)
DO $$ BEGIN
  CREATE TYPE engagement_state_v2 AS ENUM (
    'unseen',
    'engaged',
    'intent',
    'likely_to_pay',
    'ghosting'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- NextActionType = system recommendation
DO $$ BEGIN
  CREATE TYPE recovery_next_action AS ENUM (
    'send_reminder',
    'review_payment',
    'follow_up_call',
    'wait',
    'merchant_review'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. RECOVERY_CASES — Add v2 columns (dual-write safe)
-- ============================================================

ALTER TABLE recovery_cases
  ADD COLUMN IF NOT EXISTS recovery_state_v2 recovery_state_v2,
  ADD COLUMN IF NOT EXISTS engagement_state_v2 engagement_state_v2,
  ADD COLUMN IF NOT EXISTS next_action_type recovery_next_action,
  ADD COLUMN IF NOT EXISTS next_action_due_at TIMESTAMPTZ,
  -- Aggregate counts (replaces invoice_ids[] anti-pattern)
  ADD COLUMN IF NOT EXISTS open_invoice_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overdue_invoice_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disputed_invoice_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promised_invoice_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_overdue NUMERIC NOT NULL DEFAULT 0,
  -- Promise tracking
  ADD COLUMN IF NOT EXISTS promise_to_pay_date TIMESTAMPTZ,
  -- Concurrency
  ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1,
  -- Projection version (for shadow truth comparison)
  ADD COLUMN IF NOT EXISTS projection_version INTEGER NOT NULL DEFAULT 1,
  -- Attention score (deterministic ranking)
  ADD COLUMN IF NOT EXISTS attention_score INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN recovery_cases.recovery_state_v2 IS 'Factual collection position. Never behavioral.';
COMMENT ON COLUMN recovery_cases.engagement_state_v2 IS 'Behavioral interpretation. Never factual.';
COMMENT ON COLUMN recovery_cases.version IS 'Optimistic concurrency — incremented on every transition.';
COMMENT ON COLUMN recovery_cases.projection_version IS 'Projection version for shadow truth comparison.';
COMMENT ON COLUMN recovery_cases.attention_score IS 'Deterministic ranking for queue ordering. Higher = more urgent.';

-- ============================================================
-- 3. RECOVERY_CASE_EVENTS — Append-only decision log
-- ============================================================
-- Stores SYSTEM DECISIONS (not raw signals).
-- Signals live in the outbox/events tables.
-- This table records what the state machine concluded.

CREATE TABLE IF NOT EXISTS recovery_case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,              -- e.g. 'transition', 'backfill', 'override'
  from_recovery_state recovery_state_v2,
  to_recovery_state recovery_state_v2,
  from_engagement_state engagement_state_v2,
  to_engagement_state engagement_state_v2,
  reason TEXT NOT NULL,                  -- Human-readable explanation
  trigger JSONB NOT NULL DEFAULT '{}',   -- What caused this decision (signal event ref + payload summary)
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rce_case_occurred ON recovery_case_events(case_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_rce_event_type ON recovery_case_events(event_type);

COMMENT ON TABLE recovery_case_events IS 'System decisions only. Raw signals are in outbox/events tables.';

-- ============================================================
-- 4. EVENT CONSUMPTION IDEMPOTENCY
-- ============================================================

CREATE TABLE IF NOT EXISTS recovery_case_event_consumptions (
  source_event_id TEXT NOT NULL,         -- The outbox event ID that triggered this transition
  case_id UUID NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_event_id, case_id)
);

COMMENT ON TABLE recovery_case_event_consumptions IS 'Prevents duplicate processing of the same source event.';

-- ============================================================
-- 5. INDEXES for the recovery queue query
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_rc_tenant_state
  ON recovery_cases(tenant_id, recovery_state_v2)
  WHERE recovery_state_v2 NOT IN ('recovered', 'closed');

CREATE INDEX IF NOT EXISTS idx_rc_tenant_attention
  ON recovery_cases(tenant_id, attention_score DESC)
  WHERE recovery_state_v2 NOT IN ('recovered', 'closed');

CREATE INDEX IF NOT EXISTS idx_rc_tenant_next_action
  ON recovery_cases(tenant_id, next_action_due_at)
  WHERE next_action_due_at IS NOT NULL;
