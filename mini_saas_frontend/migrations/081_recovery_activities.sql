-- 081_recovery_activities.sql
-- Recovery Activity Log — append-only record of every recovery-relevant event.
-- This is NOT a generic event bus. Only events that help answer
-- "What's happening with my money?" are stored here.

CREATE TABLE IF NOT EXISTS recovery_activities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  customer_id TEXT,
  type TEXT NOT NULL CHECK (type IN (
    'invoice_created', 'invoice_sent', 'customer_viewed',
    'payment_link_opened', 'reminder_sent', 'merchant_called',
    'call_outcome',
    'promise_received', 'promise_fulfilled', 'promise_broken',
    'payment_received', 'customer_payment_reported', 'payment_confirmed', 'note_added'
  )),
  actor TEXT NOT NULL CHECK (actor IN ('merchant', 'customer', 'system')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recovery_activities_invoice ON recovery_activities(invoice_id, created_at DESC);
CREATE INDEX idx_recovery_activities_tenant ON recovery_activities(tenant_id, created_at DESC);
