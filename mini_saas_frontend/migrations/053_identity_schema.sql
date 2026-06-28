-- 053_identity_schema.sql
-- New identity model: users (login) + merchants (business) + memberships (link)
-- Phone is the unique business identifier.
-- Email is only a login method.

-- 1. Users table — login only
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,           -- Supabase auth.users UUID
    email TEXT UNIQUE NOT NULL,    -- Login email (unique)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Merchants table — business identity
CREATE TABLE IF NOT EXISTS merchants (
    id TEXT PRIMARY KEY,                          -- merchant_{timestamp}_{uuid8}
    business_name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,                   -- WhatsApp number (unique across all merchants)
    email TEXT,                                   -- Business contact email (not for login)
    gstin TEXT,
    category TEXT,                                -- Business category
    plan TEXT DEFAULT 'free',                     -- free, starter, growth, pro
    subdomain TEXT,
    is_active BOOLEAN DEFAULT true,
    upi_id TEXT,
    address TEXT,
    pan TEXT,
    bank_details JSONB DEFAULT '{}',
    auto_mode BOOLEAN DEFAULT true,
    invoice_count INTEGER DEFAULT 0,
    reminder_count INTEGER DEFAULT 0,
    onboarding_state TEXT DEFAULT 'incomplete',
    onboarding_completed_at TIMESTAMPTZ,
    whatsapp_config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchants_phone ON merchants(phone);

-- 3. Memberships — links users to merchants with roles
CREATE TABLE IF NOT EXISTS memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'owner',  -- owner, manager, cashier, accountant, staff
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, merchant_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_merchant ON memberships(merchant_id);

-- 4. Backfill: create users from existing tenant_memberships
-- Users that exist in tenant_memberships but not in the new users table
INSERT INTO users (id, email, created_at, updated_at)
SELECT DISTINCT
    tm.user_id,
    COALESCE(
        (SELECT email FROM tenants t WHERE t.id = tm.tenant_id LIMIT 1),
        ''
    ) as email,
    tm.created_at,
    NOW()
FROM tenant_memberships tm
WHERE tm.user_id IS NOT NULL
  AND tm.user_id != ''
ON CONFLICT (id) DO NOTHING;

-- 5. Backfill: create merchants from existing tenants
INSERT INTO merchants (
    id, business_name, phone, email, gstin, plan, subdomain, is_active,
    upi_id, address, pan, bank_details, auto_mode,
    invoice_count, reminder_count, onboarding_state, onboarding_completed_at,
    whatsapp_config, created_at, updated_at
)
SELECT
    t.id,
    COALESCE(NULLIF(t.name, ''), t.company_name, 'My Shop'),
    COALESCE(NULLIF(t.phone, ''), 'unknown_' || t.id),
    t.email,
    t.gstin,
    t.plan,
    t.subdomain,
    t.is_active,
    t.upi_id,
    t.address,
    t.pan,
    t.bank_details,
    t.auto_mode,
    t.invoice_count,
    t.reminder_count,
    t.onboarding_state,
    t.onboarding_completed_at,
    t.whatsapp_config,
    t.created_at,
    t.updated_at
FROM tenants t
ON CONFLICT (id) DO NOTHING;

-- 6. Backfill: create memberships from existing tenant_memberships
INSERT INTO memberships (user_id, merchant_id, role, is_active, created_at)
SELECT
    tm.user_id,
    tm.tenant_id,
    tm.role,
    tm.is_active,
    tm.created_at
FROM tenant_memberships tm
WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = tm.user_id)
  AND EXISTS (SELECT 1 FROM merchants m WHERE m.id = tm.tenant_id)
ON CONFLICT (user_id, merchant_id) DO NOTHING;

-- 7. Unique email constraint on users table (already handled by UNIQUE above)
-- 8. Unique phone constraint on merchants table (already handled by UNIQUE above)
