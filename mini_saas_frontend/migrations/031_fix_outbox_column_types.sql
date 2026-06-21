-- 031_fix_outbox_column_types.sql
-- Drop the blocking policy first
DROP POLICY IF EXISTS outbox_tenant_isolation ON public.outbox;

-- Alter column types from UUID to TEXT
ALTER TABLE public.outbox 
  ALTER COLUMN tenant_id TYPE TEXT,
  ALTER COLUMN entity_id TYPE TEXT,
  ALTER COLUMN causation_id TYPE TEXT,
  ALTER COLUMN correlation_id TYPE TEXT,
  ALTER COLUMN idempotency_key TYPE TEXT;

-- Restore the policy (ensuring it handles TEXT types)
CREATE POLICY outbox_tenant_isolation ON public.outbox
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::text);
