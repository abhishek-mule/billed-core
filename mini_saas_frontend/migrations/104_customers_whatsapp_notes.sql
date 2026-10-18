-- 104_customers_whatsapp_notes.sql
-- Persist whatsapp_number + notes on customers.
--
-- Context: the UI (parties/add, parties/[id] edit, POS, contact import) already
-- collects both fields, and POST /api/customers + the offline queue sync
-- intended to persist them — but the columns never existed, so values were
-- silently dropped on every write path.
--
-- Additive only: both nullable, no defaults, no table rewrite.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS notes TEXT;
