-- 019_behavioral_memory.sql
-- Phase 2A: Temporal Behavioral Memory Substrate
--
-- This migration introduces the behavioral evidence layer — the permanent memory
-- substrate between raw transport events and orchestration decisions.
--
-- Architectural invariants:
--   1. Raw transport truth is sacred — whatsapp_events is immutable sensory cortex
--   2. Observations are hypotheses with confidence, not facts
--   3. All behavioral aggregates carry interpreter version for replay determinism
--   4. No stored archetypes — only compressed behavioral evidence
--   5. Confidence-weighted accumulation prevents transport artifact contamination
--   6. schema_version tracks semantic evolution, not column changes
-- ============================================================

-- 1. CUSTOMER BEHAVIORAL METRICS — Global behavioral tendencies
-- ============================================================
-- Stores decayed, confidence-weighted behavioral aggregates per (tenant, customer).
-- Every write is deterministic and replayable from the observation event stream.
-- schema_version changes when decay math or confidence semantics evolve.

CREATE TABLE IF NOT EXISTS customer_behavioral_metrics (
  tenant_id           VARCHAR(255) NOT NULL,
  customer_id         UUID NOT NULL,
  schema_version      INT NOT NULL DEFAULT 1,

  -- rates (confidence-weighted, decayed via EMA)
  read_rate                   NUMERIC DEFAULT 0,
  payment_conversion_rate     NUMERIC DEFAULT 0,

  -- latencies (decayed weighted mean, per-metric half-life)
  avg_read_to_pay_hours             NUMERIC DEFAULT 0,
  avg_reminder_response_hours       NUMERIC DEFAULT 0,
  avg_settlement_latency_hours      NUMERIC DEFAULT 0,

  -- observation metadata
  observation_count           INT DEFAULT 0,
  total_interventions_sent    INT DEFAULT 0,
  total_interventions_read    NUMERIC DEFAULT 0,
  total_resolutions_after_intervention INT DEFAULT 0,

  -- pressure memory
  total_escalations_received  INT DEFAULT 0,
  last_escalation_at          TIMESTAMPTZ,
  interventions_until_resolution INT,

  -- staleness tracking
  last_resolution_at          TIMESTAMPTZ,
  last_read_at                TIMESTAMPTZ,
  last_response_at            TIMESTAMPTZ,
  last_event_at               TIMESTAMPTZ,

  updated_at                  TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (tenant_id, customer_id)
);

-- 2. CUSTOMER LIQUIDITY WINDOWS — Temporal payment affinity histograms
-- ============================================================
-- Stores unnormalized affinity scores per time bucket.
-- window_type enables multi-scale time: weekly, monthly, gst_cycle, festival_cycle, etc.
-- affinity_score is NOT a probability — it's a raw accumulation for ranking.
-- Orchestration reads top-N buckets, never a single "best slot."

CREATE TABLE IF NOT EXISTS customer_liquidity_windows (
  tenant_id           VARCHAR(255) NOT NULL,
  customer_id         UUID NOT NULL,
  schema_version      INT NOT NULL DEFAULT 1,
  window_type         TEXT NOT NULL DEFAULT 'weekly',
  weekday             INT NOT NULL,
  hour_bucket         INT NOT NULL,

  affinity_score              NUMERIC DEFAULT 0,
  observation_count           INT DEFAULT 0,
  last_seen_at                TIMESTAMPTZ,

  PRIMARY KEY (tenant_id, customer_id, window_type, weekday, hour_bucket)
);

CREATE INDEX IF NOT EXISTS idx_clw_lookup
  ON customer_liquidity_windows(tenant_id, customer_id, window_type, affinity_score DESC);

-- 3. PROJECTION DELTA LOG — Raw material for reinterpretation replay
-- ============================================================
-- Every projection.delta event is also logged here so that future interpreter
-- versions can replay from raw transport state without touching the outbox.
-- This is the canonical source for reinterpretation replay.

CREATE TABLE IF NOT EXISTS projection_delta_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           VARCHAR(255) NOT NULL,
  customer_id         UUID NOT NULL,
  invoice_id          UUID,
  billzo_message_id   TEXT,
  transport_state     TEXT NOT NULL,
  delivery_health     TEXT DEFAULT 'healthy',
  prev_transport_state TEXT,
  prev_delivery_health TEXT,
  occurred_at         TIMESTAMPTZ NOT NULL,
  ingested_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdl_tenant_customer
  ON projection_delta_log(tenant_id, customer_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_pdl_ingested
  ON projection_delta_log(ingested_at);
