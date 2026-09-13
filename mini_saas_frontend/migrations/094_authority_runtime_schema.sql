-- 094_authority_runtime_schema.sql
-- ============================================================
-- Reconcile authority_* tables to the committed runtime contract
-- (authority-runtime / executor / outbox-dispatcher / persistence).
--
-- The executor, outbox dispatcher, and persistence layers were
-- refactored AFTER migrations 021/022 were written, so the applied
-- DDL no longer matches the code that writes them. The authority
-- tables have never carried traffic (the worker runtime was never
-- booted before B-01), so this reconciliation is data-safe: tables
-- are dropped and recreated to the code's exact write contract.
--
-- Changes:
--   1. authority_intents     — add `nonce` (dispatcher rehydrates it
--      to build the execution lease key; persistence now stores it).
--   2. authority_execution_leases — match executor INSERT/RETURNING
--      (intent_id, execution_group_key, lease_id, acquired_at,
--      expires_at) + partial unique index ON (execution_group_key)
--      WHERE outcome IS NULL (arbiter for ON CONFLICT).
--   3. authority_executions — summary-row contract
--      (intent_id, execution_group_key, outcome, results, lease_id,
--      completed_at) instead of per-capability rows.
--   4. authority_queue_dispatch_attempts — dispatcher write contract
--      (outbox_id, intent_id, status, attempted_at, completed_at,
--      result, error).
-- ============================================================

ALTER TABLE authority_intents
  ADD COLUMN IF NOT EXISTS nonce TEXT;

ALTER TABLE authority_plans
  ADD COLUMN IF NOT EXISTS policy_snapshot_hash TEXT;

-- 2. execution leases
DROP INDEX IF EXISTS idx_execution_leases_expires;
DROP TABLE IF EXISTS authority_execution_leases;
CREATE TABLE IF NOT EXISTS authority_execution_leases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id TEXT NOT NULL,
  execution_group_key TEXT NOT NULL,
  lease_id UUID NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  outcome TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_lease_group_active
  ON authority_execution_leases(execution_group_key)
  WHERE outcome IS NULL;
CREATE INDEX IF NOT EXISTS idx_execution_leases_expires
  ON authority_execution_leases(expires_at);

-- 3. executions (summary-row contract)
DROP INDEX IF EXISTS uq_execution_terminal_success;
DROP TABLE IF EXISTS authority_executions;
CREATE TABLE IF NOT EXISTS authority_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id TEXT NOT NULL REFERENCES authority_intents(intent_id),
  execution_group_key TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
  results JSONB NOT NULL,
  lease_id UUID,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_authority_executions_intent
  ON authority_executions(intent_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_terminal_success
  ON authority_executions(execution_group_key)
  WHERE outcome IN ('success', 'compensated');

-- 4. dispatch attempts (dispatcher write contract)
DROP TABLE IF EXISTS authority_queue_dispatch_attempts;
CREATE TABLE IF NOT EXISTS authority_queue_dispatch_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id UUID NOT NULL REFERENCES authority_queue_outbox(id),
  intent_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed')),
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  result JSONB,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_dispatch_attempts_outbox
  ON authority_queue_dispatch_attempts(outbox_id);