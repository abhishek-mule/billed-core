import type { MutationRequest, HandlerResult, Handler } from './types'

const logger = {
  info: (ctx: Record<string, any>, msg: string) => console.log(`[mutation-gate] ${msg}`, ctx),
  warn: (ctx: Record<string, any>, msg: string) => console.warn(`[mutation-gate] ${msg}`, ctx),
  error: (ctx: Record<string, any>, msg: string) => console.error(`[mutation-gate] ${msg}`, ctx),
}
import postgres from 'postgres'
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

export type GateDomain =
  | 'payment'
  | 'recovery'
  | 'transport'
  | 'behavioral'
  | 'tenant'
  | 'invoice'

interface ProcessedKeyEntry {
  idempotency_key: string
  intent_type: string
  tenant_id: string
  created_at: string
}

const INTENT_TO_DOMAIN: Record<string, GateDomain> = {
  'invoice.mark_paid.v1': 'payment',
  'reconciliation.log_attribution.v1': 'payment',
  'reminder.advance_stage.v1': 'recovery',
  'reminder.update_cadence.v1': 'recovery',
  'invoice.update_recovery_state.v1': 'recovery',
  'recovery.record_attribution.v1': 'recovery',
  'recovery.upsert_case.v1': 'recovery',
  'tenant.update_subscription.v1': 'tenant',
  'tenant.update_whatsapp_config.v1': 'tenant',
  'tenant.update_operational_health.v1': 'tenant',
  'gstr.save_export.v1': 'invoice',
}

function intentToDomain(intentType: string): GateDomain | null {
  return INTENT_TO_DOMAIN[intentType] ?? null
}

export class MutationGate {
  private readonly handlers = new Map<string, Handler>()
  private readonly sql: any
  private readonly databaseUrl: string | undefined
  private sqlClient: any | null = null
  private domainCache: Map<GateDomain, { mode: 'shadow' | 'warn' | 'block'; fetchedAt: number }> | null = null
  private static readonly CACHE_TTL_MS = 60_000

  constructor(private config: { mode: GateMode; sql?: any; databaseUrl?: string }) {
    this.sql = config.sql
    this.databaseUrl = config.databaseUrl
    this.registerHandlers()
  }

  private async getSql(): Promise<any> {
    if (this.sql) return this.sql
    if (this.databaseUrl && !this.sqlClient) {
      try {
        this.sqlClient = postgres(this.databaseUrl, { max: 1, connection: { application_name: 'mutation-gate' } })
      } catch {
        return null
      }
    }
    return this.sqlClient
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

  async refreshConfig(): Promise<void> {
    const db = await this.getSql()
    if (!db) return
    try {
      const rows: Array<{ domain: string; mode: string }> = await db`
        SELECT domain, mode FROM gate_config
      `
      this.domainCache = new Map()
      const now = Date.now()
      for (const row of rows) {
        const mode = row.mode as 'shadow' | 'warn' | 'block'
        if (mode === 'shadow' || mode === 'warn' || mode === 'block') {
          this.domainCache.set(row.domain as GateDomain, { mode, fetchedAt: now })
        }
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Failed to refresh gate config — using cached or defaults')
    }
  }

  async getDomainMode(domain: GateDomain): Promise<'shadow' | 'warn' | 'block'> {
    if (!this.domainCache) {
      await this.refreshConfig()
    }
    const cached = this.domainCache?.get(domain)
    if (cached && Date.now() - cached.fetchedAt < MutationGate.CACHE_TTL_MS) {
      return cached.mode
    }
    if (this.domainCache) {
      const db = await this.getSql()
      if (db) {
        await this.refreshConfig()
        const refreshed = this.domainCache?.get(domain)
        if (refreshed) return refreshed.mode
      }
    }
    return 'shadow'
  }

  async shouldBlock(intentType: string): Promise<{ block: boolean; domain: GateDomain | null; mode: string }> {
    const domain = intentToDomain(intentType)
    if (!domain) return { block: false, domain: null, mode: 'unknown' }
    const mode = await this.getDomainMode(domain)
    return { block: mode === 'block', domain, mode }
  }

  async reportViolation(domain: GateDomain, intentType: string, payload: Record<string, unknown>): Promise<void> {
    const mode = await this.getDomainMode(domain)
    if (mode === 'warn' || mode === 'block') {
      logger.warn(
        { domain, intentType, mode, payloadKeys: Object.keys(payload) },
        `Gate violation — domain ${domain} is in ${mode} mode`,
      )
    }
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

    const { block, domain } = await this.shouldBlock(request.intentType)
    if (block && domain) {
      await this.reportViolation(domain, request.intentType, request.payload)
      return {
        accepted: false,
        outcome: 'rejected',
        error: `Gate blocked mutation for domain '${domain}' — intentType: ${request.intentType}`,
      }
    }

    if (domain) {
      const mode = await this.getDomainMode(domain)
      if (mode === 'warn') {
        await this.reportViolation(domain, request.intentType, request.payload)
      }
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
    const db = await this.getSql()
    if (!db) return false
    try {
      const rows = await db`
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
    const db = await this.getSql()
    if (!db) return
    try {
      await db`
        INSERT INTO mutation_processed_keys (idempotency_key, intent_type, tenant_id, entity_type, entity_id, created_at)
        VALUES (${request.idempotencyKey}, ${request.intentType}, ${request.tenantId}, ${request.entityType ?? null}, ${request.entityId ?? null}, ${new Date().toISOString()})
        ON CONFLICT (idempotency_key) DO NOTHING
      `
    } catch (err: any) {
      logger.error({ err: err.message }, 'Failed to record processed key')
    }
  }

  private async logMutation(request: MutationRequest, result: HandlerResult): Promise<void> {
    const db = await this.getSql()
    if (!db) return
    try {
      await db`
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
          ${db.json(result.touchedRows)},
          ${db.json(result.transitionTraces)},
          ${this.config.mode},
          ${new Date().toISOString()}
        )
      `
    } catch (err: any) {
      logger.error({ err: err.message }, 'Failed to log mutation')
    }
  }
}
