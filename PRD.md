# BillZo — Product Requirements Document (PRD)

**Product:** BillZo  
**Document type:** Master Product Requirements Document  
**Version:** 1.0  
**Status:** Product/Engineering Baseline  
**Primary market:** India  
**Primary users:** SME owners, operators, accountants, collection teams  
**Product category:** Receivables recovery + payment collection + financial operations SaaS

---

# 1. Executive Summary

BillZo is a receivables recovery platform for Indian small and medium businesses that helps merchants **collect outstanding payments systematically instead of manually chasing customers**.

The central problem BillZo solves is not invoice creation.

It is:

> **“I have money stuck with customers. Who should I contact, what should I do next, and did that action actually help me recover the money?”**

BillZo combines:

- invoice/receivables management
- customer management
- payment collection
- UPI payment requests
- WhatsApp communication
- recovery decisioning
- promise-to-pay tracking
- manual collection actions
- payment reconciliation
- evidence-grade recovery history
- recovery analytics
- offline-capable PWA behavior

The product's strategic differentiation is the **closed recovery loop**:

> **Outstanding invoice → decision → action → communication → customer response → promise/payment → verified outcome → future decision**

BillZo should progressively become better at determining **what action is most appropriate for each customer**, based on evidence accumulated from previous recovery attempts.

---

# 2. Product Vision

### Vision

> **Make getting paid predictable for every small business.**

BillZo should become the operational layer between:

**Invoice issued**

and

**Money actually received.**

Traditional accounting systems primarily answer:

> “What money is owed?”

BillZo additionally answers:

> **“What should I do about it right now?”**

And eventually:

> **“What actually works for this customer?”**

---

# 3. Product Mission

BillZo exists to reduce:

- outstanding receivables
- collection delay
- manual follow-up work
- forgotten customer promises
- payment reconciliation effort
- uncertainty around collection effectiveness

while increasing:

- recovered cash
- collection consistency
- payment conversion
- visibility into receivables
- evidence quality
- merchant productivity

---

# 4. Problem Statement

## 4.1 Merchant problem

Indian SMEs frequently operate with:

- WhatsApp-based customer communication
- UPI payments
- bank transfers
- invoices generated from different systems
- spreadsheets
- accounting software
- manual reminders
- phone calls
- informal payment promises

The resulting workflow is fragmented.

A merchant may know:

> Customer owes ₹25,000.

But may not know:

- Should I message them?
- Should I call?
- Did I already remind them?
- Did they read the message?
- Did they promise to pay?
- Did they break the promise?
- Did the payment belong to this recovery attempt?
- Should I remind again?
- Is another reminder annoying the customer?
- Did my last action actually improve recovery?

BillZo converts this fragmented workflow into a structured recovery system.

---

# 5. Target Market

## 5.1 Primary ICP

Businesses with:

- recurring B2B invoices
- delayed payments
- 10–1,000+ active customers
- frequent WhatsApp communication
- UPI/bank payments
- owner-led or small finance teams

### Highest-priority segments

1. Distributors
2. Wholesalers
3. Small manufacturers
4. B2B service providers
5. Agencies
6. Contractors
7. Clinics/diagnostics
8. Coaching/tuition businesses
9. Professional services
10. Local suppliers

---

# 6. Personas

## Persona A — SME Owner

**Goal:** Get cash into the bank.

Needs:

- quick overview
- who owes money
- what requires attention
- minimal operational complexity

Doesn't want:

- accounting terminology
- complex dashboards
- unnecessary configuration

---

## Persona B — Collection Operator

**Goal:** Process outstanding cases efficiently.

Needs:

- prioritized recovery queue
- customer history
- previous actions
- promises
- payment status
- recommended next action

---

## Persona C — Accountant

**Goal:** Maintain financial correctness.

Needs:

- invoices
- payments
- reconciliation
- customer balances
- audit trail
- payment matching

---

## Persona D — Business Administrator

**Goal:** Configure and monitor BillZo.

Needs:

- WhatsApp connection
- team configuration
- permissions
- plans/credits
- integrations
- system status

---

# 7. Core Product Principle

BillZo should follow:

> **What to do → Why → How much**

Not:

> Data → charts → menus → actions

The product should always prioritize the merchant.

---

# 8. Architecture Overview

```text
Invoice issued
   ↓
Decision Engine
   ↓
Recovery Command Center
   ↓
Recommended action
   ↓
Merchant approves / BillZo executes
   ↓
WhatsApp / UPI / Call
   ↓
Customer response
   ↓
Payment / Promise
   ↓
Webhook / evidence
   ↓
Verified recovery outcome
   ↓
Invoice balance updated
   ↓
Recovery history updated
   ↓
Future decision improves
```

---

# 9. Core Product Modules

## 9.1 Dashboard

The Dashboard is the **portfolio-level financial overview**.

It should not duplicate the Recovery Center.

### Primary metrics

- Total Outstanding
- Recovery Focus
- Recovered This Month
- Overdue amount
- Overdue invoices
- customers requiring attention
- recovery performance
- exceptions

### Dashboard purpose

Answer:

> **“How is my receivables situation?”**

Not:

> “What should I do with this customer?”

That belongs in Recovery.

---

# 10. Recovery Command Center

Recovery is BillZo's core product surface.

It answers:

> **“What should I do today?”**

## Three primary states

### NEEDS YOU

BillZo cannot safely continue automatically.

Examples:

- customer requires a call
- broken promise
- blocked phone
- permanent transport failure
- dispute
- ambiguous payment
- unsupported recovery condition

CTA:

**You take action**

---

### BILLZO IS HANDLING

BillZo has a valid automated recovery action underway.

Examples:

- reminder being sent
- reminder scheduled
- customer recently contacted

CTA:

**Monitor**

---

### MONITORING

BillZo is waiting for evidence.

Examples:

- payment promise active
- reminder delivered
- customer response expected
- recovery window active

CTA:

**View details**

---

# 11. Recovery Card Requirements

Every recovery card should follow:

```text
STATUS

Customer
Outstanding amount
Invoice count

WHY
Evidence explaining the state

NEXT ACTION
What BillZo recommends

[ONE PRIMARY CTA]
```

Example:

```text
NEEDS YOU

Aniket
4 overdue invoices
₹4,816 outstanding

WHY
Payment promise was missed 2 days ago.

NEXT ACTION
Call customer

[Call Aniket]
```

Avoid:

- multiple competing CTAs
- meaningless confidence percentages
- generic “AI recommendation”
- technical internal state

---

# 12. Customer-Level Recovery Aggregation

Recovery should eventually operate primarily at **customer level**, not merely invoice level.

Example:

Instead of:

```text
Aniket
Invoice #101
₹1,200

Aniket
Invoice #102
₹2,000

Aniket
Invoice #103
₹1,616
```

show:

```text
Aniket
4 overdue invoices
₹4,816 outstanding

Recommended action:
Call customer
```

The invoice breakdown remains available through drilldown.

This prevents duplicate operational work.

---

# 13. Customer Workspace

Customer Workspace provides the full relationship context.

### Required sections

**Customer summary**

- customer name
- phone
- outstanding amount
- overdue amount
- invoice count
- payment status

**Invoices**

- invoice
- amount
- due date
- outstanding
- status

**Recovery**

- recovery attempts
- actions
- messages
- promises
- calls
- outcomes

**Payments**

- payment history
- matched/unmatched payments
- partial payments
- reversals

---

# 14. Invoice Management

BillZo must support:

### Invoice creation

- customer
- invoice number
- amount
- issue date
- due date
- line items
- notes
- payment terms

### Invoice states

At minimum:

```text
draft
issued
partially_paid
paid
overdue
disputed
cancelled
```

### Outstanding calculation

```text
Outstanding =
Invoice Total
− Confirmed Payments
+ Reversals/Adjustments
```

Never derive outstanding from UI state.

Backend remains authoritative.

---

# 15. Payment Collection

BillZo should support:

- UPI payment links
- UPI QR
- payment links
- bank transfer reconciliation
- manual payment recording
- payment webhooks

## Payment lifecycle

```text
Payment Requested
       ↓
Payment Initiated
       ↓
Payment Received
       ↓
Payment Verified
       ↓
Invoice Updated
       ↓
Recovery Updated
```

---

# 16. Payment Matching

Payment matching must be conservative.

### Match priority

1. Explicit invoice/payment reference
2. Explicit customer/payment identity
3. Provider metadata
4. Other authoritative identifiers
5. Manual review

**Never use time proximity as causal proof.**

Example:

A customer pays ₹10,000 ten seconds after a WhatsApp reminder.

That does **not** prove:

> “Reminder caused payment.”

unless the recovery attempt identity is explicitly connected.

---

# 17. Unmatched Payments

When BillZo cannot confidently determine the invoice:

Display:

> **Payment to review**

Not:

> Payment automatically matched

Merchant can:

- match payment
- split payment
- assign customer
- leave unmatched

---

# 18. Partial Payments

Example:

Invoice:

₹50,000

Payment:

₹20,000

BillZo should show:

```text
Invoice
₹50,000

Paid
₹20,000

Outstanding
₹30,000
```

Recovery remains active for the remaining amount.

---

# 19. Overpayments

If:

Invoice = ₹50,000

Payment = ₹60,000

BillZo must not silently close the invoice.

Possible state:

```text
Invoice paid
₹10,000 unapplied credit
```

Merchant can:

- apply credit
- refund
- leave as credit
- review

---

# 20. WhatsApp Integration

WhatsApp is a core recovery transport.

BillZo should use the merchant's connected WhatsApp identity rather than a shared BillZo number.

Desired onboarding:

```text
Merchant signs up
       ↓
Connect WhatsApp
       ↓
WhatsApp onboarding / coexistence
       ↓
Merchant number connected
       ↓
BillZo obtains authorized messaging capability
       ↓
Recovery reminders
       ↓
Customer replies
       ↓
BillZo receives webhook
       ↓
Recovery history updated
```

---

# 21. WhatsApp Messaging

Outbound message must carry:

```text
tenant
customer
invoice
recovery_attempt_id
provider
provider_message_id
```

The recovery attempt ID is the causal spine.

---

# 22. Recovery Evidence Spine

This is a **frozen architectural invariant**.

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

Rule:

> **No identity chain → no causal attribution.**

---

# 23. Attribution Rules

BillZo must distinguish:

### VERIFIED

Explicit identity proves the event belongs to the recovery attempt.

### UNKNOWN

The event happened but causality cannot be proven.

### CANDIDATE

Internal investigation state only.

`candidate` must never appear as a product-facing causal claim.

---

# 24. Recovery Decision Engine

The Decision Engine is the **single authority** for next-action decisions.

The frontend must not independently decide recovery actions.

Example hierarchy:

```text
Blocked phone
      ↓
NEEDS YOU

Blocked transport
      ↓
NEEDS YOU

Active promise
      ↓
MONITORING

Broken promise
      ↓
CALL

Read + ignored + overdue threshold
      ↓
CALL

Delivered + silent + overdue threshold
      ↓
CALL

Long overdue + never contacted
      ↓
REMIND

Reminder in waiting window
      ↓
MONITORING
```

---

# 25. Decision Engine Constraints

The engine must:

- fail closed on unknown states
- respect disputes
- respect paid invoices
- respect zero outstanding
- respect WhatsApp consent
- avoid repeated unnecessary reminders
- avoid blanket “overdue = call” logic
- return deterministic results

---

# 26. Manual Automation Mode

When automation requires merchant approval:

```text
decision = pending_approval
```

The system must not silently send the message.

Unattended WhatsApp sending requires explicitly recorded consent.

---

# 27. Recovery Attempts

Every actual recovery action should have a canonical attempt.

Example:

```text
collection_action
id = RA-123
tenant = T1
customer = C1
invoice = I1
action = send_reminder
```

Then every subsequent event references:

```text
recovery_attempt_id = RA-123
```

This provides causal continuity.

---

# 28. Recovery Outcomes

Possible outcomes include:

- reminder sent
- delivered
- read
- customer replied
- promise made
- promise kept
- promise broken
- call completed
- payment completed
- payment partially completed
- payment reversed

Each outcome must carry evidence of its attribution status.

---

# 29. Promise-to-Pay

Promise tracking must be explicit.

### Promise fields

- customer
- invoice
- promised amount
- promised date
- triggered_by_action_id
- status

Statuses:

```text
active
kept
broken
cancelled
unknown
```

### Promise rules

Promise kept:

> Payment occurs on or before promised date.

Promise broken:

> Required payment does not occur and the system transitions the promise to broken.

---

# 30. Recovery History

Recovery history should show:

```text
Date
Action
Channel
Evidence
Customer response
Outcome
```

Example:

```text
Aug 30
WhatsApp reminder
Delivered
Read
No response

Sep 2
WhatsApp reminder
Delivered
Customer replied

Sep 3
Promise
₹25,000 by Sep 5

Sep 5
Payment
₹25,000
Promise kept
```

---

# 31. Evidence Quality

BillZo must distinguish:

### Fact

> WhatsApp message delivered.

### Inference

> Customer may have seen the message.

### Verified outcome

> Payment was explicitly linked to the recovery attempt.

UI should never convert weak evidence into strong claims.

---

# 32. Recovery Analytics

Analytics should focus on operational outcomes.

### Core metrics

- recovered amount
- recovery rate
- days-to-payment
- overdue reduction
- reminders sent
- reminders delivered
- customer responses
- promises made
- promises kept
- calls completed

---

# 33. Future Customer Behavioral Memory

This should **not** be part of the initial architecture expansion.

Future phases:

### Phase 1

Deterministic evidence collection.

### Phase 2

Verified behavioral memory.

Examples:

> Customer usually pays after WhatsApp reminder.

> Customer frequently promises payment but misses the date.

> Customer responds better to calls.

### Phase 3

Adaptive recovery.

The engine can use:

```text
Current Evidence
+
Verified Customer History
+
Fallback Baseline
```

The baseline may use:

**3 / 5 / 7-day recovery windows**

depending on the maturity of the customer's history.

---

# 34. AI Strategy

BillZo should **not** initially position itself as:

> AI Finance Platform

or:

> AI Debt Collection

Instead:

> **Smart receivables recovery**

The decision engine should initially remain deterministic and explainable.

AI can later assist with:

- message personalization
- pattern detection
- prioritization
- anomaly detection
- recovery forecasting

But AI must not silently override financial truth.

---

# 35. Notifications

BillZo should notify merchants about events requiring intervention.

Examples:

- broken promise
- payment received
- payment unmatched
- WhatsApp disconnected
- customer reply
- transport failure
- recovery escalation

Notifications must be actionable.

Bad:

> “Payment event detected.”

Better:

> **₹18,000 payment received from Aniket. Review matching.**

---

# 36. Offline-First PWA

The PWA must remain useful when connectivity is poor.

## Offline capabilities

Potentially:

- view cached recovery queue
- view customer data
- view invoices
- record local actions
- queue supported mutations

When offline:

```text
User action
    ↓
Local pending state
    ↓
Reconnect
    ↓
Server submission
    ↓
Authoritative result
```

Server state remains authoritative.

---

# 37. Service Worker

Service worker registration should be production-only.

The system should support:

- cache versioning
- stale cache invalidation
- safe update
- online recovery
- failed synchronization handling

No financial mutation should be considered final merely because local storage says it succeeded.

---

# 38. Security Requirements

Critical security requirements:

### Tenant isolation

Every tenant-scoped request must enforce tenant identity server-side.

### No browser secrets

Never expose:

- Gupshup partner tokens
- Meta access tokens
- Razorpay secrets
- HMAC secrets

to frontend code.

### Webhook verification

Validate:

- Meta signatures
- payment signatures
- provider identity

before processing.

---

# 39. Worker Architecture

The worker handles asynchronous operations.

Examples:

- WhatsApp sends
- reminder jobs
- payment reconciliation
- promise transitions
- webhook processing
- retry
- outcome projection

The worker should remain independently deployable.

---

# 40. Outbox

The outbox provides durable asynchronous execution.

Required properties:

- idempotency
- retries
- tenant isolation
- causal metadata
- failure tracking
- backoff
- dead-letter/review capability where appropriate

---

# 41. Concurrency Requirements

The B-05 audit has already demonstrated a real race:

> Two concurrent events can both mutate case state before the consumption record is inserted.

Therefore the product architecture must eventually enforce:

> **One authoritative state transition per source event/case combination.**

A uniqueness constraint alone is insufficient if mutation happens first.

The Pass 2 fix should therefore target **atomicity**, not merely duplicate-record prevention.

---

# 42. Payment Webhook Security

The B-04 audit established a weaker tenant-resolution path:

```text
payment.notes.tenantId
```

is merchant-set metadata.

Although the tested exploit is not equivalent to arbitrary customer-controlled injection, tenant resolution should still prefer **server-authoritative payment/invoice records** over client/merchant metadata wherever possible.

Principle:

> **Metadata can assist lookup; it must not become the authority for financial ownership when authoritative server state exists.**

---

# 43. Worker Security

The B-01 audit remains conditional.

Worker mutation endpoints currently appear unauthenticated.

Final severity depends on reachability.

Required topology evidence:

```text
Internet
   ↓
Reverse proxy?
   ↓
Worker:10000
   ↓
Mutation endpoint
```

or:

```text
Vercel
   ↓
Private network
   ↓
Worker
```

Only the runtime evidence determines whether this becomes P0.

---

# 44. Subscription Model

BillZo can eventually use a hybrid model:

### Base subscription

Example:

**₹600/month**

Provides the core recovery platform.

### Reminder credits

Separate consumption-based allowance.

This creates an important business rule:

> **Subscription validity and reminder-credit availability are independent constraints.**

If credits are exhausted while subscription remains active:

```text
BillZo remains usable
       ↓
Invoices/payments/history accessible
       ↓
Automated reminders paused
       ↓
Merchant can purchase/add credits
```

Do not disable the entire product.

---

# 45. Credit Exhaustion UX

Display:

> **Reminder credits exhausted**

Then:

- show remaining subscription period
- show credits consumed
- offer top-up
- allow manual recovery actions
- prevent accidental automated sends

This preserves product utility while monetizing the high-value action.

---

# 46. Pricing Philosophy

Do not price primarily around:

- number of screens
- AI features
- storage
- generic accounting features

Price around:

> **Value recovered / collection activity enabled.**

Potential model:

```text
Free
↓
Starter
↓
Recovery
↓
Growth
```

with optional reminder-credit expansion.

---

# 47. Onboarding

Target onboarding time:

> **<10 minutes to first recovery case**

Flow:

```text
Sign up
 ↓
Business setup
 ↓
Import/create invoices
 ↓
Connect WhatsApp
 ↓
Review recovery queue
 ↓
Send first reminder
 ↓
Observe outcome
```

The user should reach the first useful action quickly.

---

# 48. Invoice Import

Important acquisition wedge:

> **“Import your outstanding invoices in 10 minutes.”**

Potential imports:

- CSV
- Excel
- accounting exports
- manual bulk upload

Future integrations:

- Tally
- Zoho
- Busy
- GST ecosystem

---

# 49. First-Value Moment

BillZo's activation event should not simply be:

> Account created.

Better:

> **Merchant sees a real customer in the Recovery Command Center and executes the first recovery action.**

Strong activation:

> First verified recovery outcome.

Best long-term activation:

> **First recovered rupee attributable to a BillZo recovery attempt.**

---

# 50. Core User Journey

```text
Merchant
   ↓
Create/import invoice
   ↓
Invoice becomes overdue
   ↓
Decision Engine evaluates case
   ↓
Recovery Command Center
   ↓
Recommended action
   ↓
Merchant approves / BillZo executes
   ↓
WhatsApp / UPI / Call
   ↓
Customer response
   ↓
Payment / Promise
   ↓
Webhook / evidence
   ↓
Verified recovery outcome
   ↓
Invoice balance updated
   ↓
Recovery history updated
   ↓
Future decision improves
```

---

# 51. Navigation

Recommended primary navigation:

```text
Dashboard
Recovery
Invoices
Customers
Cashflow
POS
Settings
```

Recovery should be visually prioritized.

---

# 52. Dashboard vs Recovery

### Dashboard

**Portfolio view**

> “How much money is outstanding?”

### Recovery

**Operational view**

> “Who needs attention?”

### Customer Workspace

**Relationship view**

> “What happened with this customer?”

### Invoice Detail

**Financial truth**

> “What exactly is owed?”

This separation prevents duplication.

---

# 53. POS

POS should remain secondary to BillZo's recovery proposition.

It may support:

- invoice generation
- quick sale
- UPI collection
- customer lookup
- payment confirmation

But POS should not turn BillZo into another generic retail POS system.

---

# 54. Cashflow

Cashflow provides:

- inflow
- outflow
- receivables
- payment trends
- expected collections

Important distinction:

> Expected cash is not the same as recovered cash.

Forecasts must be labeled accordingly.

---

# 55. Auditability

Every important financial/recovery mutation must be traceable.

Minimum causal information:

```text
tenant
actor
timestamp
entity
action
source
recovery_attempt_id
provider ID
result
```

---

# 56. Idempotency

Critical operations must be idempotent.

Examples:

- payment webhook
- WhatsApp delivery webhook
- read webhook
- reply webhook
- payment reconciliation
- promise transition
- reminder send

Repeated provider events must not duplicate outcomes.

---

# 57. Data Integrity Principles

BillZo must enforce:

### Server authority

Frontend is never financial authority.

### Explicit identity

No causal inference without identity.

### Idempotency

Repeated events produce one logical outcome.

### Tenant isolation

No cross-tenant data access.

### Fail closed

Unknown state should not trigger risky automation.

---

# 58. Error Handling

Errors should be classified.

### User-actionable

> WhatsApp needs reconnecting.

### Temporary

> Payment provider unavailable. Retrying.

### Permanent

> Customer phone number is invalid.

### Unknown

> BillZo could not verify the recovery outcome.

Never hide important errors behind generic:

> FEATURE_LOCKED

when the real failure is authorization, configuration, transport, or infrastructure.

---

# 59. Observability

Production observability should cover:

### API

- latency
- errors
- tenant
- route

### Worker

- queue depth
- retry count
- failure rate
- processing latency

### WhatsApp

- send
- delivered
- read
- failed
- provider error

### Payments

- webhook success
- reconciliation
- unmatched payments
- duplicate events

### Recovery

- attempts
- outcomes
- failures
- decision distribution

---

# 60. Performance Requirements

Initial targets:

| Metric             |                            Target |
| ------------------ | --------------------------------: |
| Dashboard API      |                   <500 ms typical |
| Recovery queue     |                    <1 sec typical |
| Customer workspace |                    <1 sec typical |
| Mutation response  | <1 sec excluding provider latency |
| Worker retry       |               exponential backoff |
| Webhook processing |               idempotent and fast |

These are initial product targets, not enterprise SLAs.

---

# 61. Scalability Requirements

BillZo must eventually support:

- multiple tenants
- concurrent recovery actions
- webhook bursts
- payment bursts
- worker horizontal scaling
- queue backpressure
- provider rate limits

Scaling strategy:

```text
PWA
 ↓
API
 ↓
Database
 ↓
Outbox
 ↓
Workers
 ↓
External Providers
```

Avoid premature:

- Kafka
- microservices explosion
- event-sourcing rewrite
- ML infrastructure
- distributed databases

until actual load requires them.

---

# 62. Product KPIs

## North Star Metric

### **Recovered Rupees through BillZo**

This is stronger than:

- DAU
- messages sent
- invoices created

because it measures the actual economic outcome.

---

## Supporting KPIs

### Activation

- invoices imported
- first recovery case
- first reminder
- first payment

### Recovery

- recovered ₹
- recovery rate
- median days to payment
- overdue reduction

### Automation

- reminders sent
- delivery rate
- response rate
- automated recovery rate

### Quality

- verified attribution rate
- unknown outcome rate
- duplicate outcome rate
- failed automation rate

---

# 63. Recovery Funnel

BillZo should measure:

```text
Overdue
 ↓
Eligible for recovery
 ↓
Action taken
 ↓
Message delivered
 ↓
Customer engaged
 ↓
Promise/payment
 ↓
Payment verified
 ↓
Recovered
```

This allows BillZo to identify where recovery fails.

---

# 64. Moat

The moat is **not**:

- UI
- WhatsApp integration
- UPI
- dashboards
- decision trees
- generic AI

The long-term moat is:

> **Evidence-grade customer-specific recovery history.**

If BillZo can reliably establish:

```text
Customer
   ↓
Debt
   ↓
Action
   ↓
Response
   ↓
Outcome
```

over months/years, BillZo develops a dataset competitors cannot easily reproduce.

That creates the possibility of:

- better recovery decisions
- better customer-specific timing
- better communication strategy
- cashflow prediction
- credit decision support
- partner-led financial products

---

# 65. Fintech Expansion Strategy

BillZo should not become a lender prematurely.

Recommended progression:

```text
Receivables SaaS
       ↓
Payment Collection
       ↓
Reconciliation
       ↓
Recovery Intelligence
       ↓
Consent-based Receivables Data
       ↓
Credit Decision Support
       ↓
Partner-led Lending / Factoring / TReDS
       ↓
Potential regulated financial institution
```

The data asset should mature before taking balance-sheet risk.

---

# 66. Trust Model

BillZo must optimize for:

> **Correctness before intelligence.**

A dumb but correct system is preferable to:

> intelligent-looking but financially incorrect automation.

Especially for:

- payments
- attribution
- customer identity
- tenant identity
- recovery outcomes

---

# 67. MVP Scope

## Must Have

### Financial

- customers
- invoices
- outstanding balances
- payments
- partial payments
- reconciliation

### Recovery

- recovery queue
- decision engine
- recovery attempts
- manual calls
- WhatsApp reminders
- promises
- outcomes

### Communication

- WhatsApp integration
- delivery/read/reply webhooks

### Platform

- multi-tenancy
- authentication
- tenant isolation
- audit trail
- PWA

---

# 68. Should Have

- invoice import
- payment matching
- recovery analytics
- customer aggregation
- offline queue
- reminder credits
- team permissions
- advanced dashboard

---

# 69. Later

- behavioral memory
- personalized recovery timing
- message optimization
- recovery forecasting
- accounting integrations
- financial partner integrations
- credit decision support

---

# 70. Explicit Non-Goals

BillZo should **not** initially attempt to become:

- full ERP
- complete accounting replacement
- full POS competitor
- CRM
- payroll system
- inventory management suite
- lending platform
- generic AI assistant
- communication super-app

Every additional module must strengthen the **receivables → recovery → payment** loop.

---

# 71. Release Strategy

## Phase 0 — Reliability

Current focus:

- security audit
- recovery integrity
- payment integrity
- concurrency
- frontend/PWA reliability
- worker reachability
- observability

---

## Phase 1 — Merchant Pilot

Target:

**20–50 merchants**

Goal:

Prove:

> BillZo recovers money better than the merchant's existing process.

Measure:

- ₹ recovered
- time saved
- collection delay reduced
- successful recovery actions

---

## Phase 2 — Repeatability

Expand to:

**100–500 merchants**

Focus:

- onboarding
- integrations
- reliability
- pricing
- support
- repeatable acquisition

---

## Phase 3 — Recovery Intelligence

Introduce:

- verified behavioral memory
- customer-specific patterns
- adaptive decisioning

---

## Phase 4 — Financial Infrastructure

Potential:

- receivables financing
- factoring
- TReDS
- partner lending
- credit intelligence

---

# 72. Acceptance Criteria

BillZo is product-ready for pilot when:

### Financial

- invoice balances are authoritative
- payments are idempotent
- partial payments work
- unmatched payments remain reviewable
- reversals don't corrupt balances

### Recovery

- every actual recovery action gets an attempt ID
- decision engine is authoritative
- no unsafe action bypasses
- outcomes preserve evidence

### WhatsApp

- merchant number is correctly connected
- outbound messages carry attempt identity
- provider callbacks resolve by provider ID
- unmatched callbacks remain unknown

### Security

- tenant isolation verified
- secrets not exposed
- webhook signatures verified
- worker exposure understood

### PWA

- all major pages have loading/error/empty states
- offline behavior is explicit
- reconnect synchronization is safe
- optimistic updates roll back correctly

### Reliability

- duplicate events don't duplicate outcomes
- concurrency tests pass
- worker retry works
- failures are observable

---

# 73. Current Engineering Gate

Based on the current audit state, BillZo should be considered:

> **Architecturally serious but operationally hardening.**

The current audit gate remains:

```text
B-01 Reachability
       ↓
B-04 Payment Spoof
       ↓
B-05 Concurrency
       ↓
Frontend/PWA
       ↓
Final Severity Re-evaluation
       ↓
Pass 2 Approval
       ↓
Minimal Fixes
```

No architectural redesign should interrupt this sequence.

---

# 74. Product Golden Rules

These should be treated as BillZo's permanent engineering/product principles:

1. **Decision Engine owns decisions.**
2. **Database owns financial truth.**
3. **Recovery attempts own causal identity.**
4. **Provider IDs own external-event identity.**
5. **No identity chain means no causal attribution.**
6. **Unknown is better than false certainty.**
7. **Frontend is never the source of financial truth.**
8. **Automation must fail closed.**
9. **Every risky mutation must be idempotent.**
10. **Tenant isolation is mandatory.**
11. **Evidence precedes intelligence.**
12. **Recovered rupees matter more than feature count.**
13. **BillZo should reduce collection work, not create another dashboard people must manage.**
14. **Don't build infrastructure before the business requires it.**
15. **The long-term moat is trustworthy recovery history.**

---

# 75. One-Sentence Product Definition

> **BillZo is an evidence-driven receivables recovery platform that tells Indian SMEs who to contact, what action to take, automates safe payment follow-ups through WhatsApp and UPI, and learns what actually works by linking every recovery action to verified customer outcomes.**

This is the PRD direction I would use as the **master product baseline**. It deliberately keeps BillZo focused on its strongest wedge—**getting SMEs paid faster**—rather than allowing the product to drift into another generic accounting/ERP application.
