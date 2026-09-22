-- 102_outbox_claim_columns.sql
-- B-05b: single-winner outbox consumption.
--
-- Adds claim-ownership columns consumed by the atomic claim
-- (UPDATE ... WHERE status='pending' RETURNING). The claim predicate itself
-- needs no new index: idx_outbox_status_next_attempt (030) already covers it.
-- Also guarantees the UNIQUE backing the processed_jobs idempotency-key
-- contract that the send-marker guard depends on (the upsert in
-- recordProcessedJob assumes it; this makes the assumption explicit).

ALTER TABLE outbox ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS worker_id TEXT;

COMMENT ON COLUMN outbox.claimed_at IS
  'B-05b: when the winning consumer claimed this row (single-winner claim).';
COMMENT ON COLUMN outbox.worker_id IS
  'B-05b: identity of the winning consumer (HOSTNAME or billzo-worker fallback).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_processed_jobs_idempotency_key
  ON processed_jobs (idempotency_key);
