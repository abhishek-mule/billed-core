-- Migration 043: Unified Payment Ledger
-- Makes invoices.outstanding_amount the single source of truth,
-- maintained automatically by database triggers on the payments table.
-- ============================================================

-- 1. Payment source enum — canonical list
CREATE TYPE payment_source AS ENUM (
  'cash',
  'razorpay',
  'bank_transfer',
  'cheque',
  'adjustment',
  'upi'
);

-- 2. Add new columns to payments table
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS actor TEXT,
  ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source payment_source;

-- Backfill source from existing payment_mode values
UPDATE payments
SET source = CASE
  WHEN payment_mode IN ('cash', 'razorpay', 'upi') THEN payment_mode::payment_source
  WHEN payment_mode IN ('bank_transfer', 'bank', 'neft', 'imps') THEN 'bank_transfer'::payment_source
  WHEN payment_mode IN ('cheque', 'check') THEN 'cheque'::payment_source
  WHEN payment_mode IN ('adjustment', 'credit_note') THEN 'adjustment'::payment_source
  ELSE 'cash'::payment_source
END
WHERE source IS NULL;

-- 2b. Add paid_amount to invoices for the trigger to maintain
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) DEFAULT 0;

-- 3. Trigger function to maintain invoice outstanding
CREATE OR REPLACE FUNCTION maintain_invoice_outstanding()
RETURNS TRIGGER AS $$
DECLARE
  inv_total NUMERIC;
  inv_paid NUMERIC;
BEGIN
  -- Determine the invoice_id to recalculate
  -- Handles INSERT, UPDATE, DELETE
  IF TG_OP = 'DELETE' THEN
    IF OLD.invoice_id IS NULL THEN RETURN OLD; END IF;

    SELECT COALESCE(SUM(amount), 0) INTO inv_paid
    FROM payments
    WHERE invoice_id = OLD.invoice_id AND status = 'paid';

    SELECT COALESCE(total, 0) INTO inv_total
    FROM invoices
    WHERE id = OLD.invoice_id;

    UPDATE invoices SET
      paid_amount = inv_paid,
      outstanding_amount = GREATEST(inv_total - inv_paid, 0),
      status = CASE
        WHEN inv_paid >= inv_total THEN 'paid'
        WHEN inv_paid > 0 THEN 'partial'
        ELSE 'unpaid'
      END,
      updated_at = NOW()
    WHERE id = OLD.invoice_id;

    RETURN OLD;
  END IF;

  IF NEW.invoice_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO inv_paid
  FROM payments
  WHERE invoice_id = NEW.invoice_id AND status = 'paid';

  SELECT COALESCE(total, 0) INTO inv_total
  FROM invoices
  WHERE id = NEW.invoice_id;

  UPDATE invoices SET
    paid_amount = inv_paid,
    outstanding_amount = GREATEST(inv_total - inv_paid, 0),
    status = CASE
      WHEN inv_paid >= inv_total THEN 'paid'
      WHEN inv_paid > 0 THEN 'partial'
      ELSE 'unpaid'
    END,
    updated_at = NOW()
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger on payments table
DROP TRIGGER IF EXISTS trg_maintain_invoice_outstanding ON payments;
CREATE TRIGGER trg_maintain_invoice_outstanding
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION maintain_invoice_outstanding();

-- 5. Backfill all existing invoices (handles the newly-added paid_amount column)
UPDATE invoices i
SET
  paid_amount = COALESCE((
    SELECT SUM(p.amount) FROM payments p
    WHERE p.invoice_id = i.id AND p.status = 'paid'
  ), 0),
  outstanding_amount = GREATEST(i.total - COALESCE((
    SELECT SUM(p.amount) FROM payments p
    WHERE p.invoice_id = i.id AND p.status = 'paid'
  ), 0), 0),
  status = CASE
    WHEN COALESCE((
      SELECT SUM(p.amount) FROM payments p
      WHERE p.invoice_id = i.id AND p.status = 'paid'
    ), 0) >= i.total THEN 'paid'
    WHEN COALESCE((
      SELECT SUM(p.amount) FROM payments p
      WHERE p.invoice_id = i.id AND p.status = 'paid'
    ), 0) > 0 THEN 'partial'
    ELSE 'unpaid'
  END;
