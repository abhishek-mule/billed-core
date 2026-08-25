-- Migration 090: WhatsApp server authority + pilot forensic trace
--
-- Two tables, two jobs:
--   whatsapp_connections : server-authoritative tenant <-> phone_number_id mapping.
--                          The webhook resolves tenant ONLY through this table.
--                          No browser state. No client-supplied tenant id.
--   pilot_events         : append-only forensic proof that the WhatsApp recovery
--                          loop happened (connect -> reminder -> reply -> payment
--                          -> auto-stop). Separate from outbox (work to process)
--                          and recovery_case_events (domain history).
--
-- SECURITY INVARIANT:
--   Every inbound WhatsApp event MUST resolve
--   phone_number_id -> whatsapp_connections -> tenant_id.
--   If the lookup fails: record an unattributed pilot_event and STOP.
--   Never guess the tenant from customer phone, session, or request body.
--
-- CREDENTIALS: no access tokens / secrets are stored in either table.
-- pilot_events.raw_payload is for bounded, sanitized provider payloads only.

-- ── whatsapp_connections ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL REFERENCES tenants(id),
    waba_id         TEXT NOT NULL,
    phone_number_id TEXT NOT NULL UNIQUE,
    display_name    TEXT,
    provider        TEXT NOT NULL DEFAULT 'gupshup',
    status          TEXT NOT NULL DEFAULT 'connecting'
                    CHECK (status IN ('connecting', 'connected', 'disconnected', 'error')),
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_tenant
    ON whatsapp_connections (tenant_id);

-- ── whatsapp_events: attribute domain events to the originating number ──
-- Inbound/echo rows written by the webhook carry the phone_number_id they
-- arrived on, so per-merchant attribution is queryable in the domain table
-- too (pilot_events remains the forensic trace).
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS phone_number_id TEXT;
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_phone_number
    ON whatsapp_events (phone_number_id, occurred_at DESC);

COMMENT ON TABLE whatsapp_connections IS
    'Server-authoritative tenant <-> WhatsApp phone mapping. The ONLY path a webhook may use to resolve a tenant.';

-- ── pilot_events ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pilot_events (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- tenant_id is NULLABLE: an event that fails tenant resolution must be
    -- recorded as unattributed, not dropped and not guessed.
    tenant_id              TEXT,
    customer_id            TEXT,           -- nullable: attribution may be pending
    phone_number_id        TEXT,
    event_kind             TEXT NOT NULL,  -- connect | reminder_sent | customer_replied |
                                           -- payment_created | payment_received |
                                           -- automation_stopped | merchant_app_reply |
                                           -- message_status | unattributed_webhook | webhook_error
    direction              TEXT CHECK (direction IN ('inbound', 'outbound', 'internal')),
    -- normalized provider facts (never credentials)
    provider               TEXT,
    provider_event_id      TEXT,
    provider_message_id    TEXT,
    provider_event_type    TEXT,
    provider_status        TEXT,
    provider_error_code    TEXT,
    provider_error_message TEXT,
    -- attribution outcome for this event
    attribution_result     TEXT CHECK (attribution_result IN
                               ('resolved', 'unattributed', 'customer_unmatched')),
    state_before           JSONB,
    state_after            JSONB,
    raw_payload            JSONB,          -- bounded/sanitized provider payload
    occurred_at            TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pilot_events_tenant_created
    ON pilot_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pilot_events_phone
    ON pilot_events (phone_number_id);

-- Webhook retry dedup: the same provider event (same type + message + status)
-- must be recorded once. Rows without a provider_message_id (connect, errors)
-- are never deduped (NULLs are distinct in unique indexes).
CREATE UNIQUE INDEX IF NOT EXISTS uq_pilot_events_provider_event
    ON pilot_events (provider_event_type, provider_message_id, provider_status)
    WHERE provider_message_id IS NOT NULL;

COMMENT ON TABLE pilot_events IS
    'Append-only forensic trace of the WhatsApp recovery loop. Pilot gate: every event must be traceable end-to-end. Never store credentials here.';
