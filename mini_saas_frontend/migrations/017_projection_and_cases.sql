-- 017_projection_and_cases.sql
-- Fast read models for recovery telemetry

-- 1. Event layer classification — prevents domain collapse
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS event_layer TEXT;
UPDATE whatsapp_events SET event_layer = CASE
  WHEN status IN ('queued','sent','server_ack','delivered','read','failed','rate_limited','received') THEN 'transport'
  WHEN status IN ('clicked_upi','payment_confirmed') THEN 'behavioral'
  ELSE 'transport'
END WHERE event_layer IS NULL;

-- 2. Message projection table — fast read model, no DISTINCT ON needed
CREATE TABLE IF NOT EXISTS whatsapp_message_projection (
  billzo_message_id TEXT PRIMARY KEY,
  latest_status TEXT NOT NULL DEFAULT 'queued',
  latest_event_sequence BIGINT NOT NULL DEFAULT 0,
  latest_occurred_at TIMESTAMPTZ,
  delivered BOOLEAN DEFAULT false,
  read BOOLEAN DEFAULT false,
  failed BOOLEAN DEFAULT false,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  provider TEXT,
  provider_message_id TEXT,
  recovery_case_id TEXT,
  engagement_state TEXT DEFAULT 'unseen',
  recovery_state TEXT DEFAULT 'created',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Recovery cases — behavioral entity, not accounting artifact
CREATE TABLE IF NOT EXISTS recovery_cases (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  total_outstanding NUMERIC DEFAULT 0,
  invoice_count INT DEFAULT 0,
  engagement_state TEXT DEFAULT 'unseen',
  recovery_state TEXT DEFAULT 'created',
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rc_tenant ON recovery_cases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rc_customer ON recovery_cases(customer_id);
CREATE INDEX IF NOT EXISTS idx_rc_status ON recovery_cases(status);
CREATE INDEX IF NOT EXISTS idx_we_event_layer ON whatsapp_events(event_layer);
