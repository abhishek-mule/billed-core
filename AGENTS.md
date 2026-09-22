# AGENTS.md — BillZo AI Constitution

> Normative and binding. Short on purpose: details live in `docs/`.
> If this file conflicts with any other doc, this file wins
> unless a newer ADR in `docs/adr/` explicitly overrides it.
> Applies to every AI agent (Spark, Gemini CLI, OpenCode, Claude/Codex, …).

## Mission

BillZo is a merchant-first invoice-recovery platform (Next.js + Supabase Postgres).
Optimize for correctness, tenant isolation, and auditability — never for speed of output.

## Non-negotiables

1. **PostgreSQL is canonical business truth.** Session, ledger, invoice, payment,
   and rate-limit state live in Postgres. Any cache/queue (Redis/Upstash) is
   ephemeral and never authoritative. See ADR-002.
2. **Tenant isolation is mandatory and server-side.** Every read/write is scoped
   by verified tenant identity. Client-supplied tenant IDs are hints, never proof.
3. **Authorization is server-side.** Client state, cookies readable by JS, and
   localStorage are never authority.
4. **Webhooks fail closed.** Missing secret/config, unknown source, or invalid
   signature → reject, never process. See ADR-001.
5. **Never invent** API fields, DB columns, env vars, external-provider behavior,
   or business rules. If it isn't in code, schema, provider docs, or captured
   evidence, it doesn't exist.
6. **Never assume external-provider behavior.** Verify against provider docs or
   empirical capture (headers, source IP, raw body). Never ping/validate infra
   from your own machine.
7. **Never silently resolve a docs-vs-code conflict.** Report `CONFLICT`, inspect
   the higher-priority source, and ask if it can't be resolved safely.
8. **Financial mutations must be auditable.** Every money-affecting write needs
   an actor, a reason, and a trail. No silent adjustments, no write-offs by default.
9. **Never remove existing behavior** without proving all callers and tests are handled.
10. **Smallest safe change.** Never modify unrelated files; never bundle refactors
    into feature work.
11. **Before coding: inspect → plan → implement → verify.** Find existing
    implementation, callers, tests, migrations, ADRs, and security constraints first.
12. **A task is COMPLETE only when:** implementation + tests + security check +
    migration verification (if schema touched) + docs updated. Stale docs = incomplete.

## Source-of-truth hierarchy (highest first)

1. Production reality — verified config/evidence (`docs/known-reality.md`)
2. Executable code + tests
3. API schemas / contracts
4. ADRs (`docs/adr/`)
5. Other documentation (`docs/`)
6. Agent assumptions (must be labeled as such)
7. Conversation history (lowest — never authoritative)

## Uncertainty protocol

Classify everything you are unsure about:

- `FACT` — verified in a higher-priority source above
- `INFERENCE` — follows from facts, but not directly observed
- `ASSUMPTION` — taken for granted, could be wrong
- `UNKNOWN` — no basis at all

If an `UNKNOWN` touches **security, money, data integrity, external APIs,
or destructive operations: STOP and ask. Do not guess.**
Otherwise you may proceed but must document the assumption explicitly.

## Workflow

```
DISCOVER → UNDERSTAND → PLAN → IMPLEMENT → VERIFY → DOCUMENT → REVIEW
```

Never `PROMPT → CODE`. Keep a visible task list for multi-step work and mark
items complete only after verification actually ran.

## Mandatory output format

Expose your reasoning boundaries before and after every change.

**Before implementation:**

- Scope (what changes, what explicitly does not)
- Relevant files
- Relevant invariants
- Relevant ADRs
- Risks
- Unknowns (with FACT / INFERENCE / ASSUMPTION / UNKNOWN labels)

**After implementation:**

- Files changed
- Behavior changed
- Tests run (with result)
- Security checks run (with result)
- Docs updated
- Remaining unknowns
- Known limitations

No implementation report without this format is complete.

## Key pointers

- Current reality snapshot: `docs/known-reality.md`
  (check its `Last verified` date; anything marked `STALE` must be re-verified, never trusted)
- Binding decisions: `docs/adr/` · chronological log: `docs/development/DECISIONS.md`
- Repo boundary: `frappe_docker/` is an adjacent ERP system, not BillZo core
  (ADR-003). Ignore it unless the task explicitly involves the ERP/Frappe side
  or the Frappe integration seam.
- Legacy `AGENT.md` is archived at `docs/archive/AGENT-legacy.md` and is not
  authoritative. Its durable June-2026 frontend patterns live on in
  `docs/development/CODE_PATTERNS_GUIDE.md`.
- Architecture: `docs/architecture/` · operations checklists: `docs/operations/`
- Secrets: platform stores + untracked local `.env.local` only. The repo tracks
  `.example` files. Never paste secrets into code, docs, chat, or capture logs.
