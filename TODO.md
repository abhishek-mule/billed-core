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

## Sprint E — Money Truth Engine ✓

| Status | Task |
|--------|------|
| ✓ | Migration 043: trigger-maintained outstanding, PaymentSource enum |
| ✓ | `PaymentSource` types in shared package |
| ✓ | Worker `recordPayment()` — inserts into payments |
| ✓ | Reconciliation engine inserts into payments (both copies) |
| ✓ | Razorpay verify + webhook insert into payments |
| ✓ | Frontend Record Payment modal |
| ✓ | Re-run decision engine after every payment |

## Sprint F — Relationship Intelligence ✓

| Status | Task |
|--------|------|
| ✓ | `computeCustomerReputation()` — 0-100 from behavioral metrics |
| ✓ | `autoAssignTier()` — vip/regular/risky/blacklisted from reputation + signals |
| ✓ | Reputation + tier computed on every `payment.completed` (via outbox) |
| ✓ | Daily batch cron for all customer reputations (every 6h) |
| ✓ | `customerTier` + `reputationScore` in `OrchestrationInput` |
| ✓ | Tier-aware tone: VIP → soft, blacklisted → firm, risky → urgent faster |
| ✓ | Tier-aware escalation: VIP escalates after 2 ignores, blacklisted never escalates |
| ✓ | 527 tests passing, `pnpm -r build` clean |
