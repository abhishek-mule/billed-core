# Architecture Freeze Policy — BillZo v1 Platform

> Last updated: 2026-07-19
> Status: **ACTIVE FREEZE (code development stopped)**
> Next phase: **Merchant Activation Sprint** (product, not engineering)

## Purpose

The platform foundation is complete and ahead of product maturity. This document
formally freezes the core architecture so we can spend the next phase on
merchant adoption and learning instead of building more platform capability.

**Decision:** Stop all feature/architecture development. More architecture has
sharply diminishing returns. The biggest unknown is no longer "can the software
do it?" but "will a merchant actually reach their first recovered payment?".

## Frozen Modules (bug fixes only)

| Module                | Location                          | Notes                          |
| --------------------- | --------------------------------- | ------------------------------ |
| Billing               | `src/lib/billzo/*`                | Plans, subscriptions, events   |
| Messaging             | messaging / WhatsApp webhook      | Processor only                 |
| Event Store           | event-store code                  | Source of truth                |
| Outbox                | outbox code                       | Reliable dispatch              |
| Recovery Engine       | planner, scheduler, policies      | `src/lib/recovery/*`           |
| Diagnostics           | `/api/recovery/diagnostics`       | Read-only investigative        |
| Decision Support      | recommendation-engine / score / memory / outcomes | Deterministic, explainable |

**No architectural expansion of these modules is allowed** except for:
- Bug fixes
- Performance fixes
- Minor appends that do not change existing contracts

## Reality First Rule

This single rule protects BillZo from slowly becoming "smart" in ways that don't
match reality. It overrides any temptation to add cleverness.

> No new recovery rules, automation, AI behavior, heuristics, behavioral
> patterns, or workflow changes may be introduced without evidence from
> production merchants.
>
> Every product change must be traceable to one of:
> - Merchant interview
> - Funnel analytics
> - Support ticket
> - Observed recovery behavior
> - Production event data
>
> Architecture should never invent merchant behavior. It should model observed
> merchant behavior.

If a proposed change cites none of the above, it is rejected by default — no
matter how elegant.

## Deferred (NOT built during freeze — explicitly deprioritized)

These do NOT reduce TTFRP until real merchants exist. Do not build them:

- ❌ First Payment celebration screen
- ❌ Behavioral Engine implementation (contract only — `behavioral-engine.ts`)
- ❌ AI explanation layer
- ❌ `InvoiceService.create()` convergence refactor (3 invoice writers stay split)
- ❌ More dashboards / analytics
- ❌ More recommendation logic / scoring / automation

The invoice-writer fragmentation is intentionally left as-is. Observe which
paths (POS / Udhar / WhatsApp) real merchants actually use; the refactor becomes
obvious from data, not assumptions.

- **Behavioral Engine** — frozen as the `BehaviorProfile` contract in
  `src/lib/recovery/behavioral-engine.ts`. `getBehaviorProfile()` returns null
  until production data exists. To activate: replace `return null` with
  `return extractBehaviorProfile(...)` fed by real event-store data. The
  Recommendation Engine MUST NOT change.
- **AI Explanation Layer** — deferred. When built, it rewrites existing reasons
  into prose; it never invents facts or confidence.

## Unfreeze Trigger

The architecture freeze lifts ONLY after **ALL THREE** conditions are met:

```
20 active merchants
AND
500+ reminders sent
AND
100+ recovered invoices
```

Only then build the learning layer (Behavioral Engine, AI explanations, best
contact time, channel optimization, learning models) — because it will be
trained on reality, not assumptions. Not "after Sprint 5". Not "after AI".
Not "after Behavior Engine". The trigger is the trigger.

Until then, work is limited to: bug fixes, activation friction fixes observed
from real merchants, and the Merchant Activation Sprint below.

## Merchant Lifecycle Funnel (new north-star)

| Stage       | Meaning                          | Activation signal                      |
| ----------- | -------------------------------- | -------------------------------------- |
| Visitor     | Not signed up                    | —                                      |
| Registered  | Account created                  | `auth.signup`                          |
| Connected   | WhatsApp connected               | `whatsapp.connected`                   |
| Activated   | First reminder sent              | `collection_action.created` (reminder) |
| Successful  | First payment recovered          | `payment.completed` via BillZo         |
| Paying      | Subscription active              | `subscription.active`                  |
| Power User  | Daily active merchant            | 7-day activity streak                  |

## Next Phase = Merchant Activation Sprint (product, not engineering)

Goal (nothing else matters):

> **10 merchants create an invoice AND recover one payment.**

### Measure only ONE funnel

```
Landing
  ↓
Signup
  ↓
Business created
  ↓
WhatsApp connected
  ↓
Customer imported
  ↓
Invoice created
  ↓
Reminder sent
  ↓
Customer paid
```

For every merchant, record: **Where did they stop? Why?**

### Interview every merchant (after onboarding)

Ask only: **"What was confusing?"** — not "Did you like it?". Specifically:
where did they hesitate, ask questions, leave, or expect something else? That
feedback is worth more than 5,000 lines of code.

### Do NOT build during the sprint

See Deferred list above. No celebration screen, no Behavioral Engine, no AI, no
InvoiceService refactor, no dashboards. Fix only observed activation friction.

### Observe, don't assume

Note which invoice paths real merchants use (POS / Udhar / WhatsApp). You may
find 90% use one path — then the convergence refactor becomes obvious from data.

## Success Criteria (changed)

- Before: "Did we build it correctly?"
- Now: "Can a merchant recover money within their first week?"

## Do NOT Build Next

- More recovery intelligence
- More dashboards (customer-facing)
- AI / LLM / GPT explanations
- Predictive scores / payment probability
- Best-reminder-time
- Clustering / embeddings
- Behavioral Engine logic (contract only)
- Additional billing capabilities

If this list is tempting, re-read the unfreeze trigger.

## Temptations to Resist (until merchants ask or behavior proves need)

Do NOT add any of these until real merchants repeatedly request them or their
observed behavior clearly indicates the need (Reality First Rule):

- AI assistant
- Predictive scoring
- Cashflow forecasting
- Behavioral clustering
- More dashboards
- More automation rules
- Gamification
- "Smart" reminders

## Next Month's Allocation

- **~20% coding** — fix onboarding friction, polish UX, bug fixes.
- **~80% merchant conversations** — watch onboarding sessions, observe reminder
  workflows, ask "What confused you?", measure TTFRP, iterate from evidence.

The most valuable artifact now is a steady stream of real merchant observations
that validate or challenge the assumptions baked into the Recovery OS. That
evidence — not architectural brainstorming — is the primary input for every
future feature.

## Redefine Success

Not: "We shipped Sprint 4."

Instead: "We finished **Version 1 of the Recovery Operating System**."

The next project is not software engineering. It is learning.

## The Real Product Backlog

The next backlog should NOT look like GitHub issues. It should look like observed
merchant behavior:

| Merchant | Stopped At | Why                        | Fix?              |
| -------- | ---------- | -------------------------- | ----------------- |
| A        | WhatsApp   | Didn't understand QR       | Better onboarding |
| B        | Invoice    | Didn't know where to start | Simpler readiness |
| C        | Reminder   | Afraid to send             | Preview message   |
| D        | Payment    | Customer didn't pay        | Observe behavior  |
| E        | Import     | CSV error                  | Better importer   |

That table is the product roadmap. Each row is traceable to a real merchant
(Reality First Rule).

## The One KPI

If exactly one metric is tracked for the next month, it is:

> **Median Time-to-First-Recovered-Payment (TTFRP)**

Not signups. Not DAU. Not reminders sent. Not invoices created. Every change
optimizes this.

## Release Tag

Separate the **architecture milestone** from the **product version**. Changing
onboarding after five merchants improves the product — it does not invalidate the
architecture.

```
Recovery OS Architecture v1
Status: Frozen

Engineering complete.
Learning begins.
```

Product versions are independent and move faster:

- BillZo v0.9 — Pilot
- BillZo v1.0 — Production validated
- BillZo v1.1 — Based on merchant feedback
- ...

This is a meaningful transition. From here, the quality of BillZo is determined
far more by the quality of user observations than by the quality of the code.

The next major improvements should come from observing merchants — not from
architectural brainstorming.
