# Implementation Plan — Event Spine Execution

> **Parent:** `EVENT_SPINE_STRATEGY.md`
> **Goal:** Execute the 9 phases to make the Event Spine deterministic, traceable, and verifiable.

## Current Status

| Phase | Status | Started | Completed | Owner |
|-------|--------|---------|-----------|-------|
| 0 — Measurement | ✅ Complete | 2026-06-09 | 2026-06-09 | Julfi |
| 1 — Invariants | ✅ Phase Complete | 2026-06-09 | 2026-06-09 | Julfi |
| 2 — Ordering | 🔴 Not Started | — | — | — |
| 3 — Identity | 🔴 Not Started | — | — | — |
| 4 — Execution Boundaries | 🔴 Not Started | — | — | — |
| 5 — Mutation Gate | 🔴 Not Started | — | — | — |
| 6 — Outbox | 🔴 Not Started | — | — | — |
| 7 — Baileys Persistence | 🔴 Not Started | — | — | — |
| 8 — Reconciliation | 🔴 Not Started | — | — | — |
| 9 — Epistemic Reconnection | 🔴 Not Started | — | — | — |

## Active Tasks

```
No tasks in progress.
```

## Phase 0 — Measurement Tasks

- [x] 0.1 Add runtime metrics for `Date.now()` in domain logic
- [x] 0.2 Add runtime metrics for out-of-order events
- [x] 0.3 Add runtime metrics for missing `external_refs`
- [x] 0.4 Add runtime metrics for dual-write paths
- [x] 0.5 Publish metrics endpoint
- [ ] 0.6 Document baseline violation rates (after 24h of runtime data)

## Phase 1 — Event Spine Invariants

- [x] 1.1 Define `SpineEvent` in shared types
- [x] 1.2 Write `SpineWriter.append()` runtime guard
- [x] 1.3 Write Supabase CHECK constraint — `migrations/035_event_spine.sql`
- [x] 1.4 Migrate existing events table — `migrations/035_event_spine.sql`
- [x] 1.5 Write unit tests (20 tests for spine.ts)

## Phase 2 — Per-Entity Monotonic Ordering

- [ ] 2.1 Add `sequence_no` column + unique constraint
- [ ] 2.2 Implement `SequenceGenerator`
- [ ] 2.3 Wire `SpineWriter` to auto-assign `sequence_no`
- [ ] 2.4 Add DB trigger for out-of-order rejection
- [ ] 2.5 Replace polling with LISTEN/NOTIFY
- [ ] 2.6 Migrate all producers to `SpineWriter`

## Phase 3 — Identity Propagation

- [ ] 3.1 Define `external_refs` in `SpineEvent`
- [ ] 3.2 Audit all event producers
- [ ] 3.3 Fix Baileys status emission chain
- [ ] 3.4 Write `resolveExternalRef()` function
- [ ] 3.5 Add CI lint rule for external refs
- [ ] 3.6 Implement identity quarantine

## Phase 4 — Execution Boundaries

- [ ] 4.1 Create `DomainContext` type
- [ ] 4.2 Fix `handleMerchantSnoozed` determinism
- [ ] 4.3 Audit `recovery/` for non-deterministic calls
- [ ] 4.4 Audit `billzo/` for non-deterministic calls
- [ ] 4.5 Replace `crypto.randomUUID` with v7 UUID
- [ ] 4.6 Add CI lint rules
- [ ] 4.7 Add runtime `DomainContext` guard

## Phase 5 — Mutation Gate Enforcement

- [ ] 5.1 Create `gate_config` table
- [ ] 5.2 Convert gate to per-domain toggle
- [ ] 5.3 Set all domains to `shadow`
- [ ] 5.4 Transition `payment` to `warn`
- [ ] 5.5 Transition `payment` to `block`
- [ ] 5.6 Repeat for each domain
- [ ] 5.7 Build gate status dashboard
- [ ] 5.8 Write auto-rollback procedure

## Phase 6 — Push-Based Outbox

- [ ] 6.1 Implement LISTEN/NOTIFY consumer
- [ ] 6.2 Remove polling code
- [ ] 6.3 Enforce FIFO per entity_id
- [ ] 6.4 Add entity-level dead letter
- [ ] 6.5 Remove connection churn
- [ ] 6.6 Convert to sequential per-entity pipeline

## Phase 7 — Baileys Persistence

- [ ] 7.1 Replace in-memory key store with Redis-backed
- [ ] 7.2 Wire `creds.update` to persist
- [ ] 7.3 Add auth health probe
- [ ] 7.4 Add exponential backoff to reconnection
- [ ] 7.5 Remove Proxy wrapper

## Phase 8 — Reconciliation Fixes

- [ ] 8.1 Add LIMIT to fuzzy matching
- [ ] 8.2 Link attribution to reconciliation event
- [ ] 8.3 Make attribution idempotent
- [ ] 8.4 Handle partial payments
- [ ] 8.5 Handle payment failure regression

## Phase 9 — Epistemic Reconnection

- [ ] 9.1 Rewire resolver to read from spine
- [ ] 9.2 Replace derived-state reads
- [ ] 9.3 Verify replay determinism
- [ ] 9.4 Remove redundant projection tables
- [ ] 9.5 Publish `EVENT_SPINE_SPEC.md`

## Daily Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-09 | Phase 0: observational only — no behavioral changes. All probes are no-op when disabled. | Establish baseline before any enforcement. If we measure zero violations, we skip Phases 1-8 and go straight to Phase 9. |
| — | — | — |

## Blockers

| Blocker | Affects | Unblocked by |
|---------|---------|--------------|
| — | — | — |
