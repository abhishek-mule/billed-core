-- 058_collection_actions.sql
-- Introduce the collection_actions table as the canonical record of every
-- recovery action taken by BillZo. This replaces the implicit/overloaded use
-- of whatsapp_events for payment intents and reminder tracking.
--
-- Every action (reminder, payment_request, call, visit, escalate) gets its
-- own row with core fields as columns. Provider-specific values live in metadata.
--
-- Action hierarchy via parent_action_id:
--   Reminder
--     ├── Payment Request (customer clicked)
--     └── Reconciliation
--
-- Source field tracks who/what created the action:
--   system     - automated recovery orchestration
--   worker     - background job (BullMQ)
--   merchant   - merchant manually triggered
--   customer   - customer-initiated (e.g. clicked payment link)

CREATE TABLE collection_actions (
  id TEXT PRIMARY KEY,                              -- CA_<ulid>

  tenant_id UUID NOT NULL,
  customer_id UUID,
  invoice_ids UUID[] NOT NULL DEFAULT '{}',

  action_type TEXT NOT NULL,                        -- reminder | payment_request | call | visit | escalate | wait
  status TEXT NOT NULL DEFAULT 'scheduled',          -- scheduled | in_progress | completed | failed | cancelled | expired
  source TEXT NOT NULL DEFAULT 'system',             -- system | worker | merchant | customer

  provider TEXT,                                     -- whatsapp | upi | razorpay | null (for manual actions)
  amount NUMERIC,
  scheduled_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  parent_action_id TEXT REFERENCES collection_actions(id),
  recovery_plan_id TEXT,                             -- links to the plan that generated this action

  reason TEXT,                                       -- human-readable explanation
  priority INT NOT NULL DEFAULT 5,                   -- 1-10, for merchant timeline sorting

  -- Provider-specific values only — do NOT put core fields here
  metadata JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_collection_actions_tenant_status ON collection_actions(tenant_id, status);
CREATE INDEX idx_collection_actions_customer      ON collection_actions(customer_id, status);
CREATE INDEX idx_collection_actions_scheduled      ON collection_actions(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_collection_actions_parent          ON collection_actions(parent_action_id);
CREATE INDEX idx_collection_actions_invoices        ON collection_actions USING GIN (invoice_ids);

COMMENT ON TABLE collection_actions IS 'Canonical record of every recovery action (reminder, payment, call, visit, escalate)';
COMMENT ON COLUMN collection_actions.action_type IS 'reminder | payment_request | call | visit | escalate | wait';
COMMENT ON COLUMN collection_actions.status IS 'scheduled | in_progress | completed | failed | cancelled | expired';
COMMENT ON COLUMN collection_actions.source IS 'system | worker | merchant | customer';
COMMENT ON COLUMN collection_actions.parent_action_id IS 'Links to parent action for action trees (reminder → payment → reconciliation)';
COMMENT ON COLUMN collection_actions.recovery_plan_id IS 'Links to the orchestration plan that produced this action';
COMMENT ON COLUMN collection_actions.metadata IS 'Provider-specific values only. Core fields (amount, status, action_type, provider) are separate columns.';
