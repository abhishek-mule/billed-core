-- =============================================================
-- Schema Verification Script
-- Run this in Supabase SQL Editor to see which tables/columns
-- exist and which are missing.
-- =============================================================

-- 1. Check all expected tables
WITH expected_tables (tbl) AS (
  VALUES
    ('tenants'), ('users'), ('customers'), ('products'),
    ('invoices'), ('invoice_items'), ('payments'),
    ('whatsapp_events'), ('whatsapp_messages'),
    ('recovery_cases'), ('recovery_attributions'),
    ('recovery_decisions'), ('recovery_attempts'),
    ('recovery_case_events'), ('recovery_queue_events'),
    ('outbox'), ('processed_jobs'),
    ('device_tokens'), ('queue'),
    ('feature_trials'), ('trial_previews'),
    ('login_events'), ('tenant_memberships'),
    ('messaging_channels'),
    ('operational_situations'),
    ('customer_behavioral_metrics'),
    ('projection_delta_log'),
    ('gstr_exports'), ('suppliers'), ('purchases'),
    ('purchase_items'), ('stock_reservations'),
    ('eway_bills'), ('automation_state'), ('events')
)
SELECT
  e.tbl,
  CASE WHEN t.table_name IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
FROM expected_tables e
LEFT JOIN information_schema.tables t
  ON t.table_name = e.tbl
  AND t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY status, e.tbl;

-- 2. Check key columns on tenants table
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tenants'
ORDER BY ordinal_position;

-- 3. Check key columns on tenant_memberships table (if it exists)
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tenant_memberships'
ORDER BY ordinal_position;

-- =============================================================
-- Migration Checklist (run the ones marked MISSING)
-- =============================================================
-- To find the migration file for a missing table, check:
--   ls mini_saas_frontend/migrations/*.sql | grep -E "NNN_"
--
-- Migration index (key tables):
--   029_supabase_missing_tables.sql   → tenants, messaging_channels, customers, payments
--   050_tenant_memberships.sql        → tenant_memberships, login_events, onboarding_state
--   052_tenants_complete_schema.sql   → tenant_memberships + missing tenants columns
--   027_recovery_case_state.sql       → recovery_cases
--   044_recovery_audit_log.sql        → recovery_attributions
--   040_decision_engine.sql           → recovery_decisions
--   030_fix_outbox_schema.sql         → outbox
--   047_feature_trials.sql            → feature_trials
--   048_trial_previews.sql            → trial_previews
--   051_recovery_queue_events.sql     → recovery_queue_events
--   024_messaging_channels.sql        → messaging_channels
