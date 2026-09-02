-- 091_recovery_outcomes.sql
-- Phase 1.5: Outcome Integrity
--
-- Create explicit outcome recording so every recovery attempt can be traced to its result.
-- This is the foundation for behavioral learning (Phase 2).
--
-- Key principle: recovery_attempt_id (collection_actions.id) is the causal spine.
-- Every downstream event (delivery, reply, promise, payment) should trace back to it.

BEGIN;

-- ============================================================
-- 1. Create recovery_outcomes table
-- ============================================================

CREATE TABLE IF NOT EXISTS recovery_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  -- Evidence must outlive an operational action. Attempts are cancelled rather
  -- than deleted; RESTRICT prevents accidental loss of outcome history.
  recovery_attempt_id TEXT REFERENCES collection_actions(id) ON DELETE RESTRICT,

  -- What happened as a result of this attempt
  outcome_type TEXT NOT NULL CHECK (outcome_type IN (
    'payment',              -- Invoice paid (full or partial)
    'promise_kept',         -- Customer paid on promised date
    'promise_broken',       -- Customer missed promised date
    'no_response',          -- Delivered/read but no reply or action
    'delivered',            -- Provider delivered the WhatsApp message
    'failed_delivery',      -- WhatsApp failed to deliver
    'call_completed',       -- Merchant completed call
    'visit_completed',      -- Merchant completed in-person visit
    'customer_replied',     -- Customer sent inbound message
    'customer_read',        -- Customer read the message
    'customer_clicked'      -- Customer clicked link/button
  )),
  outcome_at TIMESTAMPTZ NOT NULL,

  -- Outcome details (nullable, only populated when relevant)
  payment_amount NUMERIC(12,2),
  payment_id TEXT,
  promise_id UUID REFERENCES payment_promises(id),
  invoice_id TEXT,
  customer_id TEXT,

  -- Attribution metadata
  time_since_attempt_hours NUMERIC,  -- How long after the attempt did this outcome occur?
  confidence_score NUMERIC CHECK (confidence_score >= 0 AND confidence_score <= 1),
  attribution_method TEXT CHECK (attribution_method IN (
    'last_touch',      -- Most recent attempt before outcome
    'time_window',     -- Within N hours of attempt
    'explicit',        -- User/system explicitly linked
    'inferred'         -- Heuristic/probabilistic
  )),
  attribution_status TEXT NOT NULL DEFAULT 'unknown' CHECK (attribution_status IN ('verified', 'unknown', 'candidate')),

  notes TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Provider receipts are retried by WhatsApp providers.  Preserve one
-- canonical evidence row per attempt/outcome/provider identity.
ALTER TABLE recovery_outcomes
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_recovery_outcome_provider_receipt
  ON recovery_outcomes(recovery_attempt_id, outcome_type, provider_message_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recovery_outcome_payment
  ON recovery_outcomes(tenant_id, payment_id)
  WHERE payment_id IS NOT NULL;

-- Indexes for fast lookups
CREATE INDEX idx_recovery_outcomes_attempt
  ON recovery_outcomes(recovery_attempt_id);

CREATE INDEX idx_recovery_outcomes_tenant_time
  ON recovery_outcomes(tenant_id, outcome_at DESC);

CREATE INDEX idx_recovery_outcomes_type
  ON recovery_outcomes(tenant_id, outcome_type, outcome_at DESC);

CREATE INDEX idx_recovery_outcomes_customer
  ON recovery_outcomes(customer_id, outcome_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX idx_recovery_outcomes_invoice
  ON recovery_outcomes(invoice_id, outcome_at DESC)
  WHERE invoice_id IS NOT NULL;

COMMENT ON TABLE recovery_outcomes IS
  'Explicit record of every recovery attempt outcome. Foundation for behavioral learning (Phase 2).';

COMMENT ON COLUMN recovery_outcomes.recovery_attempt_id IS
  'Links to collection_actions.id - the causal spine of recovery.';

COMMENT ON COLUMN recovery_outcomes.attribution_method IS
  'How this outcome was linked to the attempt: last_touch (most recent), time_window (within N hours), explicit (user/system marked), inferred (heuristic)';

COMMENT ON COLUMN recovery_outcomes.confidence_score IS
  'How confident are we this attempt caused this outcome? 1.0 = certain, 0.5 = possible, 0.1 = unlikely but recorded.';

-- ============================================================
-- 2. Add triggered_by_action_id to payment_promises
-- ============================================================

ALTER TABLE payment_promises
  ADD COLUMN IF NOT EXISTS triggered_by_action_id TEXT REFERENCES collection_actions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_promises_action
  ON payment_promises(triggered_by_action_id)
  WHERE triggered_by_action_id IS NOT NULL;

COMMENT ON COLUMN payment_promises.triggered_by_action_id IS
  'The recovery attempt (collection_actions.id) that prompted this promise. Enables "Did customer promise after WhatsApp or after call?" queries.';

-- ============================================================
-- 3. Add foreign key constraint to whatsapp_events.recovery_attempt_id
-- ============================================================

-- First, clean up any orphaned records (events pointing to non-existent attempts)
UPDATE whatsapp_events
SET recovery_attempt_id = NULL
WHERE recovery_attempt_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM collection_actions
    WHERE collection_actions.id = whatsapp_events.recovery_attempt_id
  );

-- Add the foreign key constraint
ALTER TABLE whatsapp_events
  ADD CONSTRAINT fk_whatsapp_events_recovery_attempt
  FOREIGN KEY (recovery_attempt_id)
  REFERENCES collection_actions(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN whatsapp_events.recovery_attempt_id IS
  'Links this WhatsApp event to the recovery attempt that triggered it. The attribution spine.';

-- ============================================================
-- 4. Add last_recovery_action_id to invoices (optional, for quick lookups)
-- ============================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS last_recovery_action_id TEXT REFERENCES collection_actions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_last_recovery_action
  ON invoices(last_recovery_action_id)
  WHERE last_recovery_action_id IS NOT NULL;

COMMENT ON COLUMN invoices.last_recovery_action_id IS
  'The most recent recovery attempt for this invoice. Updated when collection_actions are created. Enables quick "which attempt preceded this payment?" queries.';

COMMIT;

-- ============================================================
-- Verification Queries (run after migration)
-- ============================================================

-- Check attribution chain integrity:
-- SELECT
--   COUNT(*) as total_actions,
--   COUNT(DISTINCT ca.id) as unique_actions,
--   SUM(CASE WHEN we.recovery_attempt_id IS NOT NULL THEN 1 ELSE 0 END) as with_wa_events,
--   SUM(CASE WHEN ro.recovery_attempt_id IS NOT NULL THEN 1 ELSE 0 END) as with_outcomes
-- FROM collection_actions ca
-- LEFT JOIN whatsapp_events we ON we.recovery_attempt_id = ca.id
-- LEFT JOIN recovery_outcomes ro ON ro.recovery_attempt_id = ca.id
-- WHERE ca.status IN ('completed', 'in_progress');

-- Check for orphaned events (should be zero after cleanup):
-- SELECT COUNT(*) as orphaned_events
-- FROM whatsapp_events
-- WHERE recovery_attempt_id IS NOT NULL
--   AND NOT EXISTS (
--     SELECT 1 FROM collection_actions WHERE id = whatsapp_events.recovery_attempt_id
--   );
