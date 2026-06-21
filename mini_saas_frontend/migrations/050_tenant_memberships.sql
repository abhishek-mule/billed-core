-- 050_tenant_memberships.sql
-- Tenant memberships: links users (by user_id from JWT) to tenants with roles
-- Onboarding tracking + login audit trail

-- 1. Tenant memberships: user_id → tenant (source of truth for ownership)
CREATE TABLE IF NOT EXISTS tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'owner',  -- owner, accountant, staff, agent
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tm_user ON tenant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_tm_tenant ON tenant_memberships(tenant_id);

-- 2. Tenants: add onboarding tracking columns
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_state TEXT DEFAULT 'incomplete';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- 3. Login events: audit trail for support/debugging
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

-- 4. Onboarding trigger: mark complete on first invoice
CREATE OR REPLACE FUNCTION mark_onboarding_complete()
RETURNS TRIGGER AS $$
DECLARE
  invoice_count INT;
BEGIN
  SELECT COUNT(*) INTO invoice_count
  FROM invoices
  WHERE tenant_id = NEW.tenant_id;

  IF invoice_count = 1 THEN
    UPDATE tenants SET
      onboarding_state = 'active',
      onboarding_completed_at = NOW()
    WHERE id = NEW.tenant_id
      AND onboarding_state = 'incomplete';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mark_onboarding_complete ON invoices;
CREATE TRIGGER trg_mark_onboarding_complete
  AFTER INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION mark_onboarding_complete();