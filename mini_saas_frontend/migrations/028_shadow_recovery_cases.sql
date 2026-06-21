-- Migration 028: Shadow Recovery Cases for Truth Projection
-- 
-- Minimal table for financial truth verification - only tracks what affects business decisions
-- Does NOT include behavioral or UI-related metadata

-- 1. SHADOW RECOVERY_CASES — Truth projection snapshot
CREATE TABLE IF NOT EXISTS shadow_recovery_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  customer_id UUID NOT NULL,
  
  -- Financial truth (what affects business decisions)
  total_outstanding NUMERIC DEFAULT 0 NOT NULL,
  total_overdue NUMERIC DEFAULT 0 NOT NULL,
  open_invoice_count INT DEFAULT 0 NOT NULL,
  overdue_invoice_count INT DEFAULT 0 NOT NULL,
  
  -- Collection position (what actually needs to be done) — uses same enum as recovery_cases
  recovery_state recovery_state_v2 NOT NULL DEFAULT 'created',
  next_action_due_at TIMESTAMPTZ,
  
  -- Projection metadata
  projection_version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes for fast lookup
  INDEX idx_src_tenant ON shadow_recovery_cases(tenant_id);
  INDEX idx_src_customer ON shadow_recovery_cases(customer_id);
);

-- 2. DROP THE FOLLOWING COLUMNS from recovery_cases (NOT in shadow)
--   engagement_state (behavioral)
--   attention_score (ranking)
--   next_action_type (system recommendation)
--   promise_to_pay_date (behavioral)
--   disputed_invoice_count (behavioral)
--   promised_invoice_count (behavioral)

-- Note: These columns are maintained by event-driven logic
-- but not duplicated in shadow truth projection