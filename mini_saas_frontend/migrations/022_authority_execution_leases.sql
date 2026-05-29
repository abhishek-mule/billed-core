-- 022_authority_execution_leases.sql
-- ============================================================
-- Execution leases, dispatch attempts, and replay invariants
-- for the Sovereignty Gateway constitutional runtime.
--
-- This migration adds:
--   1. authority_queue_dispatch_attempts — append-only dispatch log
--   2. authority_execution_leases — concurrency guard between sync + async paths
--   3. plan_id FK on authority_queue_outbox — immutable plan loading
--   4. registry_snapshot_hash on authority_plans — detect registry topology drift
--   5. Partial unique index on authority_executions — terminal success enforcement
-- ============================================================

-- 1. Append-only dispatch attempt log
-- Replaces mutable dispatched_at tracking on authority_queue_outbox.
-- "Undispatched" = no row with outcome='success' exists for the outbox_id.
CREATE TABLE IF NOT EXISTS authority_queue_dispatch_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id UUID NOT NULL REFERENCES authority_queue_outbox(id),
  attempt_number INT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failed')),
  error JSONB,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_attempts_outbox
  ON authority_queue_dispatch_attempts(outbox_id);

-- 2. Execution lease table
-- Prevents dual execution between trusted_sync path and outbox dispatcher.
-- Leases expire after LEASE_TTL_MS (15s default, enforced by application logic).
CREATE TABLE IF NOT EXISTS authority_execution_leases (
  execution_group_key TEXT PRIMARY KEY,
  leased_by TEXT NOT NULL,
  leased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_execution_leases_expires
  ON authority_execution_leases(expires_at);

-- 3. plan_id FK on outbox — immutable plan snapshot at execution time
-- Dispatcher must load the plan from authority_plans, never rehydrate from logic.
ALTER TABLE authority_queue_outbox
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES authority_plans(plan_id);

CREATE INDEX IF NOT EXISTS idx_queue_outbox_plan
  ON authority_queue_outbox(plan_id);

-- 4. registry_snapshot_hash on plans — detect registry topology drift during replay
-- Captures CapabilityRegistry.runtimeHash at the time the plan was built.
ALTER TABLE authority_plans
  ADD COLUMN IF NOT EXISTS registry_snapshot_hash TEXT;

-- 5. Terminal success uniqueness constraint
-- Prevents duplicate execution of irreversible mutations after crash + lease expiry.
-- Only one row per execution_group_key may have outcome='success' or 'compensated'.
CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_terminal_success
  ON authority_executions(execution_group_key)
  WHERE outcome IN ('success', 'compensated');
