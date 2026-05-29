import type { MutationRequest, HandlerResult, Handler } from './types'

const logger = {
  info: (ctx: Record<string, any>, msg: string) => console.log(`[mutation-gate] ${msg}`, ctx),
  warn: (ctx: Record<string, any>, msg: string) => console.warn(`[mutation-gate] ${msg}`, ctx),
  error: (ctx: Record<string, any>, msg: string) => console.error(`[mutation-gate] ${msg}`, ctx),
}
import {
  invoiceMarkPaid,
  reminderAdvanceStage,
  reminderUpdateCadence,
  invoiceUpdateRecoveryState,
} from './handlers/invoice'
import {
  tenantUpdateSubscription,
  tenantUpdateWhatsappConfig,
  tenantUpdateOperationalHealth,
} from './handlers/tenant'
import {
  recoveryRecordAttribution,
  recoveryUpsertCase,
} from './handlers/recovery'
import { reconciliationLogAttribution } from './handlers/reconciliation'
import { gstrSaveExport } from './handlers/gstr'

export type GateMode = 'shadow' | 'dual_write' | 'active'

interface ProcessedKeyEntry {
  idempotency_key: string
  intent_type: string
  tenant_id: string
  created_at: string
}

export class MutationGate {
  private readonly handlers = new Map<string, Handler>()
  private readonly sql: any

  constructor(private config: { mode: GateMode; sql?: any }) {
    this.sql = config.sql
    this.registerHandlers()
  }

  private registerHandlers(): void {
    this.handlers.set('invoice.mark_paid.v1', invoiceMarkPaid)
    this.handlers.set('reminder.advance_stage.v1', reminderAdvanceStage)
    this.handlers.set('reminder.update_cadence.v1', reminderUpdateCadence)
    this.handlers.set('invoice.update_recovery_state.v1', invoiceUpdateRecoveryState)
    this.handlers.set('tenant.update_subscription.v1', tenantUpdateSubscription)
    this.handlers.set('tenant.update_whatsapp_config.v1', tenantUpdateWhatsappConfig)
    this.handlers.set('tenant.update_operational_health.v1', tenantUpdateOperationalHealth)
    this.handlers.set('recovery.record_attribution.v1', recoveryRecordAttribution)
    this.handlers.set('recovery.upsert_case.v1', recoveryUpsertCase)
    this.handlers.set('reconciliation.log_attribution.v1', reconciliationLogAttribution)
    this.handlers.set('gstr.save_export.v1', gstrSaveExport)
  }

  get mode(): GateMode {
    return this.config.mode
  }

  async submit(request: MutationRequest): Promise<{
    accepted: boolean
    outcome: 'accepted' | 'rejected' | 'duplicate' | 'stale' | 'contention'
    result?: HandlerResult
    error?: string
  }> {
    if (!request.idempotencyKey) {
      return { accepted: false, outcome: 'rejected', error: 'idempotencyKey is required' }
    }
    if (!request.intentType) {
      return { accepted: false, outcome: 'rejected', error: 'intentType is required' }
    }
    if (!request.tenantId) {
      return { accepted: false, outcome: 'rejected', error: 'tenantId is required' }
    }

    const handler = this.handlers.get(request.intentType)
    if (!handler) {
      return { accepted: false, outcome: 'rejected', error: `No handler registered for intentType: ${request.intentType}` }
    }

    if (this.config.mode === 'active' || this.config.mode === 'dual_write') {
      const isDuplicate = await this.checkIdempotency(request)
      if (isDuplicate) {
        logger.warn({ idempotencyKey: request.idempotencyKey, intentType: request.intentType }, 'Duplicate request rejected')
        return { accepted: false, outcome: 'duplicate', error: 'idempotencyKey already processed' }
      }
    }

    try {
      const result = await handler.execute(request.payload, request.tenantId)

      if (this.config.mode === 'active' || this.config.mode === 'dual_write') {
        await this.recordProcessedKey(request)
        await this.logMutation(request, result)
      }

      if (result.outcome === 'failure') {
        return { accepted: false, outcome: 'rejected', result, error: result.error }
      }

      return { accepted: true, outcome: 'accepted', result }
    } catch (err: any) {
      logger.error({ err: err.message, intentType: request.intentType }, 'Handler execution error')
      return { accepted: false, outcome: 'contention', error: err.message }
    }
  }

  private async checkIdempotency(request: MutationRequest): Promise<boolean> {
    if (!this.sql) return false
    try {
      const rows = await this.sql`
        SELECT idempotency_key FROM mutation_processed_keys
        WHERE idempotency_key = ${request.idempotencyKey}
          AND tenant_id = ${request.tenantId}
        LIMIT 1
      `
      return rows.length > 0
    } catch {
      return false
    }
  }

  private async recordProcessedKey(request: MutationRequest): Promise<void> {
    if (!this.sql) return
    try {
      await this.sql`
        INSERT INTO mutation_processed_keys (idempotency_key, intent_type, tenant_id, entity_type, entity_id, created_at)
        VALUES (${request.idempotencyKey}, ${request.intentType}, ${request.tenantId}, ${request.entityType ?? null}, ${request.entityId ?? null}, ${new Date().toISOString()})
        ON CONFLICT (idempotency_key) DO NOTHING
      `
    } catch (err: any) {
      logger.error({ err: err.message }, 'Failed to record processed key')
    }
  }

  private async logMutation(request: MutationRequest, result: HandlerResult): Promise<void> {
    if (!this.sql) return
    try {
      await this.sql`
        INSERT INTO mutation_log (
          idempotency_key, intent_type, tenant_id, entity_type, entity_id, client_version,
          outcome, error, touched_rows, transition_traces, mode, created_at
        ) VALUES (
          ${request.idempotencyKey},
          ${request.intentType},
          ${request.tenantId},
          ${request.entityType ?? null},
          ${request.entityId ?? null},
          ${request.clientVersion ?? null},
          ${result.outcome},
          ${result.error ?? null},
          ${this.sql.json(result.touchedRows)},
          ${this.sql.json(result.transitionTraces)},
          ${this.config.mode},
          ${new Date().toISOString()}
        )
      `
    } catch (err: any) {
      logger.error({ err: err.message }, 'Failed to log mutation')
    }
  }
}
