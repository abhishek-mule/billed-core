-- 034_consolidate_payments.sql
-- Consolidate the payments table from 3 competing definitions (schema.sql, 005, 029)
-- into a single canonical schema.
--
-- Canonical columns after migration:
--   id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
--   tenant_id       TEXT NOT NULL
--   invoice_id      TEXT
--   customer_id     TEXT
--   amount          NUMERIC NOT NULL DEFAULT 0
--   payment_mode    TEXT               (cash / upi / razorpay)
--   status          TEXT NOT NULL DEFAULT 'pending'
--                   CHECK (status IN ('pending', 'paid', 'failed'))
--   razorpay_payment_id  TEXT
--   razorpay_order_id    TEXT
--   collected_via   TEXT DEFAULT 'manual'
--   platform_fee    NUMERIC DEFAULT 0
--   notes           TEXT
--   paid_at         TIMESTAMPTZ
--   created_at      TIMESTAMPTZ DEFAULT NOW()
--   updated_at      TIMESTAMPTZ DEFAULT NOW()

-- 1. Add columns that may be missing depending on which CREATE TABLE ran
ALTER TABLE payments ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;

-- 2. Ensure canonical columns exist with correct types
--    (id, tenant_id, invoice_id, amount, payment_mode are in all 3 definitions)

-- 3. Set defaults for null timestamps
UPDATE payments SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE payments SET paid_at = created_at WHERE status = 'paid' AND paid_at IS NULL;

-- 4. Migrate legacy reconciliation data
UPDATE payments SET status = 'paid' WHERE is_reconciled = true AND status = 'pending';
UPDATE payments SET status = 'paid' WHERE is_reconciled = true AND status IS NULL;

-- 5. Normalize status values to canonical set
UPDATE payments SET status = 'paid'    WHERE status IN ('PAID', 'paid', 'success', 'completed');
UPDATE payments SET status = 'pending' WHERE status IS NULL OR status = '';
UPDATE payments SET status = 'failed'  WHERE status IN ('FAILED', 'failed');

-- 6. Drop deprecated columns
ALTER TABLE payments DROP COLUMN IF EXISTS is_reconciled;
ALTER TABLE payments DROP COLUMN IF EXISTS reconciliation_status;
ALTER TABLE payments DROP COLUMN IF EXISTS payment_reference;
ALTER TABLE payments DROP COLUMN IF EXISTS transaction_id;
ALTER TABLE payments DROP COLUMN IF EXISTS payment_method;

-- 7. Add status CHECK constraint (safe after normalization above)
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'paid', 'failed'));

-- 8. Ensure indexes
CREATE INDEX IF NOT EXISTS idx_payments_tenant   ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice  ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_order    ON payments(razorpay_order_id);

-- 9. Align plan type enum: TS uses 'starter' | 'growth' | 'pro', SQL defaults to 'free'
ALTER TABLE tenants ALTER COLUMN plan SET DEFAULT 'starter';
UPDATE tenants SET plan = 'starter' WHERE plan IS NULL OR plan = '';

-- 10. RPC for atomically incrementing outbox retry count
CREATE OR REPLACE FUNCTION increment_attempts(event_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE outbox
  SET attempts = COALESCE(attempts, 0) + 1
  WHERE id = event_id
  RETURNING attempts INTO new_count;
  RETURN new_count;
END;
$$;
