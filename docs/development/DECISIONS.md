# DECISIONS.md

Every major architectural decision, in reverse-chronological order. Format:

```
YYYY-MM-DD
Decision:
Why:
Alternative:
Chosen because:
```

If a decision is later reversed, add a `Reversed:` line instead of rewriting history.

---

## 2026-08-01 — Feature gate rejections return unique `code` + `message`

**Decision:** `FeatureGateResult` carries a unique `code` (`TENANT_NOT_FOUND`,
`FEATURE_LOCKED`, `TRIAL_EXPIRED`, `TRIAL_ALREADY_USED`, `TRIAL_IN_PROGRESS`) plus a
human `message`. `error` is kept only as a deprecated alias.

**Why:** Clients were string-matching prose and one generic `FEATURE_LOCKED`
swallowed distinct failure modes, making support and debugging ambiguous.

**Alternative:** Collapse every denial into `FEATURE_LOCKED` (rejected: lost
diagnostics); HTTP status-only signaling (rejected: not machine-readable).

**Chosen because:** Stable, unique codes let clients branch exactly, and distinct
trial states survive intact — never collapsed into a single plan-locked error.

## 2026-08-01 — One scheduler: `collection_actions`; legacy cron deprecated

**Decision:** The worker's `enqueueOverdueReminders()` (5-min interval over
`collection_actions`) is the single production scheduler. The legacy
`/api/cron/reminders` route is marked `@deprecated` and removed from `vercel.json`,
but kept for manual/hotfix invocations until the pilot completes.

**Why:** Two schedulers were drifting (direct-send vs. ledger-driven) and risked
double-sending reminders.

**Alternative:** Delete the legacy route immediately (rejected: no hotfix path
mid-pilot).

**Chosen because:** Deprecate-then-delete is the safe production path; deletion is a
scheduled follow-up after Merchant #1.

## 2026-08-01 — TransportRegistry lives in `@billzo/shared`

**Decision:** All transport (Meta, Baileys, Gupshup, Simulation) routes through one
`TransportRegistry` in `packages/shared`. Adapters are host-agnostic; the worker and
frontend inject dependencies (DB, Redis, sockets) via resolvers/hosts.

**Why:** Three divergent implementations existed (frontend→Meta, worker→Meta,
legacy→Gupshup), each with its own retry/circuit logic.

**Alternative:** Frontend API proxy (rejected: added a hop, kept divergence).

**Chosen because:** Single source of truth; every future channel (SMS, Email, RCS)
plugs into the same abstraction.

## 2026-08-01 — Identity: tenant resolved from `tenant_memberships`; JWT always carries tenant

**Decision:** `resolveTenantForUser` derives the tenant from `tenant_memberships`
(membership-authoritative), falling back to the Redis session. Effective tenant goes
into the JWT; `verifyRequest` never touches the DB on the JWT path.

**Why:** Requests depended on a `bz_tenant` cookie and `/auth/resolve` round-trips;
tenant lookup was repeated per-request.

**Alternative:** Continue cookie-driven resolution (rejected: non-deterministic).

**Chosen because:** The JWT is the deterministic source of truth — no request depends
on cookie lookup or a resolve hop.

## 2026-07 — Reliability: chaos-style tests over happy-path tests

**Decision:** The worker test suite includes failure-injection cases (circuit breaker
open/reset, retry semantics, no-crash on infra failure), not just "does it work".

**Why:** Production failure modes are the merchant's real experience; happy-path-only
tests gave false confidence.

**Alternative:** None (rejected all — this is the only way to know it survives).

**Chosen because:** "Does it survive?" is a different question from "does it work?"
and is the actual pilot criterion.

## 2026-07 — `packages/recovery-domain` consolidation and Analytics postponed

**Decision:** Do NOT extract `packages/recovery-domain` or build Analytics until
2–3 merchants define stable abstractions. No AI features until trust is earned.

**Why:** Recovery heuristics (confidence weighting, promise significance, invoice
view, WhatsApp replies) are still evolving; premature extraction would freeze the
wrong rules.

**Alternative:** Consolidate now (rejected: would enshrine unproven heuristics).

**Chosen because:** Pilot feedback must drive which heuristics become permanent parts
of the recovery domain — not internal ideas.

## 2026-07 — Trial errors stay distinct

**Decision:** Trial denials (`TRIAL_EXPIRED`, `TRIAL_ALREADY_USED`,
`TRIAL_IN_PROGRESS`) are separate gate codes and never collapse into `FEATURE_LOCKED`.

**Why:** Each trial state has a different merchant remedy (upgrade / already used /
waiting); conflating them hid which action the merchant should take.

**Alternative:** Merge all into `FEATURE_LOCKED` (rejected: lost the remedy signal).

**Chosen because:** Distinct codes are cheaper to support and debug than prose
guessing.

## 2026-06 — Orphaned tenants are legacy test data, not a bug

**Decision:** Tenant IDs with no `tenants` row (`tenant_1780724113010_c4fed89b`,
`tenant_1781147720396_1e07b7cd`) are left as-is. No repair migration.

**Why:** Investigation showed no memberships reference them, no migration deletes
them, and no session/tenant keys live in `kv_store` — a legacy June cleanup artifact,
not a live bug.

**Alternative:** Add a cleanup migration (rejected: churn with no user impact).

**Chosen because:** Do not repair what does not affect any live tenant.
