-- 069_plans_and_tenant_billing.sql
-- Versioned, server-driven pricing + tenant billing columns.
-- Pricing is NEVER mutated in place: a price change creates a new plan version
-- with active=false/visible=false so existing tenants keep their version.

BEGIN;

-- ── plans (versioned, single source of truth for pricing/limits/features) ──
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,                     -- 'starter' | 'pro' | 'business' | 'enterprise'
  version INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,                     -- display name, e.g. "Business"
  monthly_price_paise INTEGER NOT NULL DEFAULT 0,
  annual_price_paise INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  limits JSONB NOT NULL DEFAULT '{}',     -- { reminders: -1, branches: 1, api: false }
  features JSONB NOT NULL DEFAULT '[]',   -- feature keys
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (code, version)
);

CREATE INDEX IF NOT EXISTS idx_plans_code ON plans(code);
CREATE INDEX IF NOT EXISTS idx_plans_visible ON plans(is_visible, sort_order);

COMMENT ON TABLE plans IS 'Versioned plan catalog. Never UPDATE a price in place; INSERT a new version.';
COMMENT ON COLUMN plans.limits IS 'Numeric limits. -1 means unlimited (e.g. Pro reminders).';

-- Seed: one active version per plan. Prices are server source of truth.
INSERT INTO plans (code, version, name, monthly_price_paise, annual_price_paise, currency, limits, features, is_active, is_visible, sort_order)
VALUES
  ('starter', 1, 'Starter', 0, 0, 'INR',
    '{"reminders": 3, "branches": 1, "api": false}'::jsonb,
    '["manual_reminders"]'::jsonb, true, true, 1),
  ('pro', 1, 'Pro', 29900, 28680, 'INR',
    '{"reminders": -1, "branches": 1, "api": false}'::jsonb,
    '["manual_reminders","auto_recovery","recovery_queue","promise_tracking","cashflow_forecast"]'::jsonb,
    true, true, 2),
  ('business', 1, 'Business', 69900, 67104, 'INR',
    '{"reminders": -1, "branches": 5, "api": true}'::jsonb,
    '["manual_reminders","auto_recovery","recovery_queue","promise_tracking","cashflow_forecast","advanced_analytics","exports","api","multi_branch"]'::jsonb,
    true, true, 3),
  ('enterprise', 1, 'Enterprise', 0, 0, 'INR',
    '{"reminders": -1, "branches": -1, "api": true}'::jsonb,
    '["manual_reminders","auto_recovery","recovery_queue","promise_tracking","cashflow_forecast","advanced_analytics","exports","api","multi_branch"]'::jsonb,
    true, false, 4);  -- not purchasable via checkout (custom sales)

-- ── tenants: widen subscription_status + add billing columns ──
-- The old CHECK restricted to ('free','pro','trial') but the webhook sets
-- 'active'/'cancelled'/'paused' — drop it to avoid constraint violations.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_subscription_status_check;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_state TEXT
  DEFAULT 'trialing'
  CHECK (subscription_state IN ('trialing','active','past_due','paused','cancelled','expired','incomplete'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_version INTEGER DEFAULT 1;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false;

COMMENT ON COLUMN tenants.subscription_state IS 'Rich lifecycle state. Mirrors subscriptions.state; updated by billing worker.';

COMMIT;
