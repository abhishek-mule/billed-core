# Recovery Readiness — Activation Evaluator

> Last updated: 2026-07-19
> Status: Built (pure evaluator + server route + tests)
> Related: docs/INVOICE_LIFECYCLE.md, docs/ARCHITECTURE_FREEZE_POLICY.md

## Why this exists

Onboarding assumed invoices already exist. They don't — a brand-new merchant
may have zero customers and zero invoices. TTFRP is not "Signup → Reminder"; it
is:

```
Signup → Business → WhatsApp → Customer? → Invoice? → Overdue? → Reminder → Payment
```

So onboarding must be **adaptive**, not linear. After "Recovery Active", BillZo
evaluates readiness and shows the **single next action** that moves the merchant
toward their first recovered payment.

## Architecture

```
Onboarding Finished
  ↓
GET /api/recovery/readiness
  ↓ (reads in parallel)
  customers count (Supabase)
  invoices + overdue (Supabase)
  whatsapp_config (Supabase)
  ↓
evaluateReadiness(counts)        ← PURE, in src/lib/recovery/readiness.ts
  ↓
Readiness { customers, invoices, overdueInvoices, whatsapp, ready, action }
  ↓
Next Action (deep link)
```

No new business logic. It reuses facts that already exist. The Recommendation
Engine can later consume the same `Readiness` object.

## The four scenarios

| State                              | Next action                | Deep link          |
| --------------------------------- | -------------------------- | ------------------ |
| No customers                       | Add first customer         | `/parties/add`     |
| Customers, no invoices             | Create first invoice       | `/pos`             |
| Invoices, no WhatsApp             | Connect WhatsApp           | `/settings/whatsapp` |
| Overdue invoices + WhatsApp        | Send first reminder        | `/recovery/work`   |
| Else (healthy)                    | Monitoring (no action)     | `/recovery`        |

Priority order: customer → invoice → whatsapp → overdue → healthy.

## Files

- `src/lib/recovery/readiness.ts` — `evaluateReadiness()` pure fn + types.
- `src/app/api/recovery/readiness/route.ts` — gathers 4 facts in parallel; also
  returns `customerCount`, `invoiceCount`, `recoverableAmount`.
- `src/lib/recovery/__tests__/readiness.test.ts` — 6 scenarios.
- `src/app/(app)/recovery/readiness/page.tsx` — **Recovery Readiness screen**.
  Distraction-free: shows the 4 checks + ONE next action (deep-linked). No
  dashboard, no graphs, no extra nav.
- Onboarding (`src/app/onboarding/page.tsx`) now redirects to
  `/recovery/readiness` after completion, so a fresh merchant never lands on an
  empty dashboard.

## Next

- **Guided First Recovery:** when readiness says `send_reminder`, the screen's
  CTA deep-links to `/recovery/work`. (The work queue already exists.)
- **First Payment celebration:** on `payment_recovered`, show the win screen.
- **Empty states / mobile polish** across the recovery screens.
- Get 5 real merchants through this flow; observe where they drop off.
