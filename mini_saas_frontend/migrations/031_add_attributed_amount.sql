-- 031_add_attributed_amount.sql
-- First Rupee Accounting: track exactly how much BillZo recovered
--
-- Adds: attributed_amount to recovery_attributions (canonical money-truth column)
-- The existing `amount` column is preserved for backward compatibility.
--
-- Every attribution must now carry the actual recovered amount so we can answer:
--   "How much money did BillZo recover this month?"

ALTER TABLE recovery_attributions
  ADD COLUMN IF NOT EXISTS attributed_amount NUMERIC(12,2);

COMMENT ON COLUMN recovery_attributions.attributed_amount IS 'Actual recovered amount attributed to BillZo. Canonical money-truth column.';
