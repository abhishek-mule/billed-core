# BillZo Sprint Roadmap

## Sprint C — Complete ✓

| Status | Task |
|--------|------|
| ✓ | Migration 041 (`override_send`, `override_at`, `override_reason`, `override_warning_acked`) applied to hosted Supabase |
| ✓ | `POST /api/v1/recovery/override` and `POST /api/v1/recovery/clear-override` routes in worker |
| ✓ | Rule 9 — Override pre-check in `canSendReminder()` short-circuits all 8 rules when override active |
| ✓ | `clearOverride()` after successful send in `reminders.ts` |
| ✓ | 4 override unit tests (active, bypass expired, snapshot) |
| ✓ | Reality Test E — override bypass verified in production via `recovery_decisions` |
| ✓ | Override API proxy in Next.js (`/api/recovery/override`) |
| ✓ | Override modal on invoice detail (block reason → risk warning → confirmation → API call) |
| ✓ | Decision engine events (blocked/allowed) merged into recovery timeline |
| ✓ | Rule badges (green/red/indigo) shown on blocked events in timeline |

## Sprint D — The Trust UI (Current)

| Status | Task |
|--------|------|
| ✓ | Override events (`recovery.override.approved`/`rejected`) in timeline query |
| ✓ | Override event icons, colors, labels in RecoveryTimeline component |
| ✓ | Expandable rule detail on decision block events |
| ✓ | `DESIGN.md` updated with Decision Engine architecture |
| | End-to-end test of override flow via frontend |
| | Commit + push to GitHub |

## Sprint E — Money Truth (Next)

| Status | Task |
|--------|------|
| | Unified payment ledger (`payments` table normalization) |
| | Partial payment handling (`paid_amount` / `outstanding_amount`) |
| | Offline payment recording (cash, bank transfer, cheque) |
| | Razorpay webhook reconciliation |

## Sprint F — Relationship Intelligence (Backlog)

| Status | Task |
|--------|------|
| | Reputation score computation from behavioral metrics |
| | Customer tier auto-calculation |
| | Message strategy engine (tier-based tone/urgency) |
