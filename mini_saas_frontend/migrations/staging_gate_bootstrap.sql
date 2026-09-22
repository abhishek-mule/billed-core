-- ============================================================
-- staging_gate_bootstrap.sql
-- Surgical schema bootstrap for the STAGING Recovery Credits gate.
--
-- WHY THIS EXISTS (instead of replaying the 91 historical migrations):
--   The production database was built over time with interim manual
--   states (several tables, e.g. whatsapp_events, are ALTERed in
--   migrations but were never CREATEd in any migration or schema.sql).
--   Replaying the full history against a fresh staging DB is therefore
--   not self-consistent. The Recovery Credits gate touches exactly the
--   tables below, so we create ONLY those in their canonical production
--   shape and then run 096 + 097 on top.
--
-- IMPORTANT:
--   * Run this in the STAGING Supabase SQL editor (never production).
--   * It DROPs and recreates tenants/subscriptions/collection_actions to
--     self-heal leftover partial state from earlier failed baseline attempts.
--     Safe to run more than once (idempotent for the gate's purposes).
--   * Then apply 096_recovery_credit_ledger.sql,
--            097_recovery_credit_reservations.sql
--     and then verify_096_... and verify_097_....
-- ============================================================

-- Self-healing: earlier failed baseline attempts may have left these three
-- tables in a partial (older) shape. Recreate them from scratch so 096/097
-- and the harness see the canonical production schema regardless of leftovers.
DROP TABLE IF EXISTS collection_actions CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- gen_random_uuid() support (pre-enabled on Supabase; harmless elsewhere).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. tenants ────────────────────────────────────────────────
-- Merged production shape of schema.sql + 029 + 050 + 052 + 069 + 086
-- + 088 (the columns the app actually reads/writes). recovery_credits_
-- enabled is added by 096, not here.
CREATE TABLE IF NOT EXISTS tenants (
  id                       TEXT PRIMARY KEY,
  company_name             TEXT NOT NULL DEFAULT '',
  phone                    TEXT NOT NULL DEFAULT '',
  email                    TEXT NOT NULL DEFAULT '',
  plan                     TEXT DEFAULT 'free',
  subdomain                TEXT,
  is_active                BOOLEAN DEFAULT true,
  first_user_id            UUID,
  user_count               INT DEFAULT 0,
  max_users                INT DEFAULT 1,
  whatsapp_config          JSONB DEFAULT '{}',
  name                     TEXT,
  address                  TEXT,
  upi_id                   TEXT,
  gstin                    TEXT,
  pan                      TEXT,
  bank_details             JSONB DEFAULT '{}',
  paywall_unlocked         BOOLEAN NOT NULL DEFAULT false,
  white_label              BOOLEAN NOT NULL DEFAULT false,
  auto_mode                BOOLEAN NOT NULL DEFAULT true,
  invoice_count            INTEGER NOT NULL DEFAULT 0,
  reminder_count           INTEGER NOT NULL DEFAULT 0,
  onboarding_state         TEXT DEFAULT 'incomplete',
  onboarding_completed_at  TIMESTAMPTZ,
  subscription_id          TEXT,
  subscription_state       TEXT,
  plan_version             INTEGER DEFAULT 1,
  current_period_start     TIMESTAMPTZ,
  current_period_end       TIMESTAMPTZ,
  cancel_at_period_end     BOOLEAN DEFAULT false,
  invoice_prefix           TEXT DEFAULT 'INV-',
  invoice_footer           TEXT,
  payment_terms            TEXT DEFAULT 'Due in 30 days',
  whatsapp_business_number TEXT,
  brand_color              TEXT DEFAULT '#1e293b',
  business_hours           JSONB DEFAULT '{"enabled":false,"days":["mon","tue","wed","thu","fri","sat"],"start":"09:30","end":"19:00"}'::jsonb,
  auto_recovery_enabled    BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT tenants_subscription_state_check
    CHECK (subscription_state IS NULL OR subscription_state IN
      ('trialing','active','past_due','paused','cancelled','expired','incomplete'))
);

CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON tenants(subdomain);

-- ── 2. subscriptions ──────────────────────────────────────────
-- 070 shape minus the plans FK (plan_id optional, plans table not in
-- scope for this gate). Provider-agnostic; the authoritative period
-- source for the credits feature (never tenants).
CREATE TABLE IF NOT EXISTS subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_code               TEXT NOT NULL,
  plan_version            INTEGER NOT NULL DEFAULT 1,
  provider                TEXT NOT NULL DEFAULT 'razorpay',
  provider_subscription_id TEXT,
  provider_customer_id    TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','trialing','active','past_due','paused','cancelled','expired','incomplete')),
  cancel_at_period_end    BOOLEAN DEFAULT false,
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider ON subscriptions(provider, provider_subscription_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_active_tenant
  ON subscriptions(tenant_id) WHERE status = 'active';

-- ── 3. collection_actions ─────────────────────────────────────
-- Minimal shape: 096 adds COMMENT ON COLUMN status/metadata, so the
-- table + those two columns must exist first. Never touched by the
-- staging harness itself.
CREATE TABLE IF NOT EXISTS collection_actions (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT,
  customer_id    TEXT,
  action_type    TEXT,
  provider       TEXT,
  amount         NUMERIC,
  status         TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_at   TIMESTAMPTZ,
  metadata       JSONB NOT NULL DEFAULT '{}',
  updated_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_actions_tenant_status ON collection_actions(tenant_id, status);

COMMIT;