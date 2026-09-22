# Recovery Credits — Production Rollout Policy

> **Status:** Draft for review. No production changes have been executed.
>
> **Scope:** How `tenants.recovery_credits_enabled` (the Recovery Credits gate) is
> introduced to production and how credits are enabled per tenant over time,
> including the exactly-once invariants that make the rollout mechanically safe.
>
> **Related:** `migrations/096` + `097` (staging-verified building blocks),
> `migrations/098_recovery_credits_production.sql` (consolidated production
> migration), `migrations/verify_096`, `migrations/verify_097`,
> `docs/product/RECOVERY_ESCALATION_PACK.md` (Rev 2 spec).

---

## 1. Decision record

- **Flag defaults to `FALSE`.** Every consumer reads `recovery_credits_enabled`
  and fails closed: `FALSE` ⇒ legacy unlimited behaviour (actions dispatch
  without any credit accounting, nothing is deferred, nothing is billed).
- **No existing tenant is converted by the schema migration.** Legacy unlimited
  Business/Enterprise subscribers keep their current behaviour until an
  *explicit rollout action* converts them. The migration is safe to apply ahead
  of any conversion.
- **Bundled Pro+ pricing is deferred.** The Escalation Pack stays spec-only
  until real usage data exists; the credits migration does not ship any pricing
  change and does not gate any plan by credits.

## 2. Migration order (production)

Apply **exactly one** production migration artifact, in order:

1. `098_recovery_credits_production.sql` — idempotent consolidation of 096 + 097:
   creates `recovery_credit_ledger`, `recovery_credit_orders`,
   `recovery_credit_reservations`, adds `tenants.recovery_credits_enabled`
   (`BOOLEAN NOT NULL DEFAULT FALSE`), and updates `collection_actions` status
   documentation comments.
2. `verify_096_recovery_credit_ledger.sql` — schema shape + mechanical invariant
   probes (8 adversarial writes must be rejected).
3. `verify_097_recovery_credit_reservations.sql` — schema shape + exactly-once
   claim-tag probes (5 adversarial writes must be rejected).

Both verifies must report `096 VERIFIED` / `097 VERIFIED`. Any probe accepted
rejects the rollout — stop immediately.

**Staging note:** staging applies 096 and 097 *separately* on top of the
bootstrap (they are the reviewable building blocks). Production uses the single
098 file for a one-shot, atomic apply. Do not apply 096/097 *and* 098 to the
same database — 098 is the consolidation.

## 3. Enabling tenants (flag rollout phases)

The flag is a **binary kill switch per tenant**, and it is the *only* thing that
changes behaviour for existing tenants. Phases:

| Phase | Action | Effect | Exit criteria |
| ----- | ------ | ------ | ------------- |
| 0. Apply | Run 098 + both verifies | Tables exist; flag `FALSE` everywhere | Verifies pass |
| 1. Observe | No further action (≥1 full billing cycle) | Nothing changes: zero ledger rows, zero deferrals | Monitor: no `deferred_due_to_credits` anywhere (should be impossible — consumers gated) |
| 2. Canary | `UPDATE tenants SET recovery_credits_enabled = TRUE WHERE id IN (…1–3 trusted tenants…)` | Canary tenants enter the credits model from their next active subscription period | Balances reconcile; no phantom deferrals; subscription period source is `subscriptions` (never `tenants`) |
| 3. Ramp | Flip by cohort (by plan/segment, not all at once) | Credits accounting active for those cohorts | Per-cohort balances reconcile at period boundary; exactly-once holds under concurrency |
| 4. Full | Remaining tenants | Credits model is the default behaviour | — |

**Rollback at any phase:** `UPDATE tenants SET recovery_credits_enabled = FALSE`.
Because every credit path is gated on the flag and every mutation is audited to
the immutable ledger, disabling the flag stops all debits immediately. Past
ledger entries remain (audit by design) but no new consumption/deferral occurs.

## 4. Operational invariants (why this is safe)

- **Exactly-once is DB-enforced**, not conventional: partial unique indexes on
  `collection_action_id` (consumption), `order_id` (purchase/refund), and
  `(tenant_id, subscription_id, period_start)` (allocation/expiry) mean
  concurrent dispatches converge on one correct result.
- **Balances can never go negative**: `balance_after >= 0` and
  `pool_balance_after >= 0` CHECK constraints on every ledger row.
- **Expiry/refund can never touch the wrong pool**: pool-direction CHECKs
  (`rc_ledger_expiry_pool`, `rc_ledger_allocation_pool`, `rc_ledger_purchase_pool`,
  `rc_ledger_refund_pool`, `rc_ledger_sign`) make the invariant *mechanical*.
- **Defer never cuts into `collection_actions.amount`**: deferral writes
  `metadata.deferred_reason` only; `amount` is untouched by the credits code.
- **Subscriptions are the only period source.** Credits allocation reads
  `subscriptions.current_period_start/end`; `tenants` period columns are never a
  source of truth (069/070 design). The staging harness specifically asserts this
  (S1) and idempotent reconciliation (S1c) and precise snapshots (S1f).

## 5. Monitoring & alerting

- **Deferral surfaced:** `metadata.deferred_reason = 'deferred_due_to_credits'`
  on `collection_actions` should only appear for flag-enabled tenants. Alert on
  any deferred action whose tenant has `recovery_credits_enabled = FALSE`.
- **Negative-balance attempt:** impossible by CHECK, but alert on any `P0001`
  check-violation logs from the ledger consumer (they indicate a code path
  simulating a debit the schema forbids).
- **Balance drift:** nightly reconcile job recomputes balances by replay and
  compares to the last `balance_after`; alert on divergence.
- **Purchase mismatch:** `recovery_credit_orders.amount_paise` is computed
  server-side from the packet catalog; alert if a paid order's credits granted ≠
  packet credits (ledger unique index makes double-grant impossible).

## 6. Pricing decision (deferred)

Bundled Pro+ pricing for the Escalation Pack remains **spec-only** until real
usage data exists. The credits ledger — with its auditable per-action
consumption — is the measurement substrate that will inform that decision.
No pricing change ships with the migration.

## 7. Explicit non-goals for this rollout

- No auto-conversion of unlimited legacy subscribers.
- No plan gating to credits (no plan is billed *by* credits yet).
- No changes to `collection_actions.amount` semantics.
- No changes to the pricing tables (`plans`, `subscriptions.plan_code` values).

---

*Last updated: 2026-09-17. Status: DRAFT — production untouched.*