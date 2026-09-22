-- ============================================================
-- verify_101_webhook_inbox_alerts.sql
-- Post-apply verification for migration 101 on STAGING ONLY.
-- Run in the staging Supabase SQL editor AFTER applying 101.
--
-- What it proves:
--   A. Schema shape — table, columns, kind/severity/status CHECKs, the one-
--      active-per-kind partial unique index, and the resolved-history index.
--   B. The alert lifecycle at the DB level:
--      B1. an active (firing) row can be inserted.
--      B2. a SECOND firing row for the SAME kind is rejected (the partial
--          unique index) — no spam/fan-out.
--      B3. resolving the firing row frees the slot so a NEW firing row for
--          the same kind can be inserted (re-fire after resolution).
--
-- Only this migration's probe rows are touched; they are deleted at the end.
-- If everything passes you see: 101 VERIFIED (schema + alert lifecycle)
-- Otherwise an exception aborts with the offending check described.
-- ============================================================

DO $$
DECLARE
  n            INT;
  probe_id     UUID;
  col_count    INT;
BEGIN
  -- ── A. Schema shape ─────────────────────────────────────────────────────
  SELECT count(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'webhook_inbox_alerts'
    AND column_name IN ('id','kind','severity','status','detail',
                        'fired_at','resolved_at','created_at','updated_at');
  IF col_count <> 9 THEN
    RAISE EXCEPTION '101 VERIFY A FAILED: expected 9 columns, found %', col_count;
  END IF;

  SELECT count(*) INTO n FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'webhook_inbox_alerts'
    AND indexname = 'uq_webhook_inbox_alerts_active';
  IF n = 0 THEN RAISE EXCEPTION '101 VERIFY A FAILED: one-active-per-kind unique index missing'; END IF;

  SELECT count(*) INTO n FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'webhook_inbox_alerts'
    AND indexname = 'idx_webhook_inbox_alerts_resolved';
  IF n = 0 THEN RAISE EXCEPTION '101 VERIFY A FAILED: resolved-history index missing'; END IF;

  SELECT count(*) INTO n FROM information_schema.check_constraints cc
  JOIN pg_constraint c ON c.conname = cc.constraint_name
    AND c.conrelid = 'public.webhook_inbox_alerts'::regclass
  WHERE cc.check_clause LIKE '%dead_rows%' AND cc.check_clause LIKE '%stale_processing%';
  IF n = 0 THEN RAISE EXCEPTION '101 VERIFY A FAILED: kind CHECK does not admit the four alert kinds'; END IF;

  RAISE NOTICE '101 A/SCHEMA OK: table, 9 columns, active+resolved indexes, kind/severity/status CHECKs';

  -- ── B1. active firing row inserts ───────────────────────────────────────
  INSERT INTO public.webhook_inbox_alerts (kind, severity, status, detail)
  VALUES ('dead_rows', 'critical', 'firing', '{"metrics":{"dead_rows":1}}'::jsonb)
  RETURNING id INTO probe_id;
  IF probe_id IS NULL THEN RAISE EXCEPTION '101 VERIFY B1 FAILED: firing row did not insert'; END IF;

  -- ── B2. second firing row for the same kind is rejected ─────────────────
  BEGIN
    INSERT INTO public.webhook_inbox_alerts (kind, severity, status, detail)
    VALUES ('dead_rows', 'critical', 'firing', '{"metrics":{"dead_rows":1}}'::jsonb);
    RAISE EXCEPTION '101 VERIFY B2 FAILED: duplicate firing row for the same kind was accepted';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE '101 B2 OK: duplicate firing row rejected (one-active-per-kind)';
  END;

  -- ── B3. resolve frees the slot for a re-fire ────────────────────────────
  UPDATE public.webhook_inbox_alerts
     SET status = 'resolved', resolved_at = NOW()
   WHERE id = probe_id AND resolved_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION '101 VERIFY B3 FAILED: resolve update matched nothing'; END IF;

  INSERT INTO public.webhook_inbox_alerts (kind, severity, status, detail)
  VALUES ('dead_rows', 'critical', 'firing', '{"metrics":{"dead_rows":1}}'::jsonb)
  RETURNING id INTO probe_id;
  IF probe_id IS NULL THEN RAISE EXCEPTION '101 VERIFY B3 FAILED: re-fire after resolution failed'; END IF;

  RAISE NOTICE '101 B/LIFECYCLE OK: insert -> duplicate rejected -> resolve -> re-fire accepted';
  RAISE NOTICE '101 VERIFIED: schema shape + alert lifecycle confirmed on this database';
END $$;

-- Cleanup probe rows (leaves real alerts untouched).
DELETE FROM public.webhook_inbox_alerts WHERE kind = 'dead_rows'
  AND detail = '{"metrics":{"dead_rows":1}}'::jsonb;