-- 064_collection_action_delivery_columns.sql
-- Self-contained: creates collection_actions if missing (from 058), then adds
-- delivery tracking projections and dead_letter_events table.

BEGIN;

-- ============================================================
-- 1. Create collection_actions if not exists (from 058)
-- ============================================================
CREATE TABLE IF NOT EXISTS collection_actions (
  id TEXT PRIMARY KEY,

  tenant_id UUID NOT NULL,
  customer_id UUID,
  invoice_ids UUID[] NOT NULL DEFAULT '{}',

  action_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  source TEXT NOT NULL DEFAULT 'system',

  provider TEXT,
  amount NUMERIC,
  scheduled_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  parent_action_id TEXT REFERENCES collection_actions(id),
  recovery_plan_id TEXT,

  reason TEXT,
  priority INT NOT NULL DEFAULT 5,

  metadata JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes (IF NOT EXISTS for each)
CREATE INDEX IF NOT EXISTS idx_collection_actions_tenant_status ON collection_actions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_collection_actions_customer      ON collection_actions(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_collection_actions_scheduled      ON collection_actions(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_collection_actions_parent          ON collection_actions(parent_action_id);
CREATE INDEX IF NOT EXISTS idx_collection_actions_invoices        ON collection_actions USING GIN (invoice_ids);

-- ============================================================
-- 2. Add billzo_message_id as a first-class indexed column
-- ============================================================
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS billzo_message_id TEXT;
CREATE INDEX IF NOT EXISTS idx_ca_billzo_message_id ON collection_actions(billzo_message_id);

-- ============================================================
-- 3. Add delivery projection columns
-- ============================================================
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS last_delivery_status TEXT;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS delivery_provider TEXT;

-- ============================================================
-- 4. Dead letter events table for webhook processing failures
-- ============================================================
CREATE TABLE IF NOT EXISTS dead_letter_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reason TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'meta',
  payload JSONB NOT NULL DEFAULT '{}',
  webhook_body JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retry_count INT NOT NULL DEFAULT 0,
  last_retry_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dle_provider ON dead_letter_events(provider);
CREATE INDEX IF NOT EXISTS idx_dle_unresolved ON dead_letter_events(resolved_at) WHERE resolved_at IS NULL;

COMMENT ON TABLE dead_letter_events IS 'Unprocessable webhook payloads that could not be written to the event store. Admins can replay resolved=false rows.';
COMMENT ON COLUMN collection_actions.billzo_message_id IS 'Correlation ID linking this action to its message delivery event stream. Indexed for O(log n) lookups.';

COMMIT;
