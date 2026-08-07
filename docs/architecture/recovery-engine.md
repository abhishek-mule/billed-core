# Merchant Recovery Engine Architecture

## Purpose

How BillZo decides **which** customer to remind, **when**, **how**, and **why** —
from the moment an invoice goes overdue to the green **Paid** badge on a
merchant's screen. Every rule, threshold, and decision in this document is
traceable to source.

The engine is deliberately built so that no decision is a black box: every
reminder is reproducible, auditable, and explainable to a merchant.

---

# 1. High-Level Pipeline

```
Invoice becomes overdue
         │
         ▼
Prioritizer            ← who deserves attention
(attention scoring + decision windows)
         │
         ▼
Orchestrator           ← what SHOULD happen
(timing · channel · tone · cadence · escalation)
         │
         ▼
Decision Engine        ← whether it MAY happen
(14-rule pre-send checklist)
         │
         ▼
Authority              ← hard business rules + state mutation gate
(intents, sovereignty, capabilities, policy)
         │
         ▼
Reminder Queue         ← BullMQ execution (locking, retries, rate limits)
         │
         ▼
Meta / Baileys         ← transport
         │
         ▼
Webhook                ← delivery receipts
         │
         ▼
Reminder Badge         ← merchant-visible truth (never regresses)
```

The engine is **two-layered by design**. Most apps do `IF overdue → send`.
BillZo asks two separate questions before a single message goes out:

- **Should?** — the Orchestrator, using behavioral traits.
- **May?** — the Decision Engine, using hard rules.

Both must agree before anything is sent.

## 1.1 Execution order today vs. long-term intent

Be precise about the difference between the conceptual pipeline and the code
today.

**Conceptual recovery pipeline (how to talk about the system):**

```
Merchant Intent
        ↓
Decision Engine (Can we send?)
        ↓
Reminder Queue
        ↓
Provider (Meta / Baileys)
        ↓
Webhook
        ↓
State Projection
        ↓
Orchestrator
(decides the NEXT recovery strategy)
```

**Today, in the worker** (`worker/queues/reminders.ts`), the Orchestrator runs
**after** a successful send. Its five decisions (timing, channel, tone,
cadence, escalation) are computed at dispatch time to shape the **next**
follow-up: the next cadence date, whether to escalate, and how the next stage
will read. The Decision Engine gates **before** the send.

**Long-term architecture:** the Orchestrator is intended to become the policy
engine **before** sending — producing a full recommendation that the Decision
Engine then checks. Today it primarily computes future cadence, tone, timing,
and escalation after successful dispatch. When the Orchestrator is drawn
"before" the Decision Engine, that is the target state, not the current wiring.

## 1.2 One journey, end to end

Walk a single invoice through the whole engine so the layers are concrete.

```
Invoice: ₹13,450 — due 1 Aug. Today: 8 Aug (7 days overdue)
        ↓
1. Prioritizer
   score = 10×7 + 5×0.13 + 8×0.3 + 15×1 = 82  → priority 82, in decision window
        ↓
2. Decision Engine — can we send?
   ✓ outstanding_positive   (₹13,450 > 0)
   ✓ business_hours         (14:00 IST)
   ✓ no_active_promise      (none on file)
   ✓ customer_reachable     (phone valid, delivery 92%)
   ✓ under caps, cooldowns, not snoozed / disputed
   → allowed, confidence 1.0
        ↓
3. Reminder Queue (BullMQ) → lock → message variation #2 → rate check passes
        ↓
4. Meta Cloud API → sent → delivered → read (customer opens it)
        ↓
5. Webhook receipts → whatsapp_events → customers.last_whatsapp_status = 'read'
        ↓
6. Orchestrator (post-send) — no payment yet
   tone      → firm (7+ days overdue)
   cadence   → next follow-up in 3 days
   escalation→ still below threshold, no escalation
   → schedule t24_nudge on 11 Aug
        ↓
7. Merchant badge
   👁 Read   ·   Ignored 1 reminder   ·   ₹13,450 recoverable
   dominant action → WhatsApp follow-up
```

The same invoice tomorrow at 21:00 would be **blocked by `business_hours`** —
and the merchant would see exactly why (§4.1).

---

# 2. The Layers

## Policy Layer — the brain

These four modules **decide**. They are pure and deterministic — no message is
sent, no row is written, no side effect escapes. Every decision can be re-run
and produce the identical answer, which is what makes the whole engine
auditable.

## 2.1 Prioritizer — who deserves attention

**Inputs:** unpaid/overdue invoices with `next_recovery_at` due; per-customer
behavioral metrics (`strategic_delay_likelihood`, recovery stage, amount).

**Outputs:** a ranked, time-boxed list of situations the engine will act on.

**Responsibility:** answer "if 600 customers are overdue, why does Rajesh get
reminded before Amit?"

**Implementation** (`worker/src/lib/cognition/scorer.ts`, `prioritizer.ts`,
`pipeline.ts`):

Each invoice gets an attention score:

```
score = overdueWeight×daysOverdue
      + amountWeight×normalizedAmount
      + behavioralWeight×delayLikelihood
      + urgencyWeight×stageScore
```

with tenant-tunable weights (defaults: 10 / 5 / 8 / 15) and `stageScore`
escalating `t0_soft→1 … t5_warning→4`.

The prioritizer then applies a **decision-window penalty/boost**
(`prioritizer.ts`):

- **Before the window** → penalty up to −20 (too early to be actionable).
- **After the window** → penalty up to −30 (opportunity decaying).
- **Inside the window** → boost up to +15 (most actionable right now).

Results are sorted descending and capped at `MAX_ACTIVE_SITUATIONS` (7). These
become merchant-facing "situations" (`operational_situations`) with a
recommended action, decision window, and resolution condition.

> **Dispatch note:** the reminder scheduler is driven by
> `collection_actions` rows set from each invoice's `next_recovery_at`
> (`worker/queues/reminders.ts` → `enqueueOverdueReminders`). So "who is next"
> = each case's cadence deadline, and "in what order" = the scheduler's
> `scheduled_at` ordering, gated by business hours.

## 2.2 Orchestrator — what SHOULD happen

**Inputs:** a pure `OrchestrationInput` — behavioral traits, invoice facts,
operating hours, customer tier, reputation, transport confidence.

**Outputs:** a `SendRecommendation` (timing, channel, tone, cadence,
escalation) plus a full `DecisionRuleTrace[]` and per-axis confidence.

**Responsibility:** the inference→policy boundary. It **never** sends messages,
reads a database, or checks rate limits. It only thinks.

**Implementation** (`worker/src/lib/billzo/orchestrator.ts`):

- **Deterministic:** same input → same output, guaranteed. This is what makes
  replay verification possible.
- Confidence is computed per axis from observation count, entropy, prior
  source (`customer 1.0 > segment 0.7 > tenant 0.5 > global 0.3 > default 0.1`)
  and transport telemetry quality, dampened by low telemetry confidence.
- A behavioral regime only starts at `MIN_OBSERVATIONS_FOR_BEHAVIORAL = 3`
  observations; below that it falls back to operating-hours scheduling.

## 2.3 Decision Engine — whether it MAY happen

**Inputs:** invoice + customer facts, active promise, reminder history,
behavioral metrics, current time, timezone.

**Outputs:** `allowed` / `block` / `pending_approval`, with every rule's
pass/fail recorded, a confidence score, and a `nextReviewAt`.

**Responsibility:** the pre-send checklist. A pure function — no side effects —
so every invocation produces a complete audit trail.

**Implementation** (`worker/src/lib/recovery/decision-engine.ts`):

If any gate fails and the customer's automation mode is `manual`, the outcome
is `pending_approval` (machine suggests, merchant approves). Otherwise it is
`block`. A **merchant override** set within the last 24h short-circuits every
check while preserving the full audit trail.

## 2.4 Authority — the final guardrail

**Inputs:** a signed `IntentEnvelope`, policy bundle, sovereignty decision,
capability registry, dedup hash.

**Outputs:** `DeterministicDecision` (accepted/rejected) + an `ExecutionPlan`
or rejection, with a node-by-node decision graph.

**Responsibility:** enforce hard, non-negotiable rules over **state mutation**
and execution. This is the layer that answers "cognition says send, authority
says no — who wins?" Authority wins.

**Implementation** (`worker/src/lib/authority/decision-graph.ts`):

The graph is evaluated in strict order:
1. **Schema validation** — intent must be well-formed and signed.
2. **Sovereignty** — source + plan must be permitted.
3. **Semantic dedup** — reject duplicates by hash.
4. **Capability resolution** — the intent must match a registered capability.
5. **Policy** — all policy checks pass.

The reminders worker submits two authority-governed intents after a send:
`reminder.advance_stage` and `reminder.update_cadence` (`trusted_sync`). If no
authority client is present, a marked fallback dual-write is used.

The operating-hours window is itself a hard authority-style gate at two places:
the scheduler defers everything outside 09:00–22:00 IST, and rule 13
(`business_hours`) blocks sends outside 09:00–20:00 tenant timezone.

## Execution Layer — the hands

These four modules **execute** what the policy layer approved. They deal with
queues, transports, receipts, and projections — the messy, real-world work of
moving a reminder and reflecting what happened.

## 2.5 Reminder Queue — execution

**Inputs:** BullMQ `reminders` jobs (`invoiceId`, `tenantId`, `stage`,
optional `actionId`).

**Outputs:** a sent WhatsApp message, an emitted `WHATSAPP_SENT` outbox event,
an invoice state transition, and a `collection_actions` audit row.

**Implementation** (`worker/queues/reminders.ts`):

- Concurrency 2; per `invoiceId+stage` Redis lock (`withLock`, 60s).
- **Business-hours slot aligner** (`nextBusinessSlot`) snaps scheduling to
  09:00–19:59 IST.
- **Rate limiting** per provider: Baileys 50/hour with a 3-day warmup cap of
  10/day; Gupshup/Meta 100/hour (`checkRateLimit`).
- **Send-time guards** (fresh checks at the moment of send):
  - idempotency — `invoice+stage` already sent in the last 24h → skip
    (`duplicate_stage_today`);
  - payment — invoice paid or zero outstanding → skip.
- **Retries:** rate-limited jobs requeue with 1–3 min delay, `attempts: 5`,
  exponential backoff 120s.
- **Message building:** 3 rotating variations per stage (customers never see
  the same text twice); consolidated single message when a customer has
  multiple unpaid invoices; UPI payment link appended.
- **What runs after a send:**
  - advances `recovery_stage` to the next stage (`t0_soft → t24_nudge →
    t72_strong → t5_warning`); at terminal stage the case moves to
    `manual_review`;
  - schedules the next follow-up at `now + cadenceDays + jitter(±15min)`,
    aligned to a business slot;
  - runs the Orchestrator to set cadence + escalation for the *next* cycle;
  - clears any merchant override; logs to `collection_actions`.

## 2.6 Transport — Meta / Baileys

**Inputs:** clean phone, message, invoice/customer context.

**Outputs:** provider message id + a `MessageIdentity`
(`billzoMessageId`, `conversationId`, `eventSequence`,
`transportMessageHash`).

**Implementation** (`worker/lib/whatsapp-router.ts`):

- **Pilot mode (Scenario A):** a BillZo-owned Meta Cloud API WABA is
  infrastructure. If the bootstrapped Meta adapter is present, sends go
  straight through it — merchants never configure or even see a provider.
- **Tenant-owned path:** resolve an active `messaging_channels` row; prefer
  Baileys if paired + connected, else fall back to Gupshup; a failed primary
  provider falls back to a Gupshup channel with API keys.
- Independent transport rate limits: 1 msg/30s per phone, 5/hour and 20/day
  per tenant (Redis-backed, in-memory fallback).

## 2.7 Webhook → projection — the badge stays true

**Inputs:** WhatsApp delivery receipts.

**Outputs:** rows in `whatsapp_events`; projected columns on `customers`
(`last_whatsapp_status`, `last_whatsapp_activity`, `last_contacted_at`).

**Implementation** (`worker/queues/outbox.ts`):

```
Meta / Baileys
     │
     ▼
Webhook / receipt
     │
     ▼
whatsapp_events  (append-only, idempotent by billzoMessageId)
     │
     ▼
customers.last_whatsapp_status   ← projection
     │
     ▼
ReminderStateBadge
```

Because the badge is a **projection of the event stream**, it is correct by
construction — it never guesses.

## 2.8 Reminder Badge — merchant-visible truth

**Inputs:** canonical signals computed once per case (invoices,
`recovery_case_events`, customers).

**Outputs:** a single monotonic recovery state.

**Implementation** (`mini_saas_frontend/src/lib/billzo/recovery-read-model.ts`,
`reminder-state.ts`, `ReminderStateBadge.tsx`):

The badge shows exactly one state — the highest recovery milestone reached —
and it **never regresses**:

```
paid > promised > phone_missing > read > delivered > sent > not_sent
```

- Did they pay? → **Paid** (wins over everything).
- Did they promise? → **Promised** (stays Promised even after reading a later
  reminder).
- No usable phone? → **Phone Missing** (a blocker that should scream).
- Otherwise → the most advanced WhatsApp milestone: Read > Delivered > Sent.

The merchant also sees "why" lines (`deriveWhyLines`: broken promise, ignored
reminders, days overdue) and a single emphasized action (`dominantAction`) —
WhatsApp, Call, Record payment, or Open customer — so they never have to decide
which button to press.

---

# 3. The Five Orchestrator Decisions

## 3.1 Timing — when to send

`decideSendTiming` (`orchestrator.ts`):

- **Sparse data** (< 3 observations): send immediately if inside operating
  hours, else delay to the next window.
- **Behavioral**: if `temporalRegularity > 0.6`, a preferred send window
  (hour-of-day × weekday) is derived from the customer's own history; if now is
  within 2 hours of that window on the matching weekday, send immediately,
  otherwise delay to it.
- **Dispute soak**: if `disputeRisk > 0.5`, push any immediate send out by
  `SOFT_SOAK_DAYS = 2` days.

## 3.2 Channel — how to reach them

`decideChannel`:

- `channelViability ≥ 0.6` → **WhatsApp**.
- `0.3 ≤ viability < 0.6` → **WhatsApp, then push**.
- `viability < 0.3` → **push only**; if viability < 0.1 the whole send is
  skipped (`no_viable_channel`).

## 3.3 Tone — what to say

`decideContentTone`, resolved in priority order:

| Condition | Tone | Effective stage |
|---|---|---|
| `tier == blacklisted` | firm | `t5_warning` |
| `disputeRisk > 0.5` | soft | unchanged |
| `tier == vip` | soft | capped at `t72_strong` |
| `daysOverdue > 15 && amountRatio > 2.0` | urgent | `t5_warning` |
| `daysOverdue > 7` or stage `t72_strong`/`t5_warning` | firm | unchanged |
| `strategicDelay > 0.5` | firm | unchanged |
| `constraintAffinity > 0.5` | firm | unchanged |
| default | soft → neutral → firm by stage | unchanged |

## 3.4 Cadence — how often to follow up

`decideCadence`:

- Sparse data → follow up in `DEFAULT_FOLLOW_UP_DAYS = 3`.
- `constraintAffinity > 0.5` → **1 day**; `≥ 0.3` → **2 days**; else **4 days**.
- `maxFollowUps`: 4 / 5 / 6 depending on `strategicDelayLikelihood`
  (delay-prone customers get more attempts).
- `shouldSkipStage`: a regular, barely-overdue customer (`regularity > 0.6`,
  `daysOverdue ≤ 3`) skips the next escalation stage — don't scare a good
  customer.

## 3.5 Escalation — when to stop nudging and escalate

`decideEscalation`:

- **VIP** ignored ≥ 2 reminders → escalate (protect the relationship).
- **Blacklisted** → never escalate (already terminal).
- **Risky tier or reputation < 40** → escalate after **2** consecutive ignores.
- Otherwise → force escalation after **4** ignores.
- A regular reader who ignores (regularity > 0.6, ignores ≥ 2) → escalate.
- High-value + disputed (`ignore ≥ 3`, `amountRatio > 2.0`, `disputeRisk >
  0.4`) → escalate.
- Worker-side heuristic fallback: `ignoreCount ≥ 3 && amountRatio > 2.5`.

Escalations surface to the merchant as `RECOVERY_ESCALATION_SUGGESTED` events —
the machine suggests, the merchant decides.

---

# 4. The Decision Engine — 14 Checks

Every check produces a `DecisionRuleResult` (rule id, passed, detail) that is
persisted to the `recovery_decisions` audit table with a full rules snapshot.

| # | Rule | Gate |
|---|---|---|
| 0 | `merchant_override` | Override within 24h → send, audit preserved |
| 1 | `outstanding_positive` | `outstanding > 0` |
| 2 | `not_disputed` | invoice not marked disputed |
| 3 | `no_active_promise` | no unfulfilled promise in the future |
| 4 | `not_snoozed` | not snoozed (or `snooze_until` passed) |
| 5 | `cooldown_expired` | `next_recovery_at` has passed |
| 6 | `customer_reachable` | valid phone ≥ 10 digits AND delivery rate ≥ 0.3 |
| 7 | `no_recent_manual_contact` | no manual contact in the last 48h |
| 8 | `tier_permits_escalation` | tier allows current stage (`TIER_MAX_STAGE`) |
| 9 | `not_in_silence_period` | < 3 consecutive ignores (else 7d silence) |
| 10 | `under_monthly_cap` | < 6 reminders this month |
| 11 | `under_total_cap` | < 10 reminders per invoice, ever |
| 12 | `engagement_cooldown` | ghosting customer: 3d cooldown after last reminder |
| 13 | `business_hours` | 09:00–20:00 in tenant timezone |
| 14 | `customer_cooldown` | ≥ 24h since last reminder to this customer |
| 16 | `merchant_intervention_trigger` | informational — flags 3+ ignores for the merchant |

Thresholds live in one place:
`packages/shared/src/decision-engine-types.ts` (`ANNOVER_THRESHOLDS`,
`TIER_MAX_STAGE`).

```
Brain says "send"
     │
     ▼
Outstanding?  Promise active?  Snoozed?  Cooldown?
Business hours?  Reachable?  Cap reached?  Ghosting?
     │
     ▼
Only then: ALLOWED
```

## 4.1 Why didn't BillZo send?

The merchant's first debugging question. The answer is always one of the hard
rules below — and it is always recorded in the `recovery_decisions` audit
trail, complete with a `next_review_at` telling the merchant exactly when the
engine will try again.

```
Invoice overdue
        ↓
No reminder
        ↓
Reason (first failing rule):
   business_hours          — outside 09:00–20:00 tenant timezone
   no_active_promise       — customer promised; engine is waiting
   cooldown_expired        — next_recovery_at not reached yet
   customer_reachable      — phone missing or delivery rate < 30%
   customer_cooldown       — this customer already reminded < 24h ago
   duplicate_stage_today   — this invoice+stage already sent today
   under_monthly_cap       — 6/6 reminders used this month
   under_total_cap         — 10/10 reminders ever for this invoice
   not_in_silence_period   — 3+ consecutive ignores, 7-day silence active
   engagement_cooldown     — ghosting customer, 3-day quiet period
   no_recent_manual_contact— merchant contacted them < 48h ago
   not_snoozed / not_disputed / tier_permits_escalation
```

Every block is three things: a `DECISION_ENGINE_BLOCKED` event, an audit row,
and a `next_review_at` timestamp — so "why not" and "when next" are never
guesswork.

---

# 5. The Recovery State Machine

```
Draft
  ↓
Scheduled
  ↓
Queued
  ↓
Sent
  ↓
Delivered
  ↓
Read
  ↓
Promised
  ↓
Paid
  ↓
Closed
```

- **Draft → Scheduled** — driven by `next_recovery_at`; the scheduler enqueues
  the action into `collection_actions`.
- **Scheduled → Queued** — `enqueueOverdueReminders` marks the action
  `processing` and adds a BullMQ job (a small random delay staggers traffic).
- **Sent → Delivered → Read** — driven by WhatsApp delivery receipts through
  the outbox projection; the merchant badge is a projection of this stream.
- **Promised** — set when the customer makes an unfulfilled promise to pay.
- **Paid** — set when the outstanding balance is cleared.
- **Closed** — the recovery case is closed.

**States never regress. That is an architectural guarantee, not a display
choice.** A case that reaches `read` never drops back to `sent`; a customer who
promises stays `promised` even if they later ignore another reminder. The
merchant badge shows the single highest milestone so everyone — merchant and
engine — agrees on where the customer stands.

Two extra states the merchant sees on the badge are deliberately *off this
main chain*: `phone_missing` (a blocker that must scream) and `not_sent` (never
reached the first milestone). And at the terminal reminder stage (`t5_warning`)
a no-payment case moves to `manual_review` — the machine stops on its own and
hands control back to the merchant.

---

# 6. What Makes BillZo Different

## Deterministic recovery engine

Same customer × same invoice → same recommendation. The Orchestrator is a pure
function with a determinism guarantee, and every run is snapshotted
(`emitOrchestrationSnapshot`) for forensic replay. You can re-run a decision
and get the exact same answer.

## Rule trace on every decision

"*Why did BillZo send this?*" is always answerable. Every decision carries a
`DecisionRuleTrace` (rule id, inputs, threshold, outcome, confidence weight),
a `recovery_decisions` audit row, and `DECISION_ENGINE_BLOCKED` /
`RECOVERY_RECOMMENDATION` events. Nothing is a black box.

## Two-layer decision, not a rule of thumb

```
Most apps:   IF overdue → send.
BillZo:      SHOULD?  (orchestrator — behavioral)
             MAY?     (decision engine — hard rules)
             → send.
```

The two layers can disagree, and the hard layer always wins.

## Monotonic badge

State never regresses: `Sent → Delivered → Read → Promised → Paid`, never
`Read → Sent`. The merchant sees one unmissable truth, backed by a projection
of the event stream.

## Relationship-aware escalation

VIP customers are **capped at `t24_nudge`** and never hit a final notice.
Habitual defaulters and low-reputation customers **escalate faster** (2 ignores
vs 4). Customers who keep breaking promises, ignore reminders, or ghost get
cooldowns, silence periods, and merchant-intervention flags. The engine treats
every customer as a relationship, not a row.

## Never-spam: multiple protection layers

Most apps check a cooldown. BillZo stacks **independent** protection layers, so
a reminder must pass every gate — the caps are hard rules, not advice:

```
Reminder requested
        ↓
Decision Engine
   cooldown          — ≥ 24h since last reminder to this customer
   daily limit       — never more than 1 reminder/customer/day
   monthly limit     — < 6 reminders this month
   total limit       — < 10 reminders per invoice, ever
   promise check     — no active promise in the way
   manual contact    — no merchant contact in the last 48h
   business hours    — 09:00–20:00 only
   silence period    — no active ignore-silence
   ghosting cooldown — quiet period for ghosting customers
        ↓
Queue-level guards
   idempotency       — invoice+stage not already sent in last 24h
   rate limit        — provider hourly caps (Baileys 50, Meta 100)
        ↓
Send
```

On top of the caps: 3 rotating message variations so no text is ever sent
twice, consolidated reminders when a customer owes across multiple invoices,
and dispute-soak delays for sensitive accounts. The system is *built* to never
drift into nagging a customer.

---

# 7. BillZo Principles

These are not implementation. They are rules every future feature must satisfy.

### Principle 1 — Recovery before bookkeeping

The engine exists to move money and preserve relationships, not to keep
perfect ledgers. Bookkeeping features are welcome when they serve recovery;
they never get to drive it.

### Principle 2 — Merchant always sees one recovery truth

One badge, one state, monotonic and never regressing. No surface may show a
recovery status that contradicts another surface. When signals disagree, the
highest reached milestone wins.

### Principle 3 — Every reminder is explainable

"*Why did BillZo send this?*" and "*Why didn't it?*" are always answerable —
from the `DecisionRuleTrace`, the `recovery_decisions` audit row, and the
`next_review_at` timestamp. No decision is a black box.

### Principle 4 — Never spam customers

Cooldown, daily limit, monthly limit, total limit, promise check, manual-contact
window, business hours, silence periods, ghosting cooldowns. A reminder must
pass every layer. The caps are enforced, not suggested.

### Principle 5 — Relationship is preserved before escalation

VIPs never receive a final notice; good customers never get scared into paying
fast. Escalation is a last resort aimed at chronic defaulters — and even then
the machine suggests, the merchant decides.

### Principle 6 — Every action is auditable

Every reminder, block, escalation, promise, and payment leaves an append-only
trail (`whatsapp_events`, `recovery_decisions`, `collection_actions`,
`recovery_case_events`). A case can be reconstructed end-to-end at any time.

### Principle 7 — The system recommends. The merchant decides.

The engine surfaces recommendations, escalation signals, and merchant-
intervention flags — but the merchant keeps the final call, from overrides to
manual-mode approval.

---

**The litmus test.** Every new feature answers one question:

> Does this help the merchant recover money faster without damaging customer
> relationships?

If yes, it belongs in BillZo. If no — even if it is a "cool" accounting
feature — it belongs somewhere else. This is what keeps BillZo a recovery
operating system, not another generic bookkeeping app.

---

## Source map

| Concern | File |
|---|---|
| Attention scoring | `worker/src/lib/cognition/scorer.ts` |
| Prioritization + windows | `worker/src/lib/cognition/prioritizer.ts` |
| Pipeline | `worker/src/lib/cognition/pipeline.ts` |
| Orchestrator (5 decisions) | `worker/src/lib/billzo/orchestrator.ts` |
| Decision engine (14 checks) | `worker/src/lib/recovery/decision-engine.ts` |
| Thresholds & tier matrix | `packages/shared/src/decision-engine-types.ts` |
| Authority decision graph | `worker/src/lib/authority/decision-graph.ts` |
| Reminder queue worker | `worker/queues/reminders.ts` |
| Transport routing | `worker/lib/whatsapp-router.ts` |
| Receipt projection | `worker/queues/outbox.ts` |
| Read model (signals) | `mini_saas_frontend/src/lib/billzo/recovery-read-model.ts` |
| Monotonic badge state | `mini_saas_frontend/src/lib/billzo/reminder-state.ts` |
