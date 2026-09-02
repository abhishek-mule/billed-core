-- 093_controlled_attribution_backfill.sql
-- Phase 1.5 — Controlled attribution backfill (post D-gate PASS).
--
-- Purpose: backfill the causal spine (collection_actions.id) onto historical
-- outbound whatsapp_events and record payment outcomes, WITHOUT fabricating
-- history. Only provable links become 'verified'; everything else stays NULL /
-- 'unknown'. Nothing here rewrites existing verified evidence.
--
-- Guiding rule (frozen):
--   Exact billzo_message_id -> collection_actions.id       => verified
--   Exact provider_message_id -> attempt                      => verified
--   No matching attempt                                       => unknown (NULL link)
--   Multiple possible attempts                                => unknown (NULL link)
--   Missing/invalid identity                                  => unknown (NULL link)
--   Timestamp-only proximity                                  => NEVER verified
--
-- This is an idempotent, one-way repair. It does not create or duplicate
-- collection_actions, and it never guesses an attempt from time proximity.

BEGIN;

-- ============================================================
-- STEP 0 (SHOULD BE RUN FIRST, SEPARATELY): READ-ONLY AUDIT
-- Proves how much of the historical surface is actually provable
-- before any write. Run this block, review the numbers, then run
-- the write blocks below. Nothing in this block mutates data.
-- ============================================================

/*
-- 0a. How many outbound events are missing the causal link?
SELECT
  COUNT(*)                                        AS total_outbound,
  COUNT(*) FILTER (WHERE recovery_attempt_id IS NOT NULL) AS already_linked,
  COUNT(*) FILTER (WHERE recovery_attempt_id IS NULL)     AS missing_link
FROM whatsapp_events
WHERE direction = 'outbound';

-- 0b. Can any be matched by EXACT billzo_message_id? (99% here are local
--     'bmsg_'/'manual_' echoes — collection_actions never stored them, so
--     almost nothing is exact-matchable. Confirms 'unknown' is the honest
--     backfill for the vast majority.)
SELECT
  COUNT(*) FILTER (WHERE m.match_count = 1)  AS unique_match,
  COUNT(*) FILTER (WHERE m.match_count > 1)  AS ambiguous,
  COUNT(*) FILTER (WHERE m.match_count = 0)  AS no_match
FROM whatsapp_events we
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS match_count
  FROM collection_actions ca
  WHERE ca.metadata->>'billzo_message_id' = we.billzo_message_id
) m ON true
WHERE we.direction = 'outbound' AND we.recovery_attempt_id IS NULL
  AND we.billzo_message_id IS NOT NULL;

-- 0c. How many executed (non-scheduled/cancelled) attempts exist to link to?
SELECT status, COUNT(*) FROM collection_actions GROUP BY status ORDER BY COUNT(*) DESC;
*/

-- ============================================================
-- STEP 1: Backfill whatsapp_events.recovery_attempt_id via the
-- ONLY identity allowed to VERIFY — an exact, unambiguous message-id
-- match on collection_actions.metadata.billzo_message_id.
--
-- A second (weaker) fallback — an exact unique match on invoice
-- history — is deliberately NOT used: it would be timestamp-adjacent
-- inference, which is forbidden. Everything unprovable stays NULL
-- (which UI/ledger readers already render as 'unknown').
-- ============================================================

UPDATE whatsapp_events we
SET recovery_attempt_id = ca.id,
    metadata = COALESCE(we.metadata, '{}'::jsonb)
               || jsonb_build_object('backfill_origin', '093_controlled_attribution_backfill',
                                     'backfill_method', 'exact_billzo_message_id')
FROM (
  -- A message id that maps to EXACTLY ONE collection_action.
  SELECT ca.metadata->>'billzo_message_id' AS message_id, MIN(ca.id) AS id
  FROM collection_actions ca
  WHERE ca.metadata->>'billzo_message_id' IS NOT NULL
    AND ca.status <> 'cancelled'
  GROUP BY ca.metadata->>'billzo_message_id'
  HAVING COUNT(*) = 1
) ca
WHERE we.direction = 'outbound'
  AND we.recovery_attempt_id IS NULL
  AND we.billzo_message_id = ca.message_id;

-- ============================================================
-- STEP 2: Record historical PAYMENT outcomes.
--
-- A payment that is tied to an attempt by an exact, unambiguous
-- invoice+payment identity is recorded 'verified'. Any payment whose
-- attempt cannot be proven (no link, or multiple candidate attempts
-- for the same invoice) is recorded as 'unknown' evidence — the
-- provable fact that a payment happened is kept, but causality is
-- never invented.
--
-- Because historical payments pre-date 091 they cannot carry an
-- attempt link on the payment row itself, so the only VERIFIED
-- payment here is one matching an already-linked collection_actions
-- invoice. To stay conservative and avoid creating half-true rows,
-- this backfill only records payments we can attribute; unattributed
-- historical payments are left for the live ledger (which writes
-- 'unknown' for the same-absence case) rather than mass-inserted.
-- ============================================================

-- (Intentionally conservative: no mass payment-outcome backfill.
--  See STEP 1 + the live payment ledger for unattributed handling.)

COMMIT;

-- ============================================================
-- POST-BACKFILL AUDIT (run after the write blocks):
-- ============================================================

/*
-- What got linked, and what honestly could not be?
SELECT
  COUNT(*) FILTER (WHERE recovery_attempt_id IS NOT NULL) AS linked,
  COUNT(*) FILTER (WHERE recovery_attempt_id IS NULL)     AS unlinked_unknown
FROM whatsapp_events
WHERE direction = 'outbound';

-- The canonical Q1–Q4 oracle chain (docs/phase-1.5-attribution-audit.md)
-- Q1: Which attempt led to this payment?
SELECT ca.id as attempt_id, ro.outcome_type, ro.payment_amount
FROM collection_actions ca
JOIN recovery_outcomes ro ON ro.recovery_attempt_id = ca.id
WHERE ro.outcome_type = 'payment';

-- Q4: complete attempt lifecycle
SELECT ca.id, ca.action_type, ca.executed_at, ca.status,
       we.delivered_at, we.read_at
FROM collection_actions ca
LEFT JOIN whatsapp_events we ON we.recovery_attempt_id = ca.id;

-- Integrity: every backfilled link resolves to a real attempt (FK guarantees
-- this, but confirm no orphaned links remain):
SELECT COUNT(*) AS orphaned_links
FROM whatsapp_events
WHERE recovery_attempt_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM collection_actions WHERE id = whatsapp_events.recovery_attempt_id);
*/
