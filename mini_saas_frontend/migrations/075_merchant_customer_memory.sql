-- 075_merchant_customer_memory.sql
-- Merchant-owned, long-term customer memory (treated architecturally as
-- "Customer Memory", not a generic notes feature). Captures context that the
-- automated event stream can never infer (contact hours, who approves payment,
-- channel preferences). Later intelligence features (relationship score,
-- behavior engine, AI explanation layer) read these; nothing writes them
-- automatically. No sentiment / AI summary / tags / embeddings here — those
-- are derived downstream.
BEGIN;

CREATE TABLE IF NOT EXISTS merchant_customer_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL,
  note            TEXT NOT NULL,
  author_user_id  TEXT,
  is_pinned       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mcn_tenant_customer
  ON merchant_customer_notes(tenant_id, customer_id)
  WHERE archived_at IS NULL;

COMMENT ON TABLE merchant_customer_notes IS 'Merchant-owned long-term memory about a customer. Sacred — never auto-modified by AI or recommendations.';

COMMIT;
