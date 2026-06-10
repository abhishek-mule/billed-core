# BillZo Architecture: The Merchant Trust Engine

## Core Thesis
BillZo is not a billing software; it is a **merchant relationship operating system**. 
The moat is not automation — it is **judgment with transparency**. Every blocked reminder is a relationship preserved. Every allowed reminder is a decision the merchant can audit.

---

## 1. The 6-Layer Stack
1.  **Event Fabric (Reality):** Append-only, immutable logs of raw financial events (Payments, Sync, Actions).
2.  **Causal Graph Layer (Relationships):** Maps how events influence, support, invalidate, or decay each other.
3.  **Epistemic Resolver (The Brain):** Reconstructs the "Belief Field" by weighing competing hypotheses under uncertainty.
4.  **Decision Engine (Trust Firewall):** 8-rule pre-send checklist that blocks bad reminders before they reach the customer. Pure function — no DB access, testable without mocks. Every invocation produces a complete audit trail in `recovery_decisions`.
    - **Rule 0:** Merchant override (bypass all rules if merchant explicitly approves).
    - **Rule 1:** Outstanding > 0.
    - **Rule 2:** Not disputed.
    - **Rule 3:** No active payment promise.
    - **Rule 4:** Not snoozed.
    - **Rule 5:** Cooldown expired.
    - **Rule 6:** Customer reachable (phone + delivery rate).
    - **Rule 7:** No recent manual contact (48h window).
    - **Rule 8:** Customer tier permits escalation stage.
5.  **Policy Layer:** Evaluates the `BeliefField` to determine permitted actions.
6.  **Execution Layer (Transport):** Stateless actuator (e.g., Baileys) that executes decisions.

---

## 2. Trust Principles (The Rules)

### A. Audit Trail is the Product
Every decision (blocked or allowed) is logged to `recovery_decisions` with a full `rules_snapshot` JSONB. This is the merchant-facing proof that BillZo is acting in their interest.

### B. Merchant is the Final Authority
Rule 9 (Merchant Override) allows merchants to bypass any block with explicit risk acknowledgment. High-value customers (VIP, high reputation, large outstanding) trigger a warning requiring confirmation before override.

### C. Non-Destructive Influence
Invalidation is an event, not a deletion. We never overwrite history.
*   `INVALIDATE`: An event that prunes a branch of history.
*   `AMEND`: A partial correction of a previous claim.
*   `CORROBORATE`: Reinforcement of an existing belief.
*   `DEGRADE`: Time-based uncertainty increase (entropy).

### D. Truth is a Field, Not a Node
We do not store `status = 'recovered'`. 
We project `recovered` by querying the Event Fabric and running the Resolver. Storing derived state is **Forbidden** (State Rot).

### E. Policy Decoupling
Policy does NOT see raw events. It sees a `PolicyView` computed from the `BeliefField`.
*   If `ConflictCount > 0` or `Entropy > Threshold`, Policy MUST return `Allowed = False` (The "Fail-Closed" rule).

---

## 3. Invariants (Non-Negotiable)
1.  **Separation of Concerns:** Financial truth never directly triggers execution. Policy evaluation is mandatory.
2.  **Causal Graph over Trees:** Relationships are `UUID[]` sets, not `parent_id` pointers.
3.  **Ambiguity is a State:** "Uncertainty" is not a failure; it is a valid epistemic state that must block message triggers.
4.  **Replayability:** The Resolver must produce consistent truth for any time `T` given the full history `E <= T`.

---

## 4. Product Roadmap

| Sprint | Theme | Status |
|--------|-------|--------|
| C | Complete the Human Authority Loop (Override API + risk warning) | ✓ Complete |
| D | The Trust UI (Timeline, decision history, blocked reasons, override history) | Current |
| E | Money Truth (Unified payment ledger, partial payments, offline recording, Razorpay reconciliation) | Next |
| F | Relationship Intelligence (Reputation score, auto tier calc, message strategy engine) | Backlog |
