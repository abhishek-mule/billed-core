-- 018_reconcile_whatsapp_events_schema.sql
-- Reconcile schema drift: whatsapp_events accumulated ~30 untracked columns
-- across migrations 015-017, manual dashboard changes, and application code.
-- This migration makes the schema reproducible from Git.
-- In production, every ADD COLUMN uses IF NOT EXISTS and is a no-op.
-- In fresh environments, this creates the full schema.

BEGIN;

-- ============================================================
-- 1. Core columns from original CREATE TABLE (never migrated)
-- ============================================================
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS invoice_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS recovery_attempt_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ============================================================
-- 2. Columns from migration 015 (delivery tracking)
-- ============================================================
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound';
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS correlation_id UUID;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS template TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS recovery_stage TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS server_ack_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS rate_limited_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS time_to_click_seconds INT;

-- ============================================================
-- 3. Columns from migration 016 (message identity)
-- ============================================================
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS billzo_message_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS conversation_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS message_origin TEXT DEFAULT 'automation';
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS event_sequence BIGINT DEFAULT 0;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS transport_message_hash TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS parent_billzo_message_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS attempt_number INT DEFAULT 1;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS reminder_stage TEXT;

-- ============================================================
-- 4. Columns added via dashboard (untracked) and used in code
-- ============================================================
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS sync_status TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS message_type TEXT;

-- ============================================================
-- 5. Columns queried by recovery timeline (amount, preview, failed_at)
-- ============================================================
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS amount NUMERIC;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS message_preview TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ============================================================
-- 6. Nullable constraints — migration 016 made some NOT NULL
--    but we need to backfill first in production.
--    Skip NOT NULL here to avoid failures on existing rows.
-- ============================================================

-- ============================================================
-- 7. Indexes from migrations 015-016
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_invoice_timeline ON whatsapp_events(invoice_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_provider_msg ON whatsapp_events(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_we_billzo_message_id ON whatsapp_events(billzo_message_id);
CREATE INDEX IF NOT EXISTS idx_we_conversation_id ON whatsapp_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_we_transport_hash ON whatsapp_events(transport_message_hash);
CREATE INDEX IF NOT EXISTS idx_we_sequence ON whatsapp_events(billzo_message_id, event_sequence DESC);

-- Tenant-wide timeline queries (Recovery History page)
CREATE INDEX IF NOT EXISTS idx_we_tenant_occurred ON whatsapp_events(tenant_id, occurred_at DESC);

-- Customer lookups (recovery timeline per customer)
CREATE INDEX IF NOT EXISTS idx_we_customer ON whatsapp_events(tenant_id, customer_id);

-- ============================================================
-- 8. Replace the broken get_priority_cases RPC
--    (the previous version referenced we.customer_id which did
--     not exist at the time — now resolved via invoices join)
-- ============================================================
CREATE OR REPLACE FUNCTION get_priority_cases(
  p_tenant_id TEXT,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  case_id TEXT,
  customer_id TEXT,
  customer_name TEXT,
  phone TEXT,
  total_overdue NUMERIC,
  oldest_overdue_days INT,
  attention_score INT,
  next_action_type TEXT,
  promise_to_pay_date TIMESTAMPTZ,
  ignored_reminders INT,
  broken_promises INT,
  open_invoice_count INT,
  automation_mode TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rc.id::text as case_id,
    rc.customer_id::text,
    c.customer_name::text,
    c.phone::text,
    rc.total_overdue::numeric,
    COALESCE((
      SELECT MAX(EXTRACT(DAY FROM (NOW() - inv.due_date)::interval))::int
      FROM invoices inv
      WHERE inv.tenant_id = p_tenant_id
        AND inv.customer_id = rc.customer_id
        AND inv.status IN ('unpaid', 'overdue', 'partial')
    ), 0)::int as oldest_overdue_days,
    rc.attention_score::int,
    rc.next_action_type::text,
    rc.promise_to_pay_date::timestamptz,
    COALESCE((
      SELECT COUNT(*)::int
      FROM whatsapp_events we
      WHERE we.tenant_id = p_tenant_id
        AND we.direction = 'outbound'
        AND we.status IN ('sent', 'delivered', 'read')
        AND we.occurred_at > COALESCE(rc.last_activity_at, rc.created_at)
        AND EXISTS (
          SELECT 1 FROM invoices inv2
          WHERE inv2.id = we.invoice_id
          AND inv2.customer_id = rc.customer_id
        )
    ), 0)::int as ignored_reminders,
    COALESCE((
      SELECT COUNT(*)::int
      FROM recovery_case_events rce
      WHERE rce.case_id = rc.id
        AND rce.event_type = 'transition'
        AND rce.payload->>'to_recovery_state' = 'overdue'
        AND rce.payload->>'from_recovery_state' = 'promised'
    ), 0)::int as broken_promises,
    rc.open_invoice_count::int,
    c.automation_mode::text
  FROM recovery_cases rc
  JOIN customers c ON c.id = rc.customer_id
  WHERE rc.tenant_id = p_tenant_id
    AND rc.recovery_state_v2 NOT IN ('recovered', 'closed')
    AND rc.next_action_type IN ('send_reminder', 'call', 'follow_up_call')
  ORDER BY rc.attention_score DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION get_priority_cases IS 'Returns top priority recovery cases for a tenant, ordered by attention_score DESC';

COMMIT;
