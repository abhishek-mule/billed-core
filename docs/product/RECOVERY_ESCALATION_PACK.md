# Recovery Escalation Pack — Implementation Spec (Phase C) · Rev 2

Status: **Spec (frozen until staging gate passes)** — no code changes yet.
Owner: BillZo. Audience: engineering + product.
Read against: `PRD.md`, `TRD.md`, `docs/development/DECISIONS.md`, `docs/architecture/recovery-engine.md`.

Rev 2 incorporates the Phase C review feedback (rev 1 → this):
decomposed domain, customer-level evidence, no merchant-facing score, Recovery Effort
Summary, no-causal-evidence invariant, settlement guardrails, bundled pricing.

The previous gate is unchanged: migrations `094/095/096/097` → verify scripts → staging E2E →
evidence review → production decision. We build this **after** that gate.

---

## 1. Positioning

The merchant question is not "what happens when reminders fail?" It is:

> **"When the customer refuses to cooperate, what does BillZo do next so I don't have to figure out
> the entire recovery process myself?"**

BillZo never threatens legal action automatically and never sends settlement-notice language without
explicit merchant review. We move the case through
**automated communication → merchant intervention → formal recovery preparation**:

> BillZo recommends the escalation. The merchant authorizes consequential action.

The full lifecycle BillZo sells:

```text
Invoice overdue → understand why → choose next action
        WhatsApp / Call / Promise
                Payment?
             YES         NO
             STOP      ESCALATE
                    Payment Plan | Recovery Case | Pause
```

The merchant-facing promise:

> **"BillZo doesn't just remind your customers. It knows when reminders have stopped working — and
> prepares your next move."**

Working name: **Recovery Escalation Pack** (alt: Formal Recovery Pack). Never "Legal Action Pack".
Internally we ship an **evidence package, not a legal opinion** (Section 8).

---

## 2. Domain — three concepts, one shared UI

Rev 1 mixed three things under one `/escalation` namespace. They stay **separate internally**:

### A. Recovery Decision  (should this case get formal attention?)
### B. Recovery Case      (an evidence pack, `Recovery Case #RC-…`)
### C. Settlement Workflow (can we still get paid commercially?)

Hierarchy:

```text
Recovery Decision
       ↓
Escalation Recommended
       ↓
Merchant chooses
       ↓
┌──────────────┬──────────────┐
│              │              │
Settle       Escalate      Pause
│              │
Payment       Recovery Case
Plan          ↓
              Evidence for external review
```

Each has its own API namespace and data shape; the recovery page is the single surface that
treats them as a coherent story.

---

## 3. Non-goals (frozen, do not drift into)

- No automatic legal action, no demand letters.
- **An escalation pack can never create causal evidence.** It only packages evidence that the
  recovery spine has already established through verified attribution (Phase 1.5 identity chain).
  If a WhatsApp event's owner isn't verified, the pack records "attribution unknown" — it never
  assumes the event belonged to the customer. This is a hard architectural rule, not a guideline.
- No merchant-facing score. A single integer `score` may exist **internally for deterministic
  ordering only**; merchants see the **escalation basis** (real facts, Section 5).
- **The pack is NOT charged to Recovery Credits.** Credits pay for automated execution.
  Escalation prep is a premium capability, bundled in Pro+ initially (Section 13).
- No ML/LLM scoring. Deterministic, verifiable facts.
- No new `recovery_state_v2` value. We reuse `merchant.escalated` → `merchant_review`.
- No auto-recharge, no new credit types (unchanged from Phase B).
- No merchant-configurable escalation policy in Phase C (deterministic BillZo policy first;
  configurable merchant policy is a later Business/Enterprise feature, Section 6).

---

## 4. The snapshot is a portable evidence projection — NOT a second history engine

The immutable `evidence_snapshot` (Rev 1, kept) captures only what's needed to **reproduce the
pack** at preparation time:

```text
Snapshot (portable projection)
├── customer + invoice facts (amounts, outstanding, due/age)
├── recovery effort summary (Section 7)
├── verified communications (attribution-strict)
├── promises + broken promises
├── payment evidence
└── source identifiers (collection_action.id, recovery_case_events.id, provider/payment ids)
```

It is written once on `prepare`, never mutated, and never a substitute for the live spine.
The spine remains the single historical truth; the snapshot is a reproducible rendering.

**Invariant:** live records may change after preparation (customer pays, promise renews). The
snapshot does not rewrite. The pack's "as of prepared_at" framing is explicit; reconciling later
payments is handled by the live case, not by mutating the pack.

---

## 5. The escalation decision — deterministic, evidence-based, scoreless

Computed from the same inputs `get_priority_cases` already exposes
(`mini_saas_frontend/migrations/045_get_priority_cases_rpc.sql:40-70`) plus case risk stage:

| Input | Source (verified) |
| --- | --- |
| Amount outstanding | `invoices` outstanding — command center `totalOutstanding` |
| Age (days overdue) | `oldest_overdue_days` (get_priority_cases) → `collectionRiskStage` (`src/lib/billzo/recovery-risk.ts:20`) |
| Response history | `next_action_type` + `engagement_state_v2` on `recovery_cases` |
| Ignored reminders | `ignored_reminders` — `whatsapp_events` outbound `sent/delivered/read` (get_priority_cases) |
| Broken promises | `broken_promises` — `recovery_case_events` transition log `promised→overdue` (get_priority_cases) |
| Payment behavior | `payments` lane; `amount_paid` on case |
| Merchant policy | deterministic BillZo policy in Phase C (Section 6); toggles only as merchant kill-switch |

Rule (unchanged from Rev 1, deliberately not "10 reminders = legal"):

> Escalation is **recommended** only when the case is at stage `Urgent+` AND ≥1 negative
> relationship fact is present (broken promise OR ≥2 ignored reminders OR unanswered call attempts).

Output is **not a number**:

```text
Escalation recommended

Basis  (Escalation basis — not a "score")
• ₹84,000 outstanding across 4 invoices
• 63 days overdue
• 3 payment promises broken
• 4 reminders delivered/read without resolution
• 2 calls unanswered
• No active payment arrangement
```

The internally-computed integer is used only for **ordering** (which case surfaces first);
`basis` bullets always reference verifiable ledger facts.

`getRecoveryCommandCenter` gains an aggregate count of cases graded "escalation recommended"
(mirrors the existing `exhausted` field added in Phase B).

---

## 6. Merchant policy

Phase C: **deterministic BillZo policy only.** The kill-switch toggles (`recovery_credits_enabled`,
auto_recovery) already exist; no threshold configuration UI.

Later (Business/Enterprise, post-launch when usage data exists):

> Escalate difficult accounts after: ₹50,000+ outstanding AND 30+ days overdue AND 2 broken promises.

Out of scope for Phase C; flagged here so the score/basis model doesn't paint us into a corner.

---

## 7. Recovery Effort Summary — the new centerpiece

Every pack (and the escalation UI) leads with **what the merchant has already tried**. This answers
"what have we done?" better than any number:

```text
Recovery effort
9 attempts over 47 days

WhatsApp         5
Follow-ups       2
Calls            2
Promises         3
Payments         0

Result: No successful payment or reliable commitment.
```

Produced from the same evidence spine (collection_actions + whatsapp_events + payment_promises +
recovery_sessions + payment lane), with per-channel counts. Stored in the snapshot so the pack is
reproducible.

---

## 8. Domain B — Recovery Case (evidence pack), customer-level

### 8.1 Customer-level, not strictly invoice-level

The merchant thinks "ABC Traders owes me ₹4.8 lakh", not "invoice 1023". The recovery model is
increasingly **customer-level** (case → customer → invoices). Therefore:

- `recovery_escalations` carries `customer_id` + `primary_invoice_id` (and `case_id`).
- The **pack assembles all relevant overdue invoices** for that customer; one invoice is the
  trigger/primary invoice. Numeric fields (`RC-#`, effort) are customer-scoped.
- Wholesalers/distributors with dozens of invoices get one coherent case, not a pile of
  invoice-shaped packs.

### 8.2 What the pack contains (portable projection)

- **Customer/account** — only fields the merchant is authorized to use.
- **Invoice evidence** — all relevant invoices: number, date, due, amount, paid, outstanding.
- **Recovery evidence** — verified communications (attribution-strict), promises + broken,
  calls/sessions, merchant actions — each row keyed by `collection_action.id` /
  `recovery_case_events.id` / provider ids.
- **Payment evidence** — `payments` lifecycle, payment links, `payment_promises.triggered_by_action_id`.
- **Recovery Effort Summary** (Section 7).
- **Timeline** — linearized from `recovery_case_events` (`094` contract), cross-linked to raw ids.
- **Evidence completeness** — `Invoice ✓ / Payment records ✓ / WhatsApp events ✓ / Promises ✓ /
  Call records ✓ / Timeline ✓`. Missing fields render blank, never fabricated.
- **Fidelity markers** — every linkage states its confidence: `Verified link`, `Unknown (no
  action_id stored)` (echoes Phase 1.5 `093` backfill outcome), `Source: provider`.

### 8.3 Recovery Case #RC-… numbering

`RC-{primary_invoice_number}-{seq}` — seq from a per-invoice counter persisted on the escalation
row (deterministic, no global race).

---

## 9. Domain C — Settlement Workflow (first-class)

Getting paid outranks escalation: a merchant wants ₹84,000 back, not a dispute.

### 9.1 Settlement offers

Stored as `settlement_offer` on the escalation row (no schema expansion of `payment_promises`):
`full | partial | plan | revised_promise_date`, with amount/schedule when applicable.

### 9.2 Final settlement notice — strictly guarded

- UI language is **"Draft final settlement notice"** — it sits outside the automated-recovery
  flows and is unambiguously **merchant-authored**.
- Pipeline: **generate draft → merchant reviews → merchant edits → merchant explicitly sends**
  through their own messaging channel. BillZo never transmits it, never schedules it, never
  prefixes it with automation semantics.
- Wording template is professional/non-threatening (rev 1's message shape is retained).

---

## 10. Schema — migration `099_recovery_escalations.sql` (pending)

> Renumber note: this migration was originally authored as `098` in earlier drafts of
> this spec. `098` is already owned by the consolidated Phase B production migration
> (`098_recovery_credits_production.sql`), so the escalation pack uses **`099`**.
> Apply order for staging: 096/097 → 099.

One table, three roles clearly separated by column intent + a single lifecycle. Append-only,
exactly-once, house style (named CHECKs, partial-unique, `tenant_id text`).

```sql
recovery_escalations (
  id uuid pk,
  tenant_id text not null,
  case_id uuid not null,                 -- recovery case (customer-level)
  customer_id uuid not null,             -- customer-level pack assembly
  primary_invoice_id uuid not null,      -- trigger invoice; pack includes all customer's overdue
  status text not null default 'assessed'
    check (status in ('assessed','recommended','prepared','notified','settled','cancelled')),
  recommended boolean not null default false,
  grade int not null default 0,          -- INTERNAL ONLY: deterministic ordering, never rendered
  basis jsonb not null default '[]',     -- frozen at assessment; "escaltion basis" bullets
  merchant_decision text,                -- authorize | offer_plan | pause | decline
  merchant_note text,
  settlement_offer jsonb,                -- full | partial | plan | revised_promise_date
  snapshot jsonb,                        -- portable evidence projection, written ONCE on 'prepared'
  prepared_by uuid,
  prepared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- exactly one active escalation per customer-case; settled/cancelled releases the slot
  unique (case_id)      -- scoped by: where status not in ('settled','cancelled')  → partial unique
);

create unique index uq_recovery_escalations_active_case
  on recovery_escalations(case_id) where status not in ('settled','cancelled');
create index idx_recovery_escalations_tenant_status on recovery_escalations(tenant_id, status);
```

Notes:
- `basis` (facts) ≠ `grade` (ordering integer). The UI renders `basis` only.
- `snapshot` written once on `prepare`; never mutated (Section 4).
- Cycle: `assessed → recommended → prepared → notified → settled | cancelled`.
  `decide()` records `merchant_decision` without necessarily advancing status (a merchant can
  pause while a case stays `prepared`).

---

## 11. API surface — separated by domain, tenant-scoped, verifyRequest auth

Domain A — **Recovery Decision** `/api/recovery/case/{caseId}/escalation`
- `GET  .../escalation` → `{ caseId, recommended, basis[], nextMove, stage, effortSummary }`
  (no `score` in the payload's merchant render; `grade` may exist behind a debug flag).
- `POST .../escalation/decide` → records `merchant_decision` (`authorize | offer_plan | pause |
  decline`) + optional note; if `authorize`, emits `merchant.escalated` through the same outbox
  path the command center slash-commands use (`recovery/page.tsx:534`).

Domain B — **Recovery Case** `/api/recovery/case/{caseId}/recovery-case`
- `POST .../recovery-case/prepare` → validates recommendation or explicit override; writes
  `status='prepared'` + `evidence_snapshot`; idempotent via the partial unique index
  (re-prepare allowed only after `cancelled`). Client gets `Recovery Case #RC-…`.
- `GET  .../recovery-case` → JSON pack (from snapshot).
- `POST .../recovery-case/export` → PDF or JSON (`?format=json`), both from the snapshot.

Domain C — **Settlement** `/api/recovery/case/{caseId}/settlement`
- `POST .../settlement/offer` → save `settlement_offer`; surfaces in the UI as the "Get paid" path.
- `POST .../settlement/notice` → **draft** the final settlement notice (template + case facts).
  Never sends. The send is a merchant action in their own channel.

---

## 12. UI surface

The "Recovery requires your attention" card replaces the automation dead-end ("no more reminders")
and re-orders actions by merchant intent — lean toward getting paid, not conflict:

```text
Recovery requires your attention

ABC Traders — ₹84,000 · 4 invoices · 63 days overdue

Why BillZo recommends escalation
• 3 payment promises broken
• 4 reminders delivered/read without resolution
• 2 calls unanswered
• ₹84,000 outstanding across 4 invoices

Recovery effort
9 attempts over 47 days · WhatsApp 5 · Follow-ups 2 · Calls 2 · Promises 3 · Payments 0
Result: No successful payment or reliable commitment.

Recommended next move
[Prepare Recovery Case]   ← primary CTA (evidence-backed: invoice, payment, communication, recovery)

Get paid / Stop  (secondary)
[Offer payment plan] · [Pause recovery]
```

After preparation:

```text
Recovery Case RC-1042 prepared
[View case] [Download PDF] [Draft settlement notice]
```

Rules:
- `Escalate/Pause/Dispute` are never three equal buttons. Escalation is the recommended,
  evidence-backed path; Pause is a stop; "Offer payment plan" is the money-first path.
- Settlement notice CTA reads **"Draft final settlement notice"**, visually separated from
  automation flows.
- Timeline page gains escalation lifecycle events via `recovery_case_events` (no new shell).
- Reuse `recovery-center.css` tokens (`.rc-credits-*` pattern).

---

## 13. Gating & monetization

- New capability `escalation_pack` in `feature-flags.ts` capabilities + plan gating in
  `plan-limits.ts` (`BillzoPlan`).
- **Bundled in Pro+ initially — no new paywall.** Pricing is deferred to the post-gate
  pricing/economics discussion, and any per-case price (`Starter: ₹199/case` etc.) is an
  experiment we run only after real usage data shows merchants prep packs repeatedly.
- **Recovery Credits are never spent** on the pack (Section 3).

---

## 14. Worker & state machine

- No new cron scanner for launch. Assessment is on-demand + summarized in the command center.
- Reuse `merchant.escalated` (`case-machine.ts:47`, handler `:493` → `merchant_review`). No new
  `recovery_state_v2`; terminal states remain `recovered`/`closed`. `recovery_escalations.status`
  is the pack's own lifecycle, documented as independent of the case state machine.
- `decide(authorize)` → `merchant.escalated` event is the **authorization record**; it also lands
  in `recovery_activities` for merchant-action audit.

---

## 15. Tests (mirror Phase B depth)

- **Shared** (`@billzo/shared` `recovery/escalation.ts`): pure domain — basis builder (facts only,
  no score leak), deterministic recommendation rule, effort-summary aggregation, settlement-offer
  validation.
- **Worker**: `recovery_escalations` lifecycle unit tests; `case-machine` regression for
  `merchant.escalated` under the new path; **no-causal-evidence invariant test** — a pack built on
  an unverified WhatsApp event must render `Unknown (no action_id stored)` and never assert
  customer attribution.
- **Frontend**: assessment route (facts → expected `basis[]`), prepare/decide idempotency
  (unique violation → already-prepared), customer-level pack assembly (one customer, N invoices →
  one coherent pack + effort summary), PDF builder (sections complete, missing fields blank),
  settlement-notice draft (never sends), component test for the CTA card + post-prep states.
- **Migration verify** `verify_099_recovery_escalations.sql`: schema shape + adversarial probes
  (duplicate active escalation rejected; `settled` releases slot; bogus CHECK values rejected;
  `grade` present but `basis` is independent).

---

## 16. Ordering (gates)

```text
[STAGING GATE — 094/095/096/097 apply+verify+E2E → DO NOT START YET]
        ↓
099_recovery_escalations.sql (pending, staging only) + verify_099
shared: basis/rule/effort/settlement domain (pure)
worker: lifecycle + case-machine regression + no-causal-evidence invariant
frontend: decision/recovery-case/settlement routes + PDF builder + CTA card + timeline
staging E2E (staging-escalations-verify.ts harness)
evidence review → production decision (with pricing/economics)
```

---

## 17. Open questions (deferred, non-blocking)

1. Per-case pricing — bundled first; `₹199/case` Starter experiment only after usage data
   (Section 13) — decided with pricing discussion, post-gate.
2. Settlement offers ride `recovery_escalations.settlement_offer` (launch). If plans become
   recurring arrangements, revisit whether to formalize a `payment_plans` table (out of scope).
3. Multi-invoice ordering inside a customer-level pack — primary invoice is the trigger; the rest
   render newest-first. Confirm with a wholesaler pilot before locking the sort.
4. Whether `Prepared Recovery Case` should surface in a dedicated `/recovery-cases` page (list)
   or live within the recovery command center only. Recommend page-list at launch.