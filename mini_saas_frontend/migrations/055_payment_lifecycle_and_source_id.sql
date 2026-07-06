-- 055_payment_lifecycle_and_source_id.sql
-- Adds payment lifecycle tracking and external source ID for deduplication.
-- ============================================================

-- 1. Lifecycle status — tracks payment through the pipeline
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT
    DEFAULT 'created'
    CHECK (lifecycle_status IN ('created', 'synced', 'processed', 'projected', 'visible'));

-- 2. Source ID — external identifier for deduplication per source type
--    e.g. razorpay_payment_id, offline-sync-uuid, bank-import-ref
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS source_id TEXT;

-- 3. Unique constraint for automated sources — prevents duplicate processing
--    Manual entries (source = 'cash') are excluded from hard dedup
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_source_dedup
  ON payments (tenant_id, source, source_id)
  WHERE source IN ('razorpay', 'bank_transfer', 'cheque')
    AND source_id IS NOT NULL;

-- 4. Backfill — set lifecycle_status to 'synced' for existing paid payments
UPDATE payments
SET lifecycle_status = 'synced'
WHERE lifecycle_status IS NULL
  AND status = 'paid';

-- 5. Backfill — remaining unknown statuses get 'created'
UPDATE payments
SET lifecycle_status = 'created'
WHERE lifecycle_status IS NULL;
