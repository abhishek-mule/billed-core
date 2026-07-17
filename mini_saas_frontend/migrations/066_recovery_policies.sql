-- 066_recovery_policies.sql
-- Introduces configurable recovery policies with normalized steps.
-- Seed data provides Standard, Aggressive, and VIP defaults.

BEGIN;

-- ============================================================
-- 1. recovery_policies — Tenant-specific or system-wide policies
-- ============================================================
CREATE TABLE IF NOT EXISTS recovery_policies (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  system_policy_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rp_tenant ON recovery_policies(tenant_id);

-- ============================================================
-- 2. recovery_policy_steps — Individual steps within a policy
-- ============================================================
CREATE TABLE IF NOT EXISTS recovery_policy_steps (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES recovery_policies(id),
  sequence INT NOT NULL,
  trigger_type TEXT NOT NULL,           -- DUE_DATE | PROMISE_DATE | INVOICE_CREATED | OVERDUE | MANUAL
  offset_days INT NOT NULL DEFAULT 0,
  action_type TEXT NOT NULL,            -- reminder | promise_followup
  template_name TEXT,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rps_policy ON recovery_policy_steps(policy_id, sequence);

-- ============================================================
-- 3. Seed system policies (tenant_id = zeros for system-wide)
-- ============================================================
INSERT INTO recovery_policies (id, tenant_id, name, is_default) VALUES
  ('sys_standard', '00000000-0000-0000-0000-000000000000', 'Standard', true),
  ('sys_aggressive', '00000000-0000-0000-0000-000000000000', 'Aggressive', false),
  ('sys_vip', '00000000-0000-0000-0000-000000000000', 'VIP', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recovery_policy_steps (id, policy_id, sequence, trigger_type, offset_days, action_type, template_name, channel) VALUES
  -- Standard
  ('step_std_1', 'sys_standard', 1, 'DUE_DATE', 0,  'reminder', 'invoice_due',        'whatsapp'),
  ('step_std_2', 'sys_standard', 2, 'DUE_DATE', 3,  'reminder', 'payment_reminder',   'whatsapp'),
  ('step_std_3', 'sys_standard', 3, 'DUE_DATE', 7,  'reminder', 'promise_followup',   'whatsapp'),
  ('step_std_4', 'sys_standard', 4, 'DUE_DATE', 15, 'reminder', 'final_reminder',     'whatsapp'),
  -- Aggressive
  ('step_agg_1', 'sys_aggressive', 1, 'DUE_DATE', 0, 'reminder', 'invoice_due',       'whatsapp'),
  ('step_agg_2', 'sys_aggressive', 2, 'DUE_DATE', 1, 'reminder', 'payment_reminder',  'whatsapp'),
  ('step_agg_3', 'sys_aggressive', 3, 'DUE_DATE', 3, 'reminder', 'promise_followup',  'whatsapp'),
  ('step_agg_4', 'sys_aggressive', 4, 'DUE_DATE', 5, 'reminder', 'final_reminder',    'whatsapp'),
  ('step_agg_5', 'sys_aggressive', 5, 'DUE_DATE', 7, 'reminder', 'final_reminder',    'whatsapp'),
  -- VIP
  ('step_vip_1', 'sys_vip', 1, 'DUE_DATE', 0,  'reminder', 'invoice_due',        'whatsapp'),
  ('step_vip_2', 'sys_vip', 2, 'DUE_DATE', 5,  'reminder', 'payment_reminder',   'whatsapp'),
  ('step_vip_3', 'sys_vip', 3, 'DUE_DATE', 12, 'reminder', 'final_reminder',     'whatsapp')
ON CONFLICT (id) DO NOTHING;

COMMIT;
