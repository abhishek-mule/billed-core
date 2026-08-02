# Case Projection — Single Workspace Contract

## Purpose

The Case Projection is the single response that powers the Recovery Workspace.
It replaces 5+ independent API calls with one fetch, one shape, one contract.

```
Workspace Page
     ↓
GET /api/recovery/case-projection?caseId=xyz
     ↓
CaseProjection
     ↓
Pure UI (no business logic, no calculations)
```

---

## Contract

```typescript
CaseProjection {
  case: {
    id: string
    status: string
    recoveryScore?: number
    priority: string
    outstandingAmount: number
    overdueDays: number
    customer: {
      id: string
      name: string
      phone: string
      email: string | null
      tier: string | null
      gstin: string | null
    } | null
  }

  summary: {
    totalOutstanding: number
    invoiceCount: number
    oldestInvoiceDays: number
    lastPaymentAt: string | null
    lastContactAt: string | null
  }

  invoices: {
    id: string
    number: string | null
    amount: number
    status: string
    dueDate: string | null
    overdueDays: number
  }[]

  promises: {
    id: string
    date: string | null
    amount: number
    status: string
    createdAt: string
    note: string | null
  }[]

  timeline: {
    id: string
    type: string
    title: string
    description: string
    timestamp: string
    severity: string
  }[]

  notes: {
    id: string
    note: string
    isPinned: boolean
    createdAt: string
  }[]

  recommendations: {
    nextBestAction: string
    urgency: 'high' | 'medium' | 'low'
    reason: string
  } | null

  metrics: {
    reminderCount: number
    callCount: number
    promiseCount: number
    promiseBrokenCount: number
  }

  health: {
    stale: boolean
    lastUpdated: string | null
  }
}
```

---

## Builder

```
CaseProjectionBuilder
├── getCase()
├── getSummary()
├── getInvoices()
├── getPromises()
├── getTimeline()
├── getNotes()
├── getRecommendations()
├── getMetrics()
└── assemble()
```

Each getter is an independent async function that queries exactly one
thing. `assemble()` runs them in parallel and returns the projection.

The builder lives at `src/lib/billzo/case-projection.ts`.

---

## Recommendations (Deterministic, not AI)

Rules evaluated in order:

1. **Broken promises ≥ 2** → "Call customer today" + reason
2. **Reminder read + no payment > 48h** → "Follow up via call"
3. **Overdue > 30 days** → "Visit customer"
4. **Reminder due today** → "Send reminder"
5. **Promise due today** → "Follow up on promise"
6. **No action in 7 days** → "Send reminder"
7. **No customer phone** → "Update contact information"
8. **Default** → "No action needed"

Every recommendation includes the rule that triggered it so the merchant
understands *why* it was chosen.

---

## Health

`stale = true` if `recovery_cases.updated_at` is more than 10 minutes old.
This lets the workspace show "Last updated X minutes ago" and warns if
the worker or sync pipeline is down.

---

## Migration Path

The existing `GET /api/recovery/case` endpoint continues to work.
The new `GET /api/recovery/case-projection` is the future.

Once the workspace page consumes the projection, the old endpoint can be
deprecated and eventually removed. The POST handler in the old route
(for creating cases) stays separate.
