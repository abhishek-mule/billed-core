-- 085_recovery_events_canonical.sql
-- Canonical Recovery Event Model
--
-- Adds case_id and actor_id to recovery_activities, making it the single
-- physical store for the RecoveryEvent model. Removes the CHECK constraint
-- on type — the application layer now enforces valid types, avoiding
-- migration pain when new event types are added.

ALTER TABLE recovery_activities ADD COLUMN IF NOT EXISTS case_id TEXT;
ALTER TABLE recovery_activities ADD COLUMN IF NOT EXISTS actor_id TEXT;

-- Drop the type CHECK constraint so new types can be used without migration
ALTER TABLE recovery_activities DROP CONSTRAINT IF EXISTS recovery_activities_type_check;

-- Index for case-scoped queries
CREATE INDEX IF NOT EXISTS idx_recovery_activities_case ON recovery_activities(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_activities_customer ON recovery_activities(customer_id, created_at DESC);
