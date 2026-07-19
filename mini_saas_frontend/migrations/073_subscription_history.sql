-- 073_subscription_history.sql
-- Audit trail of all subscription state/plan changes. Written by the billing
-- worker on every transition. Required for compliance + debugging disputes.

BEGIN;

CREATE TABLE IF NOT EXISTS subscription_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  from_plan_code TEXT,
  to_plan_code TEXT,
  reason TEXT NOT NULL,                    -- 'created' | 'webhook.activated' | 'payment.failed' | 'cancelled' | 'renewed'
  actor TEXT NOT NULL DEFAULT 'system',    -- system | webhook | admin
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_hist_tenant ON subscription_history(tenant_id, created_at);

COMMENT ON TABLE subscription_history IS 'Append-only audit of plan/state transitions per tenant.';

COMMIT;
