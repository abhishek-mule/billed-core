-- ============================================================
-- 098_recovery_credits_production.sql
-- Consolidated production migration for the Recovery Credits feature
-- (Phase B). Combines the staging-verified 096 + 097 content into ONE
-- idempotent file so production applies a single migration.
--
-- Provenance:
--   * 096_recovery_credit_ledger.sql        — ledger + orders + tenant gate
--   * 097_recovery_credit_reservations.sql   — reserve-before-send model
--   * Staging gate PASSED 2026-09-17 against the real staging Supabase
--     project (postgres 15): 096/097 apply clean, verify_096 and verify_097
--     both VERIFIED, and the staging E2E harness reported ALL CHECKS PASSED
--     (allocation idempotency, reservation→settle/release, adversarial
--     concurrency, purchase/refund idempotency).
--
-- PRODUCTION ROLLOUT POLICY (encoded here where possible):
--   * tenants.recovery_credits_enabled defaults to FALSE. Every consumer
--     (action-executor, reminders queue, credits API) reads this flag and
--     fails closed: flag FALSE ⇒ legacy unlimited behaviour, never billed,
--     never deferred. NO existing tenant is converted by this migration —
--     conversion happens later ONLY via the deliberate rollout policy flag.
--   * Legacy unlimited Business/Enterprise subscribers are NOT silently
--     converted. The migration is safe to apply ahead of any conversion.
--   * Exactly-once is DB-enforced (partial unique indexes). balance_after
--     and pool_balance_after snapshots can never describe a negative
--     balance (CHECK constraints). These are mechanical, not conventional.
--
-- This file is IDEMPOTENT and safe to re-run: everything is CREATE ... IF
-- NOT EXISTS / ADD COLUMN IF NOT EXISTS. It does NOT drop or alter existing
-- tables beyond adding the gate column and documentation comments.
--
-- Apply in the PRODUCTION Supabase SQL editor (NEVER on the staging-only
-- flow files — this is the production artifact). Then run:
--   verify_096_recovery_credit_ledger.sql
--   verify_097_recovery_credit_reservations.sql
-- ============================================================

BEGIN;

-- gen_random_uuid() support (pre-enabled on Supabase; harmless elsewhere).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Tenant governance flag (default OFF — the rollout gate) ──
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS recovery_credits_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN tenants.recovery_credits_enabled IS
  'When true the tenant participates in the recovery-credits model (monthly included + purchased top-ups, defer-when-exhausted). Legacy subscribers stay FALSE until an explicit rollout policy flag converts them.';

-- ── 2. Immutable recovery-credit ledger ──
-- Entry-type → pool/sign invariants are enforced with CHECK constraints so
-- the ledger makes it MECHANICALLY IMPOSSIBLE to expire or allocate
-- purchased credits, or to grant a negative promotional grant:
--   * expiry  ↦ pool = 'included'  (only the included pool ever expires)
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
  CONSTRAINT rc_ledger_expiry_pool      CHECK (entry_type <> 'expiry'      OR pool = 'included'),
  CONSTRAINT rc_ledger_allocation_pool  CHECK (entry_type <> 'allocation'  OR pool = 'included'),
  CONSTRAINT rc_ledger_purchase_pool    CHECK (entry_type <> 'purchase'    OR pool = 'purchased'),
  CONSTRAINT rc_ledger_refund_pool      CHECK (entry_type <> 'refund'      OR pool = 'purchased'),
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

-- ── 3. Server-authoritative purchase orders (Razorpay) ──
-- amount_paise is computed server-side from the packet catalog — NEVER taken
-- from the client. A paid order produces exactly one 'purchase' ledger row
-- (enforced by the ledger purchase unique index).
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

-- ── 4. In-flight credit reservations (reserve → execute → settle/release) ──
-- A credit is claimed BEFORE an automated action is dispatched and held only
-- for the duration of the send; it is either settled into a real ledger
-- 'consumption' entry after success or released after failure. The global
-- unique index on collection_action_id is an immutable claim tag, so the same
-- automated action can never reserve two credits and can never be
-- double-billed via concurrent dispatches.
CREATE TABLE IF NOT EXISTS public.recovery_credit_reservations (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             text NOT NULL,
    collection_action_id  text NOT NULL,
    pool                  text NOT NULL CHECK (pool IN ('included', 'purchased')),
    status                text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'settled', 'released')),
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    expires_at            timestamptz NOT NULL
);

-- Exactly one reservation per automated action, ever.
CREATE UNIQUE INDEX IF NOT EXISTS uq_recovery_credit_reservations_action
    ON public.recovery_credit_reservations (collection_action_id);

-- Stale-reaper and per-tenant availability reads.
CREATE INDEX IF NOT EXISTS idx_recovery_credit_reservations_tenant_status
    ON public.recovery_credit_reservations (tenant_id, status);

COMMENT ON TABLE public.recovery_credit_reservations IS
    'In-flight credit reservations for automated recovery actions (reserve before send, settle after success, release after failure). Global unique collection_action_id guarantees exactly-once billing per action.';
COMMENT ON COLUMN public.recovery_credit_reservations.tenant_id IS 'Owner tenant (matches public.tenants.id).';
COMMENT ON COLUMN public.recovery_credit_reservations.collection_action_id IS 'Immutable claim tag — the automated action that holds this reservation.';
COMMENT ON COLUMN public.recovery_credit_reservations.pool IS 'Which credit pool the reservation drew from: included or purchased.';
COMMENT ON COLUMN public.recovery_credit_reservations.status IS 'active = credit held in-flight; settled = converted to a ledger consumption entry; released = returned to the pool (failure/stale).';
COMMENT ON COLUMN public.recovery_credit_reservations.expires_at IS 'TTL deadline; a stale sweep releases active rows past this timestamp.';

-- ── 5. Document the new deferral status on collection_actions ──
-- status is TEXT; the value is written by the scheduler. No schema change
-- beyond this comment so the canonical status doc stays accurate.
COMMENT ON COLUMN collection_actions.status IS
  'scheduled | in_progress | completed | failed | cancelled | expired | deferred';
COMMENT ON COLUMN collection_actions.metadata IS
  'Provider-specific values only. Core fields (amount, status, action_type, provider) are separate columns. Scheduler writes metadata.deferred_reason for credit-deferred actions.';

COMMIT;