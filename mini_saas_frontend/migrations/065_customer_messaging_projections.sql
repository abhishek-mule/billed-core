-- 065_customer_messaging_projections.sql
-- Add messaging activity projection columns to customers for fast lookups.

BEGIN;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_whatsapp_activity TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_whatsapp_status TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_last_whatsapp ON customers(tenant_id, last_whatsapp_activity DESC);

COMMENT ON COLUMN customers.last_whatsapp_activity IS 'Timestamp of the most recent WhatsApp event (any status) for this customer.';
COMMENT ON COLUMN customers.last_whatsapp_status IS 'Most recent delivery status (delivered, read, failed, etc.) from the event stream.';
COMMENT ON COLUMN customers.last_contacted_at IS 'Timestamp of the most recent outbound message sent to this customer.';

COMMIT;
