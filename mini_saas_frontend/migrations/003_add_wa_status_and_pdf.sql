-- 003_add_wa_status_and_pdf.sql
-- Hardening invoice schema for WhatsApp
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS wa_status TEXT DEFAULT 'pending' CHECK (wa_status IN ('pending', 'sent', 'failed'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_url TEXT;
