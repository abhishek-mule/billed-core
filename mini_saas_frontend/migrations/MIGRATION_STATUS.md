# Migration Status

## How migrations work

Each `.sql` file in `migrations/` is a sequential schema change. Files are
named `NNN_description.sql` where `NNN` is a sequential number. Some numbers
have letter suffixes (e.g. `001`, `001b`) — see Duplicate Numbers below.

Migrations are applied manually via the Supabase SQL editor or automated
pipeline. There is no migration runner — each file is applied once.

## Status legend

| Status       | Meaning                                        |
| ------------ | ---------------------------------------------- |
| Applied      | Deployed to production/staging                 |
| Superseded   | Replaced by a later migration — do not apply   |
| Deprecated   | No longer needed — kept for historical record  |
| Pending      | Not yet applied                                |

## Migration list

| File | Status | Notes |
| ---- | ------ | ----- |
| 001_add_compliance_tables.sql | Applied | Initial compliance schema |
| 001_refactor_invoices.sql | Applied | Duplicate number — see below |
| 002_add_outbox_and_logs.sql | Applied | |
| 002_workflow_optimization.sql | Applied | Duplicate number — see below |
| 003_add_wa_status_and_pdf.sql | Applied | |
| 003_push_subscriptions.sql | Applied | Duplicate number — see below |
| 004_add_meta_message_id.sql | Applied | |
| 005_add_payments_schema.sql | Applied | |
| 006_add_reminder_fields.sql | Applied | |
| 007_add_ledger_system.sql | Applied | |
| 008_add_credit_control.sql | Applied | |
| 009_add_risk_scoring.sql | Applied | |
| 010_add_followup_fields.sql | Applied | |
| 011_add_payment_attribution.sql | Applied | |
| 012_add_public_id.sql | Applied | |
| 013_add_platform_fee.sql | Applied | |
| 014_harden_outbox.sql | Applied | |
| 015_evolve_whatsapp_events.sql | Applied | |
| 016_phase1_message_identity.sql | Applied | |
| 017_projection_and_cases.sql | Applied | |
| 018_projection_evolution.sql | Applied | |
| 019_behavioral_memory.sql | Applied | |
| 020_payment_attribution_log.sql | Applied | |
| 021_authority_gateway.sql | Applied | |
| 022_authority_execution_leases.sql | Applied | |
| 023_mutation_gate.sql | Applied | |
| 024_messaging_channels.sql | Applied | |
| 025_cognition_layer.sql | Applied | |
| _(026 missing)_ | — | Gap — sequence intentionally skips 026. Do not create. |
| 027_recovery_case_state.sql | Applied | |
| 028_fix_recovery_case_fk_types.sql | Applied | Creates `recovery_case_events` |
| 028_shadow_recovery_cases.sql | Applied | Duplicate number — see below |
| 029_supabase_missing_tables.sql | Applied | |
| 030_fix_outbox_schema.sql | Applied | |
| 031_add_attributed_amount.sql | Applied | |
| 031_fix_outbox_column_types.sql | Applied | Duplicate number — see below |
| 032_add_automation_toggles.sql | Applied | |
| 033_add_allow_negative_stock.sql | Applied | |
| 034_consolidate_payments.sql | Applied | |
| 035_event_spine.sql | Applied | |
| 036_event_spine_phase2.sql | Applied | |
| 037_event_spine_phase3.sql | Applied | |
| 038_gate_config.sql | Applied | |
| 039_outbox_notify.sql | Applied | |
| 040_decision_engine.sql | Applied | |
| 041_merchant_override.sql | Applied | |
| 042_next_review_at.sql | Applied | |
| 043_unified_payment_ledger.sql | Applied | |
| 044_recovery_audit_log.sql | Applied | |
| 045_get_priority_cases_rpc.sql | Applied | |
| 046_reconcile_whatsapp_events_schema.sql | Applied | |
| 047_feature_trials.sql | Applied | |
| 048_trial_previews.sql | Applied | |
| 049_trial_index.sql | Applied | |
| 050_tenant_memberships.sql | Applied | |
| 051_recovery_queue_events.sql | **Superseded** | Replaced by `recovery_case_events` in 028. Do not apply. |
| 052_tenants_complete_schema.sql | Applied | |
| 053_identity_schema.sql | Pending | Not yet applied |
| 054_fix_priority_cases_rpc_filter.sql | Pending | Relaxes next_action_type filter |
| 055_payment_lifecycle_and_source_id.sql | Applied | |
| 056_anon_sync_policies.sql | Applied | |
| 057_recovery_state_machine.sql | Applied | |
| 058_collection_actions.sql | Applied | Core collection actions table |
| _(059 missing)_ | — | Gap — no file exists. Do not create. |
| _(060 missing)_ | — | Gap — no file exists. Do not create. |
| 061_behavior_profiles.sql | Applied | |
| 062_auth_store.sql | Applied | |
| 063_drop_permissive_sync_policies.sql | Applied | |
| 064_collection_action_delivery_columns.sql | Applied | |
| 065_customer_messaging_projections.sql | Applied | |
| 066_recovery_policies.sql | Applied | Recovery policy + steps tables |
| 067_collection_action_scheduling.sql | Applied | |
| 068_collection_action_events.sql | Applied | Audit log for actions |
| 069_plans_and_tenant_billing.sql | Applied | Versioned plans catalog |
| 070_subscriptions.sql | Applied | |
| 071_billing_events.sql | Applied | |
| 072_tenant_usage_and_feature_flags.sql | Applied | |
| 073_subscription_history.sql | Applied | |
| 074_recovery_policy_call_steps.sql | Applied | |
| 075_merchant_customer_memory.sql | Applied | |
| 076_recovery_invoice_columns.sql | Applied | |
| 077_bring_invoices_to_expected_schema.sql | Applied | |
| 078_merchant_interest.sql | Applied | |
| 079_fix_priority_cases_business_rules.sql | Applied | |
| 080_add_document_type.sql | Applied | |
| 081_recovery_activities.sql | Applied | |
| 082_add_new_recovery_activity_types.sql | Applied | |
| 083_add_call_outcome.sql | Applied | |
| 084_recovery_sessions.sql | Applied | |
| 085_recovery_events_canonical.sql | Applied | |
| 086_business_identity.sql | Applied | |
| 087_fix_collection_actions_fk_types.sql | Applied | |
| 088_auto_recovery_toggle.sql | Applied | Applied to production 2026-08-08; gate verified live (ON/pro→unblocked, OFF→system cancelled, manual bypass). |
| 090_whatsapp_server_authority.sql | Applied | Applied to production 2026-08-25. Server-authoritative `whatsapp_connections` (webhook tenant resolution) + append-only `pilot_events` forensic trace + `whatsapp_events.phone_number_id`. Latest migration |
| 091_recovery_outcomes.sql | Applied | Applied during Phase 1.5 gate: creates `recovery_outcomes`, `payment_promises.triggered_by_action_id`, `whatsapp_events.recovery_attempt_id` FK, `invoices.last_recovery_action_id`. Foundation for behavioral learning. |
| 093_controlled_attribution_backfill.sql | Applied | Applied during Phase 1.5 backfill (D-gate PASS). Read-only audit + controlled exact-identity link backfill. Result: 0 provable links (no `collection_actions` historically stored `billzo_message_id`), so 67 historical outbound events correctly left as `unknown` (NULL link) — nothing fabricated. |
| 094_authority_runtime_schema.sql | Pending | B-01: reconcile authority_* tables to the committed executor/dispatcher/persistence write contract. Adds `authority_intents.nonce`; recreates `authority_execution_leases`, `authority_executions` (summary-row), `authority_queue_dispatch_attempts` to the code's exact schema. Deferred to production (authority tables dormant — local dev DB applied 2026-09-09). |
| 095_notifications.sql | Pending | Action-oriented notification layer: `notifications` (dedupe via `UNIQUE(tenant_id, dedupe_key)` exactly-once), `notification_preferences` (push ON/OFF + per-category gates, back-in-stock OFF by default), `product_alert_cycle` (low-stock transition truth + cycle for re-alert dedupe). Contract in `packages/shared/src/notifications`. Not yet applied. |
| 096_recovery_credit_ledger.sql | Pending | Phase B Recovery Credits, CREATE-ONLY (do not apply until reviewed): immutable `recovery_credit_ledger` (entry_type allocation/purchase/consumption/refund/promotional/expiry, pool included/purchased, `balance_after >= 0` + `pool_balance_after >= 0`, exactly-once partial unique indexes per entry type), `recovery_credit_orders` (server-authoritative amounts), `tenants.recovery_credits_enabled` gate. Legacy unlimited subscribers not converted. **Staging-verified 2026-09-17** (staging gate PASS, all checks green); re-applied + re-verified **2026-09-19** after the staging DB was re-provisioned to production shape. For production use consolidated `098`. |
| 097_recovery_credit_reservations.sql | Pending | Phase B Recovery Credits, reserve-before-send model: `recovery_credit_reservations` (in-flight credit claim, TTL `expires_at`, status active/settled/released, global UNIQUE on `collection_action_id` = immutable exactly-once claim tag + stale-reaper index on (tenant_id, status)). **Staging-verified 2026-09-17** (staging gate PASS, all checks green); re-applied + re-verified **2026-09-19** after the staging DB was re-provisioned to production shape. For production use consolidated `098`. |
| 098_recovery_credits_production.sql | Pending | Consolidated production migration (096 + 097 in one idempotent file, `recovery_credits_enabled` defaults FALSE). Verified against a production-shape DB locally (apply + both verifies PASS; flag default confirmed `false`). Rollout policy: `docs/operations/RECOVERY_CREDITS_ROLLOUT.md`. Do not apply until rollout decision. |
| 099_recovery_escalations.sql | Pending | Phase C Recovery Escalation Pack (spec `docs/product/RECOVERY_ESCALATION_PACK.md`): `recovery_escalations` with TEXT spine ids (no FKs — 028 lesson), status CHECK (assessed/recommended/prepared/notified/settled/cancelled), frozen basis + immutable snapshot via `trg_recovery_escalations_frozen`, partial-unique active-slot on (tenant_id, case_id), triggers sync `recovery_cases.last_activity_at`. Was `098` in the spec; renumbered to `099` because `098` is owned by the credits-production migration. Pending — apply to staging only after 096/097 verified; verify with `verify_099_recovery_escalations.sql` + `staging:escalations` harness. |
| 100_webhook_inbox.sql | Pending | G1 durable webhook inbox: `webhook_inbox` (provider, provider_event_id, status queued/processing/done/failed/dead, attempts, lease-semantics `available_at`, sanitized `payload`/`payload_raw`), `UNIQUE(provider, provider_event_id)` idempotency, claim index `(status, available_at)`, atomic `claim_next_webhook_events(n)` via `FOR UPDATE SKIP LOCKED` (queued+due, or expired-processing leases; 5-minute lease, crash-recoverable). Route now acks 200 only after the event crosses this table and performs NO domain writes. SQL validated on Docker PG15 scratch DB (dedupe, atomic claim, no double-claim, expired-lease reclaim) and `verify_100_webhook_inbox.sql` proves the G2 claim contract (lease gating, expired-lease reclaim, dead/done/failed never auto-retried, attempts consumer-owned, FIFO + p_limit) plus a parallel two-worker probe proved disjoint claims. G2 retry/`dead` routing is worker-owned (`worker/src/lib/webhook/inbox-drain.ts`), no additional DDL. **Staging-verified 2026-09-19** on a re-provisioned production-shape staging DB (full `staging_baseline.sql` + 096/097/100 replay; `verify_096/097/100` all PASS). Step-6 lifecycle harness `worker/scripts/staging-webhook-inbox-verify.ts` (`staging:webhook-inbox`) PASSED every check: real ingest→claim→lease→done, 6×retry with exponential backoff→dead→manual requeue→done, dedupe, parallel claims with zero overlap, tenant resolution `phone_number_id → whatsapp_connections → tenant_id`, unattributed safety (tenant never guessed), staging-only tripwire (no prod host). Gate also surfaced-and-fixed a real latent bug: `whatsapp_events.conversation_id` is NOT NULL (016, no default) but the frozen inbound/echo inserts omitted it, so every customer reply 23502'd silently (row dropped) — fixed in `packages/shared/src/whatsapp/domain.ts` + regression tests (see DECISIONS.md). Production-readiness review then widened the fix to the three remaining live producers (`whatsapp-send-direct.ts`, both `meta/webhook/route.ts` insert blocks) with route-level regression tests, and added a drain activation kill switch (`WEBHOOK_DRAIN_ENABLED`, default OFF). Not yet applied to production. |
| 101_webhook_inbox_alerts.sql | Pending | F4/F7 operator alerting for the webhook inbox: `webhook_inbox_alerts` (kind dead_rows/retry_storm/queue_stalled/stale_processing, severity, status firing/resolved, PII-safe `detail`, fired_at/resolved_at), one-active-per-kind partial unique index `(kind) WHERE resolved_at IS NULL`, resolved-history index. Written ONLY by the worker health watch (`worker/src/lib/webhook/inbox-alerts.ts`, periodic poll gated by `WEBHOOK_ALERTS_ENABLED`, runs INDEPENDENTLY of the drain so rollback stays observable). Alerts are transition records — a healthy queue writes nothing; `detail` is metrics + opaque row ids, never payload/phone/error text. **Staging-verified 2026-09-19** (`verify_101_webhook_inbox_alerts.sql` PASS: schema + lifecycle — insert → duplicate rejected → resolve → re-fire). Not yet applied to production. |
| 102_outbox_claim_columns.sql | Pending | B-05b single-winner outbox claim: `outbox.claimed_at` + `worker_id` ownership columns (claim predicate needs no new index — `idx_outbox_status_next_attempt` covers it) and `uq_processed_jobs_idempotency_key` guaranteeing the UNIQUE behind the send-marker guard. Verify with `verify_102_outbox_claim.sql` on staging. Not yet applied anywhere. |
| verify_schema.sql | — | Helper script, not a migration |

## Duplicate migration numbers

| Number | Files | Why | Action |
| ------ | ----- | --- | ------ |
| 001 | `001_add_compliance_tables.sql`, `001_refactor_invoices.sql` | Divergent branches merged without renumbering | Keep both — they are independent. Apply order: alphabetical. |
| 002 | `002_add_outbox_and_logs.sql`, `002_workflow_optimization.sql` | Same | Keep both. |
| 003 | `003_add_wa_status_and_pdf.sql`, `003_push_subscriptions.sql` | Same | Keep both. |
| 028 | `028_fix_recovery_case_fk_types.sql`, `028_shadow_recovery_cases.sql` | Same | Keep both. Order: alphabetical. |
| 031 | `031_add_attributed_amount.sql`, `031_fix_outbox_column_types.sql` | Same | Keep both. |
| 094 | `094_authority_runtime_schema.sql`, `094_recovery_case_event_idempotency.sql` | Same | Keep both. Apply order: alphabetical. |

**Rule**: Never rename applied migration files. Renaming changes history and
makes it impossible to tell which files were actually run against a database.
Duplicate numbers are ugly but safe — apply in alphabetical order within the
same number.

## Missing numbers

Three sequence gaps exist — all are intentional or result of branch merges:

- **026** — No file. Sequence jumps from 025 → 027. Do not create.
- **059** — No file. Sequence jumps from 058 → 061. Do not create.
- **060** — No file. Same jump. Do not create.

Rule: closing any gap retrospectively is misleading — it implies a migration was
missed rather than that the slot was never used.

## Applying migrations

1. Open Supabase SQL Editor
2. Open the target `.sql` file
3. Run it
4. Verify with `verify_schema.sql`

**Never** apply a file marked **Superseded**.

## Billing Phase 1 (069–073)

| File | Purpose |
|------|---------|
| `069_plans_and_tenant_billing.sql` | Versioned `plans` catalog + seed (Starter/Pro/Business/Enterprise). Widens `tenants.subscription_status` CHECK (was `('free','pro','trial')` — webhook set `'active'`/`'cancelled'`/`'paused'` and would violate it) and adds `subscription_id`, `subscription_state`, `plan_version`, period columns. |
| `070_subscriptions.sql` | Provider-agnostic `subscriptions` (one active per tenant via partial unique index). Source of truth for subscription state; Razorpay is just a processor. |
| `071_billing_events.sql` | Append-only `billing_events` (raw provider log) + `payment_attempts`. |
| `072_tenant_usage_and_feature_flags.sql` | `tenant_usage` (monthly counters, incremented by worker — NOT synchronously) + `feature_flags` (per-tenant overrides). |
| `073_subscription_history.sql` | Audit trail of plan/state transitions. |

**Note**: `tenant.update_subscription` intents are still emitted to the external authority
transport (which owns the `tenants` row). This repo additionally persists billing state
in `subscriptions`/`billing_events`/`tenant_usage`/`subscription_history`/`feature_flags`
via the outbox worker (`src/lib/billzo/billing-worker.ts`, drained by `POST /api/billing/worker`).

## Review-driven refinements (post 9.9/10 review)

- **Soft limits** (`recovery/queue/actions`): reminders warn at 90% (orange) / 95% (red),
  hard-disable only past 110%. `quotaWarning` (`none|warn|critical|exceeded`) returned to UI.
- **Capability API** (`feature-flags.ts`): `can(tenantId, 'AUTO_RECOVERY')` / `getCapabilities()`
  — UI never references plan names. Mapped `api` + `multi_branch` as features.
- **Prices**: Business = ₹699 (monthly) / ₹671.04 (annual) in `069` seed.
- **Idempotency**: `UNIQUE(provider, provider_event_id) WHERE NOT NULL` on `billing_events`
  (071); `recordBillingEvent` swallows duplicate-violation (23505) gracefully.
- **tenant_usage** (072): added `customers`, `storage_mb` columns for future-proofing.

## Sprint 2 — Recovery Workflow Engine (planner + scheduler + promise follow-up)

| File | Purpose |
|------|---------|
| `074_recovery_policy_call_steps.sql` | Adds a `call` step (Phone Call) to seeded Standard/Aggressive/VIP policies. |

**Application layer** (no schema beyond 074):
- `src/lib/recovery/planner.ts` — `planRecoveryForInvoice` / `planPromiseFollowup` / `backfillUnplanned`. Runs ONCE per business event (invoice created, promise made, policy changed). Reads tenant default policy → generates `collection_actions`. Idempotent.
- `src/lib/recovery/scheduler.ts` — `runRecoveryScheduler` (cron, every 5 min): finds due `collection_actions`, validates invoice still unpaid, emits `RECOVERY_REMINDER_SENT` / `SEND_MESSAGE_INTENDED` domain events to outbox, marks `in_progress`, writes `collection_action_events` audit. `drainRecoveryOutbox` hands events to transport workers. DUMB by design — no policy logic, no transport.
- `src/app/api/recovery/plan/route.ts` — manual planner trigger (invoice_created / promise_made).
- `src/app/api/cron/recovery/route.ts` — scheduler cron (CRON_SECRET protected): dispatch + drain + backfill.
- `src/app/api/recovery/policies/route.ts` (+ `[id]`, `[id]/clone`, `[id]/set-default`) — full REST CRUD for versioned recovery workflows.

Note: `recovery_policies` / `recovery_policy_steps` / `collection_actions` / `collection_action_events` were already established (migrations 058–068). Sprint 2 adds the missing *logic* layer on top.

### Sprint 2 — Automation loop closed (final wiring)
- `invoice.created` → `src/lib/billzo/actions.ts` createInvoice now calls `planInvoiceOnCreated()` (client helper → `POST /api/recovery/plan`). No backfill dependency.
- `promise.made` → `recovery/queue/actions` `mark_promise` now calls `planPromiseFollowup()` automatically.
- `payment.completed` → `recordPayment`/`syncPayment` (the single payment funnel, used by verify + webhook reconciliation + recovery record-payment) now call `cancelFutureActions()` to cancel scheduled reminders for the paid invoice.
- Backfill removed from the production cron path; now an admin/repair endpoint `POST /api/admin/recovery/backfill` (CRON_SECRET protected).
- `cancelFutureActions()` added to `src/lib/recovery/planner.ts`.
- Recommended (Sprint 3 pre-work): a developer "Recovery Diagnostics" page reading collection_actions + events + timeline.
