-- 028_fix_recovery_case_fk_types.sql
-- Surgical fix: repair FK type mismatches in 027_recovery_case_state.sql
--
-- Problem: 027 uses `case_id UUID REFERENCES recovery_cases(id)` but
-- recovery_cases.id is TEXT. PostgreSQL requires exact type match for FKs.
--
-- Also: recovery_cases.customer_id was created as UUID but actual
-- invoice/customer IDs are varchar (e.g. CUST_xxx).
--
-- This migration is self-contained and idempotent. It can be applied
-- before or after 027 (idempotent operations skip already-applied work).

-- ============================================================
-- Part 0: Fix existing column types (empty table — safe)
-- ============================================================
ALTER TABLE recovery_cases ALTER COLUMN customer_id TYPE TEXT;

-- ============================================================
-- Part 1: ENUMS (idempotent — EXCEPTION WHEN duplicate_object)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE recovery_state_v2 AS ENUM (
    'active', 'overdue', 'partial_payment', 'promised',
    'recovered', 'disputed', 'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE engagement_state_v2 AS ENUM (
    'unseen', 'engaged', 'intent', 'likely_to_pay', 'ghosting'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE recovery_next_action AS ENUM (
    'send_reminder', 'review_payment', 'follow_up_call',
    'wait', 'merchant_review'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Part 2: v2 columns on recovery_cases (idempotent — IF NOT EXISTS)
-- ============================================================

ALTER TABLE recovery_cases
  ADD COLUMN IF NOT EXISTS recovery_state_v2 recovery_state_v2,
  ADD COLUMN IF NOT EXISTS engagement_state_v2 engagement_state_v2,
  ADD COLUMN IF NOT EXISTS next_action_type recovery_next_action,
  ADD COLUMN IF NOT EXISTS next_action_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS open_invoice_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overdue_invoice_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disputed_invoice_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promised_invoice_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_overdue NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promise_to_pay_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS attention_score INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- Part 3: recovery_case_events — Append-only decision log
-- Uses TEXT for case_id (matching recovery_cases.id type)
-- ============================================================

CREATE TABLE IF NOT EXISTS recovery_case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id TEXT NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_recovery_state recovery_state_v2,
  to_recovery_state recovery_state_v2,
  from_engagement_state engagement_state_v2,
  to_engagement_state engagement_state_v2,
  reason TEXT NOT NULL,
  trigger JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rce_case_occurred
  ON recovery_case_events(case_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_rce_event_type
  ON recovery_case_events(event_type);

-- ============================================================
-- Part 4: Event consumption idempotency table
-- ============================================================

CREATE TABLE IF NOT EXISTS recovery_case_event_consumptions (
  source_event_id TEXT NOT NULL,
  case_id TEXT NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_event_id, case_id)
);

-- ============================================================
-- Part 5: Indexes for the recovery queue query
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
