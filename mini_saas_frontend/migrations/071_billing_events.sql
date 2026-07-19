-- 071_billing_events.sql
-- Append-only event log for billing/provider events (mirrors whatsapp_events /
-- collection_action_events pattern). Webhook stores RAW here, then publishes
-- to the outbox; a worker applies state changes. Never mutate in place.

BEGIN;

CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  event_type TEXT NOT NULL,               -- subscription.activated | subscription.charged | payment.failed | invoice.expired ...
  provider_event_id TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_tenant ON billing_events(tenant_id, received_at);
CREATE INDEX IF NOT EXISTS idx_billing_events_provider ON billing_events(provider, provider_event_id);

-- Idempotency: a provider_event_id must be processed at most once.
-- Partial unique index ignores NULLs (some events lack a provider id).
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_events_provider_event_id
  ON billing_events(provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

COMMENT ON TABLE billing_events IS 'Immutable raw log of every provider billing event. Debug + replay source.';

-- Payment attempts (metered, for dunning / retry analysis)
CREATE TABLE IF NOT EXISTS payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_payment_id TEXT,
  status TEXT NOT NULL,                    -- created | authorized | captured | failed
  amount_paise INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_tenant ON payment_attempts(tenant_id, attempted_at);

COMMENT ON TABLE payment_attempts IS 'Every charge attempt against a subscription. Feeds dunning + analytics.';

COMMIT;
