-- 052_tenants_complete_schema.sql
-- Ensures tenants table has all columns needed by the API routes,
-- and tenant_memberships/login_events exist.

-- 1. Tenant memberships (already in 050 — idempotent)
CREATE TABLE IF NOT EXISTS tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'owner',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tm_user ON tenant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_tm_tenant ON tenant_memberships(tenant_id);

-- 2. Login events (already in 050 — idempotent)
CREATE TABLE IF NOT EXISTS login_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT,
    email TEXT,
    ip INET,
    user_agent TEXT,
    success BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_le_user ON login_events(user_id);

-- 3. Tenants: ensure all columns used by the app exist
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS upi_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS gstin TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pan TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_details JSONB DEFAULT '{}';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS paywall_unlocked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS white_label BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS auto_mode BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invoice_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_state TEXT DEFAULT 'incomplete';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- 4. Copy company_name → name if name is empty and company_name has data
UPDATE tenants SET name = company_name WHERE (name IS NULL OR name = '') AND company_name IS NOT NULL AND company_name != '';
