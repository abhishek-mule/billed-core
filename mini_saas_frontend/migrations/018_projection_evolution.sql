-- 018_projection_evolution.sql
-- Phase 2: Behavioral Interpretation Layer
-- 
-- This migration evolves the projection table from a simple status cache
-- into a distributed convergence surface with CAS conflict resolution,
-- provenance tracking, and drift telemetry.
--
-- Architectural invariants:
--   1. Transport progression is a strict precedence ladder
--   2. Delivery health is orthogonal (healthy / retrying / degraded)
--   3. Only semantically superior states mutate the projection
--   4. All conflicts are persisted for replay debugging
-- ============================================================

-- 1. ADD PROJECTION EVOLUTION COLUMNS
-- ============================================================

ALTER TABLE whatsapp_message_projection
  ADD COLUMN IF NOT EXISTS transport_state TEXT,
  ADD COLUMN IF NOT EXISTS delivery_health TEXT NOT NULL DEFAULT 'healthy',
  ADD COLUMN IF NOT EXISTS transport_precedence INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS causal_occurred_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_event_id UUID,
  ADD COLUMN IF NOT EXISTS failure_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_successful_delivery_at TIMESTAMPTZ;

-- Backfill transport_state from legacy latest_status
UPDATE whatsapp_message_projection
SET
  transport_state = CASE
    WHEN latest_status = 'failed' THEN 'failed_terminal'
    WHEN latest_status = 'rate_limited' THEN 'sent'
    ELSE latest_status
  END,
  transport_precedence = CASE
    WHEN latest_status IN ('delivered', 'received') THEN 4
    WHEN latest_status = 'read' THEN 5
    WHEN latest_status = 'failed_terminal' OR latest_status = 'failed' THEN 6
    WHEN latest_status = 'server_ack' THEN 3
    WHEN latest_status = 'sent' THEN 2
    ELSE 1
  END,
  causal_occurred_at = latest_occurred_at,
  failure_count = CASE WHEN latest_status IN ('failed', 'rate_limited') THEN 1 ELSE 0 END,
  last_successful_delivery_at = delivered_at
WHERE transport_state IS NULL;

-- 2. PROJECTION CONFLICTS — Drift telemetry
-- ============================================================
-- Every rejected CAS write is persisted here so that:
--   - replay debugging has full visibility into what was rejected and why
--   - drift metrics can alert on abnormal conflict rates
--   - stale worker detection can identify partition recovery events
-- ============================================================

CREATE TABLE IF NOT EXISTS projection_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billzo_message_id TEXT NOT NULL,
  existing_transport_state TEXT,
  existing_precedence INT,
  existing_sequence BIGINT,
  incoming_transport_state TEXT NOT NULL,
  incoming_precedence INT NOT NULL,
  incoming_sequence BIGINT NOT NULL,
  incoming_event_id UUID,
  rejection_reason TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pc_message ON projection_conflicts(billzo_message_id);
CREATE INDEX IF NOT EXISTS idx_pc_occurred ON projection_conflicts(occurred_at);

-- 3. CAS UPSERT FUNCTION
-- ============================================================
-- Atomic compare-and-swap for projection updates.
-- Only applies if incoming event is strictly superior to current state.
--
-- Resolution rule (matches resolveProjectionState in engagement.ts):
--   higher precedence → always applies
--   same precedence, higher sequence → applies
--   same precedence, same sequence → duplicate
--   lower precedence → stale
--
-- Returns:
--   'inserted' — new row created
--   'updated'  — existing row mutated
--   'rejected' — incoming was stale or duplicate (logged to projection_conflicts)
-- ============================================================

CREATE OR REPLACE FUNCTION cas_upsert_projection(
  p_billzo_message_id TEXT,
  p_transport_state TEXT,
  p_delivery_health TEXT DEFAULT 'healthy',
  p_transport_precedence INT,
  p_latest_event_sequence BIGINT,
  p_causal_occurred_at TIMESTAMPTZ,
  p_last_event_id UUID,
  p_delivered BOOLEAN DEFAULT FALSE,
  p_read BOOLEAN DEFAULT FALSE,
  p_failed BOOLEAN DEFAULT FALSE,
  p_delivered_at TIMESTAMPTZ DEFAULT NULL,
  p_read_at TIMESTAMPTZ DEFAULT NULL,
  p_failed_at TIMESTAMPTZ DEFAULT NULL,
  p_provider TEXT DEFAULT NULL,
  p_provider_message_id TEXT DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
  v_current_prec INT;
  v_current_seq BIGINT;
  v_current_state TEXT;
BEGIN
  -- Lock row for atomic compare-and-swap
  SELECT transport_precedence, latest_event_sequence, transport_state
  INTO v_current_prec, v_current_seq, v_current_state
  FROM whatsapp_message_projection
  WHERE billzo_message_id = p_billzo_message_id
  FOR UPDATE;

  -- CASE 1: No existing row — insert
  IF NOT FOUND THEN
    INSERT INTO whatsapp_message_projection (
      billzo_message_id,
      transport_state,
      delivery_health,
      transport_precedence,
      latest_event_sequence,
      causal_occurred_at,
      last_event_id,
      delivered,
      read,
      failed,
      delivered_at,
      read_at,
      failed_at,
      provider,
      provider_message_id,
      failure_count,
      last_successful_delivery_at,
      latest_status,
      latest_occurred_at,
      updated_at
    ) VALUES (
      p_billzo_message_id,
      p_transport_state,
      p_delivery_health,
      p_transport_precedence,
      p_latest_event_sequence,
      p_causal_occurred_at,
      p_last_event_id,
      p_delivered,
      p_read,
      p_failed,
      p_delivered_at,
      p_read_at,
      p_failed_at,
      p_provider,
      p_provider_message_id,
      CASE WHEN p_failed THEN 1 ELSE 0 END,
      p_delivered_at,
      p_transport_state,
      p_causal_occurred_at,
      NOW()
    );
    RETURN 'inserted';
  END IF;

  -- CASE 2: Current state is terminal — reject
  IF v_current_state = 'failed_terminal' THEN
    INSERT INTO projection_conflicts (
      billzo_message_id,
      existing_transport_state,
      existing_precedence,
      existing_sequence,
      incoming_transport_state,
      incoming_precedence,
      incoming_sequence,
      incoming_event_id,
      rejection_reason
    ) VALUES (
      p_billzo_message_id,
      v_current_state,
      v_current_prec,
      v_current_seq,
      p_transport_state,
      p_transport_precedence,
      p_latest_event_sequence,
      p_last_event_id,
      'terminal_failure_locked'
    );
    RETURN 'rejected';
  END IF;

  -- CASE 3: Higher precedence — apply
  IF p_transport_precedence > v_current_prec THEN
    UPDATE whatsapp_message_projection SET
      transport_state = p_transport_state,
      delivery_health = p_delivery_health,
      transport_precedence = p_transport_precedence,
      latest_event_sequence = p_latest_event_sequence,
      causal_occurred_at = p_causal_occurred_at,
      last_event_id = p_last_event_id,
      delivered = whatsapp_message_projection.delivered OR p_delivered,
      read = whatsapp_message_projection.read OR p_read,
      failed = whatsapp_message_projection.failed OR p_failed,
      delivered_at = CASE WHEN p_delivered_at IS NOT NULL AND whatsapp_message_projection.delivered_at IS NULL THEN p_delivered_at ELSE whatsapp_message_projection.delivered_at END,
      read_at = CASE WHEN p_read_at IS NOT NULL AND whatsapp_message_projection.read_at IS NULL THEN p_read_at ELSE whatsapp_message_projection.read_at END,
      failed_at = CASE WHEN p_failed_at IS NOT NULL AND whatsapp_message_projection.failed_at IS NULL THEN p_failed_at ELSE whatsapp_message_projection.failed_at END,
      provider = COALESCE(p_provider, provider),
      provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
      failure_count = whatsapp_message_projection.failure_count + CASE WHEN p_failed THEN 1 ELSE 0 END,
      last_successful_delivery_at = CASE WHEN p_delivered_at IS NOT NULL THEN p_delivered_at ELSE whatsapp_message_projection.last_successful_delivery_at END,
      latest_status = p_transport_state,
      latest_occurred_at = p_causal_occurred_at,
      updated_at = NOW()
    WHERE billzo_message_id = p_billzo_message_id;
    RETURN 'updated';
  END IF;

  -- CASE 4: Same precedence — compare sequence
  IF p_transport_precedence = v_current_prec THEN
    IF p_latest_event_sequence > v_current_seq THEN
      UPDATE whatsapp_message_projection SET
        transport_state = p_transport_state,
        delivery_health = p_delivery_health,
        latest_event_sequence = p_latest_event_sequence,
        causal_occurred_at = p_causal_occurred_at,
        last_event_id = p_last_event_id,
        delivered = whatsapp_message_projection.delivered OR p_delivered,
        read = whatsapp_message_projection.read OR p_read,
        failed = whatsapp_message_projection.failed OR p_failed,
        delivered_at = CASE WHEN p_delivered_at IS NOT NULL AND whatsapp_message_projection.delivered_at IS NULL THEN p_delivered_at ELSE whatsapp_message_projection.delivered_at END,
        read_at = CASE WHEN p_read_at IS NOT NULL AND whatsapp_message_projection.read_at IS NULL THEN p_read_at ELSE whatsapp_message_projection.read_at END,
        failed_at = CASE WHEN p_failed_at IS NOT NULL AND whatsapp_message_projection.failed_at IS NULL THEN p_failed_at ELSE whatsapp_message_projection.failed_at END,
        provider = COALESCE(p_provider, provider),
        provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
        failure_count = whatsapp_message_projection.failure_count + CASE WHEN p_failed THEN 1 ELSE 0 END,
        last_successful_delivery_at = CASE WHEN p_delivered_at IS NOT NULL THEN p_delivered_at ELSE whatsapp_message_projection.last_successful_delivery_at END,
        latest_status = p_transport_state,
        latest_occurred_at = p_causal_occurred_at,
        updated_at = NOW()
      WHERE billzo_message_id = p_billzo_message_id;
      RETURN 'updated';
    ELSE
      INSERT INTO projection_conflicts (
        billzo_message_id,
        existing_transport_state,
        existing_precedence,
        existing_sequence,
        incoming_transport_state,
        incoming_precedence,
        incoming_sequence,
        incoming_event_id,
        rejection_reason
      ) VALUES (
        p_billzo_message_id,
        v_current_state,
        v_current_prec,
        v_current_seq,
        p_transport_state,
        p_transport_precedence,
        p_latest_event_sequence,
        p_last_event_id,
        CASE WHEN p_latest_event_sequence = v_current_seq THEN 'duplicate' ELSE 'stale' END
      );
      RETURN 'rejected';
    END IF;
  END IF;

  -- CASE 5: Lower precedence — reject
  INSERT INTO projection_conflicts (
    billzo_message_id,
    existing_transport_state,
    existing_precedence,
    existing_sequence,
    incoming_transport_state,
    incoming_precedence,
    incoming_sequence,
    incoming_event_id,
    rejection_reason
  ) VALUES (
    p_billzo_message_id,
    v_current_state,
    v_current_prec,
    v_current_seq,
    p_transport_state,
    p_transport_precedence,
    p_latest_event_sequence,
    p_last_event_id,
    'stale'
  );
  RETURN 'rejected';
END;
$$ LANGUAGE plpgsql;

-- 4. INDEXES FOR QUERY PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_wmp_transport_state ON whatsapp_message_projection(transport_state);
CREATE INDEX IF NOT EXISTS idx_wmp_delivery_health ON whatsapp_message_projection(delivery_health);
CREATE INDEX IF NOT EXISTS idx_wmp_causal_occurred ON whatsapp_message_projection(causal_occurred_at);
