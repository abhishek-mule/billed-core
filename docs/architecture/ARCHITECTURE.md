# BillZo Architecture

Current architecture after the Platform Consolidation Sprint (2026-07/08). Sections
cover the seven pillars the system now stands on: Identity, Transport, Recovery
Domain, Scheduler, Feature Gates, Authority, and Read/Write Models.

Scope: this document describes how the pieces fit together today. It deliberately
freezes feature development — no new capabilities land until the pilot proves the
recovery loop end-to-end.

---

## 1. Identity

**Contract:** every request carries the tenant in the JWT. No request depends on a
`bz_tenant` cookie lookup, and no `/auth/resolve` round-trip is needed to learn the
tenant.

- `mini_saas_frontend/src/lib/billzo/tenant-context.ts`
  - `resolveTenantForUser(userId)` — resolves the tenant from `tenant_memberships`
    (membership-authoritative), falling back to the prior Redis session. Returns
    `MembershipInfo { tenantId, merchantName, membershipRole }`.
  - `buildTenantContext(membership, entitlement)` — merges membership + entitlement
    into the full `TenantContext { tenantId, userId, merchantId, membershipRole,
    plan, planVersion, subscriptionState, isPaid, features, permissions }`.
  - `derivePermissions(membershipRole, isPaid)` — permissions:
    `tenant.manage`, `tenant.access`, `reminders.send`, `recovery.automate`,
    `recovery.queue`, `api.access`.
- Auth routes (`api/auth/login`, `api/auth/supabase`, `api/auth/callback-exchange`)
  all call `resolveTenantForUser`; the effective tenant is written to the session,
  the JWT, and `setAuthCookies`. Redirect target is `/dashboard` when a tenant is
  known, else `/auth/resolve` (that fallback remains only for users with no
  membership yet).
- `api-middleware.ts` — `verifyRequest(request, { resolveContext })`. The JWT path
  never touches the DB. Opt-in `{ resolveContext: true }` returns
  `{ tenantId, userId, context }` via `buildTenantContext` for routes that need the
  full context.

**Test:** `src/lib/billzo/__tests__/tenant-context.test.ts` (membership wins, Redis
fallback, empty result, context merge, safe starter when entitlement is null).

---

## 2. Transport

**Contract:** one shared transport path. A `TransportRegistry` in `@billzo/shared`
is the single routing entry point; provider adapters are host-agnostic (no DB/Redis
imports) with dependencies injected by the host.

- `packages/shared/src/transport/`
  - `types.ts` — `ConnectionState`, `OutboundMessage`, `SendResult`, `ChannelHealth`,
    `TransportAdapter`.
  - `registry.ts` — `TransportRegistry` with optional injected `ProviderResolver`;
    `register / get / getAll / send / getHealth`.
  - `meta.ts` — `MetaAdapter` (env fallback + injected `MetaConfigResolver`; text /
    document / image; boot validation, template loading, health, inbound statuses).
  - `gupshup.ts` — `GupshupAdapter` (injected `GupshupConfigResolver` +
    `CircuitBreakerStore`; the circuit opens after 5 failures and short-circuits).
  - `baileys.ts` — `BaileysAdapter` (injected `BaileysSocketHost` +
    `BaileysTenantResolver`; retries up to `maxRetries` (default 12, injectable) on
    "not connected", fails fast on other errors).
  - `simulation.ts` — `SimulationAdapter` for local/pilot fallback.
- `worker/src/lib/transport/index.ts` re-exports the shared registry + adapters
  (worker-local duplicates were deleted).
- `worker/src/lib/transport/worker-adapters.ts` — worker wiring: `RedisCircuitBreaker`
  (wraps `getRedis()`), `baileysSocketHost` (maps to `lib/baileys-socket`),
  `createWorkerGupshupAdapter()` (config from `messaging_channels.config`),
  `createWorkerBaileysAdapter()` (channel → tenant resolver).
- `worker/index.ts` registers the adapters into the shared registry.
- The frontend manual-send path (`whatsapp-send-direct.ts`) also routes through the
  shared `TransportRegistry.send()` instead of inline provider code.

**Test:** `worker/src/lib/transport/__tests__/chaos.test.ts` — registry resilience,
circuit breaker open/reset, Baileys retry semantics, dispatcher no-crash on infra
failure.

---

## 3. Recovery Domain

**Contract:** the domain is event-driven and append-only. State is a projection,
never a mutable truth.

- `worker/src/lib/recovery/recovery-planner.ts` — **pure** function: policy →
  `collection_actions` (scheduled actions). No I/O, no transport.
- `worker/src/lib/recovery/action-executor.ts` — executes a single scheduled action
  from `collection_actions` end-to-end (marks `in_progress`, emits domain events,
  schedules retry / completes).
- `worker/src/lib/recovery/case-machine.ts` — the recovery case state machine
  (pure transitions; every transition logs to `recovery_case_events`).
- `collection_actions` is the append-only audit log / scheduling ledger; it is
  written by the planner, the scheduler, and payment entry points, and read by the
  scheduler and read-models.

---

## 4. Scheduler

**Contract:** exactly one scheduler. Due work is found from `collection_actions`,
not by scanning invoices ad hoc.

- Active path (production): `worker/queues/reminders.ts` →
  `enqueueOverdueReminders()` — scans `collection_actions` for
  `status='scheduled'`, `action_type IN ('reminder','promise_followup')`,
  `scheduled_at <= now`, bounded by `max_attempts`, enqueues into the reminders
  queue. Driven by `setInterval` every 5 minutes in `worker/index.ts`.
- Also: `mini_saas_frontend/src/app/api/cron/recovery/route.ts` — CRON_SECRET
  protected; dispatch + drain (invoked by an external scheduler).
- **Deprecated (kept only for manual/hotfix, removed from `vercel.json`):**
  `mini_saas_frontend/src/app/api/cron/reminders/route.ts` — legacy direct-send
  scheduler. Delete after the pilot.

---

## 5. Feature Gates

**Contract:** every gate rejection returns a unique `code` + human `message`, so
clients branch on stable codes, never prose.

- `mini_saas_frontend/src/lib/auth/feature-gate.ts` — `requireFeature(tenantId,
  feature, method)` → `FeatureGateResult { allowed, code, message, upgradeTo?,
  isTrial? }`.
  - Unique codes: `TENANT_NOT_FOUND`, `FEATURE_LOCKED`, `TRIAL_EXPIRED`,
    `TRIAL_ALREADY_USED`, `TRIAL_IN_PROGRESS`.
  - Trial states stay distinct — never collapsed into `FEATURE_LOCKED`.
- Consumers:
  - `api/recovery/queue/actions/route.ts` — returns real `gate.code` / `message`;
    404 for `TENANT_NOT_FOUND`, 403 otherwise.
  - `(app)/recovery/queue/page.tsx` — maps `TENANT_NOT_FOUND` to a
    "Session expired — please sign in again" toast.
  - `paywall/check`, `recovery/trial/start`, `recovery/trial/approve` — read the
    gate result directly.

**Test:** `src/lib/auth/__tests__/feature-gate.test.ts` — one test per code, each
asserting `allowed=false`, the exact `code`, and a human `message`.

---

## 6. Authority

**Contract:** the Authority Gateway is the policy-enforcement layer for all state
changes. State changes must pass a capability + policy check before execution.

- `worker/src/lib/authority/`
  - `capabilities.ts` — `CapabilityRegistry`.
  - `executor.ts` — `executePlan(registry, plan, intent, sql)` — the single shared
    execution codepath.
  - `schemas.ts` — `IntentEnvelope`, `ExecutionPlan`.
  - `outbox-dispatcher.ts` — `AuthorityOutboxDispatcher`: polls
    `authority_queue_outbox` for undelivered entries, loads **immutable** plans from
    `authority_plans`, executes via `executePlan`, records every dispatch in
    `authority_queue_dispatch_attempts` (append-only). Lease-guarded via
    `authority_execution_leases`; terminal-success via
    `uq_execution_terminal_success`.
- Invariants: plans are never rehydrated; dispatch attempts are never updated in
  place except for status/completion; a failed poll must never crash the loop.

---

## 7. Read Models

Read models are projections over the event ledger; they never write business state.

- `mini_saas_frontend/src/lib/billzo/recovery-read-model.ts` — aggregated recovery
  read model (cases, actions, invoices, events).
- `mini_saas_frontend/src/lib/billzo/case-projection.ts` — case-focused projection
  from `collection_actions` + events.
- API surfaces: `api/recovery/timeline`, `api/recovery/customer`,
  `api/recovery/case`, `api/recovery/journey/[invoiceId]`, `api/recovery/outcomes`,
  `api/recovery/diagnostics`, `api/recovery/work-queue`. Each merges
  `collection_actions`, `collection_action_events`, and `whatsapp_events` into a
  coherent view.

---

## 8. Write Models

Write paths are append-only or outbox-mediated.

- **Outbox** — domain events are written to the outbox and consumed by the worker
  (projection engine + transport execution).
- `collection_actions` — append-only scheduling/audit ledger (see Recovery Domain).
- `collection_action_events`, `whatsapp_events` — append-only event/audit tables for
  action lifecycle and message delivery.
- `recovery_case_events` — append-only per-case history; a `RecoveryCase` is only
  ever derived from these events.
- No historical fact is ever updated; corrections are new events.

---

## Definition of Done (merchant-facing)

A merchant can run the full recovery loop with zero developer intervention:

1. **Identity is deterministic** — no request depends on `bz_tenant` cookie lookup;
   the JWT always carries the tenant; no `/auth/resolve`.
2. **One transport path** — every outbound message routes through the shared
   `TransportRegistry`.
3. **One scheduler** — due work comes from `collection_actions` only.
4. **Real gate errors** — every gate rejection returns a unique `code`.
5. **Chaos-tested** — the worker reliability suite (circuit breaker, retry, no-crash
   on infra failure) stays green.

Full-loop test: create invoice → schedule → send → pay → cancel → queue / timeline /
workspace update → no duplicates — passes with zero manual DB intervention.
