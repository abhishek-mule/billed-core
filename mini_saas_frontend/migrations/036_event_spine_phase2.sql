-- 036_event_spine_phase2.sql
-- Phase 2 — Per-Entity Monotonic Ordering
--
-- Prerequisite: migration 035 (spine columns + entity_sequences table)
--
-- Adds:
--   1. UNIQUE constraint on (entity_type, entity_id, sequence_no)
--   2. BEFORE INSERT trigger to reject out-of-order inserts
--   3. tenant_id column on events table if not present
--
-- Run this in your Supabase SQL editor.

-- ============================================================
-- 1. Ensure tenant_id exists on events (needed for SpineWriter)
-- ============================================================
ALTER TABLE events ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);

-- ============================================================
-- 2. UNIQUE constraint on (entity_type, entity_id, sequence_no)
-- ============================================================
-- This is the foundation of monotonic ordering: no two events
-- for the same entity can share a sequence number.
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_entity_seq_unique
  ON events (entity_type, entity_id, sequence_no);

-- ============================================================
-- 3. BEFORE INSERT trigger — reject out-of-order inserts
-- ============================================================
-- The trigger provides a second line of defense beyond the
-- application-level SequenceGenerator. If something bypasses
-- SpineWriter and tries to insert directly, this catches it.
CREATE OR REPLACE FUNCTION reject_out_of_order_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  max_seq INTEGER;
BEGIN
  -- Allow inserts where sequence_no is 1 (first event for entity)
  IF NEW.sequence_no <= 1 THEN
    RETURN NEW;
  END IF;

  -- Check the current max sequence_no for this entity
  SELECT COALESCE(MAX(sequence_no), 0) INTO max_seq
  FROM events
  WHERE entity_type = NEW.entity_type
    AND entity_id = NEW.entity_id;

  -- Reject if not exactly max_seq + 1
  IF NEW.sequence_no != max_seq + 1 THEN
    RAISE EXCEPTION 'Out-of-order event: expected sequence_no %, got % for (%, %)',
      max_seq + 1, NEW.sequence_no, NEW.entity_type, NEW.entity_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_out_of_order_event ON events;
CREATE TRIGGER trg_reject_out_of_order_event
  BEFORE INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION reject_out_of_order_event();

-- ============================================================
-- 4. Audit: ensure increment_entity_sequence RPC exists
-- ============================================================
-- (Defined in migration 035 — this is a safety re-run)
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
