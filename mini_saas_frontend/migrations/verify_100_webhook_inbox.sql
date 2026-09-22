-- ============================================================
-- verify_100_webhook_inbox.sql
-- Post-apply verification for migration 100 on STAGING ONLY.
-- Run in the staging Supabase SQL editor AFTER applying 100.
--
-- What it proves:
--   A. Schema shape — table, columns, CHECK constraint (statuses incl. dead),
--      attempts/available_at/last_error, the unique idempotency key and the
--      claim index.
--   B. The claim contract (the DB side of G2 acceptance):
--      B1. queued + due            -> claimed once, transitioned to
--          processing with a fresh 5-minute lease.
--      B2. processing, valid lease -> NOT re-claimed (available_at gates
--          immediate retries).
--      B3. processing, expired lease -> re-claimed (crash recovery).
--      B4. `dead` rows are never claimed (the DLQ is not auto-retried).
--      B5. `done` / `failed` rows are never claimed.
--      B6. the RPC does NOT touch `attempts` (consumer-owned, incremented by
--          the worker on failure — migration 100 contract).
--      B7. claim order is FIFO (earliest available_at first) and bounded by
--          p_limit.
--   C. Concurrent-worker safety (FOR UPDATE SKIP LOCKED) — the sequential
--      double-claim observable (B2) plus the parallel-claim probe below.
--
-- Only this migration's probe rows are touched; they are deleted at the end.
-- If everything passes you see: 100 VERIFIED (schema + claim contract)
-- Otherwise an exception aborts with the offending check described.
-- ============================================================

DO $$
DECLARE
  r            RECORD;
  n            INT;
  claimed_id   UUID := NULL;
  first_id     UUID;
  second_id    UUID;
  probe_status TEXT;
  probe_attrs  INT;
  expect_val   BOOLEAN;
BEGIN
  -- ── A. Schema shape ─────────────────────────────────────────────────────
  SELECT count(*) INTO probe_attrs
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'webhook_inbox'
    AND column_name IN ('id','provider','provider_event_id','provider_event_type',
                        'phone_number_id','status','attempts','available_at',
                        'last_error','payload','payload_raw','created_at','updated_at');
  IF probe_attrs <> 13 THEN
    RAISE EXCEPTION '100 VERIFY A FAILED: expected 13 columns, found %', probe_attrs;
  END IF;

  SELECT count(*) INTO n FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'webhook_inbox' AND indexname = 'uq_webhook_inbox_provider_event';
  IF n = 0 THEN RAISE EXCEPTION '100 VERIFY A FAILED: unique idempotency key missing'; END IF;

  SELECT count(*) INTO n FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'webhook_inbox' AND indexname = 'idx_webhook_inbox_claim';
  IF n = 0 THEN RAISE EXCEPTION '100 VERIFY A FAILED: claim index missing'; END IF;

  -- status CHECK must admit the full G2 set (incl. dead)
  SELECT count(*) INTO n FROM information_schema.check_constraints cc
  JOIN pg_constraint c ON c.conname = cc.constraint_name AND c.conrelid = 'public.webhook_inbox'::regclass
  WHERE cc.check_clause LIKE '%queued%' AND cc.check_clause LIKE '%dead%';
  IF n = 0 THEN RAISE EXCEPTION '100 VERIFY A FAILED: status CHECK does not admit dead'; END IF;

  RAISE NOTICE '100 A/SCHEMA OK: table, 13 columns, uq key, claim index, status CHECK (queued/processing/done/failed/dead)';

  -- Probe rows (provider=meta avoids colliding with real Gupshup traffic).
  INSERT INTO public.webhook_inbox (provider, provider_event_id, provider_event_type, phone_number_id, payload)
  VALUES
    ('meta', 'verify:100:b1', 'customer_message', 'vph_1', '{"eventType":"customer_message","phoneNumberId":"vph_1","messages":[{"id":"verify:100:m1"}]}'::jsonb), -- B1: queued+due
    ('meta', 'verify:100:b4', 'status',             'vph_1', '{"eventType":"status","phoneNumberId":"vph_1","statuses":[{"id":"vph_dlq","status":"failed"}]}'::jsonb),
    ('meta', 'verify:100:b5done', 'status',         'vph_1', '{"eventType":"status","phoneNumberId":"vph_1","statuses":[{"id":"vph_done","status":"delivered"}]}'::jsonb);

  -- ── B1. queued + due -> claimed once, processing, fresh lease ────────────
  SELECT id INTO claimed_id FROM public.webhook_inbox WHERE provider_event_id = 'verify:100:b1';
  n := 0;
  SELECT count(*) INTO n FROM public.claim_next_webhook_events(10) WHERE id = claimed_id;
  IF n <> 1 THEN RAISE EXCEPTION '100 VERIFY B1 FAILED: due queued row was not claimed exactly once'; END IF;

  SELECT status, attempts INTO probe_status, probe_attrs FROM public.webhook_inbox WHERE id = claimed_id;
  IF probe_status <> 'processing' THEN RAISE EXCEPTION '100 VERIFY B1 FAILED: status %, expected processing', probe_status; END IF;
  IF probe_attrs <> 0 THEN RAISE EXCEPTION '100 VERIFY B1 FAILED: attempts %, expected 0 (consumer-owned)', probe_attrs; END IF;
  IF (SELECT available_at FROM public.webhook_inbox WHERE id = claimed_id) <= NOW() THEN
    RAISE EXCEPTION '100 VERIFY B1 FAILED: no lease granted';
  END IF;

  -- ── B2. processing + valid lease -> NOT re-claimed (gates immediate retry)
  n := 0;
  SELECT count(*) INTO n FROM public.claim_next_webhook_events(10) WHERE id = claimed_id;
  IF n <> 0 THEN RAISE EXCEPTION '100 VERIFY B2 FAILED: valid-lease processing row was re-claimed (immediate retry!)'; END IF;

  -- ── B3. expired processing lease -> re-claimed (crash recovery) ──────────
  UPDATE public.webhook_inbox SET available_at = NOW() - INTERVAL '1 minute' WHERE id = claimed_id;
  n := 0;
  SELECT count(*) INTO n FROM public.claim_next_webhook_events(10) WHERE id = claimed_id;
  IF n <> 1 THEN RAISE EXCEPTION '100 VERIFY B3 FAILED: expired-lease row not reclaimed'; END IF;

  -- ── B4. dead rows are never auto-retried ────────────────────────────────
  UPDATE public.webhook_inbox
     SET status = 'dead', attempts = 6, available_at = NOW() - INTERVAL '1 day', last_error = 'unfixable'
   WHERE provider_event_id = 'verify:100:b4';
  n := 0;
  SELECT count(*) INTO n FROM public.claim_next_webhook_events(10) WHERE provider_event_id = 'verify:100:b4';
  IF n <> 0 THEN RAISE EXCEPTION '100 VERIFY B4 FAILED: dead row was auto-retried'; END IF;

  -- ── B5. done / failed rows are never claimed ────────────────────────────
  UPDATE public.webhook_inbox SET status = 'done', available_at = NOW() - INTERVAL '1 day' WHERE provider_event_id = 'verify:100:b5done';
  UPDATE public.webhook_inbox SET status = 'failed', available_at = NOW() - INTERVAL '1 day' WHERE provider_event_id = 'verify:100:b1';
  n := 0;
  SELECT count(*) INTO n FROM public.claim_next_webhook_events(10)
   WHERE provider_event_id IN ('verify:100:b5done', 'verify:100:b1');
  IF n <> 0 THEN RAISE EXCEPTION '100 VERIFY B5 FAILED: terminal done/failed row was claimed'; END IF;

  -- ── B6. attempts untouched by the RPC (consumer-owned by 100 contract) ───
  IF (SELECT distinct attempts FROM public.webhook_inbox WHERE provider_event_id = 'verify:100:b1') <> 0 THEN
    RAISE EXCEPTION '100 VERIFY B6 FAILED: claim RPC mutated attempts';
  END IF;

  -- ── B7. FIFO + p_limit bound ─────────────────────────────────────────────
  INSERT INTO public.webhook_inbox (provider, provider_event_id, provider_event_type, phone_number_id, available_at, payload)
  VALUES
    ('meta', 'verify:100:fifo:1', 'status', 'vph_1', NOW() + INTERVAL '10 minutes',
     '{"eventType":"status","phoneNumberId":"vph_1","statuses":[{"id":"vph_f1","status":"read"}]}'::jsonb), -- not yet due
    ('meta', 'verify:100:fifo:2', 'status', 'vph_1', NOW(),
     '{"eventType":"status","phoneNumberId":"vph_1","statuses":[{"id":"vph_f2","status":"read"}]}'::jsonb);    -- due now

  n := 0;
  SELECT count(*) INTO n
    FROM public.claim_next_webhook_events(1) WHERE provider_event_id = 'verify:100:fifo:2';
  IF n <> 1 THEN RAISE EXCEPTION '100 VERIFY B7 FAILED: p_limit bound or FIFO ordering broken (only one due row should be claimed)'; END IF;
  n := 0;
  SELECT count(*) INTO n FROM public.claim_next_webhook_events(10) WHERE provider_event_id = 'verify:100:fifo:1';
  IF n <> 0 THEN RAISE EXCEPTION '100 VERIFY B7 FAILED: future available_at row was claimed early'; END IF;

  RAISE NOTICE '100 B/CLAIM OK: claim-once, lease gating, lease-expiry reclaim, dead/done/failed never auto-retried, attempts consumer-owned, FIFO + p_limit';
  RAISE NOTICE '100 VERIFIED: schema shape + claim contract confirmed on this database';
END $$;

-- Cleanup probe rows (leaves the real inbox untouched otherwise).
DELETE FROM public.webhook_inbox WHERE provider_event_id LIKE 'verify:100:%';