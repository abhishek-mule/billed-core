# ADR-002: PostgreSQL Is Canonical Business Truth

- **Status:** Accepted
- **Date:** 2026-09-20
- **Scope:** sessions, ledger, invoices, payments, rate limits, OTP

## Context

Code comments and helper names in the web app still say "Redis"
(`auth-store.ts`, rate-limiter logs mentioning Redis/Upstash), which invites an
agent to assume a Redis-backed session/rate-limit architecture or to introduce
one. Reading the implementation shows the opposite: session, OTP, login-event,
and magic-link rate-limit state all live in Postgres tables (`sessions`,
`kv_store`, `login_events`) accessed via the service-role client.

## Decision

- **PostgreSQL is the canonical store** for session, ledger, invoice, payment,
  OTP, login-event, and rate-limit state.
- Any Redis/Upstash (or other cache/queue) usage — current or future, notably in
  the worker — is **ephemeral infrastructure only**: queues, non-authoritative
  caches, transient locks. It must never become the source of truth for business,
  financial, session, or limit state.
- Reconciliation, tenant resolution, and audit reads always go to Postgres.

## Rejected alternatives

- **Redis-first sessions/rate limits** — rejected: introduces a second source of
  truth, silent expiry semantics, and split-brain risk between cache and ledger.
- **Queue-as-ledger for worker state** — rejected: queues are delivery
  mechanisms, not durable business records.

## Consequences

- Session/rate-limit/OTP code stays Postgres-backed; do not "migrate" it to
  Redis without a new ADR.
- The worker must treat any queue as transient: crash or loss of queue state
  must never lose or duplicate business effects (idempotency keys live in Postgres).
- Future Redis/Upstash adoption is allowed for caching/queues only, behind this ADR.

## Affected systems

- `mini_saas_frontend/src/lib/billzo/auth-store.ts`
- `mini_saas_frontend/src/app/api/auth/*` (magic-link, supabase, callback-exchange, login)
- worker queue/verify scripts
- `docs/known-reality.md` (infrastructure section)
