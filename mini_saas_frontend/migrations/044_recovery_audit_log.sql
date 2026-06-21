-- 044_recovery_audit_log.sql
-- Traceability table for all financial audit and rebuild operations.
--
-- Every audit scan creates one row per invoice checked.
-- Every rebuild action creates one row recording what was fixed.
-- This gives full provenance: who fixed what, when, and why.
--
-- Query pattern for support:
--   SELECT * FROM recovery_audit_log
--   WHERE tenant_id = '<tid>' AND drift_detected = true
--   ORDER BY created_at DESC;

-- ============================================================
-- 1. AUDIT LOG TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS recovery_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  action          TEXT NOT NULL CHECK (action IN ('audit_scan', 'rebuild')),
  invoice_id      TEXT,
  invoice_number  TEXT,

  -- Audit result (denormalised for easy querying)
  drift_amount    NUMERIC NOT NULL DEFAULT 0,
  drift_detected  BOOLEAN NOT NULL DEFAULT false,
  severity        TEXT CHECK (severity IN ('critical', 'warning', NULL)),

  -- Full audit snapshot (JSON so we can evolve the schema)
  audit_snapshot  JSONB NOT NULL DEFAULT '{}',

  -- Rebuild fields (only populated when action = 'rebuild')
  rebuild_field      TEXT,
  rebuild_old_value  NUMERIC,
  rebuild_new_value  NUMERIC,
  rebuild_reason     TEXT,

  -- Metadata (CLI version, flags, etc.)
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Allow null invoice_id for bulk entries
ALTER TABLE recovery_audit_log ALTER COLUMN invoice_id DROP NOT NULL;

-- ============================================================
-- 2. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ral_tenant_created
  ON recovery_audit_log(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ral_tenant_drifts
  ON recovery_audit_log(tenant_id, created_at DESC)
  WHERE drift_detected = true;

CREATE INDEX IF NOT EXISTS idx_ral_tenant_rebuilds
  ON recovery_audit_log(tenant_id, created_at DESC)
  WHERE action = 'rebuild';

-- ============================================================
-- 3. COMMENTS
-- ============================================================

COMMENT ON TABLE  recovery_audit_log IS 'Provenance log for financial audit scans and rebuild operations';
COMMENT ON COLUMN recovery_audit_log.action IS 'audit_scan = passive check, rebuild = active fix';
COMMENT ON COLUMN recovery_audit_log.audit_snapshot IS 'Full AuditDrift JSON at time of scan';
COMMENT ON COLUMN recovery_audit_log.metadata IS 'CLI context: version, flags, duration, etc.';
