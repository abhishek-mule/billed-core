# BillZo — WhatsApp-Native Recovery & Billing OS for Indian Merchants 
  
**First-recovered-rupee engineering.** BillZo helps Indian merchants recover outstanding payments through automated WhatsApp reminders, intelligent collection workflows, and real-time payment reconciliation.

## Core Identity
 
> "BillZo tells me where my money is stuck and what to do next."

BillZo's competitor is not Tally, Zoho, or Vyapar. It is the merchant's memory, WhatsApp chats, handwritten follow-ups, and "kal yaad dilana hai" notes.

## Architecture  

```
┌──────────────────────────────────────────────────────────────────┐
│                   NEXT.JS FRONTEND (Vercel)                      │
│                                                                  │
│  ┌─────────────┐  ┌──────────┐  ┌────────┐  ┌───────────────┐   │
│  │  Dashboard   │  │ Cashflow │  │  Pulse  │  │  Settings     │   │
│  │  (Queue)     │  │(Receivbl)│  │(Paymnts)│  │  (WhatsApp)   │   │
│  └──────┬───────┘  └────┬─────┘  └───┬────┘  └───────┬───────┘   │
│         │               │           │              │            │
│         └───────────────┴───────────┴──────────────┴────────────┘
│                              │                                        │
│                    Supabase SDK  │  Dexie (IndexedDB)                  │
└──────────────────────────────┼────────────────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                │                             │
                ▼                             ▼
┌──────────────────────────┐   ┌──────────────────────────────┐
│     SUPABASE (Auth +     │   │  POSTGRES / NEON (Business   │
│   Outbox + Realtime)     │   │  Data: invoices, customers,  │
│                          │   │  payments, recovery_cases)    │
│  - Auth (magic link/OTP) │   │                              │
│  - Outbox event store    │   │  Authority ORM               │
│  - Device tokens         │   │  Recovery state machine      │
│  - Realtime subscriptions │   │  Cognition pipeline          │
└──────────────────────────┘   └──────────────┬───────────────┘
                                               │
                                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     WORKER (Fly.io/Render)                        │
│                                                                  │
│  ┌────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────────┐      │
│  │ Outbox │ │Reminders │ │Reconciliation│ │  Cognition    │      │
│  │ Queue  │ │  Queue   │ │    Queue     │ │   Queue      │      │
│  └────────┘ └──────────┘ └──────────────┘ └──────────────┘      │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Transport Layer (Baileys WhatsApp Web / Gupshup API)   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Authority Gateway: Policy Engine + Mutation Gate       │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     REDIS (Upstash)                               │
│                                                                  │
│  - BullMQ queue scheduling                                       │
│  - Baileys auth credentials (30d TTL)                            │
│  - Baileys QR codes (120s TTL)                                   │
│  - Connection state per tenant                                   │
│  - Distributed locks                                             │
└──────────────────────────────────────────────────────────────────┘
```

## Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14.2 (React 18), TypeScript, Tailwind CSS |
| **Backend (worker)** | Node.js 20, TypeScript, postgres.js |
| **Database** | PostgreSQL (Supabase + Neon) — consolidation in progress |
| **Auth** | Supabase Auth (magic link, OTP) |
| **Queue** | BullMQ + Redis (Upstash) |
| **WhatsApp** | Baileys (WhatsApp Web, free) + Gupshup API (paid fallback) |
| **State machine** | Pure TypeScript (RecoveryCase) |
| **Policy engine** | Authority Gateway (Hono HTTP server) |
| **Push notifications** | Firebase Cloud Messaging |
| **Payments** | Razorpay |
| **Deployment** | Frontend: Vercel / Worker: Fly.io or Render |
| **CI** | GitHub Actions (typecheck + test) |

## Project Structure

```
mini_saas/
├── mini_saas_frontend/        # Next.js 14 PWA (port 3000)
│   ├── src/
│   │   ├── app/
│   │   │   ├── (app)/         # Authenticated pages (dashboard, cashflow, pulse, etc.)
│   │   │   ├── api/           # 25+ API route directories
│   │   │   └── auth/          # Authentication pages
│   │   ├── lib/
│   │   │   ├── billzo/        # Business logic (54 files)
│   │   │   ├── recovery/      # Recovery queue service
│   │   │   └── authority/     # Authority transport
│   │   └── components/
│   │       ├── billzo/        # 18 UI components
│   │       ├── recovery/      # Queue action list, timeline
│   │       └── attention-feed/# Situation cards
│   └── migrations/            # 30 SQL migration files
│
├── worker/                    # Background worker (port 10000)
│   ├── index.ts               # Bootstrap (queues, health server, periodics)
│   ├── queues/                # 5 BullMQ queues
│   │   ├── outbox.ts          # Core event processor (1006 lines, 6 lanes)
│   │   ├── reminders.ts       # WhatsApp reminder scheduling
│   │   ├── reconciliation.ts  # Payment matching
│   │   ├── cognition.ts       # Operational intelligence pipeline
│   │   └── retry.ts           # Dead letter retry (exp backoff)
│   ├── lib/                   # Baileys sockets, WhatsApp router, Redis, locks
│   ├── stores/                # Baileys auth/QR/state (Redis-backed)
│   ├── src/lib/
│   │   ├── authority/         # Policy engine (27 files)
│   │   ├── recovery/          # RecoveryCase state machine
│   │   ├── transport/         # Transport adapter abstraction
│   │   ├── cognition/         # Attention scoring pipeline
│   │   ├── mutation-gate/     # Governed mutation layer
│   │   └── billzo/            # Core business logic (24 files)
│   ├── scripts/               # Backfill, lint, inspection
│   ├── Dockerfile             # Fly.io multi-stage build
│   └── fly.toml               # Fly.io deployment config
│
├── packages/shared/           # Shared types, events, recovery models
│   └── src/
│       ├── types.ts           # 400+ lines of shared types
│       ├── recovery-case.ts   # RecoveryCase V2 + attention score
│       ├── events.ts          # 40+ event type taxonomy
│       └── authority-*/       # Config, transport schemas
│
├── billed-core/               # Python provisioning API (FastAPI)
│   └── api/provisioning_api.py # Frappe site lifecycle management
│
├── infra/                     # Docker stack (Frappe/ERPNext dev)
├── production/                # Production Docker stack
├── frappe_docker/             # Frappe Docker toolkit
├── n8n_workflows/             # n8n automation workflows
└── ocr_backend/               # Python OCR service
```

## Key Modules

### 1. Recovery State Machine (`worker/src/lib/recovery/case-machine.ts`)
Pure function that handles 14+ event types — no database access. Transitions between:
- **RecoveryStateV2** (FACT): active, overdue, partial_payment, promised, recovered, disputed, closed
- **EngagementStateV2** (BELIEF): unseen, engaged, intent, likely_to_pay, ghosting
- **NextActionType**: send_reminder, review_payment, follow_up_call, wait, merchant_review

### 2. Transport Abstraction (`worker/src/lib/transport/`)
Provider-agnostic messaging layer. Same recovery code works with:
- **BaileysAdapter**: WhatsApp Web (free, QR pairing, merchant-controlled)
- **GupshupAdapter**: WhatsApp Business API (paid, for scale)
- **SimulationAdapter**: Dev/testing with no real messages

Future: Meta Cloud API, Interakt — plug in via `TransportAdapter` interface.

### 3. Cognition Pipeline (`worker/src/lib/cognition/`)
5-stage pipeline that runs every 10 minutes per tenant:
1. **Scorer** — compute attention items from DB signals
2. **Correlation** — group related items
3. **Clusterer** — cluster into situation candidates (max 7)
4. **Prioritizer** — rank by urgency/impact
5. **Synthesizer** — generate merchant-readable narratives

### 4. Authority Gateway (`worker/src/lib/authority/`)
Policy enforcement engine inspired by AWS IAM / OPA. Every state mutation is an "intent" evaluated against sovereignty rules before execution. Uses HMAC-signed transport, nonce replay protection, and phased rollout (shadow → dual-write → active).

### 5. WhatsApp Pairing (Baileys)
- Merchant opens Settings → WhatsApp → "Connect WhatsApp"
- Worker generates QR code → stored in Redis → frontend polls and displays
- Merchant scans with phone → Baileys session established
- Auth credentials persisted in Redis (30-day TTL)
- No Meta approval needed, no BSP fees — works like WhatsApp Web

## Queue System (BullMQ)

| Queue | Frequency | Purpose |
|-------|-----------|---------|
| **outbox** | Event-driven | Core event processor — 6 lanes: transport, behavior, recovery, cognition, attribution, notification |
| **reminders** | 5 min cron | Sends staged WhatsApp payment reminders (t0_soft → t5_warning) |
| **reconciliation** | Event-driven | Matches payments to invoices |
| **cognition** | 10 min cron | Computes operational situations per tenant |
| **retry** | 5 min cron | Dead letter recovery with exponential backoff (1m, 5m, 15m) |

## The Single Metric

**Recovered Cash Attributed To BillZo** — daily, per merchant, per reminder ladder stage. Everything else (migrations, backfills, queue rendering) is setup, not progress.

## Deployment

### Frontend (Vercel)
```bash
cd mini_saas_frontend
vercel --prod
```

### Worker (Fly.io)
```bash
cd worker
fly launch --dockerfile Dockerfile
fly secrets set UPSTASH_REDIS_URL="rediss://..." NEXT_PUBLIC_SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..."
fly deploy
```

### Environment Variables
See `mini_saas_frontend/.env.example` for the full list. Key vars:
- `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — Supabase auth + outbox
- `DATABASE_URL` — Postgres (Neon) for business data
- `UPSTASH_REDIS_URL` / `UPSTASH_REDIS_REST_URL` + `TOKEN` — Redis for queues + Baileys
- `NEXT_PUBLIC_RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — Payment processing
- `JWT_SECRET` / `SESSION_SECRET` — Auth tokens
- `GUPSHUP_API_KEY` / `GUPSHUP_APP_NAME` — WhatsApp fallback provider
- `NEXT_PUBLIC_FIREBASE_*` — Push notifications

## Migration History (30 files)

| Range | Focus |
|-------|-------|
| 001-010 | Core schema (invoices, payments, reminders, ledger, compliance) |
| 011-016 | Outbox hardening, WhatsApp events, behavioral memory |
| 017-022 | Recovery cases, projections, Authority gateway, execution leases |
| 023-025 | Mutation gate, messaging channels, cognition layer |
| 027-029 | RecoveryCase v2 state, FK fixes, Supabase missing tables |

## Roadmap

### Phase A — First Recovered Rupee (NOW)
- [x] Migration 028 (RecoveryCase v2 FK fix, event tables)
- [x] Backfill recovery cases from invoices
- [x] WhatsApp pair route with graceful Redis fallback
- [ ] Worker deployed (Fly.io/Railway)
- [ ] Supabase missing tables created (migration 029)
- [ ] Test WhatsApp pairing with real merchant
- [ ] Send one real reminder
- [ ] Observe payment → RecoveryCase resolved

### Phase B — Validate
- Queue reads from Neon (frontend API routes → postgres.js)
- Backfill RecoveryCases on production data
- Show real collectible amounts in queue
- Send reminders from queue UI

### Phase C — Database Consolidation
- Move all BillZo data to Supabase
- Remove Neon dependency
- Single source of truth

### Phase D — Scale
- Gupshup / Interakt BSP (100+ merchants)
- Meta Cloud API (1000+ merchants)

## Philosophy

1. **RecoveryCase is aggregate root** — Customer Collection Position, not a container of invoice IDs
2. **Facts vs beliefs** — RecoveryState (what's true) never mixes with EngagementState (what we infer)
3. **Deterministic before intelligent** — arithmetic ranking before ML, fixed ladders before adaptive timing
4. **Anti-cleverness** — Predictable > Intelligent, Visible > Magical, Reversible > Autonomous
5. **Append-only decisions** — recovery_case_events stores system decisions, never updated in place
6. **90-second merchant session** — ranked queue → one CTA → action → next. No dashboards, no graphs, no decision trees
7. **Max 7 situations** — human cognition collapses beyond 7. Any more is noise
8. **The first recovered rupee is the only milestone that matters**
