# Recovery Events — Event Model & Timeline

## Purpose

The Recovery Event Model is BillZo's append-only audit log for every
recovery-relevant action across Merchant, Customer, and System actors.

It replaces three fragmented type enums (`RecoveryActivityType`,
`RecoveryEventType`, `RecoveryTimelineEventType`) with one canonical set.

---

## Event Types

Every event has one of these types:

### Lifecycle
| Type | Actor | Meaning |
|---|---|---|
| `case_opened` | system | Recovery case created for an invoice |
| `case_closed` | system | Case closed (paid, written off) |

### Communication
| Type | Actor | Meaning |
|---|---|---|
| `invoice_sent` | merchant | Invoice sent via WhatsApp / SMS |
| `reminder_scheduled` | system | Worker scheduled a reminder |
| `reminder_sent` | system/merchant | Reminder delivered via channel |
| `reminder_delivered` | system | Delivery receipt from WhatsApp |
| `reminder_read` | system | Read receipt from WhatsApp |
| `reminder_failed` | system | Delivery failed |
| `merchant_called` | merchant | Merchant initiated a call |
| `call_outcome` | merchant | Outcome recorded after a call |

### Promise
| Type | Actor | Meaning |
|---|---|---|
| `promise_received` | customer | Customer promised to pay by a date |
| `promise_fulfilled` | system | Promise was kept (payment received) |
| `promise_broken` | system | Promise due date passed without payment |

### Payment
| Type | Actor | Meaning |
|---|---|---|
| `customer_viewed` | customer | Customer viewed invoice/payment link |
| `payment_link_opened` | customer | Payment link was opened |
| `payment_received` | system | Payment confirmed via bank/webhook |
| `customer_payment_reported` | customer | Customer says they paid |
| `payment_confirmed` | merchant | Merchant verified payment manually |
| `payment_failed` | system | Payment attempt failed |

### Merchant Notes
| Type | Actor | Meaning |
|---|---|---|
| `note_added` | merchant | Merchant added a customer note |
| `escalated` | merchant | Case escalated for special handling |
| `disputed` | customer | Customer disputes the invoice |

---

## Database Schema (`recovery_activities`)

The `recovery_activities` table is the single physical store.

```sql
CREATE TABLE recovery_activities (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id),
  case_id    TEXT,                           -- nullable, backfilled
  customer_id TEXT,
  invoice_id  TEXT NOT NULL REFERENCES invoices(id),
  type       TEXT NOT NULL,                  -- one of the canonical types above
  actor_type TEXT NOT NULL,                  -- 'merchant' | 'system' | 'customer'
  actor_id   TEXT,                           -- user id when actor=merchant, null otherwise
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

No CHECK constraint on `type` — the application layer enforces valid types.
This avoids migration pain when new types are added.

---

## Write Path

1. **Merchant actions** → `POST /api/recovery/activities` → writes to `recovery_activities`
2. **System actions** → `logRecoveryActivity()` helper or direct `supabaseAdmin` insert
3. **Customer actions** → Pay page, payment link → `POST /api/recovery/activities`
4. **Worker actions** → Worker process writes directly via `supabaseAdmin`

Every write includes `case_id` when available. The `case_id` is resolved from
the invoice when not explicitly provided.

---

## Read Path (Timeline)

### Case-scoped timeline
`GET /api/recovery/timeline/case?caseId=xyz`

Returns `RecoveryEvent[]` for a single case, ordered by `created_at DESC`.

Source: `recovery_activities` WHERE `case_id = ?`

### Customer-scoped timeline
`GET /api/recovery/timeline?customerId=xyz`

Returns unified `RecoveryEvent[]` for a customer, merging:
1. `recovery_activities` — user-facing activity log
2. `collection_action_events` — automation state transitions
3. `whatsapp_events` — delivery telemetry

Both endpoints return the same `RecoveryEvent` shape.

---

## RecoveryEvent Interface

```typescript
interface RecoveryEvent {
  id: string
  tenantId: string
  caseId?: string
  customerId?: string
  invoiceId: string
  type: RecoveryEventType
  actorType: 'merchant' | 'system' | 'customer'
  actorId?: string
  metadata: Record<string, unknown>
  createdAt: string
}
```

---

## Timeline Rendering Rules

1. Events are grouped by day: **Today**, **Yesterday**, *DayOfWeek*, *Date*
2. Within each day, events are ordered chronologically newest-first
3. Each event renders:
   - An icon based on `type`
   - A human-readable title (derived from `type` + `metadata`)
   - An optional detail line
   - The time of day
4. Call outcomes are rendered as sub-entries under the `merchant_called` event (grouped visually)

---

## Future-Built on This Model

| Feature | Event dependency |
|---|---|
| Recovery Analytics | Count of events by type, by actor, over time |
| Merchant KPIs | Promise → payment conversion, response rate |
| Weekly Reports | Summary of all event types for a period |
| Automation Engine | Event-driven triggers (e.g., broken promise → auto-reminder) |
| AI Recommendations | Event sequence analysis to find winning patterns |

The event model is designed to be the foundation for all of these — if an
event type is missing for a planned feature, add it to the canonical list
and the feature naturally works.
