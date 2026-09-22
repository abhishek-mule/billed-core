-- ============================================================
-- verify_097_recovery_credit_reservations.sql
-- Post-apply verification for migration 097 on STAGING ONLY.
-- Run this in the staging Supabase SQL editor AFTER applying 097.
--
-- What it proves:
--   A. Schema shape — table, columns, types, CHECK constraints and the
--      exactly-once unique + stale-reaper indexes match 097.
--   B. The invariants are MECHANICAL:
--      * a collection action can reserve exactly one credit, ever
--        (the claim tag is immutable — even after settle/release);
--      * pool/status values outside the contract are rejected;
--      * a reservation without a TTL expiry deadline is rejected.
--
-- If everything passes you see: 097 VERIFIED (schema + invariants)
-- Otherwise an exception aborts with the offending check described.
-- ============================================================

-- ── A. Schema shape ────────────────────────────────────────────
DO $$
DECLARE
  v TEXT;
BEGIN
  IF to_regclass('public.recovery_credit_reservations') IS NULL THEN
    RAISE EXCEPTION 'MISSING TABLE: recovery_credit_reservations';
  END IF;

  FOR v IN
    SELECT column_name || ':' || data_type || ':' || COALESCE(is_nullable, '')
    FROM (VALUES
      ('id','uuid','NO'),('tenant_id','text','NO'),
      ('collection_action_id','text','NO'),('pool','text','NO'),
      ('status','text','NO'),('created_at','timestamp with time zone','NO'),
      ('updated_at','timestamp with time zone','NO'),
      ('expires_at','timestamp with time zone','NO')
    ) AS want(column_name, data_type, is_nullable)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name='recovery_credit_reservations'
        AND c.column_name=want.column_name AND c.data_type=want.data_type
        AND (want.is_nullable='NO') = (c.is_nullable='NO')
    )
  LOOP
    RAISE EXCEPTION 'RESERVATIONS COLUMN MISMATCH: %', v;
  END LOOP;

  -- Defaults: status must default to 'active'.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='recovery_credit_reservations'
      AND column_name='status' AND column_default = '''active''::text'
  ) THEN
    RAISE EXCEPTION 'MISSING DEFAULT: recovery_credit_reservations.status = ''active''';
  END IF;

  -- Named constraints: pool ∈ {included,purchased}, status ∈ {active,settled,released}.
  FOR v IN
    SELECT conname || ':' || pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'recovery_credit_reservations'
      AND c.conname LIKE 'recovery_credit_reservations_%_check'
  LOOP
    -- Shape-insensitive: assert the pool check lists both pools and the status
    -- check lists all three states (pg_get_constraintdef paren layout varies).
    IF v NOT LIKE '%''included''::text%''purchased''::text%'
       AND v NOT LIKE '%''active''::text%''settled''::text%''released''::text%' THEN
      RAISE EXCEPTION 'UNEXPECTED CHECK: %', v;
    END IF;
  END LOOP;

  -- Exactly-once claim tag + stale-reaper index.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND indexname='uq_recovery_credit_reservations_action'
  ) THEN
    RAISE EXCEPTION 'MISSING INDEX: uq_recovery_credit_reservations_action';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND indexname='idx_recovery_credit_reservations_tenant_status'
  ) THEN
    RAISE EXCEPTION 'MISSING INDEX: idx_recovery_credit_reservations_tenant_status';
  END IF;

  RAISE NOTICE '097 A/SCHEMA OK: table, columns, checks, defaults, indexes match';
END $$;

-- ── B. Invariants must be mechanical (adversarial probes) ──────
-- Every probe MUST be rejected. If any is accepted, the "exactly-once per
-- automated action" guarantee is not enforced by the schema.
DO $$
DECLARE
  rejected INTEGER := 0;
  expect   INTEGER := 5;
  probe_id text := 'probe_097_res_1';
BEGIN
  -- B1. A collection action can never reserve two credits: second reserve with
  --     the SAME collection_action_id → UNIQUE uq_recovery_credit_reservations_action.
  INSERT INTO recovery_credit_reservations (tenant_id, collection_action_id, pool, expires_at)
  VALUES ('probe_t_097', probe_id, 'included', now() + interval '1 hour');
  BEGIN
    INSERT INTO recovery_credit_reservations (tenant_id, collection_action_id, pool, expires_at)
    VALUES ('probe_t_097', probe_id, 'included', now() + interval '1 hour');
    RAISE EXCEPTION 'PROBE FAILED: duplicate reservation for the same action was accepted';
  EXCEPTION WHEN unique_violation THEN rejected := rejected + 1; END;

  -- B2. The claim tag is IMMUTABLE — settling the first reservation must NOT
  --     free the slot: re-insert after settle → UNIQUE (23505) again.
  UPDATE recovery_credit_reservations SET status = 'settled' WHERE collection_action_id = probe_id;
  BEGIN
    INSERT INTO recovery_credit_reservations (tenant_id, collection_action_id, pool, expires_at)
    VALUES ('probe_t_097', probe_id, 'purchased', now() + interval '1 hour');
    RAISE EXCEPTION 'PROBE FAILED: re-reservation after settle was accepted';
  EXCEPTION WHEN unique_violation THEN rejected := rejected + 1; END;

  -- B3. pool must be included|purchased → CHECK pool.
  BEGIN
    INSERT INTO recovery_credit_reservations (tenant_id, collection_action_id, pool, expires_at)
    VALUES ('probe_t_097', 'probe_097_res_bad_pool', 'expired', now() + interval '1 hour');
    RAISE EXCEPTION 'PROBE FAILED: invalid pool was accepted';
  EXCEPTION WHEN check_violation THEN rejected := rejected + 1; END;

  -- B4. status must be active|settled|released → CHECK status.
  BEGIN
    INSERT INTO recovery_credit_reservations (tenant_id, collection_action_id, pool, status, expires_at)
    VALUES ('probe_t_097', 'probe_097_res_bad_status', 'included', 'consumed', now() + interval '1 hour');
    RAISE EXCEPTION 'PROBE FAILED: invalid status was accepted';
  EXCEPTION WHEN check_violation THEN rejected := rejected + 1; END;

  -- B5. A reservation without a TTL deadline is a leak → NOT NULL expires_at.
  BEGIN
    INSERT INTO recovery_credit_reservations (tenant_id, collection_action_id, pool)
    VALUES ('probe_t_097', 'probe_097_res_no_ttl', 'included');
    RAISE EXCEPTION 'PROBE FAILED: reservation without expires_at was accepted';
  EXCEPTION WHEN not_null_violation THEN rejected := rejected + 1; END;

  IF rejected <> expect THEN
    RAISE EXCEPTION '097 VERIFY FAILED: probes rejected %, expected %', rejected, expect;
  END IF;

  RAISE NOTICE '097 B/INVARIANTS OK: all % adversarial writes rejected by schema', expect;
  RAISE NOTICE '097 VERIFIED: schema shape + mechanical invariants confirmed on this database';
END $$;

-- Cleanup probe rows (leaves the staging ledger untouched otherwise).
DELETE FROM recovery_credit_reservations WHERE tenant_id = 'probe_t_097';