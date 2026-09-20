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

## Sprint G — Recovery Visibility + WhatsApp Infrastructure

| Status | Task |
|--------|------|
| ✓ | CustomerIntelligencePanel — facts-only recovery panel for party detail page |
| ✓ | Dashboard hydration state machine with structured skeleton + retry |
| ✓ | Dexie schema v8 — added `customerId` to invoices |
| ✓ | `cases/route.ts` — promiseToPayDate in buildReason(), no duplicate totalOverdue |
| ✓ | `queue/route.ts` — tenantId! assertion fix |
| ✓ | POS page — reads `?customerId=`, auto-selects customer, optional phone |
| ✓ | Pulse page — reads `?payInvoice=`, auto-selects customer |
| ✓ | Null-safe fixes: buyer-intelligence phone, recovery-timeline timestamp |
| ✓ | `sendDirectWhatsApp` — no more simulation, returns clear errors |
| ✓ | 3-tier fallback in `sendDirectWhatsApp`: messaging_channels → whatsapp_config → Redis |
| ✓ | Redis key fix: `baileys:auth:` → `baileys:creds:` (frontend pair route + worker) |
| ✓ | Worker `getActiveChannel` — checks Redis creds, auto-creates messaging_channels row |
| ✓ | Worker `baileys-socket.ts` — auto-creates channel when creds loaded/connection opens |
| ✓ | Worker clears QR on ALL disconnects (not just loggedOut/qrExhausted) |
| ✓ | Worker startup checks Redis for Baileys creds (not just tenant config) |
| ✓ | BaileysAdapter retry: 5→12 attempts, 1.5s→2s delay for slower socket startups |
| ✓ | **Statement PDF generator** — `worker/lib/statement-pdf.ts`, jsPDF, table layout |
| ✓ | `sendBaileysDocument` — supports local file paths (reads as Buffer, no URL needed) |
| ✓ | **Consolidated send-message-handler** — queries unpaid invoices, 1 → invoice PDF, 2+ → statement PDF attachment |
| ✓ | **Send Statement button** — CustomerIntelligencePanel shows for 2+ overdue invoices |
| ✓ | Single `[Send Reminder]` button — BillZo decides PDF vs statement format |
| ✓ | Statement PDF includes Pay Link column with individual invoice payment URLs |
| ✓ | Consolidated WhatsApp message includes per-invoice payment links (clickable) |
| ✓ | No "Pay All" link — avoids payment allocation engine complexity |
| ✓ | Worker running with latest compiled code on port 10000, Baileys connected |

## V2 (On hold — needs merchant feedback)

| Status | Task |
|--------|------|
| 🕐 | Customer settlement payment link + FIFO allocation engine |
| 🕐 | Recovery analytics dashboard |
| 🕐 | AI-generated reminders |
