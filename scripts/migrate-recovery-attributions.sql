-- Migration: Add tenant_id and amount to recovery_attributions
-- Run this in Supabase Dashboard → SQL Editor
-- Or: PGPASSWORD='Pass@2709abhi' psql -h db.qdnmuoyqpqdewepzuezp.supabase.co -U postgres -d postgres -f scripts/migrate-recovery-attributions.sql

ALTER TABLE recovery_attributions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);
ALTER TABLE recovery_attributions ADD COLUMN IF NOT EXISTS amount DECIMAL NOT NULL DEFAULT 0;

-- Backfill tenant_id from outbox events for existing rows
UPDATE recovery_attributions ra
SET tenant_id = o.tenant_id
FROM outbox o
WHERE ra.reminder_event_id = o.id
  AND ra.tenant_id IS NULL;

-- Make tenant_id NOT NULL after backfill
ALTER TABLE recovery_attributions ALTER COLUMN tenant_id SET NOT NULL;

-- Index for tenant-filtered queries
CREATE INDEX IF NOT EXISTS idx_recovery_attributions_tenant ON recovery_attributions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recovery_attributions_tenant_created ON recovery_attributions(tenant_id, created_at DESC);
