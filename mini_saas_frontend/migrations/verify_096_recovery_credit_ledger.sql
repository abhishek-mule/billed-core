-- ============================================================
-- verify_096_recovery_credit_ledger.sql
-- Post-apply verification for migration 096 on STAGING ONLY.
-- Run this in the staging Supabase SQL editor AFTER applying 096.
--
-- What it proves:
--   A. Schema shape — tables, columns, types, named CHECK constraints,
--      partial unique (exactly-once) indexes exactly match 096.
--   B. The invariants are MECHANICAL — adversarial writes that the design
--      forbids must be REJECTED by the schema (this is the "expiry can never
--      touch purchased" proof, run against the real database).
--
-- If everything passes you see: 096 VERIFIED (schema + invariants)
-- Otherwise an exception aborts with the offending check described.
-- ============================================================

-- ── A. Schema shape ────────────────────────────────────────────
DO $$
DECLARE
  v TEXT;
  n INTEGER;
BEGIN
  -- Tables exist.
  IF to_regclass('public.recovery_credit_ledger') IS NULL THEN
    RAISE EXCEPTION 'MISSING TABLE: recovery_credit_ledger';
  END IF;
  IF to_regclass('public.recovery_credit_orders') IS NULL THEN
    RAISE EXCEPTION 'MISSING TABLE: recovery_credit_orders';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tenants'
      AND column_name='recovery_credits_enabled'
  ) THEN
    RAISE EXCEPTION 'MISSING COLUMN: tenants.recovery_credits_enabled';
  END IF;

  -- tenant_id must be TEXT (app identifiers are tenant_<ts>_<uuid8> per 087 — a
  -- UUID column here would reject every insert with 22P02).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='recovery_credit_ledger'
      AND column_name='tenant_id' AND data_type <> 'text'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='recovery_credit_orders'
      AND column_name='tenant_id' AND data_type <> 'text'
  ) THEN
    RAISE EXCEPTION 'TYPE MISMATCH: tenant_id must be TEXT on both new tables';
  END IF;

  -- Ledger core columns present with expected types.
  FOR v IN
    SELECT column_name || ':' || data_type
    FROM (VALUES
      ('id','uuid'),('entry_type','text'),('pool','text'),('quantity','integer'),
      ('balance_after','integer'),('pool_balance_after','integer'),
      ('subscription_id','text'),('period_start','timestamp with time zone'),
      ('period_end','timestamp with time zone'),('order_id','text'),
      ('collection_action_id','text'),('payment_id','text'),('reason','text'),
      ('created_at','timestamp with time zone')
    ) AS want(column_name, data_type)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name='recovery_credit_ledger'
        AND c.column_name=want.column_name AND c.data_type=want.data_type
    )
  LOOP
    RAISE EXCEPTION 'LEDGER COLUMN MISMATCH: %', v;
  END LOOP;

  -- Named CHECK constraints exist (the pool/sign invariant guards).
  FOR v IN
    SELECT conname FROM (VALUES
      ('rc_ledger_expiry_pool'),('rc_ledger_allocation_pool'),
      ('rc_ledger_purchase_pool'),('rc_ledger_refund_pool'),('rc_ledger_sign')
    ) AS want(conname)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid
      WHERE t.relname='recovery_credit_ledger' AND c.conname=want.conname
        AND c.contype='c'
    )
  LOOP
    RAISE EXCEPTION 'MISSING CHECK: %', v;
  END LOOP;

  -- Exactly-once partial unique indexes exist.
  FOR v IN
    SELECT indexname FROM (VALUES
      ('uq_rc_ledger_consumption_action'),('uq_rc_ledger_purchase_order'),
      ('uq_rc_ledger_refund_order'),('uq_rc_ledger_allocation_period'),
      ('uq_rc_ledger_expiry_period'),('idx_rc_ledger_tenant_created'),
      ('idx_rc_ledger_period'),('idx_rc_orders_tenant_created')
    ) AS want(indexname)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_indexes i
      WHERE i.schemaname='public' AND i.indexname=want.indexname
    )
  LOOP
    RAISE EXCEPTION 'MISSING INDEX: %', v;
  END LOOP;

  -- orders.razorpay_order_id is UNIQUE (column UNIQUE constraint → a unique
  -- constraint entry in pg_constraint, not just any index on the column).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'recovery_credit_orders'
      AND c.conname = 'recovery_credit_orders_razorpay_order_id_key'
      AND c.contype = 'u'
  ) THEN
    RAISE EXCEPTION 'MISSING UNIQUE: recovery_credit_orders.razorpay_order_id';
  END IF;

  RAISE NOTICE '096 A/SCHEMA OK: tables, columns, checks, indexes match';
END $$;

-- ── B. Invariants must be mechanical (adversarial probes) ──────
-- Every probe MUST be rejected. If any is accepted, the design guarantee
-- ("expiry can never expire purchased credits") is not enforced by the schema.
DO $$
DECLARE
  rejected INTEGER := 0;
  expect   INTEGER := 8;
BEGIN
  -- B1. Expiry must NEVER touch the purchased pool → CHECK rc_ledger_expiry_pool.
  BEGIN
    INSERT INTO recovery_credit_ledger (tenant_id, entry_type, pool, quantity, balance_after, pool_balance_after)
    VALUES ('probe_t', 'expiry', 'purchased', -10, 0, 0);
    RAISE EXCEPTION 'PROBE FAILED: expiry on purchased pool was accepted';
  EXCEPTION WHEN check_violation THEN rejected := rejected + 1; END;

  -- B2. Allocation must NEVER touch the purchased pool → CHECK rc_ledger_allocation_pool.
  BEGIN
    INSERT INTO recovery_credit_ledger (tenant_id, entry_type, pool, quantity, balance_after, pool_balance_after)
    VALUES ('probe_t', 'allocation', 'purchased', 200, 200, 200);
    RAISE EXCEPTION 'PROBE FAILED: allocation on purchased pool was accepted';
  EXCEPTION WHEN check_violation THEN rejected := rejected + 1; END;

  -- B3. Purchase must NEVER touch the included pool → CHECK rc_ledger_purchase_pool.
  BEGIN
    INSERT INTO recovery_credit_ledger (tenant_id, entry_type, pool, quantity, balance_after, pool_balance_after)
    VALUES ('probe_t', 'purchase', 'included', 50, 50, 50);
    RAISE EXCEPTION 'PROBE FAILED: purchase on included pool was accepted';
  EXCEPTION WHEN check_violation THEN rejected := rejected + 1; END;

  -- B4. Refund must NEVER touch the included pool → CHECK rc_ledger_refund_pool.
  BEGIN
    INSERT INTO recovery_credit_ledger (tenant_id, entry_type, pool, quantity, balance_after, pool_balance_after)
    VALUES ('probe_t', 'refund', 'included', -20, 0, 0);
    RAISE EXCEPTION 'PROBE FAILED: refund on included pool was accepted';
  EXCEPTION WHEN check_violation THEN rejected := rejected + 1; END;

  -- B5. Grants must be positive; only debits may be negative → CHECK rc_ledger_sign.
  BEGIN
    INSERT INTO recovery_credit_ledger (tenant_id, entry_type, pool, quantity, balance_after, pool_balance_after)
    VALUES ('probe_t', 'promotional', 'purchased', -1, 0, 0);
    RAISE EXCEPTION 'PROBE FAILED: negative promotional grant was accepted';
  EXCEPTION WHEN check_violation THEN rejected := rejected + 1; END;

  -- B6. Zero-quantity entries are meaningless → CHECK (quantity <> 0).
  BEGIN
    INSERT INTO recovery_credit_ledger (tenant_id, entry_type, pool, quantity, balance_after, pool_balance_after)
    VALUES ('probe_t', 'consumption', 'included', 0, 5, 5);
    RAISE EXCEPTION 'PROBE FAILED: zero-quantity entry was accepted';
  EXCEPTION WHEN check_violation THEN rejected := rejected + 1; END;

  -- B7. Balance snapshots can never describe a negative balance.
  BEGIN
    INSERT INTO recovery_credit_ledger (tenant_id, entry_type, pool, quantity, balance_after, pool_balance_after)
    VALUES ('probe_t', 'consumption', 'included', -1, -1, -1);
    RAISE EXCEPTION 'PROBE FAILED: negative balance_after was accepted';
  EXCEPTION WHEN check_violation THEN rejected := rejected + 1; END;

  -- B8. Exactly-once consumption: two consumption rows, same collection_action_id
  --     → UNIQUE uq_rc_ledger_consumption_action (23505).
  INSERT INTO recovery_credit_ledger (tenant_id, entry_type, pool, quantity, balance_after, pool_balance_after, collection_action_id)
  VALUES ('probe_t', 'consumption', 'included', -1, 10, 10, 'probe_action_1');
  BEGIN
    INSERT INTO recovery_credit_ledger (tenant_id, entry_type, pool, quantity, balance_after, pool_balance_after, collection_action_id)
    VALUES ('probe_t', 'consumption', 'included', -1, 10, 10, 'probe_action_1');
    RAISE EXCEPTION 'PROBE FAILED: duplicate consumption row was accepted';
  EXCEPTION
    WHEN unique_violation THEN rejected := rejected + 1;
    WHEN check_violation THEN RAISE WARNING 'probe B8 unique check: expected 23505'; END;

  IF rejected <> expect THEN
    RAISE EXCEPTION '096 VERIFY FAILED: probes rejected %, expected %', rejected, expect;
  END IF;

  RAISE NOTICE '096 B/INVARIANTS OK: all % adversarial writes rejected by schema', expect;
  RAISE NOTICE '096 VERIFIED: schema shape + mechanical invariants confirmed on this database';
END $$;