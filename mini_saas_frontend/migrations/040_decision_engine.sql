-- ============================================================
-- Decision Engine v1 — Pre-Send Checklist & Audit Log
-- ============================================================
--
-- Sprint A: recovery_decisions table (append-only audit log)
-- Sprint B: customer_tier, merchant interaction tracking
--
-- Every reminder send/block decision is recorded so we can
-- answer "WHY was this message sent?" for any invoice.
-- ============================================================

-- ============================================================
-- 1. CUSTOMER TIER — Controls escalation ceiling
-- ============================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_tier TEXT
  NOT NULL DEFAULT 'regular'
  CHECK (customer_tier IN ('vip', 'regular', 'risky', 'blacklisted'));

-- ============================================================
-- 2. PHONE VERIFICATION STATUS
-- ============================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_verification TEXT
  NOT NULL DEFAULT 'unknown'
  CHECK (phone_verification IN ('verified', 'unverified', 'unknown'));

-- ============================================================
-- 3. RECOVERY DECISIONS — Append-only decision audit log
-- ============================================================
-- Every canSendReminder() evaluation produces one row.
-- This is NOT a queue — it's an immutable record of what
-- the system decided and why.

CREATE TABLE IF NOT EXISTS recovery_decisions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    TEXT NOT NULL,
  tenant_id     TEXT NOT NULL,
  customer_id   TEXT NOT NULL,
  decision      TEXT NOT NULL CHECK (decision IN ('send', 'block', 'pending_approval')),
  reason        TEXT NOT NULL,
  confidence    NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  rules_checked JSONB NOT NULL DEFAULT '[]'::jsonb,
  rules_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  context_snapshot JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recovery_decisions_invoice
  ON recovery_decisions(invoice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recovery_decisions_tenant
  ON recovery_decisions(tenant_id, created_at DESC);

-- ============================================================
-- 4. CUSTOMER REPUTATION SCORE — Deterministic composite
-- ============================================================
-- Computed from behavioral metrics and payment history.
-- Range: 0–100. Higher = more reliable payer.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS reputation_score INTEGER
  NOT NULL DEFAULT 50
  CHECK (reputation_score >= 0 AND reputation_score <= 100);

-- ============================================================
-- 5. INTERACTION EVENTS — Merchant-initiated contacts
-- ============================================================
-- Tracks manual merchant actions so the decision engine can
-- avoid sending redundant automated reminders.

CREATE TABLE IF NOT EXISTS interaction_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL,
  customer_id   TEXT NOT NULL,
  invoice_id    TEXT,
  event_type    TEXT NOT NULL CHECK (event_type IN (
    'manual_call', 'manual_whatsapp', 'visit', 'email', 'billzo_reminder'
  )),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interaction_events_lookup
  ON interaction_events(tenant_id, customer_id, created_at DESC);

-- ============================================================
-- 6. PAYMENT PROMISES — Structured promise tracking
-- ============================================================
-- Separate table (not just a state field) to support multiple
-- promises per invoice/case with history.

CREATE TABLE IF NOT EXISTS payment_promises (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL,
  customer_id   TEXT NOT NULL,
  invoice_id    TEXT NOT NULL,
  promise_date  TIMESTAMPTZ NOT NULL,
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fulfilled', 'broken')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_promises_active
  ON payment_promises(tenant_id, customer_id, invoice_id)
  WHERE status = 'active';

-- ============================================================
-- 7. INVOICE: add outstanding_amount and disputed flag
-- ============================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS outstanding_amount NUMERIC(12,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_disputed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS manual_interaction_at TIMESTAMPTZ;
