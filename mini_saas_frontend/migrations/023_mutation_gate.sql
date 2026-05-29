-- Step 1: Shadow-mode observability tables for MutationGate
-- These are append-only log tables; no apps query them yet.

-- mutation_log: tracks every request submitted to the gate
CREATE TABLE IF NOT EXISTS mutation_log (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  intent_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  client_version INT,
  outcome TEXT NOT NULL,
  error TEXT,
  touched_rows JSONB DEFAULT '[]'::jsonb,
  transition_traces JSONB DEFAULT '[]'::jsonb,
  mode TEXT NOT NULL DEFAULT 'shadow',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mutation_log_tenant ON mutation_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mutation_log_idempotency ON mutation_log (idempotency_key);

-- mutation_processed_keys: idempotency dedup table
CREATE TABLE IF NOT EXISTS mutation_processed_keys (
  idempotency_key TEXT PRIMARY KEY,
  intent_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mutation_processed_keys_tenant ON mutation_processed_keys (tenant_id, created_at DESC);

-- mutation_outbox: durable outbox for future async dispatching
CREATE TABLE IF NOT EXISTS mutation_outbox (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  intent_type TEXT NOT NULL,
  tenant_id UUID NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  dispatched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mutation_outbox_pending ON mutation_outbox (status, created_at ASC) WHERE status = 'pending';

-- mutation_effects: materialized transition traces for queryability
CREATE TABLE IF NOT EXISTS mutation_effects (
  id BIGSERIAL PRIMARY KEY,
  log_id BIGINT REFERENCES mutation_log(id) ON DELETE CASCADE,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field TEXT NOT NULL,
  from_val TEXT,
  to_val TEXT NOT NULL,
  sequence INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mutation_effects_entity ON mutation_effects (entity, entity_id, created_at DESC);
