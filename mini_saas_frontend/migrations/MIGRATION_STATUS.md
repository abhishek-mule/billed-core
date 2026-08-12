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
| 088_auto_recovery_toggle.sql | Applied | Applied to production 2026-08-08; gate verified live (ON/pro→unblocked, OFF→system cancelled, manual bypass). Latest migration |
| verify_schema.sql | — | Helper script, not a migration |

## Duplicate migration numbers

| Number | Files | Why | Action |
| ------ | ----- | --- | ------ |
| 001 | `001_add_compliance_tables.sql`, `001_refactor_invoices.sql` | Divergent branches merged without renumbering | Keep both — they are independent. Apply order: alphabetical. |
| 002 | `002_add_outbox_and_logs.sql`, `002_workflow_optimization.sql` | Same | Keep both. |
| 003 | `003_add_wa_status_and_pdf.sql`, `003_push_subscriptions.sql` | Same | Keep both. |
| 028 | `028_fix_recovery_case_fk_types.sql`, `028_shadow_recovery_cases.sql` | Same | Keep both. Order: alphabetical. |
| 031 | `031_add_attributed_amount.sql`, `031_fix_outbox_column_types.sql` | Same | Keep both. |

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
