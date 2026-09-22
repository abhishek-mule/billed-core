# ADR-003: `frappe_docker/` Is Adjacent, Not Core

- **Status:** Accepted
- **Date:** 2026-09-20
- **Scope:** repo boundary — BillZo core vs. ERP/back-office stack

## Context

The repo contains a vendored fork of upstream `frappe/frappe_docker` (Docker
orchestration for Frappe/ERPNext) alongside the BillZo app. Without an explicit
boundary, agents gradually treat it as BillZo infrastructure: importing its
patterns, documenting it as BillZo architecture, or proposing to delete it as
dead weight. Both directions are wrong.

## Decision

**`frappe_docker/` is not currently part of BillZo's core runtime or
financial-truth architecture. It is a vendored Frappe/ERP stack maintained
alongside BillZo, with only a type-level integration point currently evidenced
in the BillZo codebase.**

```
                    BILLZO
 ┌─────────────────────────────────────────┐
 │ Next.js / PWA                           │
 │ Worker                                  │
 │ packages/shared                         │
 │ Supabase PostgreSQL ← financial truth   │
 │ Recovery / Payments / WhatsApp          │
 └─────────────────────────────────────────┘
                    │
                    │ currently only
                    │ type-level intent source
                    ▼
              "frappe" intent
                    │
 ┌─────────────────────────────────────────┐
 │          FRAPPE / ERP STACK             │
 │ frappe_docker/                          │
 │ ├─ Frappe/ERPNext                       │
 │ ├─ India Compliance                     │
 │ ├─ electrical_trader_pack               │
 │ └─ Docker/Redis/DB/etc.                 │
 └─────────────────────────────────────────┘
```

Classification:

| Area | Classification |
|---|---|
| `mini_saas_frontend/` | **BillZo core** |
| `worker/` | **BillZo core** |
| `packages/shared/` | **BillZo core** |
| Supabase/Postgres | **BillZo financial truth** |
| `frappe_docker/` | **Adjacent ERP system** |
| `apps/india_compliance/` (inside frappe_docker) | ERP-side |
| `electrical_trader_pack/` | ERP-side |
| `rebuild_stack.sh` | ERP/stack operational tooling |
| `IntentSource = 'frappe'` | **Integration seam, not proof of integration** |

Default rule for future work: **ignore `frappe_docker/` unless the task
explicitly involves the ERP/Frappe side or the Frappe integration seam.**

## Rejected alternatives

- **Delete `frappe_docker/`** (considered 2026-09-20, rejected): `rebuild_stack.sh`
  depends on it, `n8n_workflows/compose.n8n.yaml` requires the external
  `frappe_docker` Docker network it creates, `electrical_trader_pack/TODO.md`
  has unfinished steps, and at 11 MB / 756 tracked files the size benefit is
  negligible. Deletion was destructive and touched unknowns (containers in
  production? live Frappe→BillZo flow?).
- **Treat Frappe as BillZo infrastructure** — rejected: no BillZo code imports
  it; BillZo truth stays in Postgres per ADR-002.
- **Move BillZo financial truth into Frappe / depend on Frappe being online /
  import Frappe code into `packages/shared` / build connectors without a
  requirement** — all rejected unless a future ADR with an actual requirement
  revisits this boundary.

## Consequences

- Agents stay out of `frappe_docker/` by default (rule recorded in `AGENTS.md`).
- `electrical_trader_pack` TODOs are ERP-side work, never BillZo tasks.
- `frappe_docker/` docs remain that system's docs; they are not BillZo architecture.
- Revisiting this boundary (real integration, extraction to its own repo)
  requires a new ADR with evidence, not cleanup enthusiasm.

## Affected systems

- `AGENTS.md` (default rule), `docs/known-reality.md` (Frappe section)
- `docs/README.md` (map already excludes `frappe_docker/`)
- `rebuild_stack.sh`, `n8n_workflows/compose.n8n.yaml` (unchanged, still coupled)
