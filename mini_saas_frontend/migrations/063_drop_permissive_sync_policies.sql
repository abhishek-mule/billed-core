-- ============================================================
-- 063_drop_permissive_sync_policies.sql
-- Drops permissive anon_all RLS policies that allowed public
-- read/write access to sensitive tables via the anon key.
--
-- The sync engine now routes through /api/sync/proxy which
-- authenticates via the app's custom JWT (bz_access cookie)
-- and uses the service-role key — eliminating the need for
-- anon-key database access entirely.
--
-- Run in Supabase SQL Editor.
-- ============================================================

-- Drop permissive anon-all policies (anyone with the public anon
-- key could read, write, update, or delete all rows)
DROP POLICY IF EXISTS "anon_all" ON public.invoices;
DROP POLICY IF EXISTS "anon_all" ON public.customers;
DROP POLICY IF EXISTS "anon_all" ON public.payments;
DROP POLICY IF EXISTS "anon_all" ON public.whatsapp_events;

-- Drop permissive recovery attribution/experiment policies that
-- also allowed public access via USING(true)
-- Not recreating — these tables are accessed exclusively via the
-- service-role API proxy (/api/sync/proxy) which bypasses RLS.
DROP POLICY IF EXISTS "recovery_attributions_tenant_isolation" ON public.recovery_attributions;
DROP POLICY IF EXISTS "recovery_experiments_tenant_isolation" ON public.recovery_experiments;
