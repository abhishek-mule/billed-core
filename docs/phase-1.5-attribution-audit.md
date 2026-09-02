# Phase 1.5: Attribution Chain Audit

**Date:** 2026-08-29
**Goal:** Verify every recovery outcome can be traced back to the specific `recovery_attempt_id` that caused it

## Current Schema Structure

### Core Tables

#### 1. collection_actions (Recovery Attempt Spine)
```sql
CREATE TABLE collection_actions (
  id TEXT PRIMARY KEY,                    -- CA_<ulid> — THE ATTRIBUTION SPINE
  tenant_id UUID NOT NULL,
  customer_id UUID,
  invoice_ids UUID[] NOT NULL DEFAULT '{}',
  
  action_type TEXT NOT NULL,              -- reminder | payment_request | call | visit | escalate | wait
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | in_progress | completed | failed | cancelled | expired
  source TEXT NOT NULL DEFAULT 'system',  -- system | worker | merchant | customer
  
  provider TEXT,                          -- whatsapp | upi | razorpay | null
  amount NUMERIC,
  scheduled_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  parent_action_id TEXT REFERENCES collection_actions(id),
  recovery_plan_id TEXT,
  
  reason TEXT,
  priority INT NOT NULL DEFAULT 5,
  metadata JSONB NOT NULL DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes:**
- `idx_collection_actions_tenant_status` on (tenant_id, status)
- `idx_collection_actions_customer` on (customer_id, status)
- `idx_collection_actions_scheduled` on (scheduled_at) WHERE status = 'scheduled'
- `idx_collection_actions_parent` on (parent_action_id)
- `idx_collection_actions_invoices` GIN on (invoice_ids)

#### 2. whatsapp_events (Delivery & Response Evidence)
```sql
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS invoice_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS recovery_attempt_id TEXT; -- ✅ LINKS TO collection_actions.id
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound';

-- Delivery milestones
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS server_ack_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

-- Message content
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS message_preview TEXT;
ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
```

**Indexes:**
- `idx_whatsapp_events_invoice_timeline` on (invoice_id, occurred_at)
- `idx_whatsapp_events_provider_msg` on (provider_message_id)
- `idx_we_tenant_occurred` on (tenant_id, occurred_at DESC)
- `idx_we_customer` on (tenant_id, customer_id)

**Critical Field:** `recovery_attempt_id` — should reference `collection_actions.id`

#### 3. payment_promises (Customer Commitment Evidence)
```sql
CREATE TABLE IF NOT EXISTS payment_promises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  promise_date TIMESTAMPTZ NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fulfilled', 'broken')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Index:**
- `idx_payment_promises_active` on (tenant_id, customer_id, invoice_id) WHERE status = 'active'

**MISSING:** No link to `collection_actions.id` (which reminder triggered the promise?)

#### 4. invoices (Payment Outcome)
```sql
-- Core invoice fields
id VARCHAR(255) PRIMARY KEY
customer_id UUID
status TEXT -- paid | unpaid | overdue | partial
outstanding_amount NUMERIC(12,2)
paid_amount NUMERIC(12,2)
due_date TIMESTAMPTZ
```

**MISSING:** No link to `collection_actions.id` (which reminder led to payment?)

#### 5. recovery_cases (Customer-Level Aggregation)
```sql
CREATE TABLE IF NOT EXISTS recovery_cases (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id VARCHAR(255) NOT NULL,
  customer_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  total_outstanding NUMERIC DEFAULT 0,
  invoice_count INT DEFAULT 0,
  recovery_state_v2 TEXT, -- active | overdue | promised | partial_payment | disputed | recovered
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Purpose:** Projection/materialized view, not part of attribution chain

## Attribution Chain Analysis

### ✅ What Works

**collection_actions → whatsapp_events**
```
collection_actions.id 
  → whatsapp_events.recovery_attempt_id
```
✅ Link exists
✅ Can trace delivery/read/reply events to specific attempt

### ❌ What's Missing

#### 1. payment_promises → collection_actions
**Problem:** When a customer makes a promise, we don't record which recovery attempt prompted it.

**Current:**
```sql
payment_promises:
  customer_id
  invoice_id
  promise_date
  -- MISSING: recovery_attempt_id or collection_action_id
```

**Should be:**
```sql
payment_promises:
  customer_id
  invoice_id
  promise_date
  triggered_by_action_id TEXT REFERENCES collection_actions(id) -- NEW
```

**Impact:** Can't answer "Did the customer promise after reading the WhatsApp, or after the call?"

#### 2. invoices → collection_actions (Payment Attribution)
**Problem:** When a customer pays, we don't record which recovery attempt preceded it.

**Current:**
```sql
invoices:
  paid_amount
  outstanding_amount
  status
  -- MISSING: attributed_to_action_id
```

**Should have:**
```sql
-- Either add to invoices:
ALTER TABLE invoices ADD COLUMN last_recovery_action_id TEXT REFERENCES collection_actions(id);

-- Or create payment_attributions table:
CREATE TABLE payment_attributions (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  payment_amount NUMERIC NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL,
  attributed_to_action_id TEXT REFERENCES collection_actions(id),
  attribution_confidence NUMERIC, -- 0.0-1.0
  attribution_method TEXT, -- last_touch | time_window | explicit
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Impact:** Can't answer "Which reminder led to this payment?"

#### 3. No Explicit Outcome Recording
**Problem:** Recovery attempts don't have explicit outcome records.

**Current:** Have to infer outcome by joining:
- collection_actions → whatsapp_events (did it deliver?)
- collection_actions → payment_promises (did they promise?)
- collection_actions → invoices (did they pay?)

**Should have:**
```sql
CREATE TABLE recovery_outcomes (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  recovery_attempt_id TEXT NOT NULL REFERENCES collection_actions(id),
  
  outcome_type TEXT NOT NULL, -- payment | promise_kept | promise_broken | no_response | failed_delivery | call_completed | visit_completed
  outcome_at TIMESTAMPTZ NOT NULL,
  
  -- Outcome details
  payment_amount NUMERIC,
  promise_id UUID REFERENCES payment_promises(id),
  invoice_id TEXT,
  
  -- Attribution metadata
  time_since_attempt_hours NUMERIC,
  confidence_score NUMERIC,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recovery_outcomes_attempt ON recovery_outcomes(recovery_attempt_id);
CREATE INDEX idx_recovery_outcomes_tenant_time ON recovery_outcomes(tenant_id, outcome_at DESC);
```

## Required Changes for Phase 1.5

### Change 1: Add recovery_attempt_id to payment_promises
```sql
ALTER TABLE payment_promises 
  ADD COLUMN triggered_by_action_id TEXT REFERENCES collection_actions(id);

CREATE INDEX idx_payment_promises_action 
  ON payment_promises(triggered_by_action_id) 
  WHERE triggered_by_action_id IS NOT NULL;

COMMENT ON COLUMN payment_promises.triggered_by_action_id 
  IS 'The recovery attempt (collection_actions.id) that prompted this promise';
```

### Change 2: Create recovery_outcomes table
```sql
CREATE TABLE recovery_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  recovery_attempt_id TEXT NOT NULL REFERENCES collection_actions(id),
  
  outcome_type TEXT NOT NULL CHECK (outcome_type IN (
    'payment',
    'promise_kept', 
    'promise_broken',
    'no_response',
    'failed_delivery',
    'call_completed',
    'visit_completed',
    'customer_replied',
    'customer_read'
  )),
  outcome_at TIMESTAMPTZ NOT NULL,
  
  -- Outcome details
  payment_amount NUMERIC,
  promise_id UUID REFERENCES payment_promises(id),
  invoice_id TEXT,
  customer_id TEXT,
  
  -- Attribution metadata
  time_since_attempt_hours NUMERIC,
  confidence_score NUMERIC CHECK (confidence_score >= 0 AND confidence_score <= 1),
  attribution_method TEXT, -- last_touch | time_window | explicit | inferred
  
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recovery_outcomes_attempt ON recovery_outcomes(recovery_attempt_id);
CREATE INDEX idx_recovery_outcomes_tenant_time ON recovery_outcomes(tenant_id, outcome_at DESC);
CREATE INDEX idx_recovery_outcomes_type ON recovery_outcomes(tenant_id, outcome_type, outcome_at DESC);
CREATE INDEX idx_recovery_outcomes_customer ON recovery_outcomes(customer_id, outcome_at DESC);

COMMENT ON TABLE recovery_outcomes IS 'Explicit record of every recovery attempt outcome for behavioral learning';
COMMENT ON COLUMN recovery_outcomes.attribution_method IS 'How this outcome was linked to the attempt: last_touch (most recent), time_window (within N hours), explicit (user/system marked), inferred (heuristic)';
```

### Change 3: Add foreign key constraint to whatsapp_events.recovery_attempt_id
```sql
-- First, clean up orphaned records
UPDATE whatsapp_events 
SET recovery_attempt_id = NULL 
WHERE recovery_attempt_id IS NOT NULL 
  AND NOT EXISTS (
    SELECT 1 FROM collection_actions 
    WHERE collection_actions.id = whatsapp_events.recovery_attempt_id
  );

-- Then add constraint
ALTER TABLE whatsapp_events 
  ADD CONSTRAINT fk_whatsapp_events_recovery_attempt 
  FOREIGN KEY (recovery_attempt_id) 
  REFERENCES collection_actions(id) 
  ON DELETE SET NULL;
```

## Verification Queries

After implementing changes, these queries should all return results:

### Q1: Which reminder led to this payment?
```sql
SELECT 
  ca.id as attempt_id,
  ca.action_type,
  ca.executed_at,
  ro.outcome_type,
  ro.payment_amount,
  ro.time_since_attempt_hours
FROM collection_actions ca
JOIN recovery_outcomes ro ON ro.recovery_attempt_id = ca.id
WHERE ro.outcome_type = 'payment'
  AND ro.invoice_id = '<invoice_id>'
ORDER BY ro.outcome_at DESC;
```

### Q2: What was the delivery status of each attempt?
```sql
SELECT 
  ca.id,
  ca.action_type,
  ca.executed_at,
  we.delivered_at,
  we.read_at,
  (we.read_at IS NOT NULL) as was_read,
  ro.outcome_type
FROM collection_actions ca
LEFT JOIN whatsapp_events we ON we.recovery_attempt_id = ca.id AND we.direction = 'outbound'
LEFT JOIN recovery_outcomes ro ON ro.recovery_attempt_id = ca.id
WHERE ca.customer_id = '<customer_id>'
ORDER BY ca.executed_at DESC;
```

### Q3: Promise attribution
```sql
SELECT 
  pp.id,
  pp.promise_date,
  pp.status,
  ca.action_type as triggered_by,
  ca.executed_at as attempt_at,
  EXTRACT(EPOCH FROM (pp.created_at - ca.executed_at))/3600 as hours_after_attempt
FROM payment_promises pp
JOIN collection_actions ca ON ca.id = pp.triggered_by_action_id
WHERE pp.customer_id = '<customer_id>';
```

### Q4: Complete attempt lifecycle
```sql
SELECT 
  ca.id,
  ca.action_type,
  ca.scheduled_at,
  ca.executed_at,
  ca.status,
  we.delivered_at,
  we.read_at,
  (SELECT outcome_type FROM recovery_outcomes WHERE recovery_attempt_id = ca.id LIMIT 1) as outcome
FROM collection_actions ca
LEFT JOIN whatsapp_events we ON we.recovery_attempt_id = ca.id
WHERE ca.customer_id = '<customer_id>'
ORDER BY ca.executed_at DESC;
```

## Phase 1.5 Progress (outcome writers)

- ✅ 091 applied — `recovery_outcomes` (outcome_type includes `call_completed`), `payment_promises.triggered_by_action_id`, `whatsapp_events.recovery_attempt_id` FK, `invoices.last_recovery_action_id`.
- ✅ B1 reply — inbound `customer_replied` written via explicit identity; missing identity → UNKNOWN.
- ✅ B2 promise — `promise_kept`/`promise_broken` via `payment_promises.triggered_by_action_id`; missing → UNKNOWN.
- ✅ B3 payment — `payment` outcome threads `recoveryAttemptId`; missing → UNKNOWN.
- ✅ C0 call — `call_completed` written from `customer.called` via explicit `actionId`; no attempt ⇒ UNKNOWN; never timestamp inference. (`worker/src/lib/recovery/call-outcome-ledger.ts`)
- ✅ C1 history projection — decision-engine history now derived from finalized `collection_actions` + `recovery_outcomes` (delivery/reply/promise/payment evidence), replacing raw `whatsapp_events` row counts. "3 reminders sent" ⇒ "3 recovery attempts were made" with per-attempt evidence. (`worker/src/lib/recovery/attempt-history.ts`)
- ✅ C2 regression — `canSendReminder()` decision inputs are behaviorally identical pre/post data-source swap.
- ✅ D gate — release gate for Phase 1.5. `worker/src/lib/recovery/__tests__/attribution-audit-gate.test.ts` (18 tests) proves all six gates against the production writers (promise/call/payment ledgers + `attributabilityOf` + the B1 reply rule), with an in-memory Q1–Q4 oracle mirroring the queries below.
  - **D1** Schema/oracle — Q1–Q4 resolve the canonical `collection_actions.id` chain.
  - **D2** Full chain — attempt → send → delivered → read → reply → promise → broken → call → payment preserve the same attempt identity where causality is explicit (all attributable nodes resolve to `CA_A`) + the C1 projection reads the same evidence.
  - **D3** Unknown case — missing identity ⇒ `attribution_status='unknown'`, never verified.
  - **D4** No inference — hostile payment 10s after a reminder with NO `recoveryAttemptId` stays unknown; never `verified → Attempt A` (temporal proximity ≠ causality).
  - **D5** Idempotency — replayed webhooks/events do not duplicate evidence nor mutate attribution.
  - **D6** Ambiguity — provider identity matching no candidates ⇒ unknown; matching multiple ⇒ unknown, never "pick latest".
- ✅ D bug found & fixed — `recordPaymentOutcome`/`recordCallOutcome` are **write-once** (select-then-insert). The previous `upsert` (last-write-wins) would let a late reconciliation replay without an attempt id downgrade an existing VERIFIED link to unknown; the upsert's `ON CONFLICT` also could not infer the partial unique index.

### D release verdict

Phase 1.5 outcomes ledger is trustworthy when all five gates (above) pass AND the 16-question checklist can be answered from the oracle queries. Backfill and Phase 2 remain gated on this verdict.

### Controlled backfill (093)

Applied post-D-gate. **Read-only audit first, then exact-identity-only writes** (`mini_saas_frontend/migrations/093_controlled_attribution_backfill.sql`). Result on production:

- **0 `collection_actions` historically stored a `billzo_message_id`** (checked: `attempts_with_msg_id = 0`).
- Exact-match backfill therefore produced **0 verified links** (`UPDATE 0`).
- All **67** historical outbound `whatsapp_events` remain `recovery_attempt_id = NULL` → honestly `unknown`. **Nothing was fabricated** — timestamp proximity was never used to invent a link.
- Post-backfill audit: `linked = 0`, `unlinked_unknown = 67`; no orphaned links.

This is the correct outcome: pre-Phase-1.5 data carries no provable attempt identity, so it stays unknown rather than being guessed. Going forward, only new evidence (via the B/C/D writers) records verified links.

### C2 test coverage mapping

| C2 coverage | File |
| --- | --- |
| C0 ledger: verified / unknown / blank / non-string attempt / retry-idempotency | `worker/src/lib/recovery/__tests__/call-outcome-ledger.test.ts` |
| C1 projection semantics: executed-only counts, one-attempt-per-send, ignore rules, month window, customer cooldown | `worker/src/lib/recovery/__tests__/attempt-history.test.ts` |
| Data-source equivalence → identical `canSendReminder()` verdict | `worker/src/lib/recovery/__tests__/attempt-history.test.ts` |

### D gate coverage mapping

| D gate | File |
| --- | --- |
| D1–D6 (oracle, full chain, unknown, hostile payments, idempotency, ambiguity) | `worker/src/lib/recovery/__tests__/attribution-audit-gate.test.ts` |
| Payment thread + hostile null on the record path | `mini_saas_frontend/src/lib/billzo/__tests__/record-payment.test.ts` |
| Reply path: identity-only resolution, unknown fallback, per-message idempotency | `mini_saas_frontend/src/lib/billzo/__tests__/attribution-chain.test.ts` |

## Success Criteria

Phase 1.5 is complete when we can answer these questions for EVERY recovery attempt:

- [ ] Why was this action chosen?
- [ ] Which customer/invoice?
- [ ] Which recovery attempt (collection_actions.id)?
- [ ] Which channel?
- [ ] When was it scheduled?
- [ ] Was it actually executed?
- [ ] Was WhatsApp accepted (sent)?
- [ ] Was it delivered?
- [ ] Was it read?
- [ ] Did customer reply?
- [ ] What did they reply?
- [ ] Did they promise payment?
- [ ] Did they pay?
- [ ] Did the promise break?
- [ ] What was the final outcome?
- [ ] What decision followed?

## Next Steps

1. ✅ Audit complete — gaps identified
2. ✅ Migration for recovery_outcomes table (091)
3. ✅ Migration to add triggered_by_action_id to payment_promises (091)
4. ✅ Foreign key constraint on whatsapp_events.recovery_attempt_id (091)
5. ✅ Update application code to record outcomes (B1/B2/B3 + C0 call)
6. 🔒 Backfill historical outcomes — gated until D (full attribution audit) passes
7. ⏳ D — verify attribution queries (Q1–Q4) + 16-question checklist + hostile negative test
8. ⏳ Update buildRecoveryDecision() to use outcome history (C1 projection already feeds decision engine)
