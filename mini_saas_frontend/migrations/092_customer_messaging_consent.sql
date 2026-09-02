-- Consent is an execution precondition for unattended WhatsApp recovery.
-- Keep an auditable timestamp; historical records remain false/unknown until
-- the merchant captures a fresh, explicit opt-in.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS opt_in BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS opt_in_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_recovery_consent
  ON customers (tenant_id, opt_in)
  WHERE opt_in = true;
