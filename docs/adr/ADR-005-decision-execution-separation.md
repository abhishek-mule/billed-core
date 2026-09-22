# ADR-005: Decision–Execution Separation and Evidence Feedback Loop

- **Status:** Accepted
- **Date:** 2026-09-20
- **Scope:** recovery decisioning and mutation execution (no behavior change —
  architectural clarification recorded while the reasoning is fresh)

## Context

BillZo's recovery path has three safety mechanisms that look similar but solve
different problems: Layer A business rules (`canSendReminder`), execution
guards (duplicate/paid checks, outbox claim, send marker), and Layer B
`AuthorityRuntime` policy enforcement. Without an explicit statement of how
they relate, future work risks merging or deleting one as "duplicated", or
treating a Layer A recommendation as proof a mutation occurred.

## Decision

**Decision–Execution Separation:** Layer A determines whether a recovery
action is permissible based on the evidence available at decision time.
Execution guards provide independent protection against stale or eventually
consistent evidence and against concurrent/duplicate execution. Layer B
AuthorityRuntime remains the mandatory mutation boundary.

The resulting loop is:

**Evidence → Decision → Execution Guard → Authority → Mutation → Event/Evidence
→ updated Decision state.**

Layer A outputs are not treated as authoritative proof that a mutation
occurred.

## Caveat (binding)

Because recovery history can be eventually consistent (async projectors feed
Layer A inputs), **Layer A must not be the sole defense against duplicate or
unsafe execution.** The execution guards exist precisely to compensate for
decision-time evidence staleness.

## Consequences

- `confidence` values across the codebase are **rule-evaluation confidence**
  (decision-state cleanliness), never calibrated ML/predictive probability.
  They must not be displayed or consumed as success likelihood.
- The reminders-worker 24h duplicate check (execution guard) and Layer A rule
  14 `customer_cooldown` (business rule) must both be kept; code comments at
  both sites cross-reference this ADR.
- Future mutations to the send pipeline must preserve all three layers; removing
  any one requires a new ADR with evidence, not a cleanup rationale.

## Affected systems

- `worker/src/lib/recovery/decision-engine.ts` (Layer A rules)
- `packages/shared/src/decision-engine-types.ts` (confidence contract)
- `worker/queues/reminders.ts`, `worker/src/lib/billzo/send-marker.ts`,
  outbox claim (execution guards)
- Authority stack (Layer B, unchanged)
