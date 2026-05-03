-- 013_add_platform_fee.sql
ALTER TABLE payments ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(15,2) DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'free' CHECK (subscription_status IN ('free', 'pro', 'trial'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
