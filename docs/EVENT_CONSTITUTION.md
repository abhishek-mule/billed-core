# Event Constitution

This document defines the rules for event naming, causation, correlation, idempotency, intent requirements, replay guarantees, and mutation prohibitions across the BillZo platform.

**Status:** Living document — must be updated when new event types or patterns are introduced.
**Rule:** Every state mutation MUST be preceded by an emitted event. No exceptions.

---

## 1. Event Naming Convention

### Pattern
```
<domain>.<action>[.<aspect>]
```
- Use `snake_case` within each segment
- Past tense for completed actions (`payment.completed`, `invoice.created`)
- Present tense for intents (`payment.intent.received`)

### Categories

| Category | Pattern | Examples |
|----------|---------|----------|
| **Billing** | `billing.<entity>.<action>` | `billing.invoice.created`, `billing.invoice.paid` |
| **Payment** | `payment.<action>` | `payment.completed`, `payment.failed`, `payment.reconciled` |
| **Recovery** | `recovery.<action>` | `recovery.reminder.sent`, `recovery.completed`, `recovery.escalated` |
| **WhatsApp** | `whatsapp.<action>` | `whatsapp.message.sent`, `whatsapp.message.delivered`, `whatsapp.circuit_open` |
| **Behavioral** | `behavioral.<action>` | `behavioral.observation.interpreted`, `behavioral.traits.computed`, `behavioral.entropy.updated` |
| **Orchestration** | `orchestration.<action>` | `orchestration.decision.made`, `orchestration.snapshot.captured` |
| **Provisioning** | `provisioning.<action>` | `provisioning.tenant.created`, `provisioning.tenant.deprovisioned` |
| **Transport** | `transport.<action>` | `transport.projection.updated`, `transport.delta.logged` |

---

## 2. Causation & Correlation

### Every event MUST carry:

```typescript
interface BillzoEvent {
  id: string;              // UUID v4
  type: string;            // "<domain>.<action>"
  causationId: string;     // UUID of the event that caused this event
  correlationId: string;   // UUID that groups all events from the same root trigger
  createdAt: string;       // ISO 8601
  tenantId: string;        // Tenant scope
  payload: unknown;        // Event-specific data
  metadata: {
    producer: string;      // Service that produced the event
    producerVersion: string; // Code version that produced the event
    idempotencyKey: string;  // Unique key for dedup
  };
}
```

### Rules

- **causationId** MUST reference the immediate parent event (the direct cause)
- **correlationId** MUST be the same for all events in a causal chain
- **idempotencyKey** MUST be unique per logical operation; replaying the same operation MUST produce the same key
- **producerVersion** MUST be recorded so replay can use the correct code version

---

## 3. Idempotency Rules

### Key Generation

Idempotency keys follow the pattern:
```
<tenant_id>:<domain>:<entity_id>:<action>:<input_hash>
```

### Guarantee

Processing the same event (same idempotency key) twice MUST produce the same state. All projection handlers MUST check the idempotency guard before applying mutations.

### Enforcement

The `executeIdempotent()` function in `worker/src/lib/billzo/idempotency.ts` checks `processed_jobs` table. Every event handler MUST wrap its mutation in this guard.

---

## 4. Intent Requirements

### Before every state mutation, emit an intent event:

1. Construct the intent event with the proposed mutation
2. Write the intent to the outbox (status: `pending`)
3. The domain authority processes the intent and emits a completion/failure event
4. On failure, the intent's status is set to `failed` with error details

### Current intent events:

| Intent | Completion Event | Handler |
|--------|-----------------|---------|
| `whatsapp.send.intent` | `whatsapp.message.sent` / `whatsapp.send.failed` | WhatsApp router |
| `recovery.reminder.intent` | `recovery.reminder.sent` | Reminder queue |
| `payment.intent.received` | `payment.completed` / `payment.failed` | Payment webhook handler |

### New intents to add (from current violations):

| Violation | Required Intent |
|-----------|-----------------|
| Direct `invoices` UPDATE | `invoices.status.change.intent` |
| Direct `whatsapp_events` INSERT | `whatsapp.event.record.intent` |
| Direct `customer_behavioral_metrics` INSERT/UPDATE | `behavioral.metrics.update.intent` |

---

## 5. Replay Guarantees

### Deterministic Replay Contract

Replaying the same event stream with the same code versions MUST produce identical state.

### Requirements

1. **Version locking** — All event handlers MUST record the code version that produced them
2. **Seeded randomness** — Any stochastic behavior must use a seeded PRNG with the seed stored in the event
3. **No external dependencies** — Event handlers must not depend on external API state (time, random, environment)
4. **Idempotent writes** — All database writes must be safe to repeat

### Replay paths

| Path | Replayable? | Gaps |
|------|-------------|------|
| Transport events → projection | Partial | Materializer writes lack idempotency guards |
| Payment events → attribution | Yes | Full test coverage |
| Behavioral events → traits → entropy | Yes | Full test coverage |
| Orchestration → snapshots | Yes | Version-locked; tested for determinism |

---

## 6. Mutation Prohibitions

### Absolute prohibitions (will cause system corruption):

| Prohibited Action | Current Violations | Risk |
|-------------------|--------------------|------|
| DELETE from `whatsapp_events` | None (evidence immutability) | Loss of audit trail |
| UPDATE on `outbox` event payload | None (append-only payload) | Event stream corruption |
| Direct INSERT into another domain's tables | `baileys-socket.ts → whatsapp_events`, `reminders.ts → invoices` | Domain boundary violation |
| Bypassing idempotency for behavioral writes | `behavioral-materializer.ts` | Replay double-insertion |

### Enforcement Mechanism

1. **Database-level**: Foreign keys, triggers, or RLS policies that prevent cross-domain writes
2. **Application-level**: Repository/DAO layer that enforces domain boundaries
3. **CI-level**: Lint rules that detect `supabaseAdmin.from('<other_domain_table>').insert/update/delete`
