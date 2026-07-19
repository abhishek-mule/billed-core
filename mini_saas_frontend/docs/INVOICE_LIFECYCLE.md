# Invoice Lifecycle — BillZo

> Last updated: 2026-07-19
> Purpose: Document where invoices originate so product flows (onboarding,
> Recovery Readiness, Recommendation Engine) can reuse one mental model and one
> set of read paths. No new business logic is introduced here.

## The canonical question

> How does a brand-new merchant get their first collectible invoice into BillZo?

Answer: through ONE of several **creation surfaces**, all of which write the
same `Invoice` row (Dexie `db().invoices`). They do NOT currently share a single
`createInvoice()` wrapper — that is a known gap (see "Architectural Smell").

## Invoice Sources

| Source            | Entry function                                | File                                  | Writes via                |
| ----------------- | --------------------------------------------- | ------------------------------------- | ------------------------- |
| POS               | `handlePOSInvoice(...)`                       | `src/lib/billzo/actions.ts`           | `db().invoices.add`       |
| Udhar (book-credit) | `handlePOSInvoice(..., method:'udhar')`     | `src/lib/billzo/actions.ts`           | `db().invoices.add`       |
| Quick / Manual    | `createQuickInvoice(...)`                     | `src/lib/billzo/actions.ts`           | `db().invoices.add`       |
| WhatsApp-created  | `createInvoiceFromWhatsApp(...)`              | `src/lib/billzo/whatsapp-actions.ts`  | `db().invoices.add`       |
| Repeat last       | `repeatLastInvoice()` → `createQuickInvoice`  | `src/lib/billzo/actions.ts`           | delegates                 |
| Sync (server→client) | applied by `sync.ts`                        | `src/lib/billzo/sync.ts`              | `db().invoices.put`       |
| Sample seed       | `loadSampleData()`                            | `src/lib/billzo/db.ts`                | `bulkAdd` (demo only)     |

There is **no bulk invoice import** route. Customer import exists
(`/api/customers/bulk-import`) but invoice import does not.

## Canonical type

`Invoice` — `src/lib/billzo/types.ts` (~206). Status enum `InvoiceStatus`
(`packages/shared/src/types.ts:168`):

```ts
'type InvoiceStatus = 'paid' | 'partial' | 'unpaid' | 'overdue'
```

There is **no DRAFT / FINALIZED**. Invoices are created straight into `unpaid`.
Key fields: `tenantId`, `customerId`, `total`, `paidAmount`, `status`,
`dueAt` (client) / `due_date` (server), `createdAt`, `recoveryStage`,
`nextRecoveryAt`, `reminderCount`, `version`.

## Lifecycle (target, not yet fully wired)

```
Customer
  ↓
Invoice Created            (POS / Udhar / Quick / WhatsApp / Sync)
  status='unpaid', recoveryStage='t0_soft'
  ↓
Reminder Eligible          due_date reached / passed
  ↓
Planner                    planInvoiceOnCreated → /api/recovery/plan
  inserts collection_actions (scheduled)
  ↓
Scheduler (cron 5min)      picks scheduled_at <= now, still unpaid
  emits RECOVERY_REMINDER_SENT → outbox → transport
  ↓
Collection Action          WhatsApp / call delivered
  ↓
Payment                    payment.completed
  ↓
Recovered                  invoice.status='paid'/'partial'
```

## Overdue (derived, not stored)

`overdue = status !== 'paid' && new Date(dueAt) < now`

Implemented in:
- `getBillzoState()` — `src/lib/billzo/actions.ts:124`
- `recovery/queue/route.ts:217`
- `isOverdue()` — `packages/shared/src/types.ts:198`

Note: `status:'overdue'` is set only on sample seed data; in production it is
derived at read time.

## Recovery Readiness inputs (per tenant)

| Input              | Server read                                   | Client read                          |
| ------------------ | --------------------------------------------- | ------------------------------------ |
| customers exist    | `GET /api/customers` (count)                  | `db().customers.where('tenantId')`   |
| invoices exist     | `supabaseAdmin.from('invoices').eq(tenant_id)` | `db().invoices.where('tenantId')`    |
| overdue invoices   | `invoices` where `due_date < now && status!='paid'` | `getBillzoState().overdueCount`  |
| whatsapp connected | `GET /api/whatsapp/status`                    | —                                    |

There is **no single endpoint** returning all four. A `RecoveryReadiness`
evaluator should read these in parallel and return one object. Recommendation
Engine can later consume the same object.

## Architectural Smell (tracked, not fixed here)

1. **No single `createInvoice()`.** Three writers build the `Invoice` object
   inline. Every new source must remember to set recovery fields
   (`recoveryStage`, `nextRecoveryAt`, `reminderCount:0`, `version:1`) or it
   silently drops out of recovery.
2. **Planner entry is inconsistent.** Only `createQuickInvoice` calls
   `planInvoiceOnCreated`. `handlePOSInvoice` (POS/Udhar) and
   `createInvoiceFromWhatsApp` do NOT — they rely on the admin backfill
   (`/api/admin/recovery/backfill`). So POS/Udhar/WhatsApp invoices may not
   enter the recovery pipeline until backfill runs.
3. **Recommended fix (future):** extract one `createInvoice(input)` in
   `actions.ts` that all surfaces call, which always sets recovery fields and
   always calls `planInvoiceOnCreated`. Until then, activation flows must assume
   planning may be deferred to backfill.

## Activation implication

TTFRP funnel is NOT "Signup → Reminder". It is:

```
Signup → Business → WhatsApp → Customer? → Invoice? → Overdue? → Reminder → Payment
```

Onboarding must therefore adapt: a merchant with zero invoices cannot be
"reminded" — they must first create an invoice. The Recovery Readiness evaluator
(see `docs/RECOVERY_READINESS.md`) answers "what is the single next action?" so
onboarding guides each merchant to their first recovered payment regardless of
starting data.
