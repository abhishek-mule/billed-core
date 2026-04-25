CREATE TABLE IF NOT EXISTS invoice_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,
  invoice_id VARCHAR NOT NULL,
  channel VARCHAR NOT NULL,
  provider VARCHAR,
  status VARCHAR NOT NULL,
  attempt INTEGER DEFAULT 1,
  provider_message_id VARCHAR,
  error_code VARCHAR,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  UNIQUE (tenant_id, invoice_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_invoice_notifications_tenant_created
  ON invoice_notifications(tenant_id, created_at DESC);
