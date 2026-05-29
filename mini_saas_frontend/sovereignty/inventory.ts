import type { MutationInventoryEntry } from '@billzo/shared'

export const FRONTEND_MUTATION_INVENTORY: MutationInventoryEntry[] = [
  // ── Governed: submitIntent through transport ──
  { table: 'tenants', mutationPath: 'src/app/api/payment/verify/route.ts', lineNumber: 48, operation: 'update', governance: 'governed', intentType: 'invoice.mark_paid', justificationCode: 'ephemeral_operational_state', reversibility: 'irreversible', criticality: 'financial', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'tenants', mutationPath: 'src/app/api/payment/webhook/route.ts', lineNumber: 87, operation: 'update', governance: 'governed', intentType: 'tenant.update_subscription', justificationCode: 'ephemeral_operational_state', reversibility: 'reversible', criticality: 'financial', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'tenants', mutationPath: 'src/app/api/payment/webhook/route.ts', lineNumber: 112, operation: 'insert', governance: 'governed', intentType: 'tenant.create', justificationCode: 'bootstrap_import', reversibility: 'irreversible', criticality: 'financial', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'tenants', mutationPath: 'src/app/api/payment/webhook/route.ts', lineNumber: 125, operation: 'update', governance: 'governed', intentType: 'tenant.update_subscription', justificationCode: 'ephemeral_operational_state', reversibility: 'reversible', criticality: 'financial', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'tenants', mutationPath: 'src/app/api/payment/webhook/route.ts', lineNumber: 156, operation: 'update', governance: 'governed', intentType: 'tenant.update_subscription', justificationCode: 'ephemeral_operational_state', reversibility: 'reversible', criticality: 'financial', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'tenants', mutationPath: 'src/app/api/payment/webhook/route.ts', lineNumber: 195, operation: 'update', governance: 'governed', intentType: 'tenant.update_subscription', justificationCode: 'ephemeral_operational_state', reversibility: 'reversible', criticality: 'financial', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'tenants', mutationPath: 'src/app/api/payment/webhook/route.ts', lineNumber: 209, operation: 'update', governance: 'governed', intentType: 'tenant.update_subscription', justificationCode: 'ephemeral_operational_state', reversibility: 'reversible', criticality: 'financial', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'tenants', mutationPath: 'src/app/api/payment/webhook/route.ts', lineNumber: 225, operation: 'update', governance: 'governed', intentType: 'tenant.update_subscription', justificationCode: 'ephemeral_operational_state', reversibility: 'reversible', criticality: 'financial', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'invoices', mutationPath: 'src/lib/billzo/reconciliation.ts', lineNumber: 173, operation: 'update', governance: 'governed', intentType: 'invoice.mark_paid', justificationCode: 'ephemeral_operational_state', reversibility: 'irreversible', criticality: 'financial', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'recovery_attributions', mutationPath: 'src/lib/billzo/attribution.ts', lineNumber: 74, operation: 'insert', governance: 'governed', intentType: 'recovery.record_attribution', justificationCode: 'ephemeral_operational_state', reversibility: 'append_only', criticality: 'financial', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'gstr_exports', mutationPath: 'src/lib/billzo/gstr1.ts', lineNumber: 271, operation: 'upsert', governance: 'governed', intentType: 'gstr.save_export', justificationCode: 'ephemeral_operational_state', reversibility: 'reversible', criticality: 'regulatory', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'tenants', mutationPath: 'src/app/api/tenant/whatsapp-config/route.ts', lineNumber: 88, operation: 'update', governance: 'governed', intentType: 'tenant.update_whatsapp_config', justificationCode: 'ephemeral_operational_state', reversibility: 'reversible', criticality: 'operational', scope: 'tenant_local', sourceOfTruth: 'authority' },

  // ── Exempt: event outbox infrastructure ──
  { table: 'outbox', mutationPath: 'src/lib/billzo/outbox.ts', lineNumber: 51, operation: 'insert', governance: 'exempt', justificationCode: 'ephemeral_operational_state', reversibility: 'append_only', criticality: 'operational', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'outbox', mutationPath: 'src/lib/billzo/outbox.ts', lineNumber: 102, operation: 'update', governance: 'exempt', justificationCode: 'ephemeral_operational_state', reversibility: 'reversible', criticality: 'operational', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'outbox', mutationPath: 'src/lib/billzo/outbox.ts', lineNumber: 122, operation: 'update', governance: 'exempt', justificationCode: 'ephemeral_operational_state', reversibility: 'reversible', criticality: 'operational', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'outbox', mutationPath: 'src/lib/billzo/outbox.ts', lineNumber: 148, operation: 'update', governance: 'exempt', justificationCode: 'ephemeral_operational_state', reversibility: 'reversible', criticality: 'operational', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'outbox', mutationPath: 'src/lib/billzo/outbox.ts', lineNumber: 220, operation: 'delete', governance: 'exempt', justificationCode: 'ephemeral_operational_state', reversibility: 'reversible', criticality: 'operational', scope: 'tenant_local', sourceOfTruth: 'authority' },

  // ── Exempt: device tokens ──
  { table: 'device_tokens', mutationPath: 'src/lib/billzo/supabase-admin.ts', lineNumber: 14, operation: 'upsert', governance: 'exempt', justificationCode: 'notification_routing', reversibility: 'reversible', criticality: 'transport', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: 'device_tokens', mutationPath: 'src/lib/billzo/supabase-admin.ts', lineNumber: 46, operation: 'delete', governance: 'exempt', justificationCode: 'notification_routing', reversibility: 'reversible', criticality: 'transport', scope: 'tenant_local', sourceOfTruth: 'authority' },

  // ── Exempt: idempotency ──
  { table: 'processed_jobs', mutationPath: 'src/lib/billzo/idempotency.ts', lineNumber: 76, operation: 'upsert', governance: 'exempt', justificationCode: 'idempotency_guard', reversibility: 'append_only', criticality: 'operational', scope: 'tenant_local', sourceOfTruth: 'authority' },

  // ── Exempt: generic supabase helpers ──
  { table: '*dynamic*', mutationPath: 'src/lib/billzo/supabase.ts', lineNumber: 46, operation: 'insert', governance: 'exempt', justificationCode: 'ephemeral_operational_state', reversibility: 'reversible', criticality: 'operational', scope: 'tenant_local', sourceOfTruth: 'authority' },
  { table: '*dynamic*', mutationPath: 'src/lib/billzo/supabase.ts', lineNumber: 52, operation: 'upsert', governance: 'exempt', justificationCode: 'ephemeral_operational_state', reversibility: 'reversible', criticality: 'operational', scope: 'tenant_local', sourceOfTruth: 'authority' },

  // ── Deferred-authoritative: Dexie sync pipeline ──
  { table: '*multiple*', mutationPath: 'src/lib/billzo/sync.ts', lineNumber: 169, operation: 'upsert', governance: 'deferred-authoritative', justificationCode: 'offline_sync_debt', reversibility: 'reversible', criticality: 'financial', scope: 'cross_tenant', sourceOfTruth: 'client_sync' },

  // ── Exempt: transport log (whatsapp event stream) ──
  { table: 'whatsapp_events', mutationPath: 'src/app/api/whatsapp/webhook/route.ts', lineNumber: 45, operation: 'insert', governance: 'exempt', justificationCode: 'event_transport', reversibility: 'append_only', criticality: 'transport', scope: 'tenant_local', sourceOfTruth: 'transport' },
  { table: 'whatsapp_events', mutationPath: 'src/app/api/whatsapp/webhook/route.ts', lineNumber: 83, operation: 'insert', governance: 'exempt', justificationCode: 'event_transport', reversibility: 'append_only', criticality: 'transport', scope: 'tenant_local', sourceOfTruth: 'transport' },
  { table: 'whatsapp_events', mutationPath: 'src/app/api/pay/r/[token]/route.ts', lineNumber: 38, operation: 'insert', governance: 'exempt', justificationCode: 'event_transport', reversibility: 'append_only', criticality: 'transport', scope: 'tenant_local', sourceOfTruth: 'transport' },
]
