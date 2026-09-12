# BillZo — UI/UX & Workflow Specification

**Version:** 1.0  
**Status:** Product Design Baseline  
**Platform:** Web / PWA  
**Primary users:** SME owner, accountant, collection operator  
**Primary goal:** Turn outstanding receivables into recovered cash with minimum merchant effort.

---

# 1. UX North Star

BillZo should answer three questions immediately:

> **What needs my attention?**
> **Why does it need attention?**
> **What should I do next?**

The interface should therefore follow:

**WHAT → WHY → ACTION**

rather than:

**DATA → CHART → MENU → ACTION**

---

# 2. Core UX Principle

BillZo is **not another accounting dashboard**.

The user should never need to mentally calculate:

> “Which customer should I chase today?”

BillZo should calculate that for them.

The primary experience is:

```text
Outstanding money
       ↓
BillZo evaluates evidence
       ↓
Prioritized recovery state
       ↓
Recommended action
       ↓
Merchant executes / approves
       ↓
Evidence arrives
       ↓
State changes
```

---

# 3. Information Architecture

Primary navigation:

```text
┌─────────────────────┐
│ BillZo              │
├─────────────────────┤
│ Dashboard           │
│ Recovery            │
│ Invoices            │
│ Customers           │
│ Cashflow            │
│ POS                 │
│ Settings            │
└─────────────────────┘
```

### Priority

**Recovery** should receive the strongest visual emphasis because it is BillZo's differentiating workflow.

---

# 4. Dashboard vs Recovery

This distinction must remain extremely clear.

## Dashboard

Answers:

> **“How is my business financially?”**

Contains:

* outstanding
* recovered
* overdue
* recovery performance
* cashflow
* exceptions

---

## Recovery

Answers:

> **“Who needs attention right now?”**

Contains:

* NEEDS YOU
* BILLZO IS HANDLING
* MONITORING

---

## Customer Workspace

Answers:

> **“What happened with this customer?”**

---

## Invoice Detail

Answers:

> **“What exactly is owed?”**

---

# 5. Global Layout

Desktop:

```text
┌──────────────┬──────────────────────────────────────┐
│              │ Header                               │
│              ├──────────────────────────────────────┤
│ Sidebar      │                                      │
│              │ Main content                         │
│ Dashboard   │                                      │
│ Recovery    │                                      │
│ Invoices    │                                      │
│ Customers   │                                      │
│ Cashflow    │                                      │
│ POS         │                                      │
│ Settings    │                                      │
└──────────────┴──────────────────────────────────────┘
```

Mobile:

```text
┌─────────────────────────┐
│ Header                  │
├─────────────────────────┤
│                         │
│ Main content            │
│                         │
│                         │
├─────────────────────────┤
│ Home Recovery Invoices  │
│ Customers More          │
└─────────────────────────┘
```

Navigation must never cover:

* CTAs
* FAB
* important content
* bottom sheets

---

# 6. Dashboard UX

## Hero

The first screen should communicate financial position.

Example:

```text
Good morning

₹4.82L
Outstanding

₹1.74L
Overdue

₹68,400
Recovered this month
```

But avoid making the page feel like a banking dashboard.

---

# 7. Recovery Focus

A dashboard card should answer:

> **“How much money currently needs recovery attention?”**

Example:

```text
Recovery Focus

₹1,24,800
across 18 invoices

7 customers need attention

[Open Recovery]
```

This is the bridge into the core workflow.

---

# 8. Dashboard Performance

Possible metrics:

```text
Recovered this month
₹68,400

Recovery rate
72%

Average days to payment
8.4 days
```

Do not expose uncalibrated “AI confidence” as probability.

If explanatory detail is needed:

> **Decision basis**

rather than:

> 83% confidence

---

# 9. Exceptions

Exceptions should be actionable.

Example:

```text
Needs attention

3 payments to review
2 broken promises
1 WhatsApp connection issue

[Review]
```

---

# 10. Recovery Command Center

This is the most important screen.

Header:

```text
Recovery

₹1,24,800 outstanding
18 invoices
7 customers need attention
```

Then:

```text
NEEDS YOU
────────────────────────

BILLZO IS HANDLING
────────────────────────

MONITORING
────────────────────────
```

---

# 11. Recovery Summary Bar

Use a compact summary:

```text
₹1.24L outstanding

7 NEEDS YOU
5 BILLZO IS HANDLING
3 MONITORING
```

Avoid huge charts.

The merchant came here to act.

---

# 12. NEEDS YOU

This section represents cases where BillZo cannot safely continue automatically.

Examples:

* broken promise
* invalid phone
* blocked transport
* dispute
* manual intervention required
* ambiguous payment
* recovery escalation

---

# 13. NEEDS YOU Card

Example:

```text
┌────────────────────────────────────┐
│ NEEDS YOU                           │
│                                    │
│ Aniket                              │
│ 4 overdue invoices                 │
│ ₹4,816 outstanding                  │
│                                    │
│ WHY                                │
│ Payment promise was missed 2 days  │
│ ago.                               │
│                                    │
│ NEXT ACTION                         │
│ Call customer                       │
│                                    │
│ [Call Aniket]                       │
└────────────────────────────────────┘
```

Only **one primary CTA**.

---

# 14. BILLZO IS HANDLING

This means the system has an active recovery action.

Example:

```text
┌────────────────────────────────────┐
│ BILLZO IS HANDLING                 │
│                                    │
│ Raj Traders                        │
│ ₹12,500 outstanding                 │
│                                    │
│ WHY                                │
│ Reminder sent today.               │
│ Waiting for customer response.     │
│                                    │
│ NEXT ACTION                         │
│ Wait for response                   │
│                                    │
│ [View Activity]                     │
└────────────────────────────────────┘
```

---

# 15. MONITORING

Monitoring means BillZo has sufficient evidence to wait.

Example:

```text
┌────────────────────────────────────┐
│ MONITORING                         │
│                                    │
│ ABC Distributors                   │
│ ₹32,000 outstanding                 │
│                                    │
│ WHY                                │
│ Customer promised payment by       │
│ Sep 10.                             │
│                                    │
│ NEXT ACTION                         │
│ Monitor promise                    │
│                                    │
│ [View Promise]                     │
└────────────────────────────────────┘
```

---

# 16. Recovery Card Hierarchy

Every card follows:

```text
1. STATUS
2. CUSTOMER
3. MONEY
4. WHY
5. NEXT ACTION
6. CTA
```

Never:

```text
Customer
Invoice number
timestamp
provider
event ID
technical status
...
```

The UI should expose operational meaning, not backend implementation.

---

# 17. Customer Aggregation

This is an important UX rule.

If one customer has:

```text
Invoice A ₹1,000
Invoice B ₹2,000
Invoice C ₹4,000
```

don't create three competing recovery cards.

Prefer:

```text
Aniket

3 overdue invoices
₹7,000 outstanding

Recommended:
Call customer

[Call]
```

Then drill into invoice-level details.

---

# 18. Walk-in Customer

Avoid multiple confusing “Walk-in Customer” cards.

Aggregate where possible:

```text
Walk-in Customer

8 overdue invoices
₹18,420 outstanding

Recovery status:
Needs review
```

If identity is insufficient for customer-level recovery, make that limitation explicit rather than inventing identity.

---

# 19. Recovery Empty State

If there are no cases:

```text
You're all caught up

No customers currently need recovery.

We'll let you know when something needs attention.
```

Do not show:

> No data found.

---

# 20. Recovery Error State

If API fails:

```text
We couldn't load your recovery queue.

Your financial data is safe.

[Try again]
```

Avoid generic:

> Something went wrong.

---

# 21. Recovery Loading State

Use skeletons for:

* summary
* cards
* customer information

Avoid showing a blank page.

---

# 22. Recovery Detail Drawer

Clicking a recovery card can open:

```text
Customer
Outstanding
Invoices
Current decision
Decision basis
Recovery history
Payments
Promises
```

Example:

```text
Aniket

₹4,816 outstanding

4 overdue invoices

CURRENT STATUS
NEEDS YOU

DECISION BASIS
Promise missed 2 days ago.

RECOVERY HISTORY
...
```

---

# 23. Decision Basis

Instead of:

> AI confidence 87%

show:

```text
Decision basis

• Promise was due 2 days ago
• No qualifying payment recorded
• Previous reminder was delivered
• Customer has not responded
```

This builds trust.

---

# 24. Action Confirmation

For consequential actions:

```text
Call customer?

Aniket
₹4,816 outstanding
Promise missed 2 days ago

[Cancel] [Call]
```

For low-risk actions, avoid unnecessary confirmation dialogs.

---

# 25. WhatsApp Send Workflow

Manual reminder:

```text
Recovery
 ↓
Customer card
 ↓
Send Reminder
 ↓
Preview
 ↓
Confirm
 ↓
Create recovery attempt
 ↓
Send/queue message
 ↓
Result
```

---

# 26. WhatsApp Preview

Example:

```text
Send WhatsApp reminder

To:
Aniket

Invoice:
INV-1024

Outstanding:
₹4,816

Message preview:

Hi Aniket,
Just a reminder regarding the outstanding
amount of ₹4,816...

[Cancel] [Send Reminder]
```

---

# 27. WhatsApp Sending State

After clicking send:

```text
Sending reminder…

Recovery attempt created
```

Do not immediately display:

> Reminder sent

unless the server has confirmed the relevant state.

---

# 28. WhatsApp Success

Example:

```text
Reminder sent

Aniket has been contacted.

We'll monitor delivery and response.

[View Recovery]
```

---

# 29. WhatsApp Failure

Example:

```text
Reminder couldn't be sent.

Reason:
WhatsApp connection failed.

No payment or invoice data was changed.

[Reconnect WhatsApp]
```

If failure is permanent:

```text
WhatsApp unavailable for this customer.

Recommended action:
Call customer

[Call]
```

---

# 30. Recovery Activity Timeline

Customer workspace:

```text
TODAY
│
├── Reminder sent
│
├── Delivered
│
└── Read

SEP 5
│
├── Promise made
│   ₹20,000 by Sep 7
│
SEP 7
│
└── Payment received
    ₹20,000
```

Each event should show its evidence status where useful.

---

# 31. Verified vs Unknown UI

Don't expose internal `candidate`.

For a verified event:

```text
Payment
₹20,000

Recovery outcome
Verified
```

For an event lacking causal identity:

```text
Payment received
₹20,000

Recovery attribution
Could not be verified
```

This is much safer than pretending every payment resulted from a reminder.

---

# 32. Invoice Detail UX

Header:

```text
Invoice #INV-1024

₹50,000
₹30,000 outstanding

OVERDUE 18 DAYS
```

Actions:

```text
[Request Payment]
[Record Payment]
[View Recovery]
```

---

# 33. Invoice Financial Breakdown

```text
Invoice total      ₹50,000
Paid               ₹20,000
Outstanding        ₹30,000
```

Keep this visually simple.

---

# 34. Payment Recording

Flow:

```text
Invoice
 ↓
Record Payment
 ↓
Amount
 ↓
Payment method
 ↓
Reference
 ↓
Confirm
 ↓
Server processing
 ↓
Updated balance
```

---

# 35. Partial Payment UX

After ₹20,000 payment:

```text
Payment recorded

₹20,000 received

Remaining:
₹30,000

Recovery remains active.
```

Do not imply the customer fully settled.

---

# 36. Unmatched Payment UX

```text
Payment received

₹15,000

We couldn't safely match this payment
to an invoice.

[Review Payment]
```

Never silently assign it based solely on timing.

---

# 37. Customer Workspace

Structure:

```text
Customer
├── Overview
├── Invoices
├── Recovery
├── Payments
└── Activity
```

---

# 38. Customer Header

```text
Aniket Traders

+91 XXXXX XXXXX

₹4,816 outstanding
4 overdue invoices

[Call]
[WhatsApp]
```

---

# 39. Customer Overview

Show:

* outstanding
* overdue
* paid recently
* active promise
* current recovery status

Example:

```text
Recovery status
NEEDS YOU

Reason:
Promise missed 2 days ago.
```

---

# 40. Customer Invoice List

```text
Invoice      Due       Outstanding
INV-1024     Aug 20    ₹1,200
INV-1031     Aug 24    ₹2,000
INV-1037     Aug 27    ₹1,616
```

---

# 41. Customer Recovery History

Should focus on actions and outcomes:

```text
Aug 28
WhatsApp reminder
Delivered
Read
No response

Sep 2
Call
Completed

Sep 3
Promise
₹4,816 by Sep 5

Sep 5
Promise broken
```

---

# 42. Customers Page

Purpose:

> Relationship overview.

Not another recovery queue.

Useful columns:

* customer
* outstanding
* overdue
* invoices
* last activity
* recovery status

---

# 43. Customers Search

Search by:

* customer name
* phone
* invoice number

Search should be fast and forgiving.

---

# 44. Invoices Page

Purpose:

> Financial receivables management.

Filters:

```text
All
Outstanding
Overdue
Paid
Disputed
```

Sort:

* amount
* overdue age
* due date

---

# 45. Invoice Filters

Useful quick filters:

```text
Overdue > 7 days
Overdue > 30 days
₹10,000+
No recovery attempt
Promise broken
```

These should complement Recovery, not replace it.

---

# 46. Cashflow Page

Purpose:

> Understand actual and expected cash movement.

Sections:

```text
Cash received
Expected collections
Outstanding receivables
Cash trend
```

Clearly distinguish:

**Actual**

from

**Expected**

---

# 47. POS UX

Keep POS fast.

Primary interaction:

```text
Select customer
 ↓
Add items
 ↓
Total
 ↓
UPI / cash / other payment
 ↓
Receipt
```

Do not add recovery complexity into the checkout path.

---

# 48. Settings

Group settings:

```text
Business
Team
WhatsApp
Payments
Recovery
Subscription
Notifications
Security
```

---

# 49. WhatsApp Settings

Show:

```text
WhatsApp

CONNECTED

Number
+91 XXXXX XXXXX

Status
Active

[Manage Connection]
```

If disconnected:

```text
WhatsApp disconnected

Automated reminders are paused.

[Reconnect]
```

---

# 50. Reminder Credits UI

Show credits without making the product feel punitive.

Example:

```text
Reminder credits

42 remaining

Used this month
58

[Add credits]
```

When exhausted:

```text
Reminder credits exhausted

Your BillZo account is still active.

Automated reminders are paused.
Manual recovery actions remain available.

[Add credits]
```

---

# 51. Subscription UX

Separate:

```text
Plan
₹600/month

Subscription
Active until Sep 30

Reminder credits
0 remaining
```

Do not conflate subscription expiry with reminder-credit exhaustion.

---

# 52. Notifications

Notifications should be action-oriented.

Good:

> **₹18,000 received from Aniket — review matching.**

Good:

> **Promise missed by Raj Traders — call recommended.**

Bad:

> Payment event received.

---

# 53. Notification Priority

### Critical

* payment/reversal
* security issue
* WhatsApp disconnected
* broken promise

### Important

* recovery action required
* unmatched payment

### Informational

* reminder delivered
* customer read message

---

# 54. Mobile UX

BillZo should be designed mobile-first for the operational workflow.

Recovery card:

```text
┌──────────────────────────┐
│ NEEDS YOU                │
│                          │
│ Aniket                   │
│ ₹4,816                   │
│ 4 overdue invoices       │
│                          │
│ Promise missed           │
│ 2 days ago               │
│                          │
│ [Call Aniket]            │
└──────────────────────────┘
```

No tiny text.

---

# 55. Touch Targets

Interactive controls should have comfortable touch areas.

Avoid:

* tiny icon-only buttons
* tightly packed controls
* hidden swipe-only actions

---

# 56. FAB

If a floating action button exists:

It should represent the **single most common creation action**, such as:

> * Invoice

It should not obscure:

* navigation
* cards
* CTAs
* bottom sheets

---

# 57. Bottom Navigation

Recommended mobile:

```text
Home
Recovery
Invoices
Customers
More
```

Recovery should be directly accessible.

---

# 58. Offline UX

When offline:

```text
You're offline

Showing recently synced data.

Some actions will wait until you're connected.
```

Do not simply disable the whole application.

---

# 59. Offline Mutation

Example:

```text
Record action
      ↓
Saved locally
      ↓
Pending sync
      ↓
Connection restored
      ↓
Server submission
      ↓
Confirmed
```

UI status:

```text
Pending sync
```

not:

```text
Completed
```

---

# 60. Reconnection

After connection returns:

```text
Back online

Syncing 2 pending actions…
```

Then:

```text
All changes synced.
```

If conflict occurs:

```text
One action needs review.

[Review]
```

---

# 61. Optimistic Updates

For low-risk UI:

```text
clicked
 ↓
optimistic
 ↓
server confirmation
```

For financial mutations:

```text
clicked
 ↓
processing
 ↓
server confirmation
 ↓
refresh authoritative state
```

This is safer.

---

# 62. Error UX

Every page needs:

### Loading

Skeleton.

### Empty

Helpful explanation + next action.

### Error

What failed + retry.

### Offline

Clear connection state.

### Permission

Explain access restriction.

---

# 63. Error Message Principles

Never:

> Error 500

Prefer:

> We couldn't load your invoices right now.

Then:

**[Try again]**

Technical details can go into diagnostics, not the merchant UI.

---

# 64. Workflow — New Merchant

```text
Landing
 ↓
Sign up
 ↓
Business setup
 ↓
Dashboard
 ↓
Import invoices
 ↓
Review customers
 ↓
Connect WhatsApp
 ↓
Recovery queue
 ↓
First recommended action
```

Goal:

> **First recovery action within 10 minutes.**

---

# 65. Workflow — Import Invoices

```text
Invoices
 ↓
Import
 ↓
Upload CSV/Excel
 ↓
Map columns
 ↓
Preview
 ↓
Validation
 ↓
Import
 ↓
Results
```

Result:

```text
46 invoices imported
41 valid
5 need review
```

---

# 66. Workflow — First Recovery

```text
Dashboard
 ↓
Recovery Focus
 ↓
Open Recovery
 ↓
NEEDS YOU / BILLZO IS HANDLING
 ↓
Customer
 ↓
Recommended action
 ↓
CTA
 ↓
Action
```

The merchant should not navigate through five screens to send a reminder.

---

# 67. Workflow — Automatic Reminder

```text
Invoice overdue
 ↓
Decision Engine
 ↓
Eligible?
 ├── No → no automation
 └── Yes
      ↓
Consent?
 ├── No → merchant intervention
 └── Yes
      ↓
Credits?
 ├── No → automation paused
 └── Yes
      ↓
Create recovery attempt
      ↓
Queue/send
      ↓
Provider
      ↓
Delivery
      ↓
Read/reply
      ↓
Outcome
```

---

# 68. Workflow — Broken Promise

```text
Promise active
 ↓
Promise date reached
 ↓
Payment check
 ├── Payment satisfies promise
 │      ↓
 │    KEPT
 │
 └── No qualifying payment
        ↓
      BROKEN
        ↓
      Decision Engine
        ↓
      CALL
        ↓
      NEEDS YOU
```

---

# 69. Workflow — Customer Replies

```text
Customer reply
 ↓
Provider webhook
 ↓
Signature verification
 ↓
Provider message identity
 ↓
Resolve recovery attempt
 ↓
Store inbound event
 ↓
Decision Engine reevaluates
 ↓
Recovery state changes
```

UI:

```text
Customer replied

"Will pay tomorrow."

[Record promise]
```

---

# 70. Workflow — Payment Received

```text
Payment provider
 ↓
Webhook
 ↓
Verify signature
 ↓
Resolve payment
 ↓
Match invoice
 ↓
Update financial state
 ↓
Resolve recovery outcome
 ↓
Update Recovery
```

If causal identity exists:

```text
Recovery outcome
VERIFIED
```

If not:

```text
Recovery attribution
UNKNOWN
```

---

# 71. Workflow — Customer Paid in Full

```text
Payment received
 ↓
Invoice outstanding = ₹0
 ↓
Recovery case no longer actionable
 ↓
Decision engine
 ↓
REMOVE FROM ACTIVE RECOVERY
```

UI:

```text
Recovered

₹25,000 paid

Invoice settled.
```

---

# 72. Workflow — WhatsApp Failure

```text
Send attempt
 ↓
Provider failure
 ↓
Classify
 ├── temporary → retry
 └── permanent → stop automation
                     ↓
                  NEEDS YOU
                     ↓
                  Call customer
```

---

# 73. Workflow — Unmatched Payment

```text
Payment received
 ↓
No safe invoice match
 ↓
Payment to review
 ↓
Merchant reviews
 ├── Match
 ├── Split
 └── Leave unmatched
```

Never auto-close an invoice based on weak evidence.

---

# 74. Workflow — Subscription Active / Credits Exhausted

```text
Subscription active
        +
Reminder credits = 0
        ↓
Automated reminders blocked
        ↓
Recovery remains accessible
        ↓
Manual actions remain available
        ↓
Add credits
```

---

# 75. Workflow — Subscription Expired

```text
Subscription expired
 ↓
Automation blocked
 ↓
Read-only / restricted state according to plan policy
 ↓
Renew
```

Exact billing restrictions should be defined separately from recovery UX.

---

# 76. Search UX

Global search can support:

```text
Search customer
Search invoice
Search phone
```

Example:

> “Aniket”

Results:

```text
Aniket Traders
₹4,816 outstanding
4 invoices
NEEDS YOU
```

---

# 77. Filters UX

Filters should be task-oriented.

Bad:

```text
Filter by event type
Filter by internal status
Filter by transport layer
```

Good:

```text
Needs attention
Overdue > 30 days
Promise broken
No recovery attempt
Payment to review
```

---

# 78. Design System

BillZo should have a restrained financial SaaS visual language.

### Characteristics

* clean
* trustworthy
* compact
* high information density
* strong hierarchy
* minimal decoration

Avoid:

* excessive gradients
* giant illustrations
* excessive glassmorphism
* “AI magic” effects
* noisy dashboards

---

# 79. Color Semantics

Colors should communicate state consistently.

### Red

Requires attention / risk.

### Amber

Waiting / warning.

### Green

Recovered / completed.

### Neutral

Information / monitoring.

Do not use color as the only state indicator.

---

# 80. Typography

Hierarchy:

```text
Page title
Section title
Customer name
Amount
Status
Supporting explanation
Metadata
```

Avoid extremely small labels.

Important financial values should be easy to scan.

---

# 81. Accessibility

Requirements:

* keyboard navigation
* screen-reader labels
* sufficient contrast
* focus indicators
* semantic buttons
* touch-friendly controls
* no color-only meaning
* accessible modal/drawer behavior

---

# 82. Motion

Animation should communicate state changes.

Useful:

* card movement when recovery status changes
* success transition
* sync indicator
* loading skeleton

Avoid:

* decorative animations
* long transitions
* animations that delay actions

---

# 83. Data Freshness

UI should indicate stale/offline state when relevant.

Example:

```text
Last synced 3 min ago
```

This is particularly useful for offline recovery data.

---

# 84. Server vs UI Responsibilities

### Server

Owns:

* decision
* financial state
* recovery state
* permissions
* attribution
* payment matching
* automation eligibility

### UI

Owns:

* presentation
* interaction
* local temporary state
* navigation
* optimistic visual state

This boundary must remain strict.

---

# 85. Recovery Decision → UI Mapping

The API should return a semantic decision.

For example:

```ts
{
  section: "needs_you",
  action: "call",
  reason: "...",
  evidence: [...]
}
```

The UI maps that to:

```text
NEEDS YOU
↓
Why
↓
Call customer
```

The UI must not reconstruct the decision from raw invoice fields.

---

# 86. UX Evidence Model

The UI should communicate evidence without exposing implementation complexity.

Instead of:

```text
recovery_attempt_id:
RA-29383
```

show:

> Reminder sent Sep 3

And where necessary:

> Verified outcome

Technical IDs remain available for diagnostics/audit.

---

# 87. History UX

History should answer:

> **What happened?**

not:

> **What did the database record?**

Example:

```text
Sep 3
Reminder sent

Sep 3
Delivered

Sep 4
Customer replied

Sep 4
Promise made

Sep 6
₹15,000 received

Sep 6
Promise kept
```

---

# 88. Dangerous UX Patterns to Avoid

Never:

### Fake certainty

> “Reminder caused payment.”

when identity is unknown.

### Fake automation

> “BillZo recovered ₹25,000.”

when payment causality isn't proven.

### Fake AI confidence

> “87% likely to pay.”

without calibrated model evidence.

### Hidden failure

> “Reminder sent.”

when provider actually rejected it.

### Duplicate action

Three cards telling the merchant to contact the same customer.

---

# 89. Primary UX Loop

The entire product should optimize this loop:

```text
SEE
 ↓
UNDERSTAND
 ↓
ACT
 ↓
WAIT
 ↓
OBSERVE
 ↓
RECOVER
```

BillZo should minimize the time between:

**SEE → ACT**

and maximize the quality of:

**ACT → OBSERVE → RECOVER**

---

# 90. Ultimate UX Loop

The mature experience becomes:

```text
┌─────────────────────────────┐
│       MONEY OUTSTANDING     │
└──────────────┬──────────────┘
               ↓
       BILLZO DECIDES
               ↓
┌─────────────────────────────┐
│        WHAT TO DO           │
└──────────────┬──────────────┘
               ↓
        ONE CLEAR CTA
               ↓
        RECOVERY ACTION
               ↓
        EXTERNAL EVIDENCE
               ↓
      CUSTOMER RESPONSE
               ↓
       PAYMENT / PROMISE
               ↓
     VERIFIED OUTCOME
               ↓
        UPDATED HISTORY
               ↓
      BETTER FUTURE DECISION
```

That is the UI/UX system BillZo should be built around.

---

# 91. Final UX Definition

The strongest version of BillZo should feel like:

> **“I open BillZo, immediately see where my money is stuck, understand why each customer needs attention, take one action, and then BillZo keeps track of what happened.”**

Not:

> “I open BillZo and inspect another accounting dashboard.”

That distinction should guide every future screen, feature, and workflow.
