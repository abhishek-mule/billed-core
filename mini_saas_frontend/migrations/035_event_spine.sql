-- 035_event_spine.sql
-- Phase 1 — Event Spine Invariants (schema layer)
--
-- Adds spine columns, CHECK constraints, and helper RPCs to the events table.
-- All new columns are nullable/optional so existing rows are not affected.
--
-- Canonical SpineEvent shape (from packages/shared/src/spine.ts):
--   event_id          TEXT        NOT NULL UNIQUE   — UUID v7 (time-sortable)
--   entity_type       TEXT        NOT NULL          — constrained to VALID_ENTITY_TYPES
--   entity_id         TEXT        NOT NULL
--   causal_id         TEXT                          — parent event UUID (NULL for root)
--   correlation_id    TEXT        NOT NULL DEFAULT event_id
--   sequence_no       BIGINT      NOT NULL DEFAULT 1 — per (entity_type, entity_id)
--   occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now()
--   ingested_at       TIMESTAMPTZ NOT NULL DEFAULT now()
--   source_system     TEXT        NOT NULL          — constrained to VALID_SOURCE_SYSTEMS
--   idempotency_key   TEXT        NOT NULL
--   payload           JSONB       DEFAULT '{}'
--   external_refs     JSONB                         — { whatsapp_message_id, razorpay_payment_id, ... }
--
-- Run this in your Supabase SQL editor.

-- ============================================================
-- 1. Add spine columns (all nullable — existing rows stay valid)
-- ============================================================
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_id          TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS causal_id         TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS correlation_id    TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS sequence_no       BIGINT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_system     TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS idempotency_key   TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS external_refs     JSONB;

-- ingested_at — we already have created_at, but the spine model is explicit
ALTER TABLE events ADD COLUMN IF NOT EXISTS ingested_at       TIMESTAMPTZ;

-- Rename metadata → payload for consistency with SpineEvent model
ALTER TABLE events RENAME COLUMN metadata TO payload;

-- ============================================================
-- 2. Backfill: populate spine columns for existing rows
-- ============================================================
-- event_id: generate UUID v7 from created_at timestamp + random suffix
UPDATE events
SET event_id = (
    encode(
      substring(int8send(extract(epoch from created_at)::bigint * 1000) FROM 1 FOR 6)
      || decode(lpad(to_hex((random() * 4095)::int), 3, '0'), 'hex')
      || decode('8' || lpad(to_hex((random() * 16383)::int), 3, '0'), 'hex')
      || decode(encode(gen_random_bytes(8), 'hex'), 'hex'),
    'hex')
  )
WHERE event_id IS NULL;

-- correlation_id: default to event_id
UPDATE events SET correlation_id = event_id WHERE correlation_id IS NULL;

-- sequence_no: assign monotonically per (entity_type, entity_id)
WITH numbered AS (
  SELECT id, row_number() OVER (
    PARTITION BY entity_type, entity_id ORDER BY created_at, id
  ) AS seq
  FROM events
)
UPDATE events e
SET sequence_no = n.seq
FROM numbered n
WHERE e.id = n.id AND e.sequence_no IS NULL;

-- source_system: infer from event_name prefix or existing source column
UPDATE events
SET source_system = CASE
  WHEN source IN ('webhook', 'api', 'cron', 'system') THEN source
  WHEN event_name LIKE 'payment.%'  THEN 'webhook'
  WHEN event_name LIKE 'reminder.%' THEN 'worker'
  WHEN event_name LIKE 'invoice.%'  THEN 'api'
  ELSE 'system'
END
WHERE source_system IS NULL;

-- idempotency_key: derive from existing unique constraints
UPDATE events
SET idempotency_key = CASE
  WHEN event_name = 'payment.success' THEN 'razorpay:' || COALESCE(payload->>'razorpay_payment_id', event_id)
  WHEN event_name = 'reminder.sent'   THEN 'reminder:' || entity_id || ':' || COALESCE(follow_up_stage::text, '0')
  WHEN event_name = 'invoice.created' THEN 'invoice:' || entity_id
  ELSE 'legacy:' || event_id
END
WHERE idempotency_key IS NULL;

-- ingested_at: use created_at for historical rows
UPDATE events SET ingested_at = created_at WHERE ingested_at IS NULL;

-- ============================================================
-- 4. Add NOT NULL constraints (safe after backfill)
-- ============================================================
ALTER TABLE events ALTER COLUMN event_id        SET NOT NULL;
ALTER TABLE events ALTER COLUMN correlation_id  SET NOT NULL;
ALTER TABLE events ALTER COLUMN sequence_no     SET NOT NULL;
ALTER TABLE events ALTER COLUMN source_system   SET NOT NULL;
ALTER TABLE events ALTER COLUMN idempotency_key SET NOT NULL;
ALTER TABLE events ALTER COLUMN ingested_at     SET NOT NULL;
ALTER TABLE events ALTER COLUMN payload         SET DEFAULT '{}'::jsonb;

-- ============================================================
-- 5. Add UNIQUE constraint on event_id, replace PK
-- ============================================================
ALTER TABLE events ADD CONSTRAINT events_event_id_unique UNIQUE (event_id);
CREATE INDEX IF NOT EXISTS idx_events_event_id ON events (event_id);

-- ============================================================
-- 6. Add CHECK constraints for entity_type and source_system
-- ============================================================
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_entity_type_check;
ALTER TABLE events ADD CONSTRAINT events_entity_type_check
  CHECK (entity_type IN (
    'invoice', 'customer', 'payment', 'recovery_case',
    'tenant', 'product', 'whatsapp_message', 'unknown'
  ));

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_source_system_check;
ALTER TABLE events ADD CONSTRAINT events_source_system_check
  CHECK (source_system IN (
    'worker', 'api', 'webhook', 'cron', 'client', 'system'
  ));

-- ============================================================
-- 7. Add indexes for spine query patterns
-- ============================================================
-- Lookup by entity (monotonic ordering)
CREATE INDEX IF NOT EXISTS idx_events_entity_sequence
  ON events (entity_type, entity_id, sequence_no);

-- Causality chain traversal
CREATE INDEX IF NOT EXISTS idx_events_causal_id
  ON events (causal_id) WHERE causal_id IS NOT NULL;

-- Idempotency key lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_idempotency_key
  ON events (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Correlation grouping
CREATE INDEX IF NOT EXISTS idx_events_correlation_id
  ON events (correlation_id) WHERE correlation_id IS NOT NULL;

-- External refs lookup (GIN for JSONB key queries)
CREATE INDEX IF NOT EXISTS idx_events_external_refs
  ON events USING GIN (external_refs);

-- ============================================================
-- 8. RPC: increment_entity_sequence — atomic sequence_no assignment
-- ============================================================
-- Used by SpineWriter.nextSequence() to guarantee per-entity monotonicity.
CREATE OR REPLACE FUNCTION increment_entity_sequence(
  p_entity_type TEXT,
  p_entity_id   TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_seq INTEGER;
BEGIN
  INSERT INTO entity_sequences (entity_type, entity_id, last_sequence)
  VALUES (p_entity_type, p_entity_id, 1)
  ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET last_sequence = entity_sequences.last_sequence + 1
  RETURNING last_sequence INTO new_seq;
  RETURN new_seq;
END;
$$;

-- ============================================================
-- 9. entity_sequences table — supports atomic sequence generation
-- ============================================================
CREATE TABLE IF NOT EXISTS entity_sequences (
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entity_type, entity_id)
);
