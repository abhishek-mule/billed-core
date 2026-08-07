-- Sprint 3B: Tenant-level auto recovery toggle
-- Gives merchants a master switch to pause all automatic reminders
-- updated_by / updated_at tracked so we can show "Paused by Rahul, yesterday 4pm"

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS auto_recovery_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_recovery_updated_by TEXT,
  ADD COLUMN IF NOT EXISTS auto_recovery_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN tenants.auto_recovery_enabled     IS 'When false, scheduler skips all collection_actions for this tenant';
COMMENT ON COLUMN tenants.auto_recovery_updated_by  IS 'User/display name who last changed the toggle';
COMMENT ON COLUMN tenants.auto_recovery_updated_at  IS 'Timestamp of last toggle change';
