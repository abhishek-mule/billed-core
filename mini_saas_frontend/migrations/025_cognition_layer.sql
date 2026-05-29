-- Sprint 1: Cognition Layer — Merchant-facing operational intelligence
-- attention_items: internal machine-layer signals (never exposed directly)
-- operational_situations: merchant-facing compressed cognition (feed source)

CREATE TABLE IF NOT EXISTS attention_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  situation_id UUID,
  intent_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  priority_score NUMERIC NOT NULL DEFAULT 0,
  urgency TEXT NOT NULL DEFAULT 'medium'
    CHECK (urgency IN ('critical','high','medium','low')),
  confidence NUMERIC NOT NULL DEFAULT 1.0,
  signal_data JSONB NOT NULL DEFAULT '{}',
  correlation_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attention_tenant ON attention_items (tenant_id, priority_score DESC);
CREATE INDEX idx_attention_correlation ON attention_items (correlation_key);
CREATE INDEX idx_attention_situation ON attention_items (situation_id);

CREATE TABLE IF NOT EXISTS operational_situations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  situation_type TEXT NOT NULL,
  situation_fingerprint TEXT NOT NULL UNIQUE,
  priority_score NUMERIC NOT NULL,
  urgency TEXT NOT NULL CHECK (urgency IN ('critical','high','medium','low')),
  headline TEXT NOT NULL,
  narrative TEXT NOT NULL,
  affected_entities JSONB NOT NULL DEFAULT '{}',
  recommended_action JSONB NOT NULL DEFAULT '{}',
  -- { "type": "call" | "send_reminder" | "wait" | "review" | "escalate", "reason": "...", "expectedOutcome": "..." }
  decision_window_start TIMESTAMPTZ,
  decision_window_end TIMESTAMPTZ,
  resolution_condition JSONB NOT NULL DEFAULT '{}',
  -- { "field": "status", "table": "invoices", "value": "paid" } — auto-resolves when condition met
  auto_executable BOOLEAN NOT NULL DEFAULT false,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  situation_state TEXT NOT NULL DEFAULT 'active'
    CHECK (situation_state IN ('active','snoozed','dismissed','completed')),
  max_display_order INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  dismissal_count INTEGER NOT NULL DEFAULT 0,
  pipeline_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_situations_tenant_active ON operational_situations (tenant_id, priority_score DESC)
  WHERE situation_state = 'active';
CREATE INDEX idx_situations_fingerprint ON operational_situations (situation_fingerprint);
