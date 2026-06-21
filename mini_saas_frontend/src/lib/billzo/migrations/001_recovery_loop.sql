-- BillZo Recovery Loop Migration
-- Run this in Supabase SQL Editor
-- Creates tables for outbox pattern, idempotency, recovery attribution, and experiments

-- ============================================================
-- 1. OUTBOX TABLE — Business event durability
-- ============================================================
CREATE TABLE IF NOT EXISTS outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  causation_id UUID,
  correlation_id UUID NOT NULL,
  type VARCHAR NOT NULL,
  version INT DEFAULT 1,
  tenant_id VARCHAR(255) NOT NULL,
  entity_id UUID,
  payload JSONB,
  idempotency_key VARCHAR UNIQUE,
  status VARCHAR DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  attempts INT DEFAULT 0
);

-- ============================================================
-- 2. PROCESSED_JOBS TABLE — Idempotency tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS processed_jobs (
  idempotency_key VARCHAR PRIMARY KEY,
  job_type VARCHAR NOT NULL,
  tenant_id VARCHAR(255) NOT NULL,
  status VARCHAR NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. RECOVERY_ATTRIBUTIONS TABLE — Payment-to-reminder linking
-- ============================================================
CREATE TABLE IF NOT EXISTS recovery_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  invoice_id UUID NOT NULL,
  payment_id UUID,
  reminder_event_id UUID,
  amount DECIMAL NOT NULL DEFAULT 0,
  attribution_type VARCHAR DEFAULT 'last_touch',
  attribution_window_hours INT DEFAULT 48,
  confidence_score DECIMAL DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. RECOVERY_EXPERIMENTS TABLE — A/B testing for reminders
-- ============================================================
CREATE TABLE IF NOT EXISTS recovery_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  experiment_type VARCHAR NOT NULL,
  variant VARCHAR NOT NULL,
  invoice_id UUID,
  customer_id UUID,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  outcome VARCHAR,
  recovered_amount DECIMAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. INDEXES — Query performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_outbox_status_tenant ON outbox(status, tenant_id, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_outbox_type ON outbox(type);
CREATE INDEX IF NOT EXISTS idx_outbox_idempotency ON outbox(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_processed_jobs_tenant ON processed_jobs(tenant_id, job_type);
CREATE INDEX IF NOT EXISTS idx_recovery_attributions_invoice ON recovery_attributions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_recovery_experiments_tenant ON recovery_experiments(tenant_id, experiment_type);
CREATE INDEX IF NOT EXISTS idx_recovery_experiments_invoice ON recovery_experiments(invoice_id);

-- ============================================================
-- 6. ROW LEVEL SECURITY — Tenant isolation
-- ============================================================
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_experiments ENABLE ROW LEVEL SECURITY;

-- Outbox policies
CREATE POLICY "outbox_tenant_isolation" ON outbox
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- Processed jobs policies
CREATE POLICY "processed_jobs_tenant_isolation" ON processed_jobs
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- Recovery attributions policies
CREATE POLICY "recovery_attributions_tenant_isolation" ON recovery_attributions
  USING (true) -- Read by server-side logic, not direct auth
  WITH CHECK (true);

-- Recovery experiments policies
CREATE POLICY "recovery_experiments_tenant_isolation" ON recovery_experiments
  USING (true) -- Read by server-side logic, not direct auth
  WITH CHECK (true);

-- ============================================================
-- 7. COMMENTS — Documentation
-- ============================================================
COMMENT ON TABLE outbox IS 'Business events written in same transaction as state changes. Polled by worker for async processing.';
COMMENT ON TABLE processed_jobs IS 'Idempotency key store. Prevents duplicate processing on retries.';
COMMENT ON TABLE recovery_attributions IS 'Links payments to reminders that triggered them. Supports last-touch and future multi-touch attribution.';
COMMENT ON TABLE recovery_experiments IS 'A/B testing for reminder timing, tone, and channel. Builds proprietary recovery intelligence.';
