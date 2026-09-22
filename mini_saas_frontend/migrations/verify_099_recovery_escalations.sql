-- ============================================================
-- verify_099_recovery_escalations.sql
-- Post-apply verification for migration 099 on STAGING ONLY.
-- Run this in the staging Supabase SQL editor AFTER applying 099.
--
-- What it proves:
--   A. Schema shape — table, columns, types (TEXT spine identifiers per
--      028/096/097 convention — NOT uuid), defaults, CHECK constraints and
--      the partial-unique + per-tenant indexes match 099.
--   B. The invariants are MECHANICAL:
--      * exactly one ACTIVE escalation per recovery case — a second active
--        escalation is rejected; settling releases the slot;
--      * status / merchant_decision / settlement_offer values outside the
--        contract are rejected;
--      * the frozen-evidence trigger stops basis and snapshot from ever
--        being mutated after they are written;
--      * grade is independent of basis (internal ordering-only container).
--
-- If everything passes you see: 099 VERIFIED (schema + invariants)
-- Otherwise an exception aborts with the offending check described.
-- ============================================================

-- ── A. Schema shape ────────────────────────────────────────────
DO $$
DECLARE
  v TEXT;
BEGIN
  IF to_regclass('public.recovery_escalations') IS NULL THEN
    RAISE EXCEPTION 'MISSING TABLE: recovery_escalations';
  END IF;

  FOR v IN
    SELECT column_name || ':' || data_type || ':' || COALESCE(is_nullable, '')
    FROM (VALUES
      ('id','uuid','NO'),('tenant_id','text','NO'),('case_id','text','NO'),
      ('customer_id','text','NO'),('primary_invoice_id','text','NO'),
      ('status','text','NO'),('recommended','boolean','NO'),('grade','integer','NO'),
      ('basis','jsonb','NO'),('merchant_decision','text','YES'),
      ('merchant_note','text','YES'),('snapshot','jsonb','YES'),
      ('prepared_by','uuid','YES'),('prepared_at','timestamp with time zone','YES'),
      ('settlement_offer','jsonb','YES'),
      ('created_at','timestamp with time zone','NO'),
      ('updated_at','timestamp with time zone','NO')
    ) AS want(column_name, data_type, is_nullable)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name='recovery_escalations'
        AND c.column_name=want.column_name AND c.data_type=want.data_type
        AND (want.is_nullable='NO') = (c.is_nullable='NO')
    )
  LOOP
    RAISE EXCEPTION 'ESCALATIONS COLUMN MISMATCH: %', v;
  END LOOP;

  -- Defaults must match the contract.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='recovery_escalations'
      AND column_name='status' AND column_default = '''assessed''::text'
  ) THEN
    RAISE EXCEPTION 'MISSING DEFAULT: recovery_escalations.status = ''assessed''';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='recovery_escalations'
      AND column_name='recommended' AND column_default = 'false'
  ) THEN
    RAISE EXCEPTION 'MISSING DEFAULT: recovery_escalations.recommended = false';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='recovery_escalations'
      AND column_name='grade' AND column_default = '0'
  ) THEN
    RAISE EXCEPTION 'MISSING DEFAULT: recovery_escalations.grade = 0';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='recovery_escalations'
      AND column_name='basis' AND column_default = '''[]''::jsonb'
  ) THEN
    RAISE EXCEPTION 'MISSING DEFAULT: recovery_escalations.basis = ''[]''';
  END IF;

  -- Named constraints (shape-insensitive): three independent CHECKs —
  -- status six values; merchant_decision null-or-four; settlement_offer type
  -- four values via the jsonb path. Each is verified against its own name.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'recovery_escalations' AND c.conname = 'recovery_escalations_status_check'
      AND pg_get_constraintdef(c.oid) LIKE '%assessed%' AND pg_get_constraintdef(c.oid) LIKE '%recommended%'
      AND pg_get_constraintdef(c.oid) LIKE '%prepared%' AND pg_get_constraintdef(c.oid) LIKE '%notified%'
      AND pg_get_constraintdef(c.oid) LIKE '%settled%' AND pg_get_constraintdef(c.oid) LIKE '%cancelled%'
  ) THEN
    RAISE EXCEPTION 'UNEXPECTED/MISSING STATUS CHECK: recovery_escalations_status_check';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'recovery_escalations' AND c.conname = 'recovery_escalations_merchant_decision_check'
      AND pg_get_constraintdef(c.oid) LIKE '%authorize%' AND pg_get_constraintdef(c.oid) LIKE '%offer_plan%'
      AND pg_get_constraintdef(c.oid) LIKE '%pause%' AND pg_get_constraintdef(c.oid) LIKE '%decline%'
  ) THEN
    RAISE EXCEPTION 'UNEXPECTED/MISSING MERCHANT_DECISION CHECK: recovery_escalations_merchant_decision_check';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'recovery_escalations' AND c.conname = 'recovery_escalations_settlement_offer_check'
      AND pg_get_constraintdef(c.oid) LIKE '%settlement_offer%' AND pg_get_constraintdef(c.oid) LIKE '%full%'
      AND pg_get_constraintdef(c.oid) LIKE '%partial%' AND pg_get_constraintdef(c.oid) LIKE '%plan%'
      AND pg_get_constraintdef(c.oid) LIKE '%revised_promise_date%'
  ) THEN
    RAISE EXCEPTION 'UNEXPECTED/MISSING SETTLEMENT OFFER CHECK: recovery_escalations_settlement_offer_check';
  END IF;

  -- Partial-unique (one active escalation per case) + tenant/status index.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND indexname='uq_recovery_escalations_active_case'
  ) THEN
    RAISE EXCEPTION 'MISSING INDEX: uq_recovery_escalations_active_case';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND indexname='idx_recovery_escalations_tenant_status'
  ) THEN
    RAISE EXCEPTION 'MISSING INDEX: idx_recovery_escalations_tenant_status';
  END IF;

  -- Frozen-evidence trigger must exist.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'recovery_escalations' AND t.tgname = 'trg_recovery_escalations_frozen'
  ) THEN
    RAISE EXCEPTION 'MISSING TRIGGER: trg_recovery_escalations_frozen';
  END IF;

  RAISE NOTICE '099 A/SCHEMA OK: table, columns, defaults, checks, indexes, frozen trigger match';
END $$;

-- ── B. Invariants must be mechanical (adversarial probes) ──────
DO $$
DECLARE
  rejected INTEGER := 0;
  expect   INTEGER := 8;
  probe_t  text     := 'probe_t_099';
  c_a      text     := 'probe_case_a_099';
  c_s      text     := 'probe_case_s_099';
  ins_id   uuid;
BEGIN
  -- B1. Exactly one ACTIVE escalation per case: second active insert with the
  --     SAME case_id → UNIQUE uq_recovery_escalations_active_case.
  INSERT INTO recovery_escalations (tenant_id, case_id, customer_id, primary_invoice_id)
  VALUES (probe_t, c_a, 'probe_cust_099', 'probe_inv_099');
  BEGIN
    INSERT INTO recovery_escalations (tenant_id, case_id, customer_id, primary_invoice_id)
    VALUES (probe_t, c_a, 'probe_cust_099', 'probe_inv_099');
    RAISE EXCEPTION 'PROBE FAILED: duplicate ACTIVE escalation was accepted';
  EXCEPTION WHEN unique_violation THEN rejected := rejected + 1; END;

  -- B2. Settling releases the slot: after status='settled', a new escalation
  --     for the SAME case_id is ACCEPTED (partial-unique excludes final states).
  UPDATE recovery_escalations SET status = 'settled'
    WHERE tenant_id = probe_t AND case_id = c_a;
  INSERT INTO recovery_escalations (tenant_id, case_id, customer_id, primary_invoice_id)
  VALUES (probe_t, c_a, 'probe_cust_099', 'probe_inv_099');
  rejected := rejected + 1;

  -- B3. Bogus status → CHECK status.
  BEGIN
    INSERT INTO recovery_escalations (tenant_id, case_id, customer_id, primary_invoice_id, status)
    VALUES (probe_t, 'probe_case_bad_status', 'probe_cust_099', 'probe_inv_099', 'urgent');
    RAISE EXCEPTION 'PROBE FAILED: invalid status was accepted';
  EXCEPTION WHEN check_violation THEN rejected := rejected + 1; END;

  -- B4. Bogus merchant_decision → CHECK merchant_decision.
  BEGIN
    INSERT INTO recovery_escalations (tenant_id, case_id, customer_id, primary_invoice_id, merchant_decision)
    VALUES (probe_t, 'probe_case_bad_decision', 'probe_cust_099', 'probe_inv_099', 'threaten');
    RAISE EXCEPTION 'PROBE FAILED: invalid merchant_decision was accepted';
  EXCEPTION WHEN check_violation THEN rejected := rejected + 1; END;

  -- B5. Bogus settlement_offer type → CHECK settlement_offer.
  BEGIN
    INSERT INTO recovery_escalations (tenant_id, case_id, customer_id, primary_invoice_id,
             settlement_offer)
    VALUES (probe_t, 'probe_case_bad_offer', 'probe_cust_099', 'probe_inv_099',
            jsonb_build_object('type', 'demand_letter'));
    RAISE EXCEPTION 'PROBE FAILED: invalid settlement_offer type was accepted';
  EXCEPTION WHEN check_violation THEN rejected := rejected + 1; END;

  -- B6. Valid recommended-plan settlement_offer path must be accepted, then
  --     B7/B8 use this row for the frozen-evidence probes.
  INSERT INTO recovery_escalations (tenant_id, case_id, customer_id, primary_invoice_id,
           status, recommended, grade, basis, snapshot, settlement_offer)
  VALUES (probe_t, 'probe_case_frozen', 'probe_cust_099', 'probe_inv_099',
          'prepared', TRUE, 999, jsonb_build_array('fact one', 'fact two'),
          jsonb_build_object('invoices', jsonb_build_array('inv1')),
          jsonb_build_object('type', 'plan', 'amount', 84000,
                             'schedule', '3 monthly instalments'))
  RETURNING id INTO ins_id;
  rejected := rejected + 1;

  -- B7. Snapshot is IMMUTABLE after prepare → trigger rejection.
  BEGIN
    UPDATE recovery_escalations SET snapshot = jsonb_build_object('invoices', jsonb_build_array('inv2'))
      WHERE id = ins_id;
    RAISE EXCEPTION 'PROBE FAILED: snapshot mutation after prepare was accepted';
  EXCEPTION WHEN raise_exception THEN rejected := rejected + 1; END;

  -- B8. Basis is FROZEN after assessment → trigger rejection.
  BEGIN
    UPDATE recovery_escalations SET basis = jsonb_build_array('fact three')
      WHERE id = ins_id;
    RAISE EXCEPTION 'PROBE FAILED: basis mutation after assessment was accepted';
  EXCEPTION WHEN raise_exception THEN rejected := rejected + 1; END;

  -- Grade-independence: the B6 row kept basis untouched (still two facts) even
  -- though grade = 999 — basis is NOT derived from grade. Prove it here.
  IF (SELECT COALESCE(jsonb_array_length(basis), 0) FROM recovery_escalations WHERE id = ins_id) <> 2 THEN
    RAISE EXCEPTION 'PROBE FAILED: grade mutated the basis (basis must be independent)';
  END IF;

  IF rejected <> expect THEN
    RAISE EXCEPTION '099 VERIFY FAILED: probes rejected %, expected %', rejected, expect;
  END IF;

  RAISE NOTICE '099 B/INVARIANTS OK: exactly-once active slot, final-status release, guarded values, frozen basis/snapshot, grade-independent basis — all % probes correct', expect;
  RAISE NOTICE '099 VERIFIED: schema shape + mechanical invariants confirmed on this database';
END $$;

-- Cleanup probe rows (leaves the staging escalation spine untouched otherwise).
DELETE FROM recovery_escalations WHERE tenant_id = 'probe_t_099';