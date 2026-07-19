-- 070_subscriptions.sql
-- Provider-agnostic subscription record. Only one ACTIVE subscription per tenant.
-- Razorpay is just a processor; this table is the source of truth for state.

BEGIN;

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES plans(id),
  plan_code TEXT NOT NULL,                 -- denormalized for reads
  plan_version INTEGER NOT NULL DEFAULT 1,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_subscription_id TEXT,
  provider_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','trialing','active','past_due','paused','cancelled','expired','incomplete')),
  cancel_at_period_end BOOLEAN DEFAULT false,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider ON subscriptions(provider, provider_subscription_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_active_tenant
  ON subscriptions(tenant_id) WHERE status = 'active';

COMMENT ON TABLE subscriptions IS 'One row per subscription attempt. Single active sub per tenant via partial unique index.';
COMMENT ON COLUMN subscriptions.plan_code IS 'Denormalized plan code; join plan_id->plans for limits/features.';

COMMIT;
