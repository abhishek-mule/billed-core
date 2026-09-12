# BillZo — Technical Requirements Document (TRD)

**Version:** 1.0  
**Status:** Engineering Baseline  
**Product:** BillZo  
**Primary deployment:** Web/PWA + asynchronous worker  
**Market:** India  
**Architecture principle:** Evidence-first, server-authoritative, multi-tenant

---

# 1. Purpose

This TRD defines the technical architecture, requirements, interfaces, data model, security model, asynchronous processing, recovery decisioning, WhatsApp integration, payment processing, offline behavior, observability, concurrency controls, testing strategy, and production-hardening requirements for BillZo.

The TRD exists to answer:

> **How must BillZo technically work so that the product requirements can be implemented without compromising financial correctness, tenant isolation, recovery attribution, or reliability?**

This document is subordinate to the following architectural invariant:

> **`collection_actions.id` is the canonical recovery-attempt identity.**

---

# 2. Technical Objectives

BillZo must provide:

1. Multi-tenant financial data isolation.
2. Authoritative invoice/payment state.
3. Deterministic recovery decisions.
4. Durable recovery-attempt identity.
5. Evidence-grade causal attribution.
6. Idempotent asynchronous processing.
7. Secure WhatsApp integration.
8. Secure payment webhooks.
9. Offline-capable PWA behavior.
10. Horizontal worker scalability.
11. Strong auditability.
12. Safe automation.
13. Graceful failure.
14. Production observability.
15. Minimal architectural complexity.

---

# 3. Non-Goals

The architecture must not prematurely introduce:

* Kafka
* microservice decomposition
* event sourcing
* ML infrastructure
* distributed databases
* service mesh
* complex workflow orchestration
* generic AI agents

unless measured production requirements justify them.

The initial system should remain a:

> **Next.js + PostgreSQL + worker + outbox + external providers**

architecture.

---

# 4. High-Level Architecture

```text
                    ┌──────────────────────┐
                    │     Merchant PWA     │
                    │      Next.js          │
                    └──────────┬───────────┘
                               │
                               │ HTTPS
                               ▼
                    ┌──────────────────────┐
                    │      API Layer       │
                    │ Next.js route.ts      │
                    └──────────┬───────────┘
                               │
                  ┌────────────┼────────────┐
                  │            │            │
                  ▼            ▼            ▼
             PostgreSQL     Outbox       Decision
             Financial      Events       Engine
               Truth                       │
                  │                        │
                  └──────────┬─────────────┘
                             │
                             ▼
                    ┌──────────────────────┐
                    │       Worker         │
                    │ queues/outbox.ts      │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
           WhatsApp         Payments         Recovery
           Provider         Provider          Jobs
              │                │
              ▼                ▼
          Webhooks          Webhooks
              │                │
              └────────────┬───┘
                           ▼
                    Recovery Outcomes
```

---

# 5. System Components

## 5.1 Frontend

Current architecture:

* Next.js
* PWA
* TypeScript
* server/API routes
* client-side UI
* offline/service-worker capability

Responsibilities:

* rendering
* user interaction
* local UI state
* authentication/session presentation
* submitting intents
* displaying authoritative server state

Frontend must **not** become financial authority.

---

# 6. API Layer

API routes are responsible for:

* authentication
* tenant resolution
* authorization
* request validation
* feature checks
* intent creation
* database mutations
* outbox insertion
* response serialization

Every tenant-sensitive route must establish:

```text
authenticated user
        ↓
tenant
        ↓
authorized resource
```

before performing a mutation.

---

# 7. Server Authority Model

The server is authoritative for:

* invoices
* payments
* outstanding balances
* customers
* recovery cases
* collection actions
* promises
* outcomes
* WhatsApp state
* reconciliation
* subscription state
* reminder credits

The client is never authoritative for these values.

---

# 8. Request Processing Model

A mutation should follow:

```text
HTTP Request
    ↓
Authentication
    ↓
Tenant Resolution
    ↓
Authorization
    ↓
Input Validation
    ↓
Business Rule Validation
    ↓
DB Transaction
    ↓
Outbox / Action Creation
    ↓
Response
```

External network calls should generally not occur inside long-running database transactions.

---

# 9. Multi-Tenancy

Every tenant-scoped entity must contain or be deterministically associated with:

```text
tenant_id
```

Queries must always be tenant scoped.

Unsafe:

```sql
SELECT * FROM invoices WHERE id = $1;
```

Safer:

```sql
SELECT *
FROM invoices
WHERE id = $1
AND tenant_id = $2;
```

For critical resources, ownership should be validated even if the caller supplies a supposedly valid ID.

---

# 10. Tenant Isolation

Isolation must exist at multiple layers:

### Application

Tenant-aware authorization.

### Database

Tenant-scoped queries and constraints.

### Webhooks

Tenant resolved from authoritative server-side data.

### Worker

Payloads carry tenant context.

### Cache/Redis

Keys must include tenant scope where applicable.

---

# 11. Authentication

Authentication establishes:

```text
user identity
```

It does not automatically establish:

```text
tenant authorization
```

Therefore:

```text
AuthN
  ↓
User
  ↓
Tenant membership
  ↓
Role/permission
```

must be evaluated.

---

# 12. Authorization

At minimum:

* merchant/admin
* collection operator
* accountant
* read-only

Future role granularity may be added.

Sensitive operations require explicit authorization:

* payment edits
* payment reversal
* recovery overrides
* WhatsApp configuration
* subscription changes
* manual outcome modification

---

# 13. Recovery Architecture

The recovery system consists of:

```text
Recovery Case
      ↓
Decision Engine
      ↓
Collection Action
      ↓
External Action
      ↓
Provider Event
      ↓
Outcome
```

The recovery engine must never directly infer historical causal relationships from timestamps.

---

# 14. Recovery Case

A recovery case represents the recovery state associated with a customer/invoice context.

Conceptually:

```text
recovery_case
├── tenant
├── customer
├── invoice(s)
├── current state
├── decision state
└── recovery history
```

Customer-level aggregation may represent multiple invoices while retaining invoice-level financial truth.

---

# 15. Decision Engine

The decision engine is the sole authority for:

> **What should happen next?**

Inputs may include:

* outstanding amount
* overdue age
* previous recovery attempts
* verified outcomes
* active promise
* broken promise
* WhatsApp availability
* consent
* dispute state
* payment state

Output should be deterministic.

Conceptually:

```ts
Decision = {
  section,
  action,
  reason,
  evidence,
  eligibility,
  blockingConditions
}
```

---

# 16. Decision Hierarchy

Decision evaluation must respect precedence.

Example:

```text
PAID / ZERO OUTSTANDING
        ↓
BLOCKED / DISPUTED
        ↓
ACTIVE PROMISE
        ↓
BROKEN PROMISE
        ↓
VERIFIED RECOVERY EVIDENCE
        ↓
OVERDUE AGE
        ↓
DEFAULT RECOVERY ACTION
```

A lower-priority rule must not override a higher-priority blocking condition.

---

# 17. Fail-Closed Behavior

Unknown states must not produce unsafe automation.

For example:

```text
unknown WhatsApp state
        ↓
do not automatically send
```

rather than:

```text
unknown
 ↓
send reminder anyway
```

---

# 18. Recovery Attempt Spine

This is a frozen invariant.

```text
collection_actions.id
        =
recovery_attempt_id
```

Every actual recovery action must obtain a canonical attempt ID.

---

# 19. Collection Action Lifecycle

Example:

```text
created
   ↓
in_progress
   ↓
completed
```

or:

```text
created
   ↓
in_progress
   ↓
failed
```

Potential future states:

```text
cancelled
expired
```

---

# 20. Recovery Attempt Creation

For manual WhatsApp reminder:

```text
User clicks Send Reminder
        ↓
API validates decision
        ↓
Create collection_action
        ↓
Get action.id
        ↓
Send/queue transport
        ↓
Attach action.id to event
```

Do **not** create the external message first and attempt to reconstruct identity afterward.

---

# 21. Causal Identity Model

Canonical chain:

```text
collection_actions.id
        ↓
recovery_attempt_id
        ↓
whatsapp_events
        ↓
provider_message_id
        ↓
delivery/read/reply
        ↓
promise/call/payment
        ↓
recovery_outcomes
```

This allows BillZo to answer:

> “What happened after this exact recovery action?”

---

# 22. Attribution States

## VERIFIED

Explicit identifiers establish causality.

## UNKNOWN

Event exists but causal relationship cannot be proven.

## CANDIDATE

Internal investigation state only.

`candidate` must never be surfaced as verified product truth.

---

# 23. Attribution Rule

Absolute rule:

> **No identity chain → no causal attribution.**

This means:

```text
Payment at 10:02
Reminder at 10:01
```

does not automatically mean:

```text
Reminder caused payment
```

unless explicit recovery identity exists.

---

# 24. WhatsApp Transport

WhatsApp transport must support:

* outbound send
* delivery status
* read status
* inbound reply
* failure
* provider message identity

Every outbound recovery message must preserve:

```text
tenant_id
customer_id
recovery_attempt_id
provider
provider_message_id
```

where available.

---

# 25. Provider Abstraction

BillZo should retain a transport abstraction:

```text
TransportRegistry
       │
       ├── Meta
       ├── Gupshup
       └── Future provider
```

Business logic should not directly depend on provider-specific APIs.

---

# 26. Transport Registry Requirements

Registry must:

* select configured provider
* validate provider availability
* return explicit failure
* preserve tenant context
* preserve recovery attempt ID

It should not silently fall back to an unexpected provider.

---

# 27. WhatsApp Provider Payload

Logical payload:

```ts
{
  tenantId,
  customerId,
  phone,
  template,
  variables,
  recoveryAttemptId,
  attachments
}
```

Provider-specific transformation happens inside the adapter.

---

# 28. Secrets

Never expose:

* Meta access tokens
* Gupshup tokens
* provider secrets
* webhook secrets
* payment secrets

to the browser.

Tokens should exist only in trusted server/worker environments.

---

# 29. WhatsApp Webhooks

Webhook flow:

```text
Provider
   ↓
HTTPS webhook
   ↓
Signature verification
   ↓
Provider message ID
   ↓
Canonical event lookup
   ↓
Recovery attempt resolution
   ↓
Outcome
```

Webhook handlers must be idempotent.

---

# 30. Webhook Identity Resolution

Preferred:

```text
provider_message_id
```

Never:

```text
latest message from customer
```

or:

```text
message within ±5 minutes
```

Timestamp-based matching is prohibited for causal attribution.

---

# 31. Payment Architecture

Payment flow:

```text
Payment Provider
       ↓
Webhook
       ↓
Signature Validation
       ↓
Server-side Payment Lookup
       ↓
Tenant/Invoice Resolution
       ↓
Payment Transaction
       ↓
Invoice Balance
       ↓
Recovery Outcome
```

---

# 32. Payment Tenant Resolution

Payment metadata such as:

```text
notes.tenantId
```

must not be treated as stronger than authoritative server-side ownership.

Preferred:

```text
payment provider ID
      ↓
BillZo payment/payment-request record
      ↓
tenant
      ↓
invoice
```

Metadata may assist resolution but should not override authoritative ownership.

---

# 33. Payment Idempotency

Webhook retries must produce:

```text
one logical payment
```

rather than:

```text
payment #1
payment #2
payment #3
```

Use provider payment ID / transaction ID as the external idempotency key where appropriate.

---

# 34. Payment States

At minimum:

```text
pending
completed
failed
reversed
refunded
```

Invoice state should derive from authoritative payment records.

---

# 35. Payment Attribution

Explicit:

```text
recoveryAttemptId
```

→ VERIFIED

Missing:

```text
recoveryAttemptId
```

→ UNKNOWN

Never:

```text
payment.timestamp ≈ reminder.timestamp
```

→ VERIFIED

---

# 36. Payment Matching

Matching precedence:

```text
explicit payment reference
        ↓
provider payment-request identity
        ↓
invoice/customer identity
        ↓
manual review
```

Ambiguous payments remain reviewable.

---

# 37. Promise Architecture

Promise record should preserve:

```text
tenant
customer
invoice
amount
promise_date
triggered_by_action_id
status
```

Promise creation must be attributable to an explicit recovery action whenever possible.

---

# 38. Promise State Machine

```text
                    ┌──────────┐
                    │  ACTIVE  │
                    └────┬─────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
           Payment               No payment
              │                     │
              ▼                     ▼
            KEPT                  BROKEN
```

Promise kept only when payment satisfies the promise's required conditions.

---

# 39. Call Actions

Manual call:

```text
collection_action
       ↓
customer.called
       ↓
call_completed
```

If action ID exists:

```text
VERIFIED
```

If no explicit identity:

```text
UNKNOWN
```

---

# 40. Outcome Store

`recovery_outcomes` should be append-oriented.

Examples:

```text
reminder.sent
message.delivered
message.read
customer.replied
promise.made
promise.kept
promise.broken
call.completed
payment.completed
```

Duplicate logical outcomes must be prevented.

---

# 41. Outcome Idempotency

An outcome should have a deterministic uniqueness boundary such as:

```text
attempt + outcome type + provider identity
```

where appropriate.

Repeated webhook delivery must not create duplicate logical outcomes.

---

# 42. Database Requirements

PostgreSQL remains the system of record.

Critical constraints should be enforced in the database wherever practical:

* foreign keys
* unique constraints
* check constraints
* indexes
* tenant ownership

Application code alone is insufficient for critical invariants.

---

# 43. Recovery FK Integrity

The recovery attempt relationship should remain explicit:

```text
whatsapp_events.recovery_attempt_id
       ↓
collection_actions.id
```

Deletion behavior must preserve evidence.

Recovery attempts should not casually disappear because another entity was deleted.

---

# 44. Invoice Last-Recovery Reference

Invoices may retain:

```text
last_recovery_action_id
```

for fast operational access.

This is a convenience projection.

It must not replace the recovery history.

---

# 45. Database Transactions

Operations involving multiple dependent financial records must use transactions.

Example:

```text
payment
+
invoice update
+
outcome
```

should have a clearly defined consistency boundary.

---

# 46. Outbox Architecture

The outbox provides durable asynchronous execution.

```text
Database Transaction
        │
        ├── Business state
        │
        └── Outbox event
                 ↓
               Worker
```

The business mutation and outbox insertion should occur atomically when the operation requires asynchronous continuation.

---

# 47. Outbox Event

Logical structure:

```ts
{
  id,
  tenantId,
  type,
  payload,
  status,
  attempts,
  nextAttemptAt,
  causationId,
  createdAt,
  processedAt,
  lastError
}
```

---

# 48. Causation

Every asynchronous event that originates from a recovery attempt should preserve:

```text
causationId
```

and/or:

```text
recoveryAttemptId
```

where applicable.

This prevents loss of causal context across queues.

---

# 49. Worker Processing

Worker loop:

```text
poll
 ↓
claim
 ↓
lock
 ↓
process
 ↓
commit
 ↓
mark complete
```

Failure:

```text
process
 ↓
error
 ↓
retry/backoff
 ↓
dead/review
```

---

# 50. Worker Idempotency

Worker handlers must tolerate:

* duplicate execution
* process crash
* retry
* timeout
* provider retry
* worker restart

without corrupting financial/recovery state.

---

# 51. Concurrency Requirement — B-05

The audit has already established a real race:

```text
Event A ──┐
          ├── read consumption = absent
Event B ──┘
          │
          ├── both mutate case
          │
          ├── consumption insert A
          └── consumption insert B → conflict
```

Therefore:

> **Uniqueness after mutation is insufficient.**

The system needs an atomic reservation/transition boundary.

---

# 52. Required Concurrency Pattern

Preferred conceptual pattern:

```text
BEGIN
 ↓
Atomically claim event/case transition
 ↓
If claim fails → duplicate → stop
 ↓
Mutate case
 ↓
Record consumption
 ↓
COMMIT
```

Alternative:

```text
INSERT consumption
ON CONFLICT DO NOTHING
RETURNING ...
```

Then only the successful claimant performs the state transition.

The exact implementation belongs in Pass 2.

---

# 53. Locks

Where necessary:

* database row locks
* advisory locks
* Redis locks

may be used.

But locks must not become the sole correctness mechanism where a database invariant can enforce correctness.

---

# 54. Customer-Level Serialization

Recovery operations for the same customer may require serialization.

However, this must be applied carefully.

Avoid:

```text
global lock
```

Prefer:

```text
tenant + customer lock
```

or:

```text
customer-specific database serialization
```

Legacy jobs without customer ID require special handling.

---

# 55. Worker Scaling

Worker instances should be horizontally scalable.

Example:

```text
              ┌── Worker 1
Outbox ───────┼── Worker 2
              ├── Worker 3
              └── Worker N
```

Correctness must not depend on a single worker instance.

---

# 56. Retry Policy

Transient errors:

```text
exponential backoff
```

Permanent errors:

```text
do not endlessly retry
```

Examples:

### Retry

* network timeout
* provider 5xx
* temporary database issue

### Don't retry blindly

* invalid phone
* invalid template
* invalid credentials
* revoked provider configuration

---

# 57. Retry Safety

Before retrying an external action, determine whether the provider may already have accepted the request.

Otherwise:

```text
timeout
 ↓
retry
 ↓
duplicate WhatsApp message
```

Idempotency/provider message identity should be used where supported.

---

# 58. Reminder Scheduler

Reminder scheduling must consider:

* overdue age
* previous attempts
* active waiting window
* consent
* provider availability
* credits
* disputes
* payment state

Scheduler must ask the Decision Engine rather than duplicate its rules.

---

# 59. Reminder Credits

Credit checking should be authoritative server-side.

Conceptually:

```text
eligible?
   ↓
credit available?
   ↓
reserve credit
   ↓
create action
   ↓
send
```

Avoid charging a credit after an action has already been successfully sent.

The exact reservation semantics should be transactional.

---

# 60. Subscription Independence

Subscription status and reminder credits are separate.

If:

```text
subscription = active
credits = 0
```

then:

```text
Invoices      = available
Payments      = available
Recovery      = available
Manual calls  = available
Automation    = blocked
```

---

# 61. Offline Architecture

PWA should distinguish:

```text
server-confirmed
```

from:

```text
locally queued
```

Never represent a locally queued financial mutation as final.

Example:

```text
Record payment
      ↓
OFFLINE
      ↓
Pending sync
      ↓
ONLINE
      ↓
Server accepts
      ↓
Confirmed
```

---

# 62. Offline Data

Cache only data that is safe and necessary.

Potentially cache:

* recovery queue
* customer summary
* invoices
* recent recovery history

Sensitive mutable data should have appropriate expiration/invalidation.

---

# 63. Optimistic Updates

Optimistic UI is permitted only where rollback is deterministic.

Example:

```text
User action
 ↓
Optimistic state
 ↓
API request
 ├── success → authoritative refresh
 └── failure → rollback + error
```

Financial values should preferably be refreshed from server truth after mutation.

---

# 64. Service Worker

Requirements:

* production registration
* cache versioning
* controlled updates
* stale cache invalidation
* online/offline detection
* safe synchronization
* failed sync visibility

---

# 65. Frontend Error States

Every major page must define:

### Loading

What does the user see before data arrives?

### Empty

What if there is no data?

### Error

What if API fails?

### Offline

What if network is unavailable?

### Stale

What if cached data is older than expected?

---

# 66. Numeric Safety

Frontend must protect against:

* `null`
* `undefined`
* `NaN`
* `Infinity`
* malformed API numbers

`formatINR()` handling NaN is useful but insufficient.

Every numeric calculation needs an explicit valid-data path.

---

# 67. API Contract Safety

The frontend should consume typed responses where practical.

Prefer:

```ts
OutstandingResponse
```

over:

```ts
any
```

API changes should be backward-compatible where possible.

---

# 68. API Error Contract

Standard response model:

```ts
{
  error: {
    code: string,
    message: string,
    retryable?: boolean
  }
}
```

Examples:

```text
AUTH_REQUIRED
FORBIDDEN
NOT_FOUND
VALIDATION_ERROR
FEATURE_LOCKED
PROVIDER_UNAVAILABLE
PAYMENT_REVIEW_REQUIRED
RECOVERY_BLOCKED
```

Internal stack traces must not be returned.

---

# 69. Feature Gates

Feature gates should distinguish:

```text
feature unavailable
```

from:

```text
authorization failure
```

and:

```text
provider failure
```

Do not hide unrelated errors behind:

```text
FEATURE_LOCKED
```

---

# 70. Worker Health Endpoint

Health endpoint may expose:

* process health
* dependency health
* queue health

Mutation endpoints should not be casually exposed alongside public health endpoints.

---

# 71. Worker Security — B-01

Current audit concern:

```text
worker:10000
```

contains mutation endpoints without authentication.

Final severity remains dependent on runtime reachability.

Required evidence:

```text
Internet
Vercel/frontend network
Docker network
VPC/internal network
localhost
reverse proxy
firewall
```

Until this is established, B-01 remains conditional.

---

# 72. Webhook Security

Every external webhook must verify:

1. request authenticity
2. signature
3. provider identity
4. expected event structure
5. tenant/resource ownership

Only then should business mutations occur.

---

# 73. Meta Webhook Requirements

The verification endpoint must never return or log the verification token.

Bad:

```text
403 invalid token: <secret>
```

Correct:

```text
403 verification failed
```

Similarly logs must contain:

```text
verification failed
```

not:

```text
verify_token=<secret>
```

---

# 74. Logging

Logs must be structured.

Example:

```json
{
  "event": "whatsapp.send.failed",
  "tenantId": "...",
  "attemptId": "...",
  "provider": "meta",
  "status": 400,
  "errorCode": "..."
}
```

Never log:

* access tokens
* secrets
* passwords
* payment credentials

---

# 75. Correlation IDs

Every request/event should ideally carry:

```text
requestId
```

Recovery operations additionally carry:

```text
recoveryAttemptId
```

This allows:

```text
HTTP
 ↓
API
 ↓
DB
 ↓
Outbox
 ↓
Worker
 ↓
Provider
```

to be reconstructed.

---

# 76. Observability Model

Three identifiers are especially important:

```text
request_id
outbox_event_id
recovery_attempt_id
```

External providers add:

```text
provider_message_id
provider_payment_id
```

---

# 77. Metrics

## API

* request count
* latency
* error rate
* 4xx
* 5xx

## Worker

* queue depth
* processing latency
* retry count
* failure count
* dead events

## Recovery

* attempts
* completed attempts
* failed attempts
* blocked decisions
* verified outcomes
* unknown outcomes

## WhatsApp

* sent
* delivered
* read
* failed
* replies

## Payments

* received
* matched
* unmatched
* reversed
* duplicate webhook

---

# 78. Performance

Initial targets:

| Component              |                       Target |
| ---------------------- | ---------------------------: |
| Recovery API           |               <1 sec typical |
| Dashboard              |              <500 ms typical |
| Customer workspace     |               <1 sec typical |
| Webhook acknowledgment |            fast/non-blocking |
| Worker retry           |                  exponential |
| DB queries             | indexed tenant-scoped access |

Actual targets should be validated under realistic load.

---

# 79. Performance Risks

Known areas requiring measurement:

### Reputation loop

Current worker reputation processing queries tenants sequentially.

Potential improvement:

```text
bounded concurrency
```

rather than unlimited parallelism.

### Outbox

Monitor:

* polling frequency
* batch size
* lock contention
* queue depth

### Database

Monitor:

* hot rows
* slow queries
* index usage
* connection pool saturation

---

# 80. Database Index Strategy

Indexes should prioritize:

```text
tenant_id
customer_id
invoice_id
recovery_attempt_id
provider_message_id
status
next_attempt_at
created_at
```

Composite indexes should reflect actual query patterns.

Do not blindly index every column.

---

# 81. N+1 Prevention

Recovery queue should avoid:

```text
1 query cases
+
N queries invoices
+
N queries customers
+
N queries outcomes
```

Prefer bounded/joined/batched queries.

---

# 82. Security Threat Model

Major threats:

| Threat                   | Mitigation                  |
| ------------------------ | --------------------------- |
| Cross-tenant access      | server tenant authorization |
| Worker mutation exposure | network + authentication    |
| Forged payment webhook   | signature verification      |
| Spoofed tenant metadata  | authoritative lookup        |
| Fake WhatsApp callback   | provider signature + ID     |
| Duplicate webhook        | idempotency                 |
| Replay                   | provider/event dedupe       |
| Secret leakage           | server-only secrets         |
| SQL injection            | parameterized queries       |
| Client tampering         | server authority            |

---

# 83. Audit Trail

Critical mutations should record:

```text
actor
tenant
entity
action
timestamp
request
result
recoveryAttemptId
```

The audit trail should be append-oriented.

---

# 84. Data Retention

Recovery evidence should not be deleted casually.

Especially:

```text
collection_actions
recovery_outcomes
provider IDs
payment evidence
```

Retention policy must preserve the ability to reconstruct recovery history.

---

# 85. Migration Requirements

Database migrations must:

* be sequential
* be reviewable
* preserve existing data
* define rollback/backout strategy where practical
* avoid destructive changes without explicit approval

Current architecture uses migration numbering, with migration 093 being the latest applied baseline from the audit.

---

# 86. Spine Migration Rule

Any migration touching:

```text
collection_actions
recovery_attempt_id
whatsapp_events
recovery_outcomes
payment attribution
```

is considered **spine-touching**.

Such changes require explicit architectural review.

---

# 87. Testing Strategy

Four levels:

```text
Unit
 ↓
Integration
 ↓
Adversarial
 ↓
Production validation
```

---

# 88. Unit Tests

Required for:

* decision engine
* attribution helper
* state machine
* payment calculations
* promise transitions
* retry classification
* validation

---

# 89. Integration Tests

Required for:

* API → DB
* API → outbox
* worker → DB
* webhook → outcome
* payment → invoice
* WhatsApp → recovery attempt
* offline sync

---

# 90. Adversarial Tests

Required tests include:

### Tenant spoof

Attempt:

```text
tenant A user
→ tenant B resource
```

Expected:

```text
403 / not found
```

### Payment spoof

Attempt manipulated payment metadata.

Expected:

```text
cannot redirect financial ownership
```

### Duplicate webhook

Send identical webhook twice.

Expected:

```text
one logical mutation
```

### Race

Two identical events concurrently.

Expected:

```text
one authoritative transition
one consumption
```

### Missing identity

Payment without recoveryAttemptId.

Expected:

```text
UNKNOWN attribution
```

---

# 91. B-05 Regression Test

The existing race test demonstrated:

```text
upsertCount = 2
```

The eventual regression test must assert:

```text
upsertCount = 1
consumptionCount = 1
finalState = deterministic
```

under concurrent execution.

---

# 92. B-04 Regression Test

Test:

```text
payment.notes.tenantId = victimTenant
```

while payment originates through an attacker-controlled context.

The expected result must demonstrate that authoritative server-side ownership prevents cross-tenant mutation.

---

# 93. B-01 Regression Test

After securing the worker endpoint:

```text
unauthenticated request
       ↓
401/403
```

must be asserted.

But first the reachability evidence determines whether the current exposure is externally exploitable.

---

# 94. Frontend Testing

Each major page must test:

* initial loading
* normal data
* empty state
* API error
* offline
* malformed values
* mobile layout
* navigation
* mutation success
* mutation failure
* rollback

---

# 95. Required Page Coverage

The audit baseline requires coverage of:

1. Dashboard
2. Recovery
3. Invoices
4. Invoice Detail
5. Customers
6. Customer Workspace
7. Cashflow
8. POS
9. Settings

Authentication pages should additionally be checked where relevant.

---

# 96. CI Requirements

Before merge:

```bash
pnpm --filter @billzo/shared build
pnpm --filter @billzo/shared test

pnpm --filter billzo-worker build
pnpm --filter billzo-worker test

pnpm --filter mini_saas_frontend typecheck
pnpm --filter mini_saas_frontend test

pnpm -r --sequential test
```

Targeted tests should run before the full suite.

---

# 97. Deployment Architecture

Conceptually:

```text
                  Internet
                     │
             ┌───────┴───────┐
             ▼               ▼
          Vercel          Provider
             │             Webhooks
             ▼               │
        Next.js/API          │
             │               │
             └──────┬────────┘
                    ▼
               PostgreSQL
                    │
                 Outbox
                    │
                    ▼
                 Worker
```

Actual B-01 topology must be established before declaring the worker network boundary.

---

# 98. Environment Separation

At minimum:

```text
development
staging
production
```

Secrets must not be copied casually between environments.

Production credentials must never be committed to Git.

---

# 99. Configuration

Configuration should be environment driven.

Examples:

```text
DATABASE_URL
META_ACCESS_TOKEN
META_APP_SECRET
GUPSHUP credentials
RAZORPAY credentials
WORKER_URL
REDIS_URL
```

Never hard-code production credentials.

---

# 100. Worker URL

`WORKER_URL` should be explicitly defined for deployments requiring frontend → worker communication.

Missing configuration must produce an observable configuration error, not a silent failure.

---

# 101. Feature Flags

Potential flags:

```text
WHATSAPP_ENABLED
AUTOMATED_REMINDERS_ENABLED
COGNITION_ENABLED
PAYMENT_RECONCILIATION_ENABLED
```

Flags must have:

* owner
* purpose
* default
* removal plan

Dead flags should not accumulate.

---

# 102. Cognition

The audit found cognition trigger/handler remnants.

Because cognition is intentionally halted:

> This is maintenance debt, not a reason to expand the architecture now.

Do not reactivate it until its design is explicitly approved.

---

# 103. Reliability Requirements

BillZo should survive:

* API restart
* worker restart
* database connection loss
* provider timeout
* webhook retry
* duplicate webhook
* browser offline state
* deployment restart

without losing financial truth.

---

# 104. Recovery Failure Semantics

When automation fails:

```text
Attempt
   ↓
FAILED
   ↓
Reason recorded
   ↓
Decision Engine reevaluates
   ↓
Merchant intervention if required
```

Do not silently mark failed actions as successful.

---

# 105. Provider Failure Classification

Example:

```text
400 invalid recipient
→ permanent

401 invalid credential
→ configuration failure

429 rate limit
→ retry

500 provider failure
→ retry

timeout
→ ambiguous / retry safely
```

Provider-specific mappings belong inside adapters.

---

# 106. Recovery Automation Safety

Automated action requires:

```text
eligible
+
authorized
+
consented
+
credit available
+
provider available
+
no blocking condition
```

Only then:

```text
send
```

---

# 107. Manual Override

Overrides must be:

* authenticated
* tenant scoped
* authorized
* audited
* explicit

Override must not silently destroy historical evidence.

---

# 108. Security Boundary

Trusted:

```text
server
worker
database
verified providers
```

Untrusted:

```text
browser
customer
external request
payment metadata
provider payload before verification
```

All trust transitions must be explicit.

---

# 109. Production Readiness Gate

The current audit should remain separate from feature development.

Current gate:

```text
B-01 reachability
        ↓
B-04 spoof evidence
        ↓
B-05 concurrency
        ↓
Frontend/PWA
        ↓
Severity re-evaluation
        ↓
Pass 2 approval
        ↓
Fixes
```

No source modifications during evidence gathering.

---

# 110. Current Confirmed Technical Findings

Based on the current audit state:

### B-05

**P1 confirmed**

Reason:

> concurrent events can mutate case state twice before consumption uniqueness prevents the second consumption record.

This is a real correctness issue.

### B-04

**P1 confirmed**

Reason:

> tenant resolution gives excessive authority to payment metadata.

The current evidence does not establish the stronger cross-tenant exploit required for P0.

### B-01

**Conditional**

Potentially:

```text
P0 externally reachable
P1/P2 internal-only depending on topology
```

### B-02

**P1**

Secret exposed in Meta webhook verification response.

### B-03

**P1**

Secret written to logs.

---

# 111. Pass 2 Fix Philosophy

Fixes should be:

* minimal
* targeted
* independently testable
* reversible
* observable

Preferred:

> **one bug → one small fix → regression → validation**

Avoid combining unrelated refactors.

---

# 112. B-05 Fix Direction

Likely approach:

```text
atomic consumption claim
        ↓
only winner mutates case
```

not:

```text
add another uniqueness constraint
```

The second approach alone does not solve the already-proven race.

---

# 113. B-04 Fix Direction

Prefer:

```text
provider payment ID
       ↓
BillZo payment/payment-request
       ↓
tenant
```

over:

```text
notes.tenantId
       ↓
tenant
```

This reduces metadata authority without requiring a payment architecture rewrite.

---

# 114. B-01 Fix Direction

If externally reachable:

> remove or authenticate mutation endpoints on the worker health server.

Prefer eliminating unnecessary public mutation surface over adding a complicated authentication system to an endpoint that should never have been public.

---

# 115. Data Consistency Principle

For financial state:

> **Strong correctness > eventual convenience.**

For analytics:

> eventual consistency is acceptable.

For recovery attribution:

> uncertain evidence must remain uncertain.

---

# 116. Eventual Consistency Boundaries

Acceptable:

```text
Payment received
 ↓
worker
 ↓
analytics updated 2 seconds later
```

Not acceptable:

```text
Payment received
 ↓
invoice incorrectly marked paid
```

or:

```text
unknown payment
 ↓
automatically attributed to reminder
```

---

# 117. Architecture Decision Records

Major architectural decisions should be recorded as ADRs.

Examples:

* Recovery attempt spine
* Attribution model
* Outbox design
* Provider abstraction
* Payment tenant resolution
* Offline mutation model
* Behavioral memory introduction

This prevents architectural drift.

---

# 118. Technical Debt Policy

Debt should be classified:

### Correctness debt

Fix immediately.

### Security debt

Fix based on exploitability.

### Performance debt

Measure before optimizing.

### Maintenance debt

Schedule when it affects delivery.

This prevents P3 observations from consuming the same engineering attention as P0/P1 issues.

---

# 119. Scaling Roadmap

## Current

```text
Next.js
Postgres
Worker
Outbox
Redis if required
```

## Growth

Add:

* worker replicas
* queue partitioning
* database optimization
* connection pooling
* caching

## Large scale

Only when metrics justify:

* dedicated services
* event streaming
* advanced queue infrastructure
* read replicas
* partitioning

---

# 120. Technical North Star

BillZo's technical architecture should make this statement true:

> **For every rupee recovered through BillZo, the system can explain what happened, which recovery action was involved, what evidence exists, and how confident the system should be about that causal relationship.**

And when it cannot prove the relationship:

> **BillZo must say that it cannot prove it.**

That principle is more important than adding another feature.

---

# 121. Final Architecture Summary

```text
                         BILLZO
                           │
              ┌────────────┴────────────┐
              │                         │
          Financial                  Recovery
           Truth                    Intelligence
              │                         │
       ┌──────┼──────┐            Decision Engine
       │      │      │                  │
    Invoice Payment Customer      Collection Action
       │      │      │                  │
       └──────┼──────┘                  │
              │                         │
           Database                     │
              │                         │
            Outbox ─────────────────────┘
              │
           Worker
              │
       ┌──────┴───────┐
       │              │
    WhatsApp       Payment
    Provider       Provider
       │              │
    Webhooks       Webhooks
       │              │
       └──────┬───────┘
              │
       Recovery Outcomes
              │
       Evidence History
              │
       Future Behavioral
            Memory
```

## The five technical invariants I would put at the very top of the engineering repository

> **1. Database owns financial truth.**

> **2. Decision Engine owns recovery decisions.**

> **3. `collection_actions.id` owns recovery-attempt identity.**

> **4. No identity chain → no causal attribution.**

> **5. Unknown is preferable to false certainty.**

That gives BillZo a technical architecture that is **serious without being overengineered**: PostgreSQL remains the financial source of truth, the worker handles durable asynchronous work, the outbox provides reliability, the decision engine controls recovery behavior, and the recovery-attempt spine provides the evidence needed for the eventual intelligence layer.
