-- 021_authority_gateway.sql
-- Sovereignty Gateway — Constitutional Mutation Authority
-- ============================================================
-- IMMUTABLE TABLES: INSERT-only. No UPDATEs. No DELETEs.
-- Replay determinism and forensic audit built into schema.
--
-- 7 tables:
--   authority_policies        — immutable governance law (versioned bundles)
--   authority_intents          — inbound intent requests
--   authority_decisions        — policy evaluation outcomes (one per intent)
--   authority_plans            — execution plans (frozen at decision time)
--   authority_executions       — capability execution evidence (new row per attempt)
--   authority_queue_outbox     — internal queue dispatch (prevents orphaned intents)
--   authority_nonces           — transport replay protection
-- ============================================================

-- 1. Policy bundles (immutable governance law)
CREATE TABLE IF NOT EXISTS authority_policies (
  policy_version TEXT PRIMARY KEY,
  policy_snapshot_hash TEXT NOT NULL UNIQUE,
  policy_bundle JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT NOT NULL
);

-- 2. Inbound intent requests (immutable)
CREATE TABLE IF NOT EXISTS authority_intents (
  intent_id TEXT PRIMARY KEY,
  intent_type TEXT NOT NULL,
  intent_version INT NOT NULL,
  tenant_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  source TEXT NOT NULL,
  payload JSONB NOT NULL,
  canonical_payload_hash TEXT NOT NULL,
  semantic_payload_hash TEXT NOT NULL,
  causation_id TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_authority_intents_tenant
  ON authority_intents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_authority_intents_type
  ON authority_intents(intent_type);
CREATE INDEX IF NOT EXISTS idx_authority_intents_correlation
  ON authority_intents(correlation_id);

-- 3. Policy decisions (immutable, one per intent)
CREATE TABLE IF NOT EXISTS authority_decisions (
  decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id TEXT NOT NULL REFERENCES authority_intents(intent_id),
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'rejected')),
  decision_reason JSONB NOT NULL,
  policy_snapshot_hash TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_authority_decision_per_intent
  ON authority_decisions(intent_id);

-- 4. Execution plans (frozen at decision time, never recompiled)
CREATE TABLE IF NOT EXISTS authority_plans (
  plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id TEXT NOT NULL REFERENCES authority_intents(intent_id),
  execution_plan JSONB NOT NULL,
  plan_hash TEXT NOT NULL,
  plan_compiler_version TEXT NOT NULL,
  capability_implementation_hashes JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_authority_plans_intent
  ON authority_plans(intent_id);

-- 5. Capability execution evidence (immutable — new row per attempt)
CREATE TABLE IF NOT EXISTS authority_executions (
  execution_group_id UUID NOT NULL,
  execution_group_key TEXT NOT NULL UNIQUE,
  attempt_number INT NOT NULL DEFAULT 1,
  intent_id TEXT NOT NULL REFERENCES authority_intents(intent_id),
  capability_id TEXT NOT NULL,
  capability_implementation_hash TEXT NOT NULL,
  execution_phase TEXT NOT NULL DEFAULT 'forward'
    CHECK (execution_phase IN ('forward', 'compensation', 'recovery', 'manual_replay', 'shadow')),
  priority_class TEXT NOT NULL CHECK (priority_class IN (
    'critical_financial', 'regulatory', 'tenant_lifecycle', 'transport', 'analytics'
  )),
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'pending', 'compensated')),
  result JSONB,
  executor_version TEXT NOT NULL,
  execution_latency_ms INT,
  queue_latency_ms INT,
  worker_id TEXT,
  executed_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (execution_group_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_authority_executions_intent
  ON authority_executions(intent_id);
CREATE INDEX IF NOT EXISTS idx_authority_executions_group
  ON authority_executions(execution_group_id);

-- 6. Internal queue outbox (prevents orphaned intents after DB commit)
CREATE TABLE IF NOT EXISTS authority_queue_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id TEXT NOT NULL REFERENCES authority_intents(intent_id),
  target_queue TEXT NOT NULL CHECK (target_queue IN ('authority', 'capabilities')),
  payload JSONB NOT NULL,
  priority_class TEXT NOT NULL CHECK (priority_class IN (
    'critical_financial', 'regulatory', 'tenant_lifecycle', 'transport', 'analytics'
  )),
  dispatched_at TIMESTAMPTZ,
  dispatch_attempts INT NOT NULL DEFAULT 0,
  last_dispatch_error JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_authority_queue_outbox_undispatched
  ON authority_queue_outbox(created_at)
  WHERE dispatched_at IS NULL;

-- 7. Transport replay protection (nonce dedup)
CREATE TABLE IF NOT EXISTS authority_nonces (
  nonce TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL REFERENCES authority_intents(intent_id),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_authority_nonces_expires
  ON authority_nonces(expires_at);
