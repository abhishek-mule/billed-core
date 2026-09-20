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

## 2026-09-20 — B-04 residual closed: billing webhooks anchored to local subscription row

**Decision:** `order.paid` / `subscription.*` resolve tenants via our
server-created `subscriptions` row (`notes.subscriptionId` must match a local
row whose `tenant_id` equals claimed `tenantId`); invoice-bound orders reuse
the authoritative-order check. No tenant minting from raw notes — the bootstrap
branch now runs only for anchored tenants. Pre-stamping legacy notes fall back
with a loud warn (audited bridge, hit rate visible in logs).

**Why:** B-04 payment-path fix left the billing branches consuming
`notes.tenantId` directly (authenticated but uncorroborated).

**Alternative:** Full authoritative fetch per billing event / hard-reject legacy notes.

**Chosen because:** local-row anchor is one indexed lookup, preserves first-
subscription onboarding, and degrades gracefully for legacy rows.

---

## 2026-09-20 — B-05a: convergence guard on invoice payment apply

**Decision:** Single-statement conditional `UPDATE` (`IS DISTINCT FROM` on
`paid_amount`/`status` + mandatory tenant scoping) in both the
`invoice.mark_paid` capability and `finalizeReconciliation`; duplicates become
INFO no-ops skipping ledger insert and event emissions; distinct payments
serialize on the row lock with the ledger trigger as amount anchor. No contract
changes (`AuthorityResult` untouched); no `executeIdempotent` changes.

**Why:** `executeIdempotent` is check-then-act; both concurrent duplicates ran
the full pipeline (double events). Capability did blind absolute updates.

**Alternative:** Checklist's `apply_payment_atomic` rewrite (rejected: replaces
the authority path, regresses unrelated `executeIdempotent` consumers).

**Chosen because:** guards the existing path; 622 worker + 294 frontend green,
incl. new convergence tests.

---

## 2026-09-20 — B-01 fixed: worker raw endpoints require WORKER_INTERNAL_SECRET HMAC

**Decision:** Guarded `/api/v1/recovery/override`, `/trigger-reminder`,
`/api/whatsapp/pair/*` with inter-service HMAC (existing `hmacSignHttp` scheme,
dedicated secret, fail-closed 503/401/403); deleted dead `clear-override`
(zero callers); `/health`+`/metrics` stay open. Full record: ADR-004.

**Why:** Code audit confirmed unauthenticated mutation endpoints on the
production worker entrypoint with public ingress via Fly `[http_service]`.

**Alternative:** Route proxies through the authority gateway / reuse
AUTHORITY_HMAC_SECRET_APP / IP-allowlist only.

**Chosen because:** smallest safe change — same HMAC scheme, independent secret,
no capability rewiring; allowlisting is complementary, not a substitute.

---

## 2026-09-19 — Launch scope: Gupshup is the sole WhatsApp provider; inbound auth = source-IP allowlisting (verified)

**Decision:** Production webhook traffic is **Gupshup-only** (outbound + inbound). Meta Cloud
API is not an active launch provider; the legacy `/api/meta/webhook` route stays temporarily
as a compatibility path and is not part of the new outbound production path. Gupshup's inbound
webhook authentication was therefore verified against the actual provider configuration: Gupshup
does **not** sign webhooks — the documented and published mechanism is **source-IP allowlisting**
against Gupshup's official webhook-delivery IP list (`partner-docs.gupshup.io/docs/gupshup-ip-allowlisting`,
updated 2026-04-20; 14 IPs incl. 4 added 2026-04-15; the sibling support article differs on one
IP and must be cross-checked during the empirical capture). `GUPSHUP_WEBHOOK_SECRET`'s HMAC role
is a false assumption for Gupshup and is **not** aliased to `META_APP_SECRET`; it retires from the
inbound path. No authentication is removed: the route fails closed on unknown source IP
(authentication-by-allowlist is exactly what Gupshup documents) on top of the existing TLS,
payload suppression, dedupe, and durability boundary.

**Why:** operator context — Meta Business verification succeeded but Meta's billing/credit-card
setup is the blocker, which is why Gupshup was adopted; a Meta-only or dual-provider launch would
re-run the same blocker or add unnecessary complexity.

**Chosen because:** one provider owns production WhatsApp; the Meta compat path is preserved but
dormant. Gate-17 path = capture actual headers/source IP (operator, webhook.site) → implement
IP-allowlist verification in the unified route (unfreeze-needed code change) → staging lifecycle
test (`staging-webhook-inbox-verify.ts`) → production GO with `WEBHOOK_DRAIN_ENABLED=false`
until activation. Recorded in `docs/operations/WEBHOOK_AUTH_AND_SECRETS.md`.

---

## 2026-09-19 — Gupshup webhook authentication VERIFIED: Gupshup does not sign; HMAC contract is a blocker

**Reversed (2026-09-19, scope decision):** the "recommended resolution = Meta-only" phrasing
below is superseded by the entry above (Gupshup-only scope). The core finding stands and is
unaffected: Gupshup produces no signature header; Meta is the only signed channel.

**Decision:** The "Gupshup authentication verified" gate was resolved by reading Gupshup's
actual documentation (not by assuming the HMAC assumption was correct). Verified facts:
Meta signs every webhook POST (`X-Hub-Signature-256` HMAC-SHA256 over the raw body with the
Meta App Secret) and uses a GET `hub.challenge` handshake on (re)subscription — the only
signed channel in this stack. Gupshup's self-serve webhooks have **no signature header of
any kind** (the documented security measure is allowlisting Gupshup's outbound IPs, obtained
from `devsupport@gupshup.io`), and even the v3 partner passthrough that relays Meta-format
payloads documents no signature. Therefore the unified route
(`/api/whatsapp/webhook`, `route.ts:8,36-64,85`) — which fail-closes 401/503 on an HMAC
header that Gupshup never sends — can never accept real Gupshup traffic, and its one env var
`GUPSHUP_WEBHOOK_SECRET` doubles as the key for Meta (it must hold the Meta App Secret
value today); the route also exports no `GET`, so it cannot answer Meta's `hub.challenge`
handshake (the legacy prod route can, `api/meta/webhook/route.ts:97`). Staged lifecycle tests
passed because fixtures sign with the shared secret — they prove the verification code, not
that a provider produces that header.

**Why:** pre-GO requirement "verify the actual mechanism, don't assume 'Gupshup sends HMAC,
therefore verification is correct'". The finding turns gate 17 from "assumed-pass" into a
documented ⏳ blocker.

**Alternative:** assume the signature contract holds and mark the gate green. Rejected: it
is factually false for live Gupshup traffic and would reject every event in production.

**Chosen because:** honest scoping. Recommended resolution = Meta-only launch (set the var
to the Meta App Secret, add a GET handshake to the unified route — a code change needing an
unfreeze decision — then flip Meta's callback URL at activation); Gupshup ingestion deferred
to an IP-allowlist design. Captured in `docs/operations/WEBHOOK_AUTH_AND_SECRETS.md`
(verification + production secret ownership matrix) and the pre-GO checklist
(`docs/operations/WEBHOOK_PRE_GO_CHECKLIST.md`).

---

## 2026-09-19 — Webhook alerts are a PII-safe transition log that survives rollback

**Decision:** migration 101 adds `webhook_inbox_alerts`; the worker health watch
(`worker/src/lib/webhook/inbox-alerts.ts`) inserts `firing`, refreshes only
`detail`, and marks `resolved` per kind (one active alert per kind via a partial
unique index). Detail carries **counts, ages, and opaque row UUIDs only** —
never payload, provider_event_id, phone, or error text (the forensic error stays
in `webhook_inbox.last_error`). The watch runs INDEPENDENTLY of the drain and is
gated by `WEBHOOK_ALERTS_ENABLED` (default ON; retires itself if migration
100/101 is absent), so a `WEBHOOK_DRAIN_ENABLED=false` rollback stays observable.

**Why:** review findings F4/F7 — the dead queue had no alert, no attempt/staleness
sentinel, and "dead" was a log line. The user prioritised alerting before the
rollback runbook: "how will we know something is going wrong?". Alerts are DB
rows + structured logs because no email/Slack channel exists in the repo; the
consumer surface is `webhook_inbox_alerts` queries (see the runbook).

**Alternative:** piggyback on the tenant notification layer (`n`/`ns`). Rejected:
those are tenant-scoped and merchant-facing; operator alerts are global and
must never be routed to a tenant.

**Chosen because:** a transition-only log (healthy queue writes nothing) is
spam-proof, and PII-safe-by-schema is enforceable in tests (the detail JSON is
asserted to contain only allowed keys).

---

## 2026-09-19 — Webhook inbox rollback = pause → diagnose → resume, never drop

**Decision:** captured in `docs/operations/WEBHOOK_INBOX_ROLLBACK.md` — the
rollback procedure is: (1) `WEBHOOK_DRAIN_ENABLED=false` (kill switch) and
re-deploy the worker, (2) confirm the drain stopped and the queue accumulates,
(3) confirm the inbox is intact (continuous ingest = durable boundary held),
(4) diagnose via `webhook_inbox_alerts` + `webhook_inbox.last_error`, requeue
dead rows individually, (5) re-enable after the staging gate passes again.
Dropping `webhook_inbox` is explicitly forbidden in a rollback: a 200 was
already sent to the provider, so those events can never be re-fetched.

**Why:** finding F8 — no rollback procedure existed, and the naive `DROP TABLE`
rollback destroys 200-acked events permanently.

**Alternative:** truncate/re-drop and "replay from provider". Rejected: providers
do not re-deliver acked events; the inbox IS the replay source.

**Chosen because:** the drain kill switch (previous decision) is what makes a
lossless pause possible at all; the runbook sequences it with verification steps
that prove the queue is intact before diagnosing.

---

## 2026-09-19 — Webhook drain gets an activation kill switch (`WEBHOOK_DRAIN_ENABLED`)

**Decision:** the worker's periodic inbox drain (`worker/src/index.ts`) starts **only** when
`WEBHOOK_DRAIN_ENABLED === 'true'`; otherwise it logs that it is disabled and exits. The local
`worker/.env.local` sets it `true` so dev/staging runs are unaffected; anything merged to prod stays OFF
until the flag is set there.

**Why:** finding F9 of the production-readiness review — the drain boot is an uncommitted change, so the
moment it merges it becomes unconditionally ON (autoDeploy) with no environment gate and no kill switch.
A regular deploy must never start consuming inbox rows by accident.

**Alternative:** gate on the existing phase/label config. Rejected: no such concept covers the drain, and
env-var gating is the established convention here (`WEBHOOK_DRAIN_INTERVAL_MS`, etc.).

**Chosen because:** fail-closed by default is the cheapest protection against an accidental activation.

---

## 2026-09-19 — conversation_id bug widened: three more live writers were dropping rows (NOT NULL audit)

**Decision:** the NOT-NULL sweep (step-6:48) found the `whatsapp_events` writers besides `domain.ts` also
fail the `conversation_id` / `billzo_message_id` NOT NULL contract:
- `frontend/…/whatsapp-send-direct.ts` — never set `conversation_id` → 23502 on every manual send.
- `frontend/…/api/meta/webhook/route.ts` outbound row — set `conversation_id: conversation?.id || null`
  → 23502 whenever Meta reports no conversation.
- `frontend/…/api/meta/webhook/route.ts` inbound row — omitted **both** `billzo_message_id` and
  `conversation_id` → 23502 on every inbound customer reply (this is the route live on prod today).

All three fixed with the same convention as `domain.ts` (`'conv_' || <phone>`, `unknown` fallback;
`billzo_message_id` mirrors the event id). Regression coverage added: fetch-level route tests for the meta
inbound insert (`…/api/meta/webhook/__tests__/route.test.ts`) asserting every NOT NULL column, and a
payload assertion in `whatsapp-send-direct.test.ts`.

**Why:** the W2d fix only covered the shared consumer; the sweep proved the live producers were still
silently losing rows on the same root cause.

**Alternative:** defer to deprecate the legacy route wholesale. Rejected: it is live in prod; the 2-field
fix is the correct cheap stopgap until the unified route replaces it.

**Chosen because:** identical defect, identical fix — one conventions change across all writers, with the
DB-visible contract enforced in tests.

---

## 2026-09-19 — Step 6 gate: staging reprovisioned to production shape; baseline generator hardened

**Decision:** The staging DB (`ktmzbesuqncoctgceypu`) was a 7-table credits-gate database, not the
production schema — the Step-6 webhook lifecycle gate could not run on it. It was re-provisioned to
production shape: recreate `public` + replay `staging_baseline.sql` (schema.sql + 001–093) + apply
096/097/100, then `verify_096/097/100` (all PASS). `scripts/build-staging-baseline.cjs` now also ships
replay guards for two more legacy relations that migrations reference but history never creates —
`whatsapp_events` (before 015) and `recovery_attributions` (before 031) — and 100 is excluded from the
baseline (applied separately after, like 096/097).

**Why:** a fresh replay from the baseline previously failed at migration 015 (`whatsapp_events` does not
exist) and would have at 031. Post-replay, 19 legacy ordering gaps remain on staging (shadow_recovery_cases
enum ordering, recovery_case_events FKs, `payments.customer_id`/`invoices.due_at` index ordering,
`DROP POLICY … ON storage.objects` + `CREATE POLICY … IF NOT EXISTS` syntax errors in 086, the 046
whatsapp_events backfill mixing uuid/text, function default-arg ordering). None touch the webhook domain;
they are tracked hardening, not gate blockers.

**Alternative:** targeted DDL onto the sparse DB. Rejected: creates a schema that diverges from migration
history, corroding the staging gate.

**Chosen because:** only a faithful production-shaped staging can prove the "real event → real consumer →
shared domain" lifecycle — and it immediately did (see below).

---

## 2026-09-19 — BUG (found by Step 6 gate): inbound WhatsApp transport rows silently dropped since 016

**Decision:** `persistInboundWhatsAppEvent`/`persistEchoWhatsAppEvent` in
`packages/shared/src/whatsapp/domain.ts` now always set `conversation_id` (`'conv_' || phone`, falling back
to `'unknown'`) on the `whatsapp_events` insert. Migration `016_phase1_message_identity` made
`conversation_id NOT NULL` (no default), but the frozen route's inbound/echo inserts never supplied it —
so on ANY real database every customer reply produced a **silently swallowed 23502**: supabase-js returns
`{error}` without throwing, the row never persisted, and (worse) the code continued and still wrote the
`recovery_outcomes` row, so the telemetry ledger looked truthful while the transport stream was empty.
Unit tests with mocked DBs could not catch a constraint violation; the Step-6 real-staging harness did
(W2d). Regression tests added in `webhook-domain.test.ts` asserting `conversation_id` on both inserts.

**Why:** data-integrity bug in the recovery telemetry stream (inbound replies) affecting prod-pre-existing
behavior, surfaced by the new gate.

**Alternative:** mask it in staging (add a DEFAULT in the replay guard). Rejected: that would diverge
staging from prod and defeat the gate's purpose.

**Chosen because:** the harness exists precisely to prove real schema behavior; fixing the consumer is the
honest fix and the outbound send path already used the same `conv_…` convention.

---

## 2026-09-19 — Caps: Business/Enterprise reminders −1 → 750 (pilot safety cap)

**Decision:** `REMINDER_MONTHLY_ALLOWANCE` in `@billzo/shared/plan-limits` changes
`business`/`enterprise` from `-1` (unlimited) to a finite **750/month pilot safety cap**.
This is an operational safety limit for the reliability pilot — **not** a final commercial
entitlement. UI surfaces that derived "Unlimited" from the allowance now render the finite
number: the `UsagePill` "Unlimited" badge is removed, the billing usage meter and the send
page quota strip always show `used / limit`, and the "Unlimited reminders"/"∞" fallbacks are
gone. `branches` keep `-1` unlimited for Enterprise. No other limits, recovery credits,
pricing, or billing behavior changed.

**Why:** the worker enforces `reminderMonthlyAllowance` as a hard monthly gate in
`action-executor.ts`; an infinite allowance defeats the caps purpose in the locked
reliability slice and contradicts the finite story told on the pricing page.

**Alternative:** separate "safety cap" vs "commercial limit" fields. Rejected: two numbers
per plan for one concept invites drift; the same single source of truth drives enforcement
and the advertised UI.

**Chosen because:** the one-field model in shared already feeds both the worker gate and the
frontend (`PLAN_LIMITS`, `/api/billing/usage`) so the change needed no new mechanism — and
the finite number is deliberately conservative and reassessable at go-live.

---

## 2026-09-19 — G2: webhook DLQ = `webhook_inbox.status: dead` + worker-owned retry routing

**Decision:** The G2 dead-letter queue is **not a second queue or a separate DLQ table** —
`webhook_inbox.status = 'dead'` IS the DLQ. Retry/dead routing is worker-owned:

```
queued → claim (lease, 5-min) → processing
   ├── success → done (last_error cleared)
   └── failure
         ├── attempts < 6 → queued + attempts+1 + available_at = now + backoff
         └── attempts = 6 → dead (terminal; manual review only)
```

Exponential backoff is `base * 2^(attempt-1)` (`backoffDelayMs`, base 60s, attempts 1–5),
applied by the worker as an `available_at` on the requeue — no worker sleep, the claim RPC
honors it. `attempts` counts failures and is incremented by the worker on failure, never by
the RPC (migration 100 contract: "consumer-owned"). Exit from `dead` is a deliberate manual
action: `requeueWebhookEvent(rowId)` resets `attempts`→0 and the row to immediately-claimable
`queued`, guarded so only a `dead` row can be resurrected; `last_error` (500-char cap) is
retained across requeues for ops visibility and cleared on success.

**Why:** migration 100 already ships the DB-side claim contract — atomic claim under
`FOR UPDATE SKIP LOCKED`, 5-min lease, lease-expiry reclaim, `available_at` gating, and the
`dead` terminal state excluded from claims. G2 therefore needs zero schema/DDL change and
stays a bounded, reviewer-checkable routing change in `worker/src/lib/webhook/inbox-drain.ts`.

**Alternative:** a dedicated `webhook_dlq` table + worker requeue cron. Rejected: duplicates
provenance (row identity lives in `webhook_inbox`), splits the retry and the inbox into two
sources of truth, and buys nothing the existing status enum does not already grant.

**Chosen because:** the DLQ must be *op-visible and reviewable*, not a second store; the
existing `dead` status + `last_error` + `attempts` are exactly the DLQ shape; and capping at
six attempts with a protective manual-gated `requeueWebhookEvent` keeps a poison message from
looping forever while preserving a deliberate human exit.

**Acceptance mapping (all green):** worker tests cover transient-requeue, attempts increment,
backoff doubling, 5th-not-dead, 6th→dead, bounded `last_error`, successful-retry→done, and
manual-requeue safety; `verify_100_webhook_inbox.sql` on the PG15 harness proves the DB side
(lease gating, expired-lease reclaim, dead/done/failed never auto-retried, attempts
consumer-owned, FIFO + p_limit); a parallel two-worker claim probe on the harness proved
disjoint claims (no double-processing).

---

## 2026-09-19 — RC-03: durable webhook processing → real worker + shared domain layer

**Decision:** BillZo webhook processing moves to a **real worker runtime**, scaled back
from the full "async everything" plan to a locked reliability slice (G1 durable inbox,
G2 DLQ, Business/Enterprise safety caps). The webhook domain is extracted into a new
runtime-dependency-free `@billzo/shared/whatsapp` subpath (client-injected), consumed by
both the Next.js webhook route and a new periodic-poll worker queue
(`worker/queues/webhook.ts`) that claims `webhook_inbox` rows via `claim_next_webhook_events`.

Threads:
1. **Frontend route = thin & durable:** `route.ts` only does `auth → parse → normalize →
   buildInboxRows → upsert webhook_inbox → 200` (DB error → 503; no domain persistence,
   no tenant resolution, no pilot events in the request path).
2. **Extraction seam:** `whatsapp-server.ts` (3 fns) + webhook domain
   (`persistInboundWhatsAppEvent`, `persistEchoWhatsAppEvent`, `updateDeliveryStatus`,
   `resolveReplyContext`, `resolveAttemptForMessageId`, `normalizePayload`, `tsToIso`,
   `textBody`) + `sanitizeRaw`/`buildInboxRows` move to `@billzo/shared/whatsapp`, bound to
   an injected `SupabaseClient` at call sites. Shared stays runtime-dependency-free
   (type-only `@supabase/supabase-js` import as devDep).
3. **Worker picks up rows by periodic poll** (BullMQ/interval claimer, mirrors the outbox
   poll precedent, NOT realtime LISTEN/NOTIFY — that stays a noted future enhancement).
   BullMQ is not the queue; the Postgres inbox is. Identity chain is server-side preserved:
   `provider phone_number_id → whatsapp_connections → tenant_id` via the same shared code.
4. **G2 DLQ** belongs in the worker runtime (attempts/backoff/`dead` in the inbox schema,
   mirroring the existing `retry.ts`/`dead_letter` pattern) — Step 4.
5. **Caps** (Business/Enterprise `REMINDER_MONTHLY_ALLOWANCE` −1→750) land in
   `@billzo/shared/plan-limits` — Step 5.

**Why:** `whatsapp-server.ts` + the domain layer have zero Next.js coupling (their only
dep is `supabaseAdmin`, a lazy proxy both runtimes already build identically). The worker
already writes `whatsapp_events` (`send-message-handler.ts:193`) and owns the retry/DLQ
machinery, health endpoints, and logging (outbox/retry/reminders precedent). Shared is
already the WhatsApp home (`services/meta`, `transport/{meta,gupshup}`, injected
`repositories/`) — a `whatsapp` subpath is additive, not a new category.

**Alternative:** frontend cron-drain route (reuse `whatsapp-server.ts` in place; no
extraction). Rejected: serverless request runtime for continuous background work,
cron-tick-dependent latency (a dropped tick stalls the queue), retry/DLQ living in the
wrong runtime, deployment tied to the frontend artifact.

**Chosen because:** the extraction seam is small (155-line single-dep module + pure domain
functions), the worker runtime already exists and owns these tables + DLQ patterns, G2
maps 1:1 onto the inbox schema (`attempts`/`last_error`/`dead`), and shared's
dependency-free convention is preserved via client injection.

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
