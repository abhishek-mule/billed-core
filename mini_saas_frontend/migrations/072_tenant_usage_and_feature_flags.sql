-- 072_tenant_usage_and_feature_flags.sql
-- Metered usage is event-driven (worker increments from outbox), never
-- updated synchronously in request handlers. Feature flags enable per-tenant
-- overrides (beta, promo, lifetime) without touching plan logic.

BEGIN;

CREATE TABLE IF NOT EXISTS tenant_usage (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  month TEXT NOT NULL,                     -- 'YYYY-MM'
  reminders_sent INTEGER NOT NULL DEFAULT 0,
  whatsapp_messages INTEGER NOT NULL DEFAULT 0,
  invoices_created INTEGER NOT NULL DEFAULT 0,
  customers INTEGER NOT NULL DEFAULT 0,
  api_calls INTEGER NOT NULL DEFAULT 0,
  storage_mb NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, month)
);

COMMENT ON TABLE tenant_usage IS 'Monthly metered counters. Incremented by the billing worker, not request handlers.';

CREATE TABLE IF NOT EXISTS feature_flags (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flag TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  granted_by TEXT,
  reason TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, flag)
);

COMMENT ON TABLE feature_flags IS 'Per-tenant feature overrides (beta, promo, lifetime). Checked by FeatureService.';

COMMIT;
