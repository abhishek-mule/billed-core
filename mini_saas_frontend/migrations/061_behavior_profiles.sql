-- 061_behavior_profiles.sql
-- Introduce customer_behavior_profiles and business_behavior_profiles tables
-- as the canonical persistent storage for Learning Engine output.
--
-- Profiles are the "source of truth" for learned customer and business behavior.
-- Feature vectors for future ML/XGBoost/embeddings/LLMs are stored separately
-- in the feature_store table.
--
-- Every profile is versioned via model_version to enable A/B comparison
-- when the learning model improves.

CREATE TABLE customer_behavior_profiles (
  customer_id UUID NOT NULL,
  tenant_id UUID NOT NULL,

  model_version TEXT NOT NULL DEFAULT '1.0.0',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_count INT NOT NULL DEFAULT 0,

  -- Observed behavior (directly computed from events)
  observed JSONB NOT NULL DEFAULT '{}',

  -- Derived behavior (computed from observed + Bayesian priors)
  derived JSONB NOT NULL DEFAULT '{}',

  -- Predicted behavior (forward-looking estimates)
  predicted JSONB NOT NULL DEFAULT '{}',

  -- Confidence scores per field
  confidence JSONB NOT NULL DEFAULT '{}',

  -- Drift detection report (null if no drift detected)
  drift JSONB,

  -- Feature store reference (points to feature_store.id)
  feature_store_id TEXT,

  dirty_at TIMESTAMPTZ,                               -- set when new events arrive, cleared after recompute
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (customer_id, tenant_id)
);

CREATE INDEX idx_customer_profiles_tenant ON customer_behavior_profiles(tenant_id);
CREATE INDEX idx_customer_profiles_dirty ON customer_behavior_profiles(dirty_at) WHERE dirty_at IS NOT NULL;

CREATE TABLE business_behavior_profiles (
  tenant_id UUID PRIMARY KEY,

  model_version TEXT NOT NULL DEFAULT '1.0.0',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  customer_count INT NOT NULL DEFAULT 0,
  avg_risk_score NUMERIC NOT NULL DEFAULT 0,
  preferred_recovery_style TEXT NOT NULL DEFAULT 'balanced',
  dashboard_engagement TEXT NOT NULL DEFAULT 'unknown',
  snooze_rate NUMERIC NOT NULL DEFAULT 0,
  call_preference BOOLEAN NOT NULL DEFAULT FALSE,

  -- Business intelligence
  busiest_collection_day INT,                         -- 0=Sun, 6=Sat
  avg_receivable_age_days NUMERIC,
  avg_recovery_efficiency NUMERIC,                    -- 0-1, collected / total due
  avg_payment_cycle_days NUMERIC,
  reminder_effectiveness NUMERIC,                     -- 0-1, payments after reminder / reminders sent
  cashflow_health NUMERIC,                            -- 0-1, (collections - new invoices) / collections

  dirty_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Feature store — single table consumed by ML, embeddings, forecasting, LLMs
CREATE TABLE feature_store (
  id TEXT PRIMARY KEY,                                -- FS_<ulid>
  customer_id UUID NOT NULL,
  tenant_id UUID NOT NULL,

  model_version TEXT NOT NULL,
  vector JSONB NOT NULL,
  event_count INT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feature_store_customer ON feature_store(customer_id, tenant_id);
