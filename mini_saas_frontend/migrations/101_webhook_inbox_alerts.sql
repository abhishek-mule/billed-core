-- 101_webhook_inbox_alerts.sql
-- Operator alerting for the webhook inbox (review findings F4/F7).
--
-- Written ONLY by the worker health watch
-- (worker/src/lib/webhook/inbox-alerts.ts), which runs INDEPENDENTLY of the
-- inbox drain so visibility survives a drain-off rollback
-- (WEBHOOK_DRAIN_ENABLED=false) - the queue must stay observable exactly when
-- the consumer is switched off.
--
-- Alert lifecycle: exactly one ACTIVE row per kind (partial unique index on
-- (kind) WHERE resolved_at IS NULL). The watch inserts status='firing' on a
-- breach, refreshes only `detail` while it stays breached (fired_at preserved,
-- no spam), and marks status='resolved' when the breach clears. A healthy
-- queue writes NOTHING.
--
-- PII RULE: `detail` carries only counts, ages, and opaque row UUIDs. It must
-- NEVER contain payload, payload_raw, provider_event_id, phone numbers, or
-- error text - the full forensic error stays in webhook_inbox.last_error.

BEGIN;

CREATE TABLE IF NOT EXISTS public.webhook_inbox_alerts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind         TEXT NOT NULL
                 CHECK (kind IN ('dead_rows', 'retry_storm', 'queue_stalled', 'stale_processing')),
    severity     TEXT NOT NULL DEFAULT 'warning'
                 CHECK (severity IN ('info', 'warning', 'critical')),
    status       TEXT NOT NULL DEFAULT 'firing'
                 CHECK (status IN ('firing', 'resolved')),
    detail       JSONB NOT NULL DEFAULT '{}'::jsonb,   -- sanitized metrics only (no payload/PII)
    fired_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active (firing) alert per kind; resolved rows do not block re-firing.
CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_inbox_alerts_active
    ON public.webhook_inbox_alerts (kind) WHERE resolved_at IS NULL;

-- Cheap list of history (resolved) rows for ops review queries.
CREATE INDEX IF NOT EXISTS idx_webhook_inbox_alerts_resolved
    ON public.webhook_inbox_alerts (resolved_at) WHERE resolved_at IS NOT NULL;

COMMENT ON TABLE public.webhook_inbox_alerts IS
    'Operator-only webhook inbox alerts (transition fire/resolve per kind). PII-safe: detail is metrics + opaque row ids, never payload/phone/error text.';

COMMIT;