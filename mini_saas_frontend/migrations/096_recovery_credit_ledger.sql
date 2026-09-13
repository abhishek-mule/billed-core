-- 096_recovery_credit_ledger.sql
-- Phase B of the Recovery Credits feature: monthly included recovery credits
-- per plan + purchased (Razorpay) top-ups + idempotent audit-first consumption.
--
-- This migration is CREATE-ONLY and MUST NOT be applied until the Phase B diff
-- has been reviewed and the consumption/deferral code paths land together.
--
-- Design invariants encoded here:
--   * recovery_credit_ledger is an IMMUTABLE append-only audit trail. Every row
--     is a signed, tenant-scoped mutation carrying `balance_after` and
--     `pool_balance_after` snapshots with CHECK (...) >= 0 — the ledger can
--     never describe a negative balance, no matter what the application does.
--   * Exactly-once is DB-enforced per entry type via partial unique indexes:
--       - consumption  UNIQUE(collection_action_id)  — one credit per action
--       - purchase     UNIQUE(order_id)              — one credit grant per order
--       - refund       UNIQUE(order_id)              — at most one refund per order
--       - allocation   UNIQUE(tenant, subscription, period_start) — once per period
--       - expiry       UNIQUE(tenant, subscription, period_start) — once per boundary
--   * Entry types: allocation (included, +), purchase (purchased, +),
--     consumption (included-first else purchased, −), expiry (included, − at
--     period boundary), refund (purchased, −), promotional (either, +). Included
--     credits expire with the period; purchased credits carry forward forever.
--   * recovery_credit_orders is the server-authoritative purchase record. The
--     charged amount is computed server-side from the packet catalog — it is
--     NEVER taken from the client. A paid order produces exactly one 'purchase'
--     ledger row (enforced by the ledger purchase unique index).
--   * Consumption is only EVER written after a successful billable automated
--     action. Deferral (status='deferred' + metadata.deferred_reason) is a
--     scheduler-side decision and never touches collection_actions.amount.
--   * Consumers are gated by tenants.recovery_credits_enabled. Legacy unlimited
--     Business/Enterprise subscribers keep current behaviour — they are never
--     silently converted (an explicit rollout policy flag does that later).
--   * tenant_id is TEXT on both new tables, matching the app's identifier
--     convention (see 087: the entire app uses TEXT identifiers — tenant ids are
--     `tenant_<ts>_<uuid8>` strings, and UUID columns reject them with 22P02).
--     subscription_id is TEXT (069). No FK references are added here — mirroring
--     the FK-free pattern of the tables this ledger interoperates with.

-- 1. Tenant governance flag — credit consumers and UI gate on this column.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS recovery_credits_enabled BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN tenants.recovery_credits_enabled IS
  'When true the tenant participates in the recovery-credits model (monthly included + purchased top-ups, defer-when-exhausted). Legacy subscribers stay FALSE until an explicit rollout policy flag converts them.';

-- 2. Immutable recovery-credit ledger.
-- Entry-type → pool/sign invariants are enforced with CHECK constraints so the
-- ledger makes it MECHANICALLY IMPOSSIBLE to expire or allocate purchased
-- credits, or to grant a negative promotional grant:
--   * expiry  ↦ pool = 'included'  (only the included pool ever expires; the
--     purchased pool is excluded by a CHECK, not by convention)
--   * allocation ↦ pool = 'included'
--   * purchase/refund ↦ pool = 'purchased'
--   * debits (consumption/expiry/refund) are the ONLY negative quantities.
CREATE TABLE IF NOT EXISTS recovery_credit_ledger (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            TEXT NOT NULL,
  entry_type           TEXT NOT NULL
                       CHECK (entry_type IN ('allocation', 'purchase', 'consumption', 'refund', 'promotional', 'expiry')),
  pool                 TEXT NOT NULL CHECK (pool IN ('included', 'purchased')),
  quantity             INTEGER NOT NULL CHECK (quantity <> 0),   -- signed delta
  balance_after        INTEGER NOT NULL CHECK (balance_after >= 0),
  pool_balance_after   INTEGER NOT NULL CHECK (pool_balance_after >= 0),
  subscription_id      TEXT,
  period_start         TIMESTAMPTZ,
  period_end           TIMESTAMPTZ,
  order_id             TEXT,
  collection_action_id TEXT,
  payment_id           TEXT,
  reason               TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Expiry + allocation can only ever touch the INCLUDED pool.
  CONSTRAINT rc_ledger_expiry_pool      CHECK (entry_type <> 'expiry'      OR pool = 'included'),
  CONSTRAINT rc_ledger_allocation_pool  CHECK (entry_type <> 'allocation'  OR pool = 'included'),
  -- Purchase + refund can only ever touch the PURCHASED pool.
  CONSTRAINT rc_ledger_purchase_pool    CHECK (entry_type <> 'purchase'    OR pool = 'purchased'),
  CONSTRAINT rc_ledger_refund_pool      CHECK (entry_type <> 'refund'      OR pool = 'purchased'),
  -- Debits are the only negative quantities; grants are always positive.
  CONSTRAINT rc_ledger_sign             CHECK (entry_type IN ('consumption', 'expiry', 'refund') OR quantity > 0)
);

COMMENT ON TABLE recovery_credit_ledger IS
  'Immutable, tenant-scoped audit trail of recovery credits. balance_after always >= total; pool_balance_after always >= 0 per pool. Entries are signed deltas: allocation/purchase positive, consumption/expiry/refund negative.';
COMMENT ON COLUMN recovery_credit_ledger.collection_action_id IS
  'collection_actions.id consumed by this entry. Set only for entry_type=''consumption'' and UNIQUE there — one credit per successful automated action, ever.';
COMMENT ON COLUMN recovery_credit_ledger.order_id IS
  'recovery_credit_orders reference for purchase/refund entries. UNIQUE per purchase and per refund — no double credit grants.';

-- Exactly-once per entry type.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rc_ledger_consumption_action
  ON recovery_credit_ledger (collection_action_id) WHERE entry_type = 'consumption';
CREATE UNIQUE INDEX IF NOT EXISTS uq_rc_ledger_purchase_order
  ON recovery_credit_ledger (order_id) WHERE entry_type = 'purchase' AND order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rc_ledger_refund_order
  ON recovery_credit_ledger (order_id) WHERE entry_type = 'refund' AND order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rc_ledger_allocation_period
  ON recovery_credit_ledger (tenant_id, subscription_id, period_start) WHERE entry_type = 'allocation';
CREATE UNIQUE INDEX IF NOT EXISTS uq_rc_ledger_expiry_period
  ON recovery_credit_ledger (tenant_id, subscription_id, period_start) WHERE entry_type = 'expiry';

-- Read paths: per-tenant balance reconstruction + period boundaries.
CREATE INDEX IF NOT EXISTS idx_rc_ledger_tenant_created
  ON recovery_credit_ledger (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rc_ledger_period
  ON recovery_credit_ledger (tenant_id, subscription_id, period_start);

-- 3. Server-authoritative purchase orders (Razorpay).
CREATE TABLE IF NOT EXISTS recovery_credit_orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            TEXT NOT NULL,
  razorpay_order_id    TEXT UNIQUE NOT NULL,
  razorpay_payment_id  TEXT,
  packet_code          TEXT NOT NULL,
  credits              INTEGER NOT NULL CHECK (credits > 0),
  amount_paise         INTEGER NOT NULL CHECK (amount_paise > 0),
  currency             TEXT NOT NULL DEFAULT 'INR',
  status               TEXT NOT NULL DEFAULT 'created'
                       CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
  metadata             JSONB NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at              TIMESTAMPTZ
);

COMMENT ON TABLE recovery_credit_orders IS
  'Server-authoritative Razorpay top-up orders. amount_paise is computed server-side from the packet catalog, never supplied by the client. One paid order grants credits exactly once via the ledger purchase unique index.';

CREATE INDEX IF NOT EXISTS idx_rc_orders_tenant_created
  ON recovery_credit_orders (tenant_id, created_at DESC);

-- 4. Document the new deferral status on collection_actions (status is TEXT;
--    the value is written by the scheduler, no schema change required beyond
--    this comment so the canonical status doc stays accurate).
COMMENT ON COLUMN collection_actions.status IS
  'scheduled | in_progress | completed | failed | cancelled | expired | deferred';
COMMENT ON COLUMN collection_actions.metadata IS
  'Provider-specific values only. Core fields (amount, status, action_type, provider) are separate columns. Scheduler writes metadata.deferred_reason for credit-deferred actions.';