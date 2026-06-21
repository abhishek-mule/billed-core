# BillZo

BillZo is a **reconstructive financial recovery engine** designed to synchronize truth between merchants, customers, and payment rails.

## Documentation Entry Points
*   **[System Constitution](ARCHITECTURE_TRUTH.md):** The core architectural invariants and dimensional truth model.
*   **[Implementation Plan](IMPLEMENTATION_PLAN.md):** The 45-day roadmap to the First Rupee Recovery Loop.

## Core Pillars
1.  **Money Truth:** Immutable event ledger + pure reducer projection.
2.  **Relationship Memory:** Behavioral tracking (VIP, annoyance, promises).
3.  **Policy Engine:** Context-aware action gating (`canSendReminder`).

## Status
*   **Backend:** Proven (Loop closed: Payment -> Attribution -> Recovered).
*   **Infrastructure:** Stabilized on local Redis.
*   **Next Step:** Implement Task 1.1 (Financial Reducer Hardening).

## Running Locally

### Prerequisites
- **Node.js** >= 18
- **pnpm** (`npm i -g pnpm`)
- **Redis** (local, or Upstash)
- **PostgreSQL** (local or Supabase)

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Build shared packages
pnpm build:shared

# 3. Set up environment variables
cp mini_saas_frontend/.env.example mini_saas_frontend/.env.local
# Edit .env.local with your keys (Razorpay test keys suffice for local dev)

# 4. (Optional) Worker env
cp worker/.env.local.example worker/.env.local
```

### Run

```bash
# Frontend (Next.js on :3000)
pnpm --filter mini_saas_frontend dev

# Worker (background recovery engine)
pnpm --filter billzo-worker dev

# Tests
pnpm test:frontend        # Vitest (unit)
pnpm test:e2e             # Cypress (E2E — needs frontend running)
pnpm --filter mini_saas_frontend storybook   # Storybook on :6006
```

### Minimal Local Setup (no external services)

For UI-only development, set `NEXT_PUBLIC_OCR_API_URL` to any dummy value and leave Razorpay/Supabase keys empty — the app will run in offline mode with mock data.
