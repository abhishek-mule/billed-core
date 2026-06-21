# BillZo Event Spine Strategy

> **Goal:** Make the Event Spine so disciplined that the Epistemic Engine *cannot* be lied to.

## The Diagnosis

BillZo's architecture has three structural failures:

| # | Failure | Evidence | Consequence |
|---|---------|----------|-------------|
| 1 | **No Execution Determinism Boundary** | `Date.now()` inside state machine, outbox ordering not guaranteed, no idempotency on attribution | System cannot reproduce itself across time — epistemic invariant "same events → same belief field" is violated |
| 2 | **No Durable Identity Spine** | `billzoMessageId` not propagated across WhatsApp ↔ internal, broken attribution traceability, missing event linking | Cannot reliably trace cause → effect across subsystems — causal graph is local, not global |
| 3 | **Side-effect Infrastructure Pretending to be Event-Driven** | Redis connection churn, polling-based outbox, shadow mutation gate, dual-write paths everywhere | "Event system" is actually "database with notifications" — event stream is not canonical |

## The Stack Inversion

**Current (broken):**
```
Infrastructure (chaotic, side-effect heavy)
  → Event System (partial, polled, unordered)
    → Epistemic Engine (correct, but fed garbage)
```

**Target (correct):**
```
Canonical Event Spine (deterministic, ordered, identity-complete)
  → Identity & Causality Propagation (traceable)
    → Epistemic Resolver (existing engine)
      → Policy Layer → Execution Actuators
```

## The Strategy: 6 Constraint Layers

Each layer is an independent constraint with its own enforcement mechanism. No layer depends on philosophy — each can be verified by code.

---

## Phase 0: Foundation (Week 1)

### Goal: Instrument the current system to measure how often it violates the invariants. No behavioral changes yet. Measurement first.

| Task | Description | Success Criteria | Owner |
|------|-------------|------------------|-------|
| 0.1 | Add runtime metrics for every `Date.now()` call in domain logic | Dashboard showing call frequency per module | Worker |
| 0.2 | Add runtime metrics for outbox events processed out-of-order | Alert when sequence_no decreases for same entity_id | Worker |
| 0.3 | Add runtime metrics for events emitted without `external_refs` | Counter incremented per missing external_ref | Shared |
| 0.4 | Add runtime metrics for dual-write paths (direct DB + outbox) | Per-table counter for direct mutations bypassing spine | Worker |
| 0.5 | Publish metrics to Prometheus / open a `/metrics` endpoint | Worker exposes scrape-able metrics | Infra |

**Deliverable:** `METRICS_PHASE0.md` — dashboard showing current violation rates. Baseline numbers to measure progress against.

**Enforcement:** None yet. Observability only.

---

## Phase 1: Event Spine Invariants (Week 2)

### Goal: Every event that enters the system satisfies a hard contract. Rejected otherwise.

The invariant schema:

```typescript
interface SpineEvent {
  event_id: string              // UUID v7 (time-sortable)
  entity_type: string            // 'invoice' | 'customer' | 'payment' | 'recovery_case'
  entity_id: string              // the domain entity this event is about
  causal_id: string | null       // immediate parent event (optional for root events)
  correlation_id: string         // groups all events from one root trigger
  sequence_no: number            // per (entity_type, entity_id) — strict monotonic
  occurred_at: string            // ISO 8601, set by producer
  ingested_at: string            // ISO 8601, set by spine writer (NOT producer)
  source_system: string          // 'worker' | 'api' | 'webhook' | 'cron' | 'client'
  idempotency_key: string        // unique per logical operation
  payload: Record<string, any>   // event-specific data
  external_refs: {               // identity propagation — see Phase 3
    whatsapp_message_id?: string | null
    razorpay_payment_id?: string | null
    upi_ref?: string | null
    provider_message_id?: string | null
  }
}
```

| Task | Description | Success Criteria | Owner |
|------|-------------|------------------|-------|
| 1.1 | Define `SpineEvent` in `packages/shared/src/spine.ts` with branded types | TypeScript strict type with branded fields | Shared |
| 1.2 | Write runtime guard `SpineWriter.append()` that validates all invariants before writing | `SpineWriter` class rejects invalid events with typed error | Worker |
| 1.3 | Write Supabase CHECK constraint on the events table matching the invariant | DB-level rejection: `INSERT` with missing fields fails | Backend |
| 1.4 | Migrate existing outbox events table to include new invariant columns | Zero-loss migration, backfill `external_refs` where possible | Backend |
| 1.5 | Write unit tests for `SpineWriter` validating every invariant | 100% coverage of rejection cases | Shared |

**Deliverable:** `SpineWriter` class in `packages/shared/src/spine.ts`, Supabase migration, unit tests.

**Enforcement:** Runtime rejection at both app layer (TypeScript) and DB layer (CHECK constraint).

---

## Phase 2: Per-Entity Monotonic Ordering (Week 2-3)

### Goal: Events for the same entity are strictly ordered and cannot be inserted out of sequence.

| Task | Description | Success Criteria | Owner |
|------|-------------|------------------|-------|
| 2.1 | Add `sequence_no` column to events table — per `(entity_type, entity_id)` | DB unique constraint on `(entity_type, entity_id, sequence_no)` | Backend |
| 2.2 | Implement `SequenceGenerator` — atomic counter per entity | Uses `SELECT ... FOR UPDATE` or Redis atomic increment, never `Date.now()` | Worker |
| 2.3 | Wire `SpineWriter.append()` to auto-assign `sequence_no` via `SequenceGenerator` | Writer rejects if sequence would break monotonicity | Worker |
| 2.4 | Add DB trigger that rejects out-of-order inserts on existing events table | `BEFORE INSERT` trigger checks `sequence_no > max(sequence_no)` for entity | Backend |
| 2.5 | Replace outbox polling with `SpineWriter.append()` emitting via LISTEN/NOTIFY | Polling code removed; events pushed to consumers | Worker |
| 2.6 | Update all existing event producers to use `SpineWriter` instead of direct DB writes | Zero direct `outbox.insert()` calls remaining | Worker |

**Deliverable:** Monotonic ordering enforced at DB level. Polling eliminated.

**Enforcement:** DB trigger + unique constraint. `SequenceGenerator` exposed via `SpineWriter` only.

---

## Phase 3: Identity Propagation Graph (Week 3)

### Goal: Every event carries traceable external identity. No event exists without mapped origin.

| Task | Description | Success Criteria | Owner |
|------|-------------|------------------|-------|
| 3.1 | Define `external_refs` schema in `SpineEvent` | Typed field, all external systems mapped | Shared |
| 3.2 | Audit every event producer to ensure `external_refs` is populated | Zero events emitted with missing `external_refs` (null explicitly allowed) | Worker |
| 3.3 | Fix Baileys status emission to propagate `billzoMessageId` through the event chain | Status events carry the original message ID | Worker |
| 3.4 | Write identity resolution function: `resolveExternalRef(ref) → SpineEvent[]` | Given a WhatsApp message ID or Razorpay payment ID, return full event chain | Shared |
| 3.5 | Add CI lint rule: `no-event-without-external-refs` | Build fails if event is emitted without at least one external ref | CI |
| 3.6 | Implement identity quarantine — events with unresolvable external refs go to a separate dead-letter table | Quarantine has alerting; events don't silently disappear | Worker |

**Deliverable:** Every event has `external_refs`. Baileys chain is fixed. CI enforces it.

**Enforcement:** CI lint rule + runtime quarantine for unresolvable events.

---

## Phase 4: Execution Boundary Contract (Week 3-4)

### Goal: Domain logic is pure. No `Date.now()`, no direct DB, no random in business code.

| Task | Description | Success Criteria | Owner |
|------|-------------|------------------|-------|
| 4.1 | Create `DomainContext` type — injects `clock: { now(): string }` instead of `Date.now()` | All domain functions accept `ctx: DomainContext` | Shared |
| 4.2 | Fix `handleMerchantSnoozed` to use injected `ctx.clock.now()` instead of `Date.now()` | Test proves determinism: same input → same output | Worker |
| 4.3 | Audit all `worker/src/lib/recovery/` — eliminate `Date.now()`, `Math.random()`, `crypto.randomUUID()` from business logic | Zero non-deterministic calls in domain logic | Worker |
| 4.4 | Audit all `worker/src/lib/billzo/` — same elimination | Zero non-deterministic calls | Worker |
| 4.5 | Replace `crypto.randomUUID()` with injected `v7()` UUID generator in domain code | UUIDs are time-sortable, not random | Shared |
| 4.6 | Add CI lint rule: `no-date-now-in-domain` + `no-random-in-domain` | Build fails on violation | CI |
| 4.7 | Add runtime guard: `DomainContext` enforcer wraps handler and blocks non-injected time calls | Runtime panic if domain function calls `Date.now()` | Worker |

**Deliverable:** All domain logic is pure + testable + replayable.

**Enforcement:** CI lint rules + runtime guard wrapping every handler.

---

## Phase 5: Mutation Gateway — Graduated Enforcement (Week 4-5)

### Goal: No mutation bypasses the gate. Shadow → Warn → Block transitioned one domain at a time.

| Task | Description | Success Criteria | Owner |
|------|-------------|------------------|-------|
| 5.1 | Create `gate_config` table: `(domain, mode: shadow|warn|block)` | Per-domain toggle, read at runtime | Backend |
| 5.2 | Convert existing `MutationGate` from single-mode to per-domain toggle | Gate reads `gate_config` table, operates per domain | Worker |
| 5.3 | Stage 1 — Set ALL domains to `shadow` | Gate logs all mutations, blocks nothing | Worker |
| 5.4 | Stage 2 — Set `payment` domain to `warn` | Gate logs + sends alert metric on violation | Worker |
| 5.5 | Stage 3 — Set `payment` domain to `block` | Gate rejects violations with structured error | Worker |
| 5.6 | Repeat 5.4-5.5 for each domain: `recovery`, `transport`, `behavioral`, `tenant`, `invoice` | One domain at a time. Rollback if alerts spike. | Worker |
| 5.7 | Add dashboard showing current gate mode per domain + violation count | Operators see real-time gate status | Frontend |
| 5.8 | Write rollback procedure: gate auto-reverts to `shadow` if error rate > threshold | Safe deployment | Infra |

**Deliverable:** Gate enforces all domains. One-by-one transition with rollback safety.

**Enforcement:** DB-backed per-domain toggle with automatic rollback.

---

## Phase 6: Outbox Contract — Push-Based FIFO (Week 5-6)

### Goal: Outbox is push-based, strictly FIFO per entity_id, with no polling ambiguity.

| Task | Description | Success Criteria | Owner |
|------|-------------|------------------|-------|
| 6.1 | Implement Postgres LISTEN/NOTIFY on `events` table insert | Worker receives event push within 100ms of write | Backend |
| 6.2 | Remove polling: `pollOutboxEvents()` → `onEventInserted()` callback | Polling code deleted from `queues/outbox.ts` | Worker |
| 6.3 | Enforce FIFO per entity_id: consumer processes events in `sequence_no` order | No handler sees out-of-order events for same entity | Worker |
| 6.4 | Add dead-letter per entity_id (not global): if one event fails, later ones queue behind it | Entity-level ordering preserved even on failure | Worker |
| 6.5 | Remove Redis connection churn: `SpineWriter` uses persistent connection pool | Redis connections are reused, not created per-poll | Worker |
| 6.6 | Convert 6-lane handler to sequential per-entity pipeline | Lanes still exist but run in order per event, not per batch | Worker |

**Deliverable:** Push-based, entity-ordered, zero-polling outbox.

**Enforcement:** Postgres LISTEN/NOTIFY + entity-sequenced consumer.

---

## Phase 7: Baileys Persistence Fix (Week 6)

### Goal: Baileys auth survives worker restart. No QR re-scan needed.

| Task | Description | Success Criteria | Owner |
|------|-------------|------------------|-------|
| 7.1 | Replace `createInMemoryKeyStore()` with Redis-backed key store using proper serialization | Auth state survives JSON round-trip | Worker |
| 7.2 | Wire `creds.update` to persist to Redis via new store | Every creds change persisted immediately | Worker |
| 7.3 | Add Baileys connection health probe that checks if auth is loadable | Worker detects corrupt auth before creating socket | Worker |
| 7.4 | Add exponential backoff to reconnection: 1s → 2s → 4s → 8s → max 60s | No reconnect loop floods during transient failures | Worker |
| 7.5 | Remove the Proxy wrapper around key store — replace with direct Redis passthrough | No magic. Straightforward key-value store. | Worker |

**Deliverable:** Baileys survives deploys. No QR resets.

**Enforcement:** Unit tests that simulate restart + verify auth is loadable.

---

## Phase 8: Reconciliation & Matching Fixes (Week 6-7)

### Goal: Payment reconciliation is bounded, idempotent, and traceable.

| Task | Description | Success Criteria | Owner |
|------|-------------|------------------|-------|
| 8.1 | Add `LIMIT 200` to fuzzy matching query | Query never loads >200 rows | Worker |
| 8.2 | Add `reconciliation_event_id` to attribution log — link attribution to the exact reconciliation event | Attribution is traceable to specific reconciliation run | Worker |
| 8.3 | Make attribution idempotent: add `(invoice_id, provider_payment_id)` unique constraint | Duplicate attribution runs produce same result | Backend |
| 8.4 | Handle partial payments: multi-row attribution with `remaining_balance` tracking | One payment across multiple invoices is correctly allocated | Worker |
| 8.5 | Handle payment failure regress: if payment is refunded/reversed, return case to previous state | State machine regresses, not stays at `recovered` | Worker |

**Deliverable:** Bounded, idempotent, reversible reconciliation.

**Enforcement:** DB unique constraint + state machine regression path.

---

## Phase 9: Epistemic Engine Reconnection (Week 7-8)

### Goal: Plug the now-clean Event Spine into the Epistemic Resolver. This is where BillZo's core value lives.

| Task | Description | Success Criteria | Owner |
|------|-------------|------------------|-------|
| 9.1 | Rewire `BeliefField` resolver to read from canonical `SpineEvent` stream (not DB projections) | Resolver queries `events` table only | Worker |
| 9.2 | Replace all derived-state reads in cognition pipeline with spine reads | Cognition gets its input from events, not projections | Worker |
| 9.3 | Verify replay: 100 event sequences produce identical `BeliefField` | Determinism test passes | Worker |
| 9.4 | Remove all derived projection tables that are now redundant | Schema cleanup migration | Backend |
| 9.5 | Publish `EVENT_SPINE_SPEC.md` as the operational contract for the system | Living document, versioned with code | Docs |

**Deliverable:** Epistemic engine reads from clean spine. System is self-consistent.

**Enforcement:** Replay test in CI.

---

## Dependency Graph

```
Phase 0 (Measurement) — no deps
    ↓
Phase 1 (Invariants) — needs Phase 0 baseline
    ↓
Phase 2 (Ordering) — needs Phase 1 spine schema
    ↓
Phase 3 (Identity) — needs Phase 1 + Phase 2
    ↓
Phase 4 (Execution Boundaries) — independent of 1-3, can parallelize
    ↓
Phase 5 (Mutation Gate) — needs Phase 1, 2, 3, 4
    ↓
Phase 6 (Outbox) — needs Phase 1, 2
    ↓
Phase 7 (Baileys) — needs Phase 3 (identity propagation)
    ↓
Phase 8 (Reconciliation) — needs Phase 1, 2, 3
    ↓
Phase 9 (Epistemic Reconnection) — needs everything above
```

**Parallelizable:** Phase 4 can run in parallel with Phases 1-3 (different code boundaries).

---

## Success Criteria

| Metric | Current | Target | Phase |
|--------|---------|--------|-------|
| `Date.now()` calls in domain logic | 4+ | 0 | Phase 4 |
| Outbox events processed out-of-order | Unknown (not measured) | 0 | Phase 2 |
| Events without `external_refs` | Unknown | 0 (null explicitly OK) | Phase 3 |
| Baileys re-auth on restart | 100% | 0% | Phase 7 |
| Direct DB writes bypassing spine | 5 known violations | 0 | Phase 5 |
| Polling-based event processing | 1 (10s poll loop) | 0 | Phase 6 |
| Recovery state machine replay determinism | Broken | 100% identical | Phase 4 + 2 |

---

## Non-Goals (What This Plan Explicitly Does Not Do)

- Epistemic resolver math, belief fields, entropy models — those belong in a separate spec
- Feature additions (new capabilities, new UI) — zero feature work until spine is stable
- Performance optimization beyond what's required for correctness — no premature optimization
- Full ERPNext integration — out of scope for this phase
- Multi-provider WhatsApp failover — kept as-is until spine is stable

---

## Risk Register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Phase 5 gate switch causes production incidents | Medium | One domain at a time. Auto-rollback if error rate spikes. Shadow phase measures baseline. |
| Baileys Redis store rewrite breaks existing auth | Low | Test with backup tenant first. Keep old in-memory path as fallback during transition. |
| Phase 2 sequence number migration blocks writes | Low | Run migration offline. `sequence_no` defaults to 0 for existing rows. |
| Phase 8 payment reconciliation changes break existing matched payments | Low | Additive only: new unique constraint doesn't conflict with existing data. |

---

## File Map

```
EVENT_SPINE_STRATEGY.md        ← This file — strategic plan, phases, tasks
EVENT_SPINE_SPEC.md            ← Phase 9 deliverable — operational contract (living)
packages/shared/src/spine.ts   ← Phase 1 — SpineEvent type + SpineWriter
worker/src/lib/spine/          ← Phase 1-3 — SpineWriter implementation
infra/migrations/              ← Phase 1-2 — DB constraints + triggers
worker/src/lib/gate/           ← Phase 5 — MutationGate per-domain toggle
worker/src/lib/outbox/         ← Phase 6 — Push-based FIFO consumer
worker/src/lib/baileys/        ← Phase 7 — Redis-backed key store
worker/src/lib/reconciliation/ ← Phase 8 — Bounded matching + idempotent attribution
```

---

## How to Execute

1. **Start Phase 0 today.** Add metrics. Measure how often the system lies to itself.
2. **Phase 1-3 are the spine.** Everything depends on them. They are the only thing that matters until done.
3. **Phase 4 is independent.** Can be done in parallel with 1-3 by a separate contributor.
4. **Phase 5-7 harden the spine.** Don't start until 1-3 are verified.
5. **Phase 8 reconciles the spine.** Don't start until 1-3 are verified.
6. **Phase 9 reconnects the epistemic engine.** Only when spine is proven clean.

---

*Last updated: 2026-06-09*
*Status: Active — Phase 0 planned*
