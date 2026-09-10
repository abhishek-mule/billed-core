# DECISIONS.md

Every major architectural decision, in reverse-chronological order. Format:

```
YYYY-MM-DD
Decision:
Why:
Alternative:
Chosen because:
```

If a decision is later reversed, add a `Reversed:` line instead of rewriting history.

---

## 2026-09-10 — B-05: recovery_case_event_consumptions race fix (claim-first)

**Decision:** The recovery case state-machine handler is extracted from
`worker/queues/outbox.ts` into `worker/src/lib/recovery/case-machine-handler.ts`
(exports `tryHandleRecoveryCaseStateMachine`, injectable `db`, default `supabaseAdmin`)
and made race-safe with **claim-first idempotency**:

1. Atomic claim at the top: `recovery_case_event_consumptions(source_event_id, case_id)`
   via upsert `{ onConflict: 'source_event_id,case_id', ignoreDuplicates: true }`.
   Only the handler that wins the claim proceeds to mutate; the loser returns early.
2. Brand-new cases use a **deterministic case id** (`deterministicCaseId` — uuidv5 of
   tenant+customer) instead of `crypto.randomUUID()`, so two concurrent handlers for the
   same new customer claim the SAME `(source_event_id, case_id)` key and serialize on the
   first creation. Existing cases keep their id.
3. The post-mutation consumption insert (old step 8) and the no-op-path insert are removed
   — the claim at step 1 is the only idempotency write.
4. On `recovery_cases` upsert failure the claim is **released** (delete) so a retry can
   reprocess the event (retry semantics preserved).

**Why:** Old sequence was read consumption → transition → upsert recovery_cases →
insert consumption (or plain insert for no-op). The claim happened AFTER mutation, and
new cases got a random id per handler, so two concurrent handlers for the same event both
passed the read and both mutated: duplicate `recovery_case_events` log rows, case-version
escalation, or two cases for one new customer. Confirmed P1 during post-P3 hardening.

**Evidence (real handler, in-memory supabase-shaped DB, 6 tests):**
- 2 concurrent handlers for the SAME event → exactly 1 `recovery_cases` upsert, 1
  `recovery_case_events` row, 1 consumption row. (Old code: 2 upserts + 2 log rows.)
- Deterministic case id: same (tenant, customer) → same id; different customer → different;
  RFC 4122 v5 format.
- Replayed event after completion → idempotently skipped (no second mutation).
- Distinct events for the same customer → both process (dedup is per-event, not per-case).
- Upsert failure → claim released → reprocess succeeds exactly once.
- Unsupported event type → ignored, no claim.
- Worker suite now **532/532** (was 527/528); `tsc` + mutation lint clean.

---

**Decision:** The recovery worker now boots the existing authoritative runtime
(`AuthorityRuntime.initialize` → `activate`, gateway on `:10000`, fly `internal_port`,
`/health`) as `worker/src/index.ts` (the real Docker/`start` entry, `dist/src/index.js`),
with capability providers for recovery, invoice, reconciliation, tenant and gstr.
The legacy queue-worker boot (`/worker/index.ts`, which hard-failed on the expired Meta
token) is dead code. Legacy `validate/poll.ts` and `validate/supabase-poll.ts` are NOT
revived. No new decision logic, automation rules, or broad activation against the live
pilot tenant. Schema reconciled to the committed code contract via
`mini_saas_frontend/migrations/094_authority_runtime_schema.sql` (dev DB applied
2026-09-09, production still `Pending` — pilot stance).

**Why:** The authority stack (gateway, executor, outbox dispatcher, capability providers,
authority tables) was fully written + unit-tested but never instantiated; the Fly image
was running a legacy entry that crashed on boot. B-01's scope is "wire the boot, prove it
runs" — not to activate automation.

**Runtime evidence (local, real compiled entry, real DB):**
- Worker boot: PREBOOT → POLICY_READY → CAPABILITIES_READY → AUTHORITY_READY →
  QUEUES_READY → HTTP_READY → RUNNING, gateway `:10000`, `/health` 200 in ≤3 s.
- Gateway auth: valid HMAC → accepted (schema_validation / sovereignty / semantic_dedup /
  capability_resolution "matched 1 capabilities" / policy, all passed); nonce replay → 409;
  invalid signature → 403; unknown source → 403; tampered body → 403. No unauth mutation route.
- Outbox dispatcher (through the booted runtime): seeded `collection_action`
  → `authority_queue_outbox` observed → lease acquired → `recovery.record_attribution.v1`
  executed → `authority_executions` outcome `success`, dispatch attempt `completed`,
  and a `recovery_attributions` row persisted (invoice INV-B01-001, 1250.75, tenant and
  reminder-event match). Cleanup verified.
- Legacy loops: not revived; zero consumers.

**Findings fixed:**
- `authority_queue_dispatch_attempts` PK is `id`; dispatcher terminal UPDATE and
  `markFailed` referenced a non-existent `attempt_id` column → in-progress attempts were
  silently dropped (error swallowed). Fixed → `WHERE id = ...`; `markFailed` now warns on
  failure instead of swallowing.
- `decision-graph.resolveCapabilities` matched capabilities by intentVersion only, never
  intentType → every intent compiled a plan of ALL registered capabilities (e.g.
  `tenant.update_subscription` planned recovery/invoice/reminder/gstr mutations). Fixed →
  `capabilityId.startsWith(intent.intentType)`; probe now shows "matched 1 capabilities".
- `AuthorityOutboxDispatcher.poll()` used `setInterval` without awaiting → overlapping
  polls could dispatch the same outbox twice (lease guard prevented double execution, but
  duplicate attempts were written). Fixed → `_polling` latch.
- Schema drift rows (authority_intents.nonce, authority_execution_leases partial unique
  index, authority_executions summary-row contract, dispatch_attempts columns) reconciled
  via 094.

**Workers tests:** 527/528 — only failure is the pre-existing B-05 race
(`case-machine-race.test.ts`), verified not a regression.

---

## 2026-09-09 — Single recovery decision authority (P3 consolidation)

**Decision:** One decision engine (`recovery_decision` → `buildRecoveryDecision`)
drives every projection: command-center deck → `/api/recovery/summary`,
`/api/recovery/cases`, `/api/recovery/customer`. The legacy queue classifier
(`/api/recovery/queue` GET), the priority engine, recommendation engine,
behavioral/recommendation/relationship-score engines, and the dead work-store
branch were deleted. Execution (`/api/recovery/queue/actions`), events
(`/api/recovery/queue/events`), and the per-customer cases API are kept.
`attentionScore` is presentation-only (sort key), never an eligibility gate.

**Why:** Two classifiers ("legacy queue" + decision engine) were assigning
attention with different rules, and the classifier GET also wrote to the DB
(`recoverWalkInCustomer`), violating "GET must not mutate".

**Alternative:** Rewire every consumer to the command-center payload directly
(rejected: `cashflow` only needs `monthSales`/`totalCollectedToday`/`recentEvents`;
udhar needs decision-derived `priorityCases`; a dedicated summary projection fits
each). Keep the classifier (rejected: duplicate authority).

**Chosen because:** Consumers now read exactly the decision-derived fields they
render; no second engine decides who deserves attention.

**P3-A incident (found by this audit):** `planner.ts:insertSteps` wrote
`channel` into `collection_actions`, which has only `provider` — runtime
`PGRST204`, risking the invoice-created → planning → worker path. Fixed to
`provider: step.channel` (migration 058 contract: `whatsapp|upi|razorpay|null`).

**Behavior notes (deliberate):**
- `priorityCases` now represents **authoritative recovery scope** (customers with
  a `recovery_cases` row), not every financially-overdue customer. Old "virtual
  cases" for invoice-only customers were synthetic classifier output. If product
  later wants every overdue customer in scope, create/maintain real
  `recovery_cases`, do not resurrect synthesis.
- `settings/billing` "Recovered this month" was reading top-level fields that
  were always `undefined` (silently null); it now reads
  `summary.recoveredThisMonth` (attribution spine) and is populated.

**Deferred cleanup:** SQL function `get_priority_cases` is an orphaned DB object
(code references = 0, runtime dependency = none). Removed from code in P3;
function itself left for a normal schema-maintenance migration after one final
dependency search. Not urgent.

---

## 2026-08-01 — Feature gate rejections return unique `code` + `message`

**Decision:** `FeatureGateResult` carries a unique `code` (`TENANT_NOT_FOUND`,
`FEATURE_LOCKED`, `TRIAL_EXPIRED`, `TRIAL_ALREADY_USED`, `TRIAL_IN_PROGRESS`) plus a
human `message`. `error` is kept only as a deprecated alias.

**Why:** Clients were string-matching prose and one generic `FEATURE_LOCKED`
swallowed distinct failure modes, making support and debugging ambiguous.

**Alternative:** Collapse every denial into `FEATURE_LOCKED` (rejected: lost
diagnostics); HTTP status-only signaling (rejected: not machine-readable).

**Chosen because:** Stable, unique codes let clients branch exactly, and distinct
trial states survive intact — never collapsed into a single plan-locked error.

## 2026-08-01 — One scheduler: `collection_actions`; legacy cron deprecated

**Decision:** The worker's `enqueueOverdueReminders()` (5-min interval over
`collection_actions`) is the single production scheduler. The legacy
`/api/cron/reminders` route is marked `@deprecated` and removed from `vercel.json`,
but kept for manual/hotfix invocations until the pilot completes.

**Why:** Two schedulers were drifting (direct-send vs. ledger-driven) and risked
double-sending reminders.

**Alternative:** Delete the legacy route immediately (rejected: no hotfix path
mid-pilot).

**Chosen because:** Deprecate-then-delete is the safe production path; deletion is a
scheduled follow-up after Merchant #1.

## 2026-08-01 — TransportRegistry lives in `@billzo/shared`

**Decision:** All transport (Meta, Baileys, Gupshup, Simulation) routes through one
`TransportRegistry` in `packages/shared`. Adapters are host-agnostic; the worker and
frontend inject dependencies (DB, Redis, sockets) via resolvers/hosts.

**Why:** Three divergent implementations existed (frontend→Meta, worker→Meta,
legacy→Gupshup), each with its own retry/circuit logic.

**Alternative:** Frontend API proxy (rejected: added a hop, kept divergence).

**Chosen because:** Single source of truth; every future channel (SMS, Email, RCS)
plugs into the same abstraction.

## 2026-08-01 — Identity: tenant resolved from `tenant_memberships`; JWT always carries tenant

**Decision:** `resolveTenantForUser` derives the tenant from `tenant_memberships`
(membership-authoritative), falling back to the Redis session. Effective tenant goes
into the JWT; `verifyRequest` never touches the DB on the JWT path.

**Why:** Requests depended on a `bz_tenant` cookie and `/auth/resolve` round-trips;
tenant lookup was repeated per-request.

**Alternative:** Continue cookie-driven resolution (rejected: non-deterministic).

**Chosen because:** The JWT is the deterministic source of truth — no request depends
on cookie lookup or a resolve hop.

## 2026-07 — Reliability: chaos-style tests over happy-path tests

**Decision:** The worker test suite includes failure-injection cases (circuit breaker
open/reset, retry semantics, no-crash on infra failure), not just "does it work".

**Why:** Production failure modes are the merchant's real experience; happy-path-only
tests gave false confidence.

**Alternative:** None (rejected all — this is the only way to know it survives).

**Chosen because:** "Does it survive?" is a different question from "does it work?"
and is the actual pilot criterion.

## 2026-07 — `packages/recovery-domain` consolidation and Analytics postponed

**Decision:** Do NOT extract `packages/recovery-domain` or build Analytics until
2–3 merchants define stable abstractions. No AI features until trust is earned.

**Why:** Recovery heuristics (confidence weighting, promise significance, invoice
view, WhatsApp replies) are still evolving; premature extraction would freeze the
wrong rules.

**Alternative:** Consolidate now (rejected: would enshrine unproven heuristics).

**Chosen because:** Pilot feedback must drive which heuristics become permanent parts
of the recovery domain — not internal ideas.

## 2026-07 — Trial errors stay distinct

**Decision:** Trial denials (`TRIAL_EXPIRED`, `TRIAL_ALREADY_USED`,
`TRIAL_IN_PROGRESS`) are separate gate codes and never collapse into `FEATURE_LOCKED`.

**Why:** Each trial state has a different merchant remedy (upgrade / already used /
waiting); conflating them hid which action the merchant should take.

**Alternative:** Merge all into `FEATURE_LOCKED` (rejected: lost the remedy signal).

**Chosen because:** Distinct codes are cheaper to support and debug than prose
guessing.

## 2026-06 — Orphaned tenants are legacy test data, not a bug

**Decision:** Tenant IDs with no `tenants` row (`tenant_1780724113010_c4fed89b`,
`tenant_1781147720396_1e07b7cd`) are left as-is. No repair migration.

**Why:** Investigation showed no memberships reference them, no migration deletes
them, and no session/tenant keys live in `kv_store` — a legacy June cleanup artifact,
not a live bug.

**Alternative:** Add a cleanup migration (rejected: churn with no user impact).

**Chosen because:** Do not repair what does not affect any live tenant.
