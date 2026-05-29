-- Sprint A: Normalized channel abstraction layer
-- Decouples transport infrastructure from tenant business settings

CREATE TABLE IF NOT EXISTS messaging_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  channel_type TEXT NOT NULL DEFAULT 'whatsapp',
  provider TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  display_name TEXT,
  connection_state TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (connection_state IN ('connecting','connected','degraded','rate_limited','reconnecting','auth_expired','disconnected','banned','shadow')),
  quality_score NUMERIC,
  delivery_success_rate NUMERIC,
  last_heartbeat_at TIMESTAMPTZ,
  last_connected_at TIMESTAMPTZ,
  priority INTEGER NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  encrypted_credentials BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_channels_tenant_active ON messaging_channels (tenant_id, priority) WHERE is_active = true;

-- Migrate existing tenant whatsapp_config data into channels
-- This is a one-time backfill; new tenants use the channel API
DO $$
DECLARE
  t RECORD;
  cfg JSONB;
  provider TEXT;
  channel_id UUID;
BEGIN
  FOR t IN SELECT id, whatsapp_config FROM tenants WHERE whatsapp_config IS NOT NULL AND whatsapp_config != '{}'::jsonb
  LOOP
    cfg := t.whatsapp_config;
    provider := COALESCE(cfg->>'whatsappProvider', 'gupshup');

    INSERT INTO messaging_channels (tenant_id, channel_type, provider, phone_number, connection_state, config, is_active)
    VALUES (
      t.id,
      'whatsapp',
      provider,
      COALESCE(cfg->>'sourceNumber', 'unknown'),
      CASE WHEN provider = 'baileys' THEN 'disconnected' ELSE 'connected' END,
      jsonb_build_object(
        'gupshupApiKey', cfg->'gupshupApiKey',
        'gupshupAppName', cfg->'gupshupAppName',
        'sourceNumber', cfg->'sourceNumber'
      ),
      true
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
