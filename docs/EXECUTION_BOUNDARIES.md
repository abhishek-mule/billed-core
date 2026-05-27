# Execution Boundaries

This document defines what each system component may and may not do. Violations are architectural errors that must be caught in code review.

**Status:** Living document — must be updated when new components or capabilities are added.
**Rule:** No component may exceed its defined execution boundary. If a component needs a capability it does not have, it must emit an intent and let the authorized component execute it.

---

## 1. n8n (Workflow Orchestrator)

### MAY DO
- Emit HTTP requests to the API Gateway with intents
- Compose workflows from approved intent templates
- Read from approved read-only API endpoints
- Execute idempotent webhook transformations (data format changes, no side effects)
- Send notifications via approved channels (email, Slack)

### MUST NOT DO
- Mutate ERPNext/Frappe directly (no API calls to Frappe HTTP endpoints)
- Call any database directly
- Store or manage credentials (must use secrets manager)
- Generate or manage identities (tenant IDs, user IDs, invoice IDs)
- Decide retry policies or state transitions
- Execute long-running workflows that hold state
- Access production Redis, Postgres, or any data store directly

### Configuration
- Version-pinned image (`n8nio/n8n:1.x.x` — NOT `latest`)
- Scoped API key with read-only access to intent endpoints only
- Network isolation: only reachable to API Gateway, not to Frappe or databases
- Workflow definitions version-controlled and reviewed

---

## 2. Frontend (Next.js PWA)

### MAY DO
- Read from Dexie (local cache) for instant UI
- Write to Dexie (local-first) — these writes are transient projections, not canonical
- Query Supabase Postgres via the sync bridge for read operations
- Emit intents via `/api/intents/*` endpoints
- Subscribe to Server-Sent Events (`/api/events/stream`) for real-time updates
- Execute user-initiated actions that emit events (create invoice intent, send message intent)
- Display projections from any domain (read-only views)

### MUST NOT DO
- Directly call `/api/whatsapp/send` — must use `/api/intents/send-message`
- Directly update `invoices`, `tenants`, `products` in Supabase without going through sync bridge
- Store or expose API secrets in client-side code
- Execute business logic that belongs in the worker (orchestration decisions, behavioral computation)
- Bypass the middleware auth layer (all requests to app routes must be authenticated)

### Auth Responsibility
- Middleware enforces JWT session
- Token refresh is handled by middleware via `/api/auth/refresh`
- No Firebase or Supabase Auth sessions are used for application authorization
- `bz_access` and `bz_refresh` cookies are the only session tokens

---

## 3. Worker (BullMQ Background Jobs)

### MAY DO
- Read from Supabase Postgres for all domains (event-driven queries preferred, direct queries for bootstrapping)
- Write to owned domains: `whatsapp_events`, `customer_behavioral_metrics`, `recovery_cases`, `recovery_attributions`, `outbox`, `processed_jobs`
- Execute behavioral computation (interpretation, materialization, entropy, traits, calibration)
- Execute orchestration decisions (timing, channel, tone, cadence, escalation)
- Send WhatsApp messages via transport layer (Baileys, Gupshup)
- Write to Redis for lock management, queue state, Baileys auth
- Emit events to the outbox for any domain

### MUST NOT DO
- Directly UPDATE `invoices` (must emit status change intent for ERP bridge)
- Directly INSERT/UPDATE `tenants` (tenant lifecycle belongs to provisioning API)
- DELETE from any domain's tables (soft-delete via status flags only)
- Accept unauthenticated HTTP requests (health endpoint is the only public endpoint)
- Execute long-running synchronous operations (must use queues)
- Bypass the outbox for event recording

### Queue Configuration
- 3 queues: `outbox` (concurrency: 5), `reminders` (concurrency: 10), `reconciliation` (concurrency: 5)
- Dead-letter queue for events exceeding max retries
- Job timeouts prevent stuck jobs from blocking queues
- Graceful shutdown on SIGTERM/SIGINT

---

## 4. ERPNext / Frappe (Accounting Engine)

### MAY DO
- Serve as canonical source of truth for accounting records (Sales Invoice, Payment Entry, Item, Customer)
- Execute business logic that is Frappe-native (GST computation, ledgers, financial reports)
- Serve read-only APIs for projections to consume
- Send webhook events for state changes (invoice.created, payment.reconciled)

### MUST NOT DO
- Serve as primary data store for non-accounting domains (behavioral metrics, transport events, tenant state)
- Call out to external services directly (must go through the bridge service)
- Store behavioral or transport data in Frappe DocTypes
- Expose write APIs that bypass the domain sovereignty model

---

## 5. Queues (BullMQ)

### MAY DO
- Reliably deliver jobs between producer and consumer
- Enforce retry policies with exponential backoff
- Maintain job state in Redis for observability
- Route jobs to specific queue workers

### MUST NOT DO
- Execute business logic (queues transport jobs; workers execute them)
- Hold credentials or secrets
- Bypass the outbox for event emission
- Execute jobs that exceed their configured timeout

### Queue Topology

```
Producer                    Queue                   Consumer
────────────────────────────────────────────────────────────
Worker (event handler)  →  outbox       →  Outbox worker (lane-based)
                  Scheduler  →  reminders    →  Reminder worker
                  Webhook handler  →  reconciliation  →  Reconciliation worker
```

---

## 6. API Gateway (Intended — Not Yet Implemented)

### Intended Capabilities
- Validate all incoming intents against the sovereignty map
- Rate-limit per tenant, per intent type
- Authenticate and authorize all requests
- Transform and route intents to the appropriate domain authority
- Log all intents for audit purposes

### Current State
- No API gateway exists yet
- n8n calls Frappe directly (violation)
- Frontend calls some API endpoints directly (some are correct, others bypass domain authority)
- The API routes in `src/app/api/*` serve as a partial gateway but lack unified intent validation

---

## 7. Violation Detection

### Automated Detection (CI)
- **Lint rule**: Detect `supabaseAdmin.from('<table>').insert/update/delete` in files not owned by that table's domain
- **Lint rule**: Detect direct Frappe HTTP calls from n8n workflow definitions
- **Lint rule**: Detect `crypto` or `process.hrtime` imports in browser-bundleable code

### Manual Detection (Code Review)
- Every PR must be reviewed against the sovereignty map
- New event types require justification in the Event Constitution
- New API routes require domain ownership documentation
- Cross-domain queries must have an explicit justification comment

---

## Current Violations Registry

| Boundary | Violation | Location | Severity | Fix Target |
|----------|-----------|----------|----------|------------|
| n8n | Direct Frappe API call | All n8n workflows | CRITICAL | Add API gateway |
| Worker | Direct `invoices` UPDATE | `queues/reminders.ts:221` | HIGH | Emit intent instead |
| Worker | Direct `whatsapp_events` INSERT (bypass outbox) | `lib/baileys-socket.ts:154` | HIGH | Emit outbox event |
| Frontend | Direct `/api/whatsapp/send` call | `whatsapp-actions.ts` | MEDIUM | Use `/api/intents/send-message` |
| Worker | Direct DB queries in `index.ts` | `index.ts:52-133` | MEDIUM | Move to proper domain modules |
