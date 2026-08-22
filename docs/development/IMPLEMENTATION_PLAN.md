# BillZo System Strategy & Implementation Plan

## Objective
Ship the **First Rupee Recovery Loop** by implementing the **Reconstructive Truth Engine** and **Recovery-First UX**.

---

## 1. Core Architecture: The Truth Stack
1.  **Event Ledger (Truth):** Supabase `outbox` as the immutable record of all financial facts.
2.  **Projection Engine (Projection):** `worker/src/lib/recovery/reducer.ts` computes the current `FinancialState`.
3.  **State Snapshot (View):** `recovery_cases` stores the projected result for fast reading.
4.  **Decision Engine (Policy):** `canSendReminder()` evaluates truth + relationship data.

---

## 2. Implementation Roadmap (45 Days)

### Week 1-2: Financial Truth Engine (P0)
- [ ] **Task 1.1:** Finalize `reducer.ts` with overpayment guards and explicit adjustments.
- [ ] **Task 1.2:** Implement `recovery:rebuild --dry-run` to audit historical data consistency.
- [ ] **Task 1.3:** Wire `outbox.ts` to use the `reducer` for all `recovery_cases` updates.

### Week 3: Payment & Reconciliation Reality (P1)
- [ ] **Task 2.1:** Support `payment.reversed` and `invoice.cancelled` in the live loop.
- [ ] **Task 2.2:** Connect Razorpay webhooks to the `payment.recorded` event flow.

### Week 4: Relationship Memory (P1)
- [ ] **Task 3.1:** Implement `customer_profile` and `recovery_memory` projections.
- [ ] **Task 3.2:** Move "Annoyance" and "Promises" logic into the Relationship Engine.

### Week 5-6: Recovery-First UX (P2)
- [ ] **Task 4.1:** Launch Dashboard "Recovery Engine" hero widget.
- [ ] **Task 4.2:** Deploy "Recovery Timeline" on the Invoice detail page.

---

## 3. The "First Rupee" Proof Checklist
- [x] Backend State Machine (Proven).
- [x] Attribution Logic (Proven).
- [ ] Telemetry Honesty (Pending - Week 1).
- [ ] Dashboard Visibility (Pending - Week 5).

---

## 4. Maintenance & Discipline
- **Never UPDATE facts:** Append events.
- **Fail-Closed:** When in doubt, block messaging.
- **Traceable:** Every UI status must map to an event ID.
