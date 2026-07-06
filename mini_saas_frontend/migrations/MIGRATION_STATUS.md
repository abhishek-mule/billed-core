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
| 027_recovery_case_state.sql | Applied | Gap at 026 — no file exists |
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
| 054_fix_priority_cases_rpc_filter.sql | Pending | Relaxes next_action_type filter to include review_payment and merchant_review |
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

- **026** — No file exists. The sequence jumps from 025 to 027. Do not
  create one — closing the gap would imply a migration was missed.

## Applying migrations

1. Open Supabase SQL Editor
2. Open the target `.sql` file
3. Run it
4. Verify with `verify_schema.sql`

**Never** apply a file marked **Superseded**.
