-- 068_collection_action_events.sql
-- Immutable audit log for every state transition of a collection_action.
-- Mirrors the event-sourced pattern used for whatsapp_events.

BEGIN;

CREATE TABLE IF NOT EXISTS collection_action_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id TEXT NOT NULL REFERENCES collection_actions(id),
  event_type TEXT NOT NULL,          -- scheduled | processing | sent | completed | cancelled | retry | failed | expired
  from_status TEXT,
  to_status TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cae_action ON collection_action_events(action_id, created_at);

COMMENT ON TABLE collection_action_events IS 'Immutable event log for collection action lifecycle. Every state transition creates a row.';
COMMENT ON COLUMN collection_action_events.event_type IS 'scheduled | processing | sent | completed | cancelled | retry | failed | expired';

COMMIT;
