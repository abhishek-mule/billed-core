-- Business Identity & Invoice Branding
-- Adds canonical branding fields that power PDF invoices, WhatsApp, payment pages, UPI QR, receipts.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invoice_prefix TEXT DEFAULT 'INV-';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invoice_footer TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT 'Due in 30 days';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_business_number TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#1e293b';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{"enabled":false,"days":["mon","tue","wed","thu","fri","sat"],"start":"09:30","end":"19:00"}'::jsonb;

-- Storage bucket for merchant assets (logos, etc.)
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES ('merchant-assets', 'merchant-assets', true, false, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
CREATE POLICY IF NOT EXISTS "merchant_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'merchant-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY IF NOT EXISTS "merchant_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'merchant-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY IF NOT EXISTS "merchant_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'merchant-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Anyone can read public assets (needed for invoice PDFs, shared links, etc.)
CREATE POLICY IF NOT EXISTS "merchant_read_public" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'merchant-assets');
