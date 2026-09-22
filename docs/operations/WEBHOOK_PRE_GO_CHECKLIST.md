# Webhook Inbox — Pre-GO Checklist

Status of the webhook-inbox + recovery-credits slice before the operator makes a GO/NO-GO
call for production. 15 gates ✅, 4 gates ⏳. Production default keeps
`WEBHOOK_DRAIN_ENABLED=false`; nothing is deployed or applied until gate 19 is explicitly
approved.

| # | Gate | Status | Evidence |
| - | --- | --- | --- |
| 1 | Production DB untouched | ✅ | Zero commands against `qdnmuoyqpqdewepzuezp.supabase.co`. All lifecycle work on staging `ktmzbesuqncoctgceypu`. |
| 2 | Staging re-provisioned to production shape | ✅ | DECISIONS 2026-09-19 step-6 gate; full `staging_baseline.sql` + 096/097/100/101 replay. |
| 3 | Migration 098 (consolidated recovery credits) verified | ✅ | Local production-shape DB apply + `verify_096` / `verify_097` PASS; `tenants.recovery_credits_enabled` default `false` confirmed. See `098_recovery_credits_production.sql:16-36`. Rollout policy: `docs/operations/RECOVERY_CREDITS_ROLLOUT.md`. |
| 4 | Migration 100 (webhook inbox) verified | ✅ | `verify_100_webhook_inbox.sql` PASS on staging 2026-09-19; the same contract proven on a Docker PG15 scratch DB. |
| 5 | Migration 101 (inbox alerts) verified | ✅ | `verify_101_webhook_inbox_alerts.sql` PASS on staging 2026-09-19. |
| 6 | Ingest → claim → process lifecycle | ✅ | `worker/scripts/staging-webhook-inbox-verify.ts` (`staging:webhook-inbox`) — every check PASSED on the production-shape staging DB. |
| 7 | Retry/backoff → `dead` (DLQ) → manual requeue | ✅ | Harness: 6x retry with exponential backoff → `dead` → guarded `requeueWebhookEvent` → `done`. Worker tests cover backoff doubling, 5th-not-dead, 6th→dead (see DECISIONS G2). |
| 8 | Dedupe / idempotency | ✅ | `uq_webhook_inbox_provider_event` + `ON CONFLICT DO NOTHING` (route.ts:95-97); harness duplicate check passed. |
| 9 | Concurrent claim safety | ✅ | `claim_next_webhook_events` under `FOR UPDATE SKIP LOCKED`; parallel two-worker harness probe — zero double-processing (DECISIONS G2). |
| 10 | Tenant attribution | ✅ | `phone_number_id → whatsapp_connections → tenant_id` via shared domain; harness verified attribution on real rows. |
| 11 | Unattributed safety | ✅ | Tenant is never guessed from phone/session/body; consumer skips unattributed rows safely. |
| 12 | NOT NULL writer contract | ✅ | `conversation_id`/`billzo_message_id` audit found + fixed FOUR writers (shared `domain.ts`, `whatsapp-send-direct.ts`, both `meta/webhook/route.ts` insert blocks); regression tests in `meta/webhook/__tests__/route.test.ts`, `webhook-domain.test.ts`, `whatsapp-send-direct.test.ts`. Gate suites green. |
| 13 | Worker activation kill switch | ✅ | `WEBHOOK_DRAIN_ENABLED` default OFF (`worker/src/index.ts`); local `worker/.env.local` ON for dev only; prod stays OFF at GO. |
| 14 | Operational alerts | ✅ | Migration 101 + `worker/src/lib/webhook/inbox-alerts.ts` health watch (dead_rows / retry_storm / queue_stalled / stale_processing; PII-safe; independent of the drain). |
| 15 | Rollback runbook | ✅ | `docs/operations/WEBHOOK_INBOX_ROLLBACK.md` — pause → diagnose → resume, never drop. |
| 16 | Production secrets ownership assigned | ⏳ | Matrix drafted in `docs/operations/WEBHOOK_AUTH_AND_SECRETS.md` (Part B); named owners pending. |
| 17 | Gupshup authentication (sole launch provider) verified | ⏳ | Verified mechanism: Gupshup webhook delivery authenticates by **source-IP allowlisting** against Gupshup's published webhook IP list (partner-docs `gupshup-ip-allowlisting`, 14 IPs, updated 2026-04-20) — no signature exists; `GUPSHUP_WEBHOOK_SECRET` HMAC is a false assumption. Scope decided: **Gupshup-only at launch**, Meta legacy-compat only. Remaining: empirical capture of actual headers/source IP + implement allowlist verification + staging lifecycle test (see `WEBHOOK_AUTH_AND_SECRETS.md` Part A gate-17 path). |
| 18 | Production migration reviewed for GO | ⏳ | Re-review done (see below); applying 098/100/101 + verify scripts to prod is part of gate 19 and not yet performed. |
| 19 | Production activation explicitly approved | ⏳ | Operator decision. No deploy, no migration apply, `WEBHOOK_DRAIN_ENABLED` stays false until approved. |

---

## Gate 18 detail — production migration re-review (098 / 100 / 101)

Re-reviewed 2026-09-19 against the GO bar (idempotency, ordering, mechanical
invariants, rollback, verify scripts):

- **098_recovery_credits_production.sql**: single transactional file (`BEGIN…COMMIT`),
  fully `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS` (idempotent, re-runnable). Adds
  `tenants.recovery_credits_enabled DEFAULT FALSE` (no tenant converted; flag is the
  rollout gate). Exactly-once is DB-enforced (partial unique indexes); `balance_after`
  /`pool_balance_after` never negative (CHECK). No drops, no FK alterations to existing
  tables. Rollback: drop the three new tables + the column — safe because nothing writes
  while the flag is FALSE. Verify = `verify_096` + `verify_097` (assert exactly the DDL
  this file ships; both PASS on production-shape DB).
- **100_webhook_inbox.sql**: single transaction, `CREATE TABLE IF NOT EXISTS` +
  `CREATE UNIQUE/INDEX IF NOT EXISTS` + `CREATE OR REPLACE FUNCTION` (idempotent). No
  RLS on the inbox (matches 090 — service-role only). Verify script proves the G2 claim
  contract incl. lease-reclaim and consumer-owned `attempts`.
- **101_webhook_inbox_alerts.sql**: single transaction, idempotent. Partial unique
  index `(kind) WHERE resolved_at IS NULL` = one active alert per kind. Verify proves
  insert → duplicate-rejected → resolve → re-fire.
- **Ordering**: apply 098 → 100 → 101 in one window; both worker watch and drain tolerate
  missing schema (watch self-retires; drain kill switch OFF), so a mid-sequence stop is
  safe. All three shippers use `gen_random_uuid`/`pgcrypto`; `CREATE EXTENSION IF NOT
  EXISTS pgcrypto` is included in 098 (harmless elsewhere).

**Explicitly out of scope for GO (frozen):** no replay of the 19 legacy baseline gaps
(tracked hardening), no Redis/BullMQ, no realtime LISTEN/NOTIFY, no ML,
no new webhook abstractions.

## Gate 17 detail — Gupshup-only scope, decided

The operator's launch scope is **Gupshup as the sole WhatsApp provider** (Meta Cloud API is
NOT an active launch provider; the legacy `/api/meta/webhook` route stays temporarily as a
compatibility path). Gupshup webhook authentication is verified as **source-IP allowlisting**
against Gupshup's published webhook-delivery IP list — no HMAC, no secret-shared with Meta,
no removal of authentication. The four-step path to clear gate 17 (capture → implement →
staging test → GO) is spelled out in `docs/operations/WEBHOOK_AUTH_AND_SECRETS.md` Part A.
Implementing the allowlist verification in the unified route (replacing the Gupshup HMAC path)
is a code change and needs an unfreeze decision; the capture step itself needs the operator's
Gupshup console. `WEBHOOK_DRAIN_ENABLED` remains false throughout.