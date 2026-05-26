-- Evolve whatsapp_events into the recovery telemetry nervous system
-- Adds delivery tracking, intent signals, and recovery journey state

ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound';
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS correlation_id UUID;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS template TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS recovery_stage TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS server_ack_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS rate_limited_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS time_to_click_seconds INT;

-- Add recovery flag to invoices for escalation detection
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recovery_flag TEXT;

-- Add whatsapp reputation to tenants for merchant quality scoring
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_reputation REAL DEFAULT 1.0;

-- Index for timeline queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_invoice_timeline ON whatsapp_events(invoice_id, occurred_at);

-- Index for provider message id lookups (webhook matching)
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_provider_msg ON whatsapp_events(provider_message_id);
