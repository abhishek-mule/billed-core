# BillZo Sprint Roadmap

## Sprint C — Merchant Override API ✓

| Status | Task |
|--------|------|
| ✓ | Migration 041 (override columns) applied |
| ✓ | Override + clear-override routes in worker |
| ✓ | Rule 9 — Override pre-check in decision engine |
| ✓ | Frontend override modal on invoice detail page |
| ✓ | Override proxy in Next.js |
| ✓ | Reality Test E — production verified |

## Sprint D — The Trust UI ✓

| Status | Task |
|--------|------|
| ✓ | Decision engine events (blocked/allowed) in timeline |
| ✓ | Rule badges + expandable rule detail |
| ✓ | Override events in timeline |
| ✓ | `ARCHITECTURE_TRUTH.md` with 6-Layer Stack |

## Sprint D.5 — Trust Polish ✓

| Status | Task |
|--------|------|
| ✓ | `RECOVERY_RECOMMENDATION` event type |
| ✓ | `checksPassed` / `totalChecks` in output |
| ✓ | `nextReviewAt` computed (promise/cooldown/snooze) |
| ✓ | Migration 042 (`next_review_at`) applied |
| ✓ | "X/8 checks passed" + "Next review" in timeline |
| ✓ | Timeline filters: Type + Blocked Reason |
| ✓ | Recommendation events rendered |

## Sprint E — Money Truth Engine ✓

| Status | Task |
|--------|------|
| ✓ | Migration 043: trigger-maintained outstanding, PaymentSource enum, evidence fields |
| ✓ | `PaymentSource` types in shared package |
| ✓ | Worker `recordPayment()` — inserts into payments, emits event |
| ✓ | Reconciliation engine inserts into payments (both worker + frontend) |
| ✓ | Razorpay verify endpoint inserts into payments |
| ✓ | Frontend Record Payment modal (amount, source, notes) |
| ✓ | Re-run decision engine after every payment (synchronous + outbox) |
| ✓ | E2E verification: trigger, API, all payment sources |
| ✓ | 527 tests passing, `pnpm -r build` clean |

## Sprint F — Relationship Intelligence (Backlog)

| Status | Task |
|--------|------|
| | Reputation score computation from behavioral metrics |
| | Customer tier auto-calculation |
| | Message strategy engine (tier-based tone/urgency) |
