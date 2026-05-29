import crypto from 'crypto'
import { evaluate, type AuthorityCoreConfig } from './core'
import { executePlan } from './executor'
import type { AuthorityPersistence } from './persistence'
import type { CapabilityRegistry } from './capabilities'
import type { IntentEnvelope, IntentSource, AuthorityResult } from './schemas'

export interface InternalIntent {
  readonly intentType: string
  readonly intentVersion?: number
  readonly tenantId: string
  readonly actor: string
  readonly payload: Record<string, unknown>
}

export type SubmitMode = 'durable_async' | 'trusted_sync'

export class InternalAuthorityClient {
  private _config: AuthorityCoreConfig | null
  private _persistence: AuthorityPersistence | null
  private _registry: CapabilityRegistry | null

  constructor(config: AuthorityCoreConfig) {
    this._config = config
    this._persistence = null
    this._registry = null
  }

  reconfigure(config: AuthorityCoreConfig, persistence: AuthorityPersistence | null, registry?: CapabilityRegistry): void {
    this._config = config
    this._persistence = persistence
    if (registry) this._registry = registry
  }

  async submit(
    intent: InternalIntent,
    mode: SubmitMode = 'durable_async',
  ): Promise<AuthorityResult> {
    if (!this._config) throw new Error('InternalAuthorityClient not configured')

    const envelope = this.buildEnvelope(intent)

    // 1. EVALUATE
    const result = await evaluate(envelope, this._config)

    // 2. PERSIST
    if (this._persistence && result.accepted && result.decision && result.plan) {
      await this._persistence.persistAccepted(envelope, result.decision, result.plan)
    } else if (this._persistence && !result.accepted && result.decision) {
      await this._persistence.persistRejected(envelope, result.decision)
    }

    // 3. EXECUTE (trusted_sync only) or ENQUEUE (durable_async, handled by outbox)
    if (mode === 'trusted_sync' && result.accepted && this._persistence && result.plan && this._registry) {
      if ((this._persistence as any).sql) {
        await executePlan(
          this._registry,
          result.plan,
          envelope,
          (this._persistence as any).sql,
        )
      }
    }

    return {
      accepted: result.accepted,
      intentId: result.intentId,
      decisionId: result.decisionId,
      decision: result.decision,
      error: result.error,
    }
  }

  private buildEnvelope(intent: InternalIntent): IntentEnvelope {
    const intentId = crypto.randomUUID()
    const nonce = crypto.randomUUID()
    const timestamp = new Date().toISOString()
    const signature = crypto
      .createHash('sha256')
      .update(intentId + timestamp + nonce)
      .digest('hex')

    return {
      intentId,
      intentType: intent.intentType,
      intentVersion: intent.intentVersion ?? 1,
      tenantId: intent.tenantId,
      actor: intent.actor,
      source: 'internal_worker' satisfies IntentSource,
      timestamp,
      causationId: null,
      correlationId: null,
      payload: { ...intent.payload },
      nonce,
      signature,
    }
  }
}
