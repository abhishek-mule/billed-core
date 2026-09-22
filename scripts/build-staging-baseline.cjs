const fs = require('fs')
const path = require('path')

const dir = path.resolve(__dirname, '../mini_saas_frontend/migrations')
const baseFile = path.resolve(__dirname, '../mini_saas_frontend/schema.sql')

// Pending (not on prod yet) + Superseded — excluded from the staging baseline.
const EXCLUDE = new Set([
  '051_recovery_queue_events.sql', // Superseded
  '053_identity_schema.sql', // Pending
  '054_fix_priority_cases_rpc_filter.sql', // Pending
  '094_authority_runtime_schema.sql', // Pending
  '094_recovery_case_event_idempotency.sql', // Pending
  '095_notifications.sql', // Pending
  '096_recovery_credit_ledger.sql', // Target gate migrations — applied separately AFTER baseline
  '097_recovery_credit_reservations.sql', // Target gate migrations — applied separately AFTER baseline
  '098_recovery_credits_production.sql', // Prod-only consolidation of 096+097 — staging applies 096/097 separately
  '099_recovery_escalations.sql', // Phase C escalation pack — pending; staging applies separately after 096/097 verified
  '100_webhook_inbox.sql', // Webhook inbox gate migration — applied separately AFTER baseline (like 096/097)
])

const n = (f) => parseInt(f.match(/^(\d{3})/)[1], 10)

// Historical replay gaps: relations referenced by a migration but created
// nowhere in the migration history (they existed on prod from earlier manual
// states). The generator injects these CREATE IF NOT EXISTS guards immediately
// BEFORE the migration that first references them, so a fresh staging replay works.
const PRELUDES = {
  '002_workflow_optimization.sql': `-- Replay guard (schema.sql era): audit_logs is referenced by ALTER/INDEX in
-- 002_workflow_optimization but created nowhere in the migration history.
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(255) PRIMARY KEY,
  tenant_id VARCHAR(255) REFERENCES tenants(id),
  user_id VARCHAR(255),
  action VARCHAR(255),
  entity_type VARCHAR(255),
  entity_id VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);`,
  '007_add_ledger_system.sql': `-- Replay guard: ledger_entries (007) was authored expecting customers.id/
-- invoices.id to already be UUID (prod state at the time). On a fresh replay
-- from schema.sql they are VARCHAR, so the FK would not construct. The table
-- is unused by BillZo code; pre-creating it makes 007's CREATE IF NOT EXISTS
-- a no-op (mirroring prod, where the relation already existed).
CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id VARCHAR(255) REFERENCES customers(id) ON DELETE CASCADE,
  invoice_id VARCHAR(255) REFERENCES invoices(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('debit', 'credit')),
  amount NUMERIC(15,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON ledger_entries(customer_id);`,
  '015_evolve_whatsapp_events.sql': `-- Replay guard (schema.sql era): whatsapp_events is referenced by ALTER/INDEX
-- from 015 onwards but created nowhere in the migration history (it existed on
-- prod from an earlier manual state). Pre-creating the full post-046 column set
-- makes every ALTER ... ADD COLUMN IF NOT EXISTS a no-op on fresh replay. Column
-- shape mirrors the domain inserts (whatsapp inbound/outbound telemetry stream).
CREATE TABLE IF NOT EXISTS whatsapp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT,
  phone TEXT,
  phone_number_id TEXT,
  billzo_message_id TEXT,
  parent_billzo_message_id TEXT,
  provider_message_id TEXT,
  conversation_id TEXT,
  direction TEXT DEFAULT 'outbound',
  message_type TEXT,
  event_layer TEXT,
  message_origin TEXT DEFAULT 'automation',
  provider TEXT,
  template TEXT,
  recovery_stage TEXT,
  reminder_stage TEXT,
  recovery_attempt_id TEXT,
  correlation_id UUID,
  transport_message_hash TEXT,
  invoice_id TEXT,
  event_sequence BIGINT DEFAULT 0,
  status TEXT DEFAULT 'queued',
  sync_status TEXT,
  attempt_number INT DEFAULT 1,
  amount NUMERIC,
  error TEXT,
  failure_reason TEXT,
  message_preview TEXT,
  server_ack_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  rate_limited_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  time_to_click_seconds INT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);`,
  '031_add_attributed_amount.sql': `-- Replay guard (schema.sql era): recovery_attributions is referenced by
-- ALTER in 031 and INSERT/UPDATE/comments across 043+ but created nowhere in
-- the migration history (legacy prod table). Shape mirrors the attribution
-- inserts in worker/src/lib/billzo/attribution.ts.
CREATE TABLE IF NOT EXISTS recovery_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  invoice_id TEXT,
  payment_id TEXT,
  reminder_event_id TEXT,
  amount NUMERIC(12,2),
  attributed_amount NUMERIC(12,2),
  attribution_type TEXT,
  attribution_window_hours INT,
  confidence_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);`,
}

const files = fs
  .readdirSync(dir)
  .filter((f) => /^\d{3}_.*\.sql$/.test(f))
  .filter((f) => !EXCLUDE.has(f))
  .sort((a, b) => (n(a) === n(b) ? a.localeCompare(b) : n(a) - n(b)))

const parts = [
  '-- ============================================================================',
  '-- staging_baseline.sql  (GENERATED — do not edit; do not commit)',
  '-- Base schema (schema.sql) + every APPLIED migration (001-093) in documented',
  '-- order (alphabetical within duplicate numbers), for a fresh STAGING database.',
  '-- The migrations are INCREMENTAL: they ALTER/CREATE on top of the base schema,',
  '-- so schema.sql MUST come first (it defines tenants/users/customers/products/',
  '-- invoices/payments/gstr_exports/eway_bills/events + RLS).',
  '-- Excludes: 051 (Superseded), 053/054/094x2/095/098 (Pending on prod), 100 (webhook inbox gate — applied separately after this).',
  '-- After this, apply: 096_recovery_credit_ledger.sql,',
  '--                   097_recovery_credit_reservations.sql,',
  '--                   100_webhook_inbox.sql,',
  '-- then run verify_096, verify_097 and verify_100.',
  '-- Generated from MIGRATION_STATUS.md + git history.',
  '-- ============================================================================',
  '',
  '-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '-- BASE — schema.sql (pre-Supabase baseline the migrations layer on)',
  '-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
]

const base = fs.readFileSync(baseFile, 'utf8').replace(/\s+$/, '')
parts.push(base)
parts.push('')

// REWRITES: migration files whose committed SQL is broken at parse/execution
// time on a fresh replay (they were never actually executed verbatim on prod —
// the relations existed by other means). The generator emits these corrected
// bodies instead. Source files are left untouched (history preserved).
const REWRITES = {
  '028_shadow_recovery_cases.sql': `-- Migration 028: Shadow Recovery Cases for Truth Projection
-- REWRITTEN for replay: original had bare INDEX ... ON ...; statements inside
-- the CREATE TABLE (...) body, which is a 42601 syntax error on any database.
CREATE TABLE IF NOT EXISTS shadow_recovery_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  customer_id UUID NOT NULL,
  total_outstanding NUMERIC DEFAULT 0 NOT NULL,
  total_overdue NUMERIC DEFAULT 0 NOT NULL,
  open_invoice_count INT DEFAULT 0 NOT NULL,
  overdue_invoice_count INT DEFAULT 0 NOT NULL,
  recovery_state recovery_state_v2 NOT NULL DEFAULT 'created',
  next_action_due_at TIMESTAMPTZ,
  projection_version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_src_tenant ON shadow_recovery_cases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_src_customer ON shadow_recovery_cases(customer_id);`,
}

for (const f of files) {
  if (PRELUDES[f]) {
    parts.push(`-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~`)
    parts.push(`-- [replay guard before ${f}]`)
    parts.push(PRELUDES[f])
    parts.push('')
  }
  const body = REWRITES[f] != null ? REWRITES[f] : fs.readFileSync(path.join(dir, f), 'utf8').replace(/\s+$/, '')
  parts.push(`-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~`)
  parts.push(`-- ${f}${REWRITES[f] != null ? '  (REWRITTEN for staging replay)' : ''}`)
  parts.push(`-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~`)
  parts.push(body)
  parts.push('')
}

parts.push('-- ============================ END BASELINE ============================')
const out = path.resolve(__dirname, '../staging_baseline.sql')
fs.writeFileSync(out, parts.join('\n'))
console.log(`Wrote ${files.length} migrations -> ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`)