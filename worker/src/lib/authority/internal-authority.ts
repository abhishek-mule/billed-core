import crypto from 'crypto'
import { evaluate, type AuthorityCoreConfig } from './core'
import type { IntentEnvelope, IntentSource, AuthorityResult } from './schemas'

export interface InternalIntent {
  readonly intentType: string
  readonly intentVersion?: number
  readonly tenantId: string
  readonly actor: string
  readonly payload: Record<string, unknown>
}

export class InternalAuthorityClient {
  constructor(private readonly config: AuthorityCoreConfig) {}

  async submit(intent: InternalIntent): Promise<AuthorityResult> {
    const envelope = this.buildEnvelope(intent)
    return evaluate(envelope, this.config)
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
