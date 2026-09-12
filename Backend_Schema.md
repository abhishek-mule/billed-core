# BillZo Backend Schema Specification

**Document:** Backend Database Schema & Data Model
**Version:** 1.0
**Status:** Architecture Baseline
**Database:** PostgreSQL
**Architecture:** Multi-tenant, event-driven recovery platform
**Primary invariant:** `collection_actions.id == recovery_attempt_id`

---

# 1. Purpose

The BillZo database must support five things simultaneously:

1. **Financial truth** — invoices, payments, balances.
2. **Customer/business identity** — tenants, customers, contacts.
3. **Recovery execution** — actions and recovery attempts.
4. **Evidence** — WhatsApp events, delivery/read/reply, promises, calls, payments.
5. **Decisioning** — current recovery state derived from authoritative evidence.

The database must **not** turn inferred relationships into financial or recovery truth.

---

# 2. Core Architecture

The backend is conceptually divided into:

```text
TENANT
  │
  ├── Customers
  │      └── Invoices
  │              └── Payments
  │
  └── Recovery
          │
          └── collection_actions
                  │
                  ▼
           recovery_attempt_id
                  │
       ┌──────────┼──────────┐
       ▼          ▼          ▼
   WhatsApp    Promise      Call
       │          │          │
       └──────────┼──────────┘
                  ▼
          recovery_outcomes
                  │
                  ▼
          Decision Engine
```

The key concept is:

> **A recovery action creates the causal identity.**

---

# 3. Multi-Tenant Boundary

Every business-owned record must be tenant-scoped.

Conceptually:

```sql
tenant_id UUID NOT NULL
```

on tenant-owned tables.

Tenant isolation must exist at multiple levels:

```text
Authentication
      ↓
Authorization
      ↓
tenant_id resolution
      ↓
database query
      ↓
business operation
```

Never rely on the frontend to supply a trusted tenant ID.

---

# 4. Tenant

## `tenants`

Represents the merchant/business using BillZo.

```text
tenants
──────────────
id
name
legal_name
status
plan_id
created_at
updated_at
```

### Important fields

| Field        | Type      | Purpose               |
| ------------ | --------- | --------------------- |
| `id`         | UUID      | Tenant identity       |
| `name`       | TEXT      | Display name          |
| `legal_name` | TEXT      | Legal business name   |
| `status`     | enum      | Active/suspended/etc. |
| `plan_id`    | FK        | Subscription plan     |
| `created_at` | timestamp | Creation              |
| `updated_at` | timestamp | Last update           |

---

# 5. Tenant Isolation

Every query should conceptually be:

```sql
WHERE tenant_id = :authenticatedTenantId
```

Never:

```sql
WHERE id = :clientProvidedId
```

without independently establishing tenant ownership.

---

# 6. Users

## `users`

Represents people accessing BillZo.

```text
users
──────────────
id
email
name
status
created_at
updated_at
```

---

# 7. Tenant Membership

## `tenant_members`

A user may belong to one or more businesses.

```text
tenant_members
──────────────
id
tenant_id
user_id
role
created_at
```

Constraint:

```text
UNIQUE(tenant_id, user_id)
```

Possible roles:

```text
owner
admin
accountant
operator
viewer
```

---

# 8. Customers

## `customers`

Represents a customer/debtor of the merchant.

```text
customers
──────────────
id
tenant_id
name
phone
email
address
external_reference
created_at
updated_at
```

Indexes:

```text
(tenant_id, id)
(tenant_id, phone)
(tenant_id, name)
```

---

# 9. Customer Identity

Customer identity is important because recovery operates at customer level.

Do not create a second recovery-specific customer identity table unless there is a genuine identity requirement.

The same canonical:

```text
customers.id
```

should be reused throughout recovery.

---

# 10. Walk-In Customers

Walk-in invoices may historically lack a customer ID.

That is a known data-quality case.

Do not fabricate:

```text
customer_id = random UUID
```

to make the UI convenient.

Instead:

```text
customer_id = NULL
```

means customer identity is unavailable.

The system may display a virtual grouping for UX purposes, but must not turn it into verified customer identity.

---

# 11. Invoices

## `invoices`

Canonical financial obligation.

```text
invoices
──────────────
id
tenant_id
customer_id
invoice_number
issue_date
due_date
total_amount
paid_amount
outstanding_amount
currency
status
dispute_status
last_recovery_action_id
created_at
updated_at
```

---

# 12. Invoice Ownership

Invariant:

```text
invoice.tenant_id
    =
invoice.customer.tenant_id
```

when `customer_id` exists.

Cross-tenant customer assignment must be rejected.

---

# 13. Invoice Status

Possible states:

```text
draft
issued
partially_paid
paid
overdue
disputed
cancelled
```

However, avoid using status as the sole source of financial truth.

The authoritative financial state should be consistent with payment ledger data.

---

# 14. Invoice Amounts

Conceptually:

```text
total
  -
payments
  =
outstanding
```

Do not allow:

```text
outstanding < 0
```

unless the product explicitly supports credits/overpayments.

---

# 15. Payments

## `payments`

Represents actual financial receipts.

```text
payments
──────────────
id
tenant_id
invoice_id
amount
currency
payment_method
provider
provider_payment_id
reference
status
paid_at
created_at
updated_at
```

---

# 16. Payment Idempotency

External provider payment identity must be unique within its appropriate scope.

For example:

```text
UNIQUE(tenant_id, provider, provider_payment_id)
```

This prevents duplicate webhook processing from creating duplicate payments.

---

# 17. Payment States

Recommended:

```text
pending
completed
failed
refunded
reversed
```

The exact lifecycle depends on provider integration.

---

# 18. Payment Matching

Payment matching should distinguish:

```text
matched
unmatched
ambiguous
```

An ambiguous payment must **not automatically close an invoice**.

---

# 19. Payment Attribution

A payment may have a recovery relationship.

But:

```text
payment happened after reminder
```

does **not** prove:

```text
reminder caused payment
```

Therefore recovery attribution requires explicit identity.

---

# 20. Collection Actions

## `collection_actions`

This is the **causal spine**.

Conceptually:

```text
collection_actions
────────────────────
id
tenant_id
customer_id
invoice_id
action_type
channel
status
provider
billzo_message_id
created_at
completed_at
failed_at
error
```

---

# 21. Recovery Attempt Identity

BillZo's core invariant:

```text
collection_actions.id
        =
recovery_attempt_id
```

Do not introduce another independent recovery-attempt identity unless absolutely necessary.

The action itself is the attempt.

---

# 22. Action Types

Possible:

```text
whatsapp_reminder
call
payment_request
manual_followup
```

Future actions may include:

```text
email
sms
visit
```

but should only be added when actually implemented.

---

# 23. Collection Action Lifecycle

Typical:

```text
created
   ↓
in_progress
   ↓
completed
```

Failure:

```text
created
   ↓
in_progress
   ↓
failed
```

Some queued provider operations may legitimately remain:

```text
in_progress
```

until their transport state is resolved.

---

# 24. Why Actions Must Exist Before Transport

Correct:

```text
Create collection_action
        ↓
obtain recovery_attempt_id
        ↓
send WhatsApp
```

Incorrect:

```text
send WhatsApp
        ↓
try to create action
```

The latter destroys causal identity at the exact moment the evidence begins.

---

# 25. WhatsApp Events

## `whatsapp_events`

Represents WhatsApp communication evidence.

```text
whatsapp_events
────────────────────
id
tenant_id
customer_id
recovery_attempt_id
direction
event_type
provider
provider_message_id
billzo_message_id
phone
payload/reference
created_at
```

---

# 26. WhatsApp Event Types

Typical:

```text
outbound
sent
delivered
read
failed
inbound
reply
```

Provider-specific events may be normalized into these semantic states.

---

# 27. Provider Message Identity

The critical identity:

```text
provider_message_id
```

must be preserved.

It is the bridge between:

```text
Meta/Gupshup
       ↓
BillZo
       ↓
WhatsApp event
       ↓
recovery attempt
```

---

# 28. WhatsApp Identity Chain

Canonical chain:

```text
collection_actions.id
       ↓
whatsapp_events.recovery_attempt_id
       ↓
provider_message_id
       ↓
delivery/read/reply webhook
```

Never use:

```text timestamp
+
customer
```

as causal identity.

---

# 29. WhatsApp Webhook Data

Raw provider payloads should be retained or safely referenced for debugging/audit where appropriate.

But the application should operate primarily on normalized fields.

Example:

```text
provider = meta
event_type = delivered
provider_message_id = META_MESSAGE_ID
```

---

# 30. WhatsApp Status Projection

Delivery state can be projected onto application-facing state:

```text
queued
sent
delivered
read
failed
```

But the underlying event evidence should remain append-only where practical.

---

# 31. Recovery Outcomes

## `recovery_outcomes`

This records what actually happened after a recovery attempt.

Conceptually:

```text
recovery_outcomes
────────────────────
id
tenant_id
recovery_attempt_id
outcome_type
attribution_state
provider_message_id
metadata
created_at
```

---

# 32. Outcome Types

Examples:

```text
customer_replied
promise_made
promise_kept
promise_broken
payment_completed
call_completed
```

Only implemented outcome types should enter production schema.

---

# 33. Attribution State

BillZo has three internal states:

```text
verified
unknown
candidate
```

### Product-facing

Only:

```text
verified
unknown
```

should normally surface.

### Candidate

Internal-only.

It must never become a merchant-facing causal claim.

---

# 34. Verified

An outcome is:

```text
verified
```

only when explicit identity proves:

```text
outcome
    ↓
specific recovery attempt
```

---

# 35. Unknown

Use:

```text
unknown
```

when the event exists but causality cannot safely be established.

Example:

```text
Payment received
+
No recovery_attempt_id
```

Result:

```text
payment.completed
attribution = unknown
```

---

# 36. Candidate

Candidate may be used internally during investigation/reconciliation.

It should not be interpreted as:

> probably caused by this reminder.

It is an intermediate evidence state.

---

# 37. Promise Table

## `payment_promises`

Conceptually:

```text
payment_promises
────────────────────
id
tenant_id
customer_id
invoice_id
amount
promise_date
status
triggered_by_action_id
created_at
updated_at
```

---

# 38. Promise Trigger Identity

Critical field:

```text
triggered_by_action_id
```

It should reference:

```text
collection_actions.id
```

when the promise originated from a known recovery action.

---

# 39. Promise Lifecycle

```text
active
   ↓
kept
```

or:

```text
active
   ↓
broken
```

Promise status should be derived from explicit payment/evidence rules rather than subjective timing.

---

# 40. Promise Kept

A promise is kept when qualifying payment satisfies the promise within the defined promise-date rule.

Do not mark:

```text
promise_kept
```

just because:

```text
payment eventually happened
```

---

# 41. Calls

Calls should use the same recovery identity system.

Conceptually:

```text
collection_actions
       ↓
call execution
       ↓
call outcome
```

If the call has:

```text recovery_attempt_id
```

the resulting outcome can be:

```text verified
```

Otherwise:

```text unknown
```

---

# 42. Outbox

## `outbox`

The outbox coordinates asynchronous work.

Conceptually:

```text
outbox
──────────────
id
tenant_id
event_type
aggregate_id
payload
status
attempt_count
next_attempt_at
processed_at
error
causation_id
created_at
```

---

# 43. Outbox Purpose

Application transaction:

```text
DB mutation
+
outbox event
```

should be committed atomically where required.

Then:

```text
worker
 ↓
claim
 ↓
process
 ↓
provider/database
 ↓
mark processed
```

---

# 44. Outbox States

Typical:

```text
pending
processing
completed
failed
```

Retries should use:

```text
next_attempt_at
```

rather than aggressive polling.

---

# 45. Outbox Idempotency

Every event that can be retried must have a stable identity.

Processing:

```text
event X
```

twice must not produce:

```text
payment X twice
promise X twice
recovery outcome X twice
```

---

# 46. Event Consumption

The existing BillZo architecture includes:

## `recovery_case_event_consumptions`

Purpose:

```text
source event
+
recovery case
```

must be processed once.

Conceptual constraint:

```text
UNIQUE(source_event_id, case_id)
```

This is an important idempotency mechanism.

---

# 47. Critical Concurrency Finding

The database currently has an important distinction:

```text
consumption insert
```

is protected by uniqueness, but that does **not** automatically make:

```text
case state mutation
```

atomic.

The proven race is:

```text
Event A ── read consumption absent ── mutate case
Event B ── read consumption absent ── mutate case
Event A ── insert consumption
Event B ── insert consumption → conflict
```

Therefore:

> **The consumption constraint protects the record, not necessarily the preceding state mutation.**

This is currently a confirmed P1 hardening issue.

---

# 48. Recovery Cases

## `recovery_cases`

Represents the current recoverable case/state.

Conceptually:

```text
recovery_cases
────────────────────
id
tenant_id
customer_id
invoice_id
state
version
created_at
updated_at
```

The exact fields should follow the existing case-machine implementation rather than duplicating invoice state.

---

# 49. Case State

The case machine should remain the authority for transitions.

The database should not contain multiple competing implementations of recovery state.

---

# 50. Decision Engine

The database does **not** become the decision engine.

Instead:

```text
DB evidence
   ↓
Decision Engine
   ↓
decision
   ↓
API
   ↓
UI
```

The UI must never independently reconstruct:

```text call
remind
waiting
monitoring
```

from raw database fields.

---

# 51. Recovery Decision Data

A decision can conceptually contain:

```text
section
action
reason
evidence
```

Example:

```json
{
  "section": "needs_you",
  "action": "call",
  "reason": "...",
  "evidence": [...]
}
```

This is an API projection, not necessarily a new database table.

---

# 52. Recovery History

Do **not** create a second recovery-history database.

History should be reconstructed/projected from:

```text
collection_actions
        +
whatsapp_events
        +
recovery_outcomes
        +
payment_promises
        +
payments
```

where explicit identity exists.

---

# 53. Identity Resolution

Correct:

```text
provider_message_id
        ↓
whatsapp_events
        ↓
recovery_attempt_id
```

Incorrect:

```text
customer_id
+
created_at proximity
        ↓
guess attempt
```

---

# 54. Financial Evidence vs Recovery Evidence

These are related but not identical.

### Financial evidence

```text
invoice
payment
refund
reversal
credit
```

### Recovery evidence

```text
reminder
delivery
read
reply
call
promise
```

A payment can exist without proving recovery causality.

---

# 55. Payment → Recovery

Possible:

```text
Payment
   ↓
explicit recovery_attempt_id
   ↓
verified payment.completed
```

or:

```text
Payment
   ↓
no explicit attempt
   ↓
unknown recovery attribution
```

---

# 56. Refund/Reversal

A reversal should not simply delete the original payment.

Correct conceptual model:

```text
payment.completed
       ↓
payment.reversed
```

The financial state is recomputed/adjusted.

Recovery state may reopen if the invoice becomes outstanding again.

---

# 57. Partial Payments

Example:

```text
Invoice = ₹50,000

Payment = ₹20,000

Outstanding = ₹30,000
```

Recovery remains active.

Never mark:

```text
paid
```

until the financial state actually reaches zero.

---

# 58. Overpayment

If:

```text
payment > outstanding
```

do not silently invent invoice settlement semantics.

Possible handling:

```text
credit balance
unapplied amount
review required
```

depending on BillZo's accounting policy.

---

# 59. Disputes

A disputed invoice should be represented explicitly.

Recovery automation must not blindly continue normal reminders.

Conceptually:

```text
invoice
 ↓
dispute
 ↓
recovery automation restricted
```

The exact dispute workflow should remain a business-policy layer.

---

# 60. Consent

WhatsApp automation must preserve consent state.

Conceptually:

```text
whatsapp_consent
────────────────
tenant_id
customer_id
status
source
captured_at
revoked_at
```

Possible:

```text
granted
revoked
unknown
```

If the current implementation stores this differently, preserve the existing canonical representation rather than creating a duplicate.

---

# 61. WhatsApp Connection

Tenant-level WhatsApp configuration:

```text
whatsapp_connections
────────────────────
id
tenant_id
provider
phone_number
phone_number_id
business_account_id
status
created_at
updated_at
```

Sensitive credentials must not be exposed through normal application queries.

---

# 62. Provider Credentials

Never store:

```text
access_token
client_secret
partner_secret
```

in frontend-visible records.

Credential storage should be isolated and access-controlled.

If encryption/secrets infrastructure is available, use it rather than treating PostgreSQL plaintext as a secret store.

---

# 63. Provider Abstraction

Database records should identify the provider:

```text
meta
gupshup
```

but business logic should not spread provider-specific logic across every table/query.

Transport layer:

```text
TransportRegistry
       ↓
Provider adapter
```

---

# 64. Recovery Transport

Conceptually:

```text
recovery_attempt
      ↓
transport
      ↓
provider
      ↓
provider_message_id
```

This allows:

```text
Meta
```

and:

```text
Gupshup
```

to produce the same normalized recovery evidence.

---

# 65. Audit Logs

A separate audit mechanism should capture security-sensitive administrative operations.

Examples:

```text
override created
override removed
settings changed
connection changed
payment manually adjusted
```

Audit records should contain:

```text
actor
tenant
action
target
timestamp
metadata
```

Do not use audit logs as recovery causality.

---

# 66. Recovery Overrides

Overrides must be distinguishable from normal decision-engine state.

Conceptually:

```text
recovery_override
────────────────────
tenant_id
customer_id
action
reason
created_by
expires_at
created_at
```

Overrides should still obey hard financial/consent restrictions.

---

# 67. Subscription

Conceptual:

```text
subscriptions
────────────────
id
tenant_id
plan_id
status
started_at
expires_at
provider_reference
```

Possible states:

```text
trial
active
past_due
expired
cancelled
```

---

# 68. Reminder Credits

If credits are part of the current commercial model:

```text
reminder_credit_accounts
──────────────────────────
tenant_id
balance
updated_at
```

and preferably a ledger:

```text
reminder_credit_ledger
──────────────────────────
id
tenant_id
amount
type
reference
created_at
```

Types:

```text
purchase
consumption
refund
adjustment
```

A ledger is safer than treating `balance` as the only historical truth.

---

# 69. Credit Consumption

A reminder should consume credit exactly once.

Therefore the credit operation needs idempotency tied to:

```text
recovery_attempt_id
```

Conceptually:

```text
UNIQUE(tenant_id, recovery_attempt_id)
```

for consumption records.

---

# 70. Why This Matters

Without this:

```text
retry
 ↓
same reminder
 ↓
two credit deductions
```

can occur.

The recovery attempt identity gives us a natural idempotency key.

---

# 71. Tenant-Level Indexing

Most indexes should begin with:

```text
tenant_id
```

Examples:

```text
(tenant_id, customer_id)
(tenant_id, invoice_id)
(tenant_id, created_at)
(tenant_id, status)
```

This helps both isolation and query performance.

---

# 72. Important Unique Constraints

Expected categories:

```text
tenant membership
provider payment identity
provider message identity
event consumption
credit consumption
```

Every uniqueness constraint should answer:

> **What duplicate does this prevent?**

Avoid indexes/constraints that exist merely because they "might be useful."

---

# 73. Foreign Keys

Critical relationships should use FKs.

Examples:

```text
customers.tenant_id → tenants.id

invoices.tenant_id → tenants.id

invoices.customer_id → customers.id

collection_actions.tenant_id → tenants.id

collection_actions.customer_id → customers.id

whatsapp_events.recovery_attempt_id
    → collection_actions.id

recovery_outcomes.recovery_attempt_id
    → collection_actions.id

payment_promises.triggered_by_action_id
    → collection_actions.id
```

---

# 74. Recovery Attempt Deletion

The recovery evidence relationship should be protected.

The existing architecture intentionally uses:

```text
recovery_outcomes.recovery_attempt_id
ON DELETE RESTRICT
```

because deleting the attempt would destroy causal evidence.

This is the correct direction for an evidence-grade recovery system.

---

# 75. Unknown Outcomes

An unknown outcome may legitimately have:

```text
recovery_attempt_id = NULL
```

because no causal identity exists.

That is preferable to inventing a relationship.

---

# 76. Append-Only Evidence

The strongest evidence tables should behave as append-oriented records:

```text
whatsapp_events
recovery_outcomes
audit_events
```

Corrections should preferably be represented by new events/state projections rather than destructive rewriting of history.

---

# 77. Current State vs Evidence

This distinction is critical.

### Current state

```text
invoice.outstanding_amount
recovery_case.state
whatsapp connection status
```

### Evidence

```text
whatsapp_events
recovery_outcomes
payments
promises
collection_actions
```

Current state may change.

Evidence should preserve what actually happened.

---

# 78. Event Ordering

Do not assume:

```text created_at
```

alone establishes causal ordering.

Use explicit relationships whenever available:

```text recovery_attempt_id
provider_message_id
provider_event_id
outbox event ID
payment provider ID
```

---

# 79. Idempotency Layers

BillZo should have multiple independent idempotency boundaries:

```text
HTTP request
      ↓
collection action
      ↓
outbox
      ↓
provider message
      ↓
webhook
      ↓
outcome
```

Each layer should prevent duplicate effects at its own boundary.

---

# 80. Webhook Idempotency

Webhook delivery may be repeated.

Therefore:

```text
same provider event
```

must not create:

```text
two outcomes
```

Use provider event/message identity wherever available.

---

# 81. Webhook Tenant Resolution

This is especially important for payment providers.

Never make a client-controlled field such as:

```text payment.notes.tenantId
```

the sole trusted source of tenant ownership for a financial mutation.

The current audit classified this as **confirmed P1** because the weakness is real, even though the investigated exploit path requires additional attacker knowledge and provider-side conditions.

---

# 82. Secure Payment Resolution

Preferred conceptual chain:

```text provider payment ID
       ↓
server-side payment/link lookup
       ↓
known tenant
       ↓
known invoice
       ↓
financial mutation
```

Client/merchant metadata can be supporting information, not the sole authority.

---

# 83. Worker Architecture

Database:

```text
PostgreSQL
     ↓
outbox
     ↓
worker
     ↓
handlers
     ↓
provider
```

Worker should not directly mutate arbitrary tenant records based only on untrusted payload data.

---

# 84. Worker Health Server

The current architecture exposes a worker health server around:

```text worker:10000
```

The mutation endpoints found during audit are:

```text /api/v1/recovery/override
/api/v1/recovery/clear-override
/api/v1/recovery/trigger-reminder
```

These require explicit network-boundary/authentication treatment.

This is currently conditional:

```text P0 if externally reachable
P1/P2 if internal-only depending on topology
```

The final classification must come from the runtime reachability test.

---

# 85. Database Transaction Boundaries

Financial mutations should be transactional.

For example:

```text BEGIN

update payment
update invoice
insert recovery outcome
insert outbox event

COMMIT
```

A partial transaction must not leave contradictory financial state.

---

# 86. Recovery Action Transaction

For a manual reminder:

```text BEGIN

create collection_action

create/send outbox job

COMMIT
```

Then the worker processes the transport asynchronously.

This preserves the attempt identity even if the provider later fails.

---

# 87. State Machine Transaction

Case-machine transitions must ensure:

```text event accepted
        +
case state mutation
        +
consumption
```

are protected from concurrent duplicate effects.

This is precisely where the confirmed B-05 race requires hardening.

---

# 88. Recommended Concurrency Model

The desired invariant is:

```text one logical event
        ↓
one accepted transition
        ↓
one state mutation
        ↓
one consumption
```

Possible implementation mechanisms include:

```text
row-level locking
atomic insert-before-mutation
transactional compare-and-swap
serializable transaction
```

Choose the smallest mechanism that satisfies the invariant; don't introduce distributed infrastructure unnecessarily.

---

# 89. Soft Delete

Use soft deletion only where business history requires it.

For example:

```text customer archived
```

may be appropriate.

But avoid soft-deleting everything.

For evidence tables, preserving records through retention policy is more important than generic `deleted_at` fields.

---

# 90. Timestamps

Use UTC timestamps for persisted backend events where practical:

```text created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Convert to IST at presentation/operational scheduling boundaries.

The decision engine's business-hour rules should explicitly use:

```text Asia/Kolkata
```

rather than server-local time.

---

# 91. Monetary Types

Do not use floating-point types for financial amounts.

Prefer:

```text NUMERIC
```

with an explicit currency policy.

Example:

```text amount NUMERIC(18,2)
```

or the project's existing precision standard.

---

# 92. Currency

Every monetary record should either:

1. explicitly carry currency, or
2. inherit from a strongly defined tenant/business currency.

For India-first BillZo:

```text INR
```

is the initial dominant currency.

But don't hardcode currency assumptions into generic financial tables if multi-currency may eventually matter.

---

# 93. Database Schema Layers

A useful conceptual organization:

```text
01 Identity
   tenants
   users
   memberships

02 CRM
   customers

03 Financial
   invoices
   payments
   adjustments

04 Recovery Spine
   collection_actions
   recovery_cases

05 Evidence
   whatsapp_events
   recovery_outcomes
   payment_promises
   call outcomes

06 Async
   outbox
   event consumptions

07 Commercial
   subscriptions
   reminder credits

08 Integrations
   WhatsApp connections
   provider mappings

09 Governance
   audit events
   overrides
```

---

# 94. Core Relationship Diagram

```text
                         ┌──────────────┐
                         │   tenants    │
                         └──────┬───────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
        ┌──────────┐      ┌────────────┐    ┌──────────────┐
        │  users   │      │ customers  │    │ subscription │
        └──────────┘      └─────┬──────┘    └──────────────┘
                                │
                                ▼
                         ┌────────────┐
                         │  invoices  │
                         └─────┬──────┘
                               │
                               ▼
                         ┌────────────┐
                         │  payments  │
                         └────────────┘


                         RECOVERY SPINE

                         ┌────────────────────┐
                         │ collection_actions │
                         │       ATTEMPT       │
                         └──────────┬─────────┘
                                    │
                  ┌─────────────────┼──────────────────┐
                  │                 │                  │
                  ▼                 ▼                  ▼
          ┌──────────────┐  ┌──────────────┐   ┌────────────┐
          │ WhatsApp     │  │   Promise    │   │    Call    │
          │   events     │  │              │   │            │
          └──────┬───────┘  └──────┬───────┘   └─────┬──────┘
                 │                 │                 │
                 └─────────────────┼─────────────────┘
                                   ▼
                         ┌───────────────────┐
                         │ recovery_outcomes │
                         └───────────────────┘
```

---

# 95. Canonical Causal Chain

The backend's most important chain is:

```text
Tenant
  ↓
Customer
  ↓
Invoice
  ↓
Collection Action
  ↓
Recovery Attempt
  ↓
WhatsApp Event
  ↓
Provider Message ID
  ↓
Delivery / Read / Reply
  ↓
Promise / Call / Payment
  ↓
Recovery Outcome
  ↓
Decision Engine
  ↓
Next Action
```

Where:

```text
Collection Action ID
=
Recovery Attempt ID
```

---

# 96. Data Integrity Rules

The following should be treated as hard invariants.

### Identity

```text
No identity chain
→ no verified attribution
```

### Tenant

```text
No cross-tenant record ownership
```

### Payment

```text
No duplicate provider payment effect
```

### Recovery

```text
No duplicate logical case transition
```

### WhatsApp

```text
Provider identity beats timestamp
```

### Evidence

```text
Unknown ≠ inferred
```

### Decisioning

```text
Decision Engine is authoritative
```

---

# 97. What Should NOT Be in the Schema

Avoid prematurely adding:

```text
customer_behavior_profiles
customer_risk_scores
AI_predictions
ML_embeddings
recovery_probability
generic_event_graph
Kafka offsets
microservice-specific databases
```

None of these are necessary for the current BillZo architecture.

The moat comes from **trustworthy historical recovery evidence**, not from creating hundreds of tables.

---

# 98. Future Behavioral Memory

Phase 2 can derive customer-level behavioral memory from:

```text
verified recovery outcomes
```

For example:

```text
customer
 ↓
verified historical attempts
 ↓
response/payment patterns
 ↓
deterministic behavioral memory
```

This should be a **derived layer**, not something that contaminates the primary evidence model.

---

# 99. Future Adaptive Recovery

Phase 3:

```text
current invoice evidence
+
verified historical customer outcomes
+
current constraints
        ↓
adaptive decision
```

The database should therefore preserve enough evidence to support this later without implementing ML prematurely.

---

# 100. Schema Philosophy

The BillZo backend should follow:

> **Financial state is authoritative. Recovery actions create identity. Events provide evidence. Outcomes encode verified consequences. The decision engine determines what happens next.**

The schema should remain deliberately boring.

That is a feature.

---

# 101. Final Backend Model

If I reduce the entire BillZo backend to its essential data model:

```text
                    BILLZO
                       │
              ┌────────┴────────┐
              │                 │
          FINANCIAL          RECOVERY
              │                 │
       ┌──────┴──────┐          │
       │             │          │
    Invoice       Payment       │
       │             │          │
       └──────┬──────┘          │
              │                 │
              └──────┬──────────┘
                     │
                     ▼
             COLLECTION ACTION
                     │
                     │
              RECOVERY ATTEMPT
                     │
        ┌────────────┼────────────┐
        │            │            │
     WhatsApp      Promise       Call
        │            │            │
        └────────────┼────────────┘
                     │
                     ▼
             RECOVERY OUTCOME
                     │
                     ▼
              DECISION ENGINE
                     │
                     ▼
               NEXT ACTION
```

**This should remain the canonical backend-data philosophy for BillZo.**

The most important architectural rule is not any individual table. It is the fact that **`collection_actions.id` is the causal spine connecting an intentional recovery action to the evidence and outcome that follow**. That is what prevents BillZo from eventually making false claims such as *“this reminder recovered ₹20,000”* when the database cannot actually prove it.
