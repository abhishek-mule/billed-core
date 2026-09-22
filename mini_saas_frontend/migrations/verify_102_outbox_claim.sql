-- ============================================================
-- verify_102_outbox_claim.sql
-- Post-apply verification for migration 102 on STAGING ONLY.
-- Run in the staging Supabase SQL editor AFTER applying 102.
--
-- What it proves:
--   A. claimed_at / worker_id columns exist on outbox.
--   B. uq_processed_jobs_idempotency_key exists (send-marker arbiter).
-- ============================================================

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'outbox'
  AND column_name IN ('claimed_at', 'worker_id');

SELECT indexname
FROM pg_indexes
WHERE tablename = 'processed_jobs'
  AND indexname = 'uq_processed_jobs_idempotency_key';
