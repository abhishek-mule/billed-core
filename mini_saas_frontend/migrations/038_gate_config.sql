-- ============================================================
-- Phase 5: Mutation Gateway — Per-Domain Enforcement Toggle
-- ============================================================
-- The gate_config table controls whether the MutationGate
-- shadows, warns, or blocks mutations for each business domain.
--
--   shadow → Gate logs all mutations, blocks nothing
--   warn   → Gate logs + emits alert metric on violation
--   block  → Gate rejects violations with structured error
--
-- Rollout strategy (one domain at a time):
--   1. All domains start at 'shadow'
--   2. Move each domain through warn → block after validation
-- ============================================================

CREATE TABLE IF NOT EXISTS gate_config (
  domain     TEXT PRIMARY KEY,
  mode       TEXT NOT NULL DEFAULT 'shadow' CHECK (mode IN ('shadow', 'warn', 'block')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed all domains in 'shadow' mode
INSERT INTO gate_config (domain, mode) VALUES
  ('payment',    'shadow'),
  ('recovery',   'shadow'),
  ('transport',  'shadow'),
  ('behavioral', 'shadow'),
  ('tenant',     'shadow'),
  ('invoice',    'shadow')
ON CONFLICT (domain) DO NOTHING;
