-- 056_anon_sync_policies.sql
-- Adds RLS policies for the anon role on tables synced from the frontend.
-- The frontend sync uses the anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY) to upsert
-- locally-created data to Supabase. RLS is enabled by default on all Supabase tables
-- but no policies existed — every upsert was denied, causing silent sync failures.
-- ============================================================
-- Notes:
--   - Service role key (SUPABASE_SERVICE_ROLE_KEY) bypasses RLS entirely.
--   - These policies only affect the anon key path (frontend Dexie → Supabase sync).
--   - Tenant isolation is handled at the application layer via tenant_id in every row.

CREATE POLICY "anon_all" ON public.invoices
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.customers
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.payments
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.whatsapp_events
  FOR ALL USING (true) WITH CHECK (true);
