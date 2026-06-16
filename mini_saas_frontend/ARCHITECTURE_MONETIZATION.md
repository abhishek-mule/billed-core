# Monetization Architecture — BillZo

## Philosophy

> BillZo becomes the memory of your business, and you pay when it starts bringing your money back.

Free tier is designed to build habit (unlimited invoices + unlimited manual reminders), not to cap usage. The paid upgrade sells relief from the daily pain of overdue money — not "more software access."

## Plan Features

| Feature | Starter | Pro (₹299) | Growth (₹599) |
|---|---|---|---|
| Invoices | Unlimited | Unlimited | Unlimited |
| Manual reminders | Unlimited | Unlimited | Unlimited |
| Auto recovery | — | ✅ | ✅ |
| Recovery queue | Preview only | Full | Full |
| Promise tracking | — | ✅ | ✅ |
| Cashflow forecast | — | ✅ | ✅ |
| Advanced analytics | — | — | ✅ |
| Exports | — | — | ✅ |

Promotions (like `free_recovery_trial`) are **not** in the permanent feature map. They are checked separately via `feature-gate.ts`.

## Trial Campaign

### Eligibility

- Tenant must be on Starter plan
- Must have at least one overdue invoice (outstanding_amount > 0)
- Must be within 14 days of first overdue invoice
- Must not have a completed `free_recovery_trial` already

### Flow

```
Dashboard shows "₹74,500 waiting"
    ↓
Merchant clicks "Try Free Recovery"
    ↓
GET /api/recovery/trial/start
  → Deletes stale previews for tenant
  → Queries overdue invoices
  → Creates trial_previews row (signed, expires in 1 hour)
  → Returns { previewId, eligibleCount, totalOverdue }
    ↓
Review screen (behavioral summaries, no rule traces)
    ↓
POST /api/recovery/trial/approve { previewId }
  → Verifies preview exists and belongs to tenant
  → Checks expiry (409 if expired)
  → requireFeature('free_recovery_trial', 'POST')
    → Checks plan, 14-day window, feature_trials table
  → If Pro/Growth: runs campaign without consuming trial
  → If Starter: upserts feature_trials (status: running)
  → Enforces max 50 customers, 1 message per customer
  → Enqueues messages to outbox
  → Deletes preview (consumed)
    ↓
Worker sends one WhatsApp per customer
    ↓
feature_trials updated to completed with metadata
```

### Limits

| Parameter | Value |
|---|---|
| Max customers | 50 |
| Messages per customer | 1 (one reminder per campaign) |
| Campaign lifetime | Once per tenant (completed blocks forever) |
| Preview expiry | 1 hour |

## Feature Gate Architecture

```
UI Button
    |
    | (optional UX hint)
    ↓
API Route
    |
    ↓
requireFeature(tenantId, feature, method)
    |
    ├── Permanent features → FEATURES map (plan-limits.ts)
    └── Promotions       → feature_trials table + tenant.created_at
    |
    ↓
403 FEATURE_LOCKED   or   200 OK
```

- **Never trust the frontend.** The API route is the authority.
- GET requests for locked features return preview data (200, not 403).
- POST/PUT/DELETE mutations return 403 when locked.
- Promotions are separate from permanent feature entitlements.

### Key endpoints

| Endpoint | Method | Starter response | Pro+ response |
|---|---|---|---|
| `/api/paywall/enforce` | GET | Plan + overdue aggregate + trial availability | Plan + full data |
| `/api/paywall/check?feature=X` | GET | Feature access status | Full access |
| `/api/recovery/queue` | GET | `{ access: "preview", data: { aggregate + 3 anonymous samples } }` | `{ access: "full", data: { ... } }` |
| `/api/recovery/queue/actions` | POST | `403 FEATURE_LOCKED` | Success |
| `/api/recovery/trial/start` | GET | Preview snapshot (signed) | "Already active" |
| `/api/recovery/trial/approve` | POST | Campaign starts (consumes trial) | Campaign starts (no trial consumed) |

## Database Schema

### `feature_trials`

Single-lifetime trial record per tenant. Status transitions: (no row) → `running` → `completed`.

```sql
CREATE TABLE feature_trials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    feature TEXT NOT NULL CHECK (feature IN ('free_recovery_trial')),
    status TEXT NOT NULL CHECK (status IN ('running', 'completed')),
    created_by TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}',
    UNIQUE (tenant_id, feature)
);
```

### `trial_previews`

Ephemeral preview snapshots to prevent client-side customer list manipulation.

```sql
CREATE TABLE trial_previews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    eligible_customers JSONB NOT NULL,
    eligible_count INT NOT NULL,
    total_overdue NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour'
);
```

### Index for trial eligibility query

```sql
CREATE INDEX idx_invoices_trial_lookup
ON invoices (tenant_id, due_at)
WHERE outstanding_amount > 0;
```

## Security

1. **Signed preview IDs** — `POST /trial/approve` reads the server-computed customer list from `trial_previews`, never from the client request body.
2. **Preview dedup** — `GET /trial/start` deletes stale previews before creating a new one.
3. **API as authority** — All mutations check `requireFeature()`. The frontend hints are optional.
4. **Backend limits** — `maxCustomers: 50` enforced in the approve route, not in UI.
5. **No telemetry for free users** — Paywall status endpoint is lightweight (no customer scan, no eligibility query).

## Conversion Mechanism

The recovery queue **preview** is the primary conversion tool:

- Previews show aggregate pain (₹74,500 stuck, 18 overdue) + 3 anonymous samples
- Previews do NOT show customer names, phone numbers, or individual priority logic
- The trial campaign demonstrates delivery/open/payment signals
- After trial completion, the dashboard shows recovery amount + "162× your monthly subscription" ROI

## Engine Versioning

```typescript
// src/lib/recovery/version.ts
export const RECOVERY_ENGINE_VERSION = '1.0'
```

Bumped when decision rules, orchestration, or scoring logic changes. Stored in `feature_trials.metadata.engineVersion` for experiment tracking.

## File Map

| File | Role |
|---|---|
| `migrations/047_feature_trials.sql` | Feature trials table |
| `migrations/048_trial_previews.sql` | Trial preview snapshots |
| `migrations/049_trial_index.sql` | Index for trial eligibility query |
| `src/lib/recovery/version.ts` | Engine version constant |
| `src/lib/billzo/trial-limits.ts` | Trial campaign limits |
| `src/lib/billzo/plan-limits.ts` | Feature entitlement map per plan |
| `src/lib/auth/feature-gate.ts` | requireFeature() gate |
| `src/app/api/paywall/enforce/route.ts` | Lightweight paywall status |
| `src/app/api/paywall/check/route.ts` | Feature-specific access check |
| `src/app/api/recovery/queue/route.ts` | Dual response (preview/full) |
| `src/app/api/recovery/queue/actions/route.ts` | Mutation gate for queue actions |
| `src/app/api/recovery/trial/start/route.ts` | Trial campaign preview |
| `src/app/api/recovery/trial/approve/route.ts` | Trial campaign execution |
