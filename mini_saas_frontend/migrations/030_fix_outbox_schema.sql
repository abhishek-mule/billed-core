-- 030_fix_outbox_schema.sql
-- The outbox table was created with an old schema (002_add_outbox_and_logs.sql)
-- and partially updated (014_harden_outbox.sql). 
-- This migration adds all columns the code expects.

-- Step 1: Add missing columns
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS entity_id TEXT;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS causation_id TEXT;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS correlation_id TEXT;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Step 2: Rename/migrate legacy columns to match code expectations
-- Legacy 'retry_count' → code expects 'attempts'
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;

-- Legacy 'last_attempt_at' → code expects 'next_attempt_at'
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

-- Step 3: Fix status CHECK constraint to include all states the code uses
ALTER TABLE outbox DROP CONSTRAINT IF EXISTS outbox_status_check;
ALTER TABLE outbox ADD CONSTRAINT outbox_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter'));

-- Step 4: Migrate legacy 'processed' boolean to status enum (if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name = 'outbox' 
      AND column_name = 'processed'
  ) THEN
    UPDATE public.outbox 
    SET status = 'completed' 
    WHERE processed = true AND status IS NULL;

    UPDATE public.outbox 
    SET status = 'pending' 
    WHERE (processed = false OR processed IS NULL) AND status IS NULL;
  END IF;
END $$;

-- Step 5: Add NOT NULL constraints (safe — skips if existing rows have nulls)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM outbox WHERE tenant_id IS NULL) THEN
    ALTER TABLE outbox ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM outbox WHERE status IS NULL) THEN
    ALTER TABLE outbox ALTER COLUMN status SET DEFAULT 'pending';
    ALTER TABLE outbox ALTER COLUMN status SET NOT NULL;
  END IF;
END $$;

-- Step 6: Create indexes for query patterns
CREATE INDEX IF NOT EXISTS idx_outbox_tenant_status ON outbox(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_outbox_status_next_attempt ON outbox(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_outbox_correlation ON outbox(correlation_id);
CREATE INDEX IF NOT EXISTS idx_outbox_idempotency ON outbox(idempotency_key);
