-- 049_trial_index.sql
-- Partial index for efficient trial-eligibility query:
--   SELECT MIN(due_at) FROM invoices WHERE tenant_id = $1 AND outstanding_amount > 0;

CREATE INDEX IF NOT EXISTS idx_invoices_trial_lookup
ON invoices (tenant_id, due_at)
WHERE outstanding_amount > 0;
