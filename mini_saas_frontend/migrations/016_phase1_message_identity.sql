-- 016_phase1_message_identity.sql
-- Phase 1: Canonical message identity + append-only event semantics
-- Router becomes identity authority. whatsapp_events becomes an event stream.

-- 1. Core identity columns
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS billzo_message_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS conversation_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS message_origin TEXT DEFAULT 'automation';
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS event_sequence BIGINT DEFAULT 0;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS transport_message_hash TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS parent_billzo_message_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS attempt_number INT DEFAULT 1;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS reminder_stage TEXT;

-- 2. Performance indexes
CREATE INDEX IF NOT EXISTS idx_we_billzo_message_id ON whatsapp_events(billzo_message_id);
CREATE INDEX IF NOT EXISTS idx_we_conversation_id ON whatsapp_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_we_transport_hash ON whatsapp_events(transport_message_hash);
CREATE INDEX IF NOT EXISTS idx_we_sequence ON whatsapp_events(billzo_message_id, event_sequence DESC);

-- 3. Backfill existing rows
-- Existing rows get billzo_message_id = id (each existing row becomes
-- its own canonical message with a single event).
-- event_sequence is derived from occurred_at epoch millis.
-- conversation_id groups by invoice_id, or falls back to phone-based.
UPDATE whatsapp_events SET
  billzo_message_id = COALESCE(billzo_message_id, id),
  event_sequence = COALESCE(event_sequence, EXTRACT(EPOCH FROM COALESCE(occurred_at, created_at, NOW()))::BIGINT * 1000),
  conversation_id = COALESCE(conversation_id, invoice_id, 'conv_' || COALESCE(phone, 'unknown'))
WHERE billzo_message_id IS NULL OR event_sequence = 0;

-- 4. Enforce NOT NULL after backfill
ALTER TABLE whatsapp_events ALTER COLUMN billzo_message_id SET NOT NULL;
ALTER TABLE whatsapp_events ALTER COLUMN event_sequence SET NOT NULL;
ALTER TABLE whatsapp_events ALTER COLUMN conversation_id SET NOT NULL;
