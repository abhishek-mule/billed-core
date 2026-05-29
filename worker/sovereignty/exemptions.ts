import type {
  MutationInventoryEntry,
  CriticalityOverride,
} from '@billzo/shared'

export const EXEMPT_ENTRIES: MutationInventoryEntry[] = [
  // ── Worker outbox infrastructure ──
  { table: 'outbox', mutationPath: 'src/lib/billzo/outbox.ts', lineNumber: 50, operation: 'insert', governance: 'exempt', justificationCode: 'ephemeral_operational_state', reversibility: 'append_only', criticality: 'operational', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'outbox', mutationPath: 'src/lib/billzo/outbox.ts', lineNumber: 100, operation: 'update', governance: 'exempt', justificationCode: 'ephemeral_operational_state', reversibility: 'reversible', criticality: 'operational', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'outbox', mutationPath: 'src/lib/billzo/outbox.ts', lineNumber: 120, operation: 'update', governance: 'exempt', justificationCode: 'ephemeral_operational_state', reversibility: 'reversible', criticality: 'operational', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'outbox', mutationPath: 'src/lib/billzo/outbox.ts', lineNumber: 158, operation: 'update', governance: 'exempt', justificationCode: 'ephemeral_operational_state', reversibility: 'reversible', criticality: 'operational', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'outbox', mutationPath: 'src/lib/billzo/outbox.ts', lineNumber: 230, operation: 'delete', governance: 'exempt', justificationCode: 'ephemeral_operational_state', reversibility: 'reversible', criticality: 'operational', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'processed_jobs', mutationPath: 'src/lib/billzo/idempotency.ts', lineNumber: 76, operation: 'upsert', governance: 'exempt', justificationCode: 'idempotency_guard', reversibility: 'append_only', criticality: 'operational', scope: 'tenant_local', sourceOfTruth: 'authority' },

  // ── Device tokens (notification routing, UX metadata) ──
  { table: 'device_tokens', mutationPath: 'src/lib/billzo/supabase-admin.ts', lineNumber: 14, operation: 'upsert', governance: 'exempt', justificationCode: 'notification_routing', reversibility: 'reversible', criticality: 'transport', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'device_tokens', mutationPath: 'src/lib/billzo/supabase-admin.ts', lineNumber: 44, operation: 'delete', governance: 'exempt', justificationCode: 'notification_routing', reversibility: 'reversible', criticality: 'transport', scope: 'tenant_local', sourceOfTruth: 'authority' },

  // ── Behavioral analytics (materialized from observations) ──
  // customer_behavioral_metrics + customer_liquidity_windows — 12 insert/update sites
  // File-level opt-out already present; formalized here for inventory completeness.

  // ── Transport: whatsapp event append-only log ──
  // send-message-handler.ts line 86 — whatsapp_events insert
  // File-level opt-out already present; formalized here.

  // ── Transport: outbox projection pipeline ──
  { table: 'whatsapp_events', mutationPath: 'queues/outbox.ts', lineNumber: 465, operation: 'insert', governance: 'exempt', justificationCode: 'event_transport', reversibility: 'append_only', criticality: 'transport', scope: 'tenant_local', sourceOfTruth: 'projection' },
  { table: 'whatsapp_message_projection', mutationPath: 'queues/outbox.ts', lineNumber: 562, operation: 'rpc', governance: 'exempt', justificationCode: 'derived_state', reversibility: 'reversible', criticality: 'transport', scope: 'tenant_local', sourceOfTruth: 'projection' },
  { table: 'projection_delta_log', mutationPath: 'queues/outbox.ts', lineNumber: 605, operation: 'insert', governance: 'exempt', justificationCode: 'derived_state', reversibility: 'append_only', criticality: 'transport', scope: 'tenant_local', sourceOfTruth: 'projection' },
]

export const DEFERRED_ENTRIES: MutationInventoryEntry[] = []

export const CRITICALITY_OVERRIDES: CriticalityOverride[] = [
  {
    capabilityId: 'tenant.update_subscription.v1',
    overrideCriticality: 'financial',
    overrideScope: 'tenant_local',
    justificationCode: 'ephemeral_operational_state',
  },
  {
    capabilityId: 'tenant.update_whatsapp_config.v1',
    overrideCriticality: 'operational',
    overrideScope: 'tenant_local',
    justificationCode: 'ephemeral_operational_state',
  },
  {
    capabilityId: 'reminder.advance_stage.v1',
    overrideCriticality: 'operational',
    overrideScope: 'tenant_local',
    justificationCode: 'ephemeral_operational_state',
  },
  {
    capabilityId: 'reminder.update_cadence.v1',
    overrideCriticality: 'operational',
    overrideScope: 'tenant_local',
    justificationCode: 'ephemeral_operational_state',
  },
  {
    capabilityId: 'recovery.record_attribution.v1',
    overrideCriticality: 'financial',
    overrideScope: 'tenant_local',
    justificationCode: 'ephemeral_operational_state',
  },
  {
    capabilityId: 'reconciliation.log_attribution.v1',
    overrideCriticality: 'operational',
    overrideScope: 'tenant_local',
    justificationCode: 'ephemeral_operational_state',
  },
]
