-- 048_trial_previews.sql
-- Ephemeral preview snapshots so the approve endpoint reads a signed,
-- server-computed list of eligible customers (never trusts client customerIds).

CREATE TABLE IF NOT EXISTS trial_previews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    eligible_customers JSONB NOT NULL,
    eligible_count INT NOT NULL,
    total_overdue NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour'
);

CREATE INDEX IF NOT EXISTS idx_trial_previews_tenant
ON trial_previews (tenant_id, created_at DESC);
