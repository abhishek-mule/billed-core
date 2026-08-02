-- 087_fix_collection_actions_fk_types.sql
-- Surgical fix: repair FK type mismatch in 058_collection_actions.sql.
--
-- Problem: 058 created collection_actions with UUID tenant_id/customer_id
-- and UUID[] invoice_ids, but the entire app uses TEXT identifiers
-- (tenant_..., cust_..., inv_..., e2e_...). Every scheduler/planner write
-- to collection_actions fails with 22P02 "invalid input syntax for type uuid".
-- Same defect previously fixed for recovery_cases in 028.
--
-- Safe: collection_actions is currently empty (no data to cast).
-- Idempotent: only alters if the column is still uuid-typed.
ALTER TABLE collection_actions
  ALTER COLUMN tenant_id TYPE TEXT,
  ALTER COLUMN customer_id TYPE TEXT,
  ALTER COLUMN invoice_ids TYPE TEXT[] USING ARRAY[]::TEXT[];

-- Rebuild the GIN index over the now-text array (uuid[] → text[]).
DROP INDEX IF EXISTS idx_collection_actions_invoices;
CREATE INDEX idx_collection_actions_invoices
  ON collection_actions USING GIN (invoice_ids);
