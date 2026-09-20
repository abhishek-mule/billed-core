# ADR-004: HMAC for Next.js → Worker Raw Endpoints

- **Status:** Accepted (implemented 2026-09-20)
- **Date:** 2026-09-20
- **Scope:** worker raw HTTP surface (`worker/index.ts`)

## Context

The production worker entrypoint exposed unauthenticated mutation endpoints on
`:10000` (`/api/v1/recovery/override`, `/trigger-reminder`,
`/api/whatsapp/pair/*`, plus a dead `/clear-override`), while `fly.toml`
`[http_service]` makes that port publicly reachable (B-01, confirmed by
code audit 2026-09-20). The authority gateway already enforced HMAC, but
production boots the raw server, not the gateway-only path.

## Decision

- Raw worker endpoints require inter-service HMAC (`x-billzo-timestamp`,
  `x-billzo-nonce`, `x-billzo-signature`) using the repo's existing
  `hmacSignHttp` scheme with a **dedicated `WORKER_INTERNAL_SECRET`**
  (independent rotation/blast radius from intent-envelope secrets).
- Fail-closed mapping: secret unset → 503; missing credentials/stale
  timestamp (>300s) → 401; bad signature → 403.
- Dead `clear-override` (zero callers) deleted instead of guarded.
- `/health` and `/metrics` stay open (Fly checks need them; read-only).
- The three Next.js proxy routes sign every call and fail closed (503/skip)
  when the secret is unconfigured.

## Rejected alternatives

- **Reusing `AUTHORITY_HMAC_SECRET_APP`** — rejected: different trust domain
  (legacy direct-call endpoints vs. intent gateway); independent secret keeps
  rotation and blast radius separate at the cost of one more env var.
- **Routing the three proxies through the authority gateway instead** —
  rejected for now: larger change (capability wiring for pair/trigger flows);
  revisitable via a new ADR once gateway coverage is complete.
- **IP-allowlisting the worker port** — complementary, not a substitute;
  app-layer auth holds regardless of ingress topology.

## Consequences

- `WORKER_INTERNAL_SECRET` must be provisioned in **both** Next.js and worker
  environments (platform stores; `.example` files document the shape only).
  Missing on either side → legit calls fail closed and loudly.
- Rotation must update both sides together; document the pairing wherever the
  secret is stored.
- B-05 (idempotency race) and the subscription-branch tenant-minting note are
  explicitly out of scope — separate ADRs when addressed.

## Affected systems

- `worker/index.ts`, `worker/src/lib/worker-auth.ts` (+ tests)
- `mini_saas_frontend/src/lib/billzo/worker-auth.ts`,
  `api/recovery/{override,case}`, `api/whatsapp/pair`
- `docs/known-reality.md` (limitations), `docs/development/DECISIONS.md`
