-- 094_recovery_case_event_idempotency.sql
-- Recovery decision-log ↔ code contract repair (production schema is authoritative).
--
-- Production recovery_case_events(id, case_id, event_type, payload jsonb, created_at) is
-- the append-only decision log. The worker state-machine must write payload JSONB (snake_case
-- keys: from_recovery_state / to_recovery_state / from_engagement_state / to_engagement_state
-- / reason / trigger) and link every processed source outbox event via source_event_id.
--
-- This migration:
--   1. Adds source_event_id to recovery_case_events so every decision can be attributed
--      back to the originating outbox event (idempotency + audability).
-- 2. Enforces idempotency AT THE DATABASE:
--        - one source event → exactly one decision-log row (globally)
--        - one (event_id, case_id) → at most one consumption row
--
-- Cardinality proof (from worker/queues/outbox.ts tryHandleRecoveryCaseStateMachine):
--   exactly ONE customerId is resolved per event (payload.customerId or a single
--   invoice lookup), then ONE recovery case via (tenant_id, customer_id)
--   .limit(1).single(), then ONE transition → ONE event-log row. No flow fans a
--   single source event out to multiple cases, so GLOBAL uniqueness on
--   source_event_id is provably correct AND closes the concurrent new-case race
--   (two workers racing the same first-time event cannot create two cases).
--
-- Backfilled/manual rows have NULL source_event_id, so the unique index is partial.

-- 1. source_event_id on the decision log
ALTER TABLE recovery_case_events
  ADD COLUMN IF NOT EXISTS source_event_id TEXT;

-- 2a. Idempotency: one source event → at most one decision-log row (global)
CREATE UNIQUE INDEX IF NOT EXISTS uq_recovery_case_events_source
  ON recovery_case_events (source_event_id)
  WHERE source_event_id IS NOT NULL;

-- 2b. Idempotency: each (event_id, case_id) consumed exactly once
CREATE UNIQUE INDEX IF NOT EXISTS uq_recovery_case_event_consumptions_event_case
  ON recovery_case_event_consumptions (event_id, case_id);