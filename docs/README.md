# BillZo Docs — Map

> Start at the repo root [`AGENTS.md`](../AGENTS.md) (binding rules), then
> [`known-reality.md`](known-reality.md) (verified snapshot).
> `frappe_docker/` docs belong to the forked Frappe project — ignore them for BillZo work.
> `.kilo/worktrees/` are stale agent-worktree leftovers — never authoritative.

| Folder / file | Purpose | Status |
|---|---|---|
| [`adr/`](adr/) | Binding architecture decisions (Gupshup auth, Postgres truth, Frappe boundary) | **Normative** — read before touching those areas |
| [`known-reality.md`](known-reality.md) | Verified operational snapshot (providers, gates, infra) | Check `Last verified`; `STALE` = re-verify |
| [`architecture/`](architecture/) | System design: ARCHITECTURE_TRUTH, ARCHITECTURE, recovery engine/events, case projection, event catalog, phase-1.5 audit | Reference; production transport scope decided in ADR-001 |
| [`development/`](development/) | DECISIONS.md (chronological log), implementation plan/checklist, code-patterns guide | Reference |
| [`operations/`](operations/) | Pre-GO checklist, webhook auth/secrets, rollout + rollback runbooks, pilot playbooks | Checklists are **gates**, not guides |
| [`product/`](product/) | June-2026 bug-fix executive summary, escalation-pack spec | Historical / spec |
| [`strategy/`](strategy/) | Merchant-trust scenarios | Product reference |
| [`archive/`](archive/) | Superseded docs (AGENT-legacy, sprint roadmap, old plans/audits) | **Never follow** — history only |
| Root `PRD.md`, `TRD.md`, `Backend_Schema.md`, `UI_UX_Workflow.md` | v1.0 product/technical baselines | Reference (kept at root: specs link to them by path) |

**Rules:** never move a doc without `git mv` + updating references; never write
provider IPs, secrets, or phone numbers into docs; specs link root baselines by
path (`PRD.md`, `TRD.md`), so those files stay at root.
