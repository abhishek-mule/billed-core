-- 020_payment_attribution_log.sql
-- Immutable audit trail for payment-to-invoice matching.
-- Every match writes the full context (algorithm version, confidence, input tokens)
-- at the time of matching, ensuring deterministic replay even if matching
-- logic changes in future versions.
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_attribution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  invoice_id VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  provider_payment_id VARCHAR(255) NOT NULL,

  -- Match metadata
  match_type VARCHAR(50) NOT NULL,       -- 'payment_link' | 'exact' | 'fuzzy' | 'none'
  match_confidence NUMERIC NOT NULL,      -- 0.0 to 1.0
  matching_algorithm_version INT NOT NULL DEFAULT 1,

  -- Input signal at match time (snapshot, not reference)
  signal_amount NUMERIC NOT NULL,
  signal_currency VARCHAR(10) DEFAULT 'INR',
  signal_phone VARCHAR(50),
  signal_upi_reference VARCHAR(255),
  signal_customer_name TEXT,
  signal_payment_link_id VARCHAR(255),
  signal_timestamp TIMESTAMPTZ,

  -- Matched invoice snapshot at match time
  invoice_total NUMERIC,
  invoice_status VARCHAR(50),
  invoice_customer_name TEXT,
  invoice_customer_phone VARCHAR(50),
  invoice_created_at TIMESTAMPTZ,

  -- Reasoning
  match_reasons JSONB DEFAULT '[]'::jsonb,
  raw_signal JSONB,

  -- Immutable timestamp
  matched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pal_tenant_invoice ON payment_attribution_log(tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_pal_provider_payment ON payment_attribution_log(provider, provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_pal_matched_at ON payment_attribution_log(matched_at DESC);
CREATE INDEX IF NOT EXISTS idx_pal_tenant_matched ON payment_attribution_log(tenant_id, matched_at DESC);
