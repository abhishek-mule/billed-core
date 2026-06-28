-- ============================================================
-- !!! SUPERSEDED — DO NOT APPLY !!!
-- ============================================================
-- Replaced by: recovery_case_events (created in 028_fix_recovery_case_fk_types.sql)
-- The API writes all recovery action telemetry to recovery_case_events instead.
-- This file is kept for reference only and is NOT included in the apply order.
-- ============================================================
--
-- Original intent:
-- Recovery Queue action telemetry
-- Tracks what merchants do in the Recovery Queue to validate product direction.
-- Minimal schema: tenant + customer + event type + timestamp.
-- No dashboards. Just raw events for post-hoc analysis.

-- CREATE TABLE IF NOT EXISTS recovery_queue_events (
--   id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   tenant_id TEXT NOT NULL,
--   customer_id TEXT,
--   event_type  TEXT NOT NULL,
--   metadata    JSONB DEFAULT '{}'::jsonb,
--   created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );

-- CREATE INDEX IF NOT EXISTS idx_rqe_tenant_event
--   ON recovery_queue_events (tenant_id, event_type, created_at);

-- CREATE INDEX IF NOT EXISTS idx_rqe_tenant_created
--   ON recovery_queue_events (tenant_id, created_at DESC);
