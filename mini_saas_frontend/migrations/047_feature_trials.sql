-- 047_feature_trials.sql
-- Tracks the single-lifetime recovery trial campaign per tenant.
-- Status transitions: (no row) → running → completed

CREATE TABLE IF NOT EXISTS feature_trials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    feature TEXT NOT NULL CHECK (feature IN ('free_recovery_trial')),
    status TEXT NOT NULL CHECK (status IN ('running', 'completed')),
    created_by TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}',
    UNIQUE (tenant_id, feature)
);

CREATE INDEX IF NOT EXISTS idx_feature_trials_lookup
ON feature_trials (tenant_id, feature);
