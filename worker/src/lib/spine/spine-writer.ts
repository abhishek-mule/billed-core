import { supabaseAdmin } from '../billzo/supabase-admin'
import { spineDiagnostics } from '../spine-diagnostics'
import {
  type SpineEventInput,
  type SpineWriteResult,
  type SpineValidationError,
  validateSpineEventInput,
  uuidv7,
} from '@billzo/shared'
import { SequenceGenerator } from './sequence-generator'

export class SpineWriter {
  private readonly sequenceGenerator: SequenceGenerator

  constructor(sequenceGenerator?: SequenceGenerator) {
    this.sequenceGenerator = sequenceGenerator ?? new SequenceGenerator(supabaseAdmin)
  }

  async append(input: SpineEventInput): Promise<SpineWriteResult> {
    const errors: SpineValidationError[] = validateSpineEventInput(input)
    if (errors.length > 0) {
      const msg = errors.map(e => `${e.field}: ${e.message}`).join('; ')
      return { accepted: false, error: `Spine validation failed: ${msg}` }
    }

    const entityType = input.entity_type

    if (input.idempotency_key) {
      const { data } = await supabaseAdmin
        .from('events')
        .select('event_id')
        .eq('idempotency_key', input.idempotency_key)
        .limit(1)
        .maybeSingle()
      if (data) {
        return { accepted: false, error: `Duplicate idempotency_key: ${input.idempotency_key}` }
      }
    }

    // Phase 3: identity quarantine — transport/payment events without
    // external_refs get quarantined for review but still pass through
    let quarantined = false
    if (!input.external_refs && (entityType === 'whatsapp_message' || entityType === 'payment')) {
      spineDiagnostics.missingExternalRefs(entityType, input.entity_id)
      await this.quarantine(input, 'Missing external_refs for transport/payment event')
      quarantined = true
    }

    const { sequenceNo } = await this.sequenceGenerator.next(entityType, input.entity_id)

    const now = new Date().toISOString()
    const eventId = uuidv7()

    const event = {
      event_id: eventId,
      entity_type: entityType,
      entity_id: input.entity_id,
      causal_id: input.causal_id ?? null,
      correlation_id: input.correlation_id ?? eventId,
      sequence_no: sequenceNo,
      occurred_at: input.occurred_at ?? now,
      ingested_at: now,
      source_system: input.source_system,
      idempotency_key: input.idempotency_key,
      tenant_id: input.tenant_id ?? null,
      payload: input.payload ?? {},
      external_refs: input.external_refs ?? null,
    }

    const { error: writeError } = await supabaseAdmin
      .from('events')
      .insert(event)

    if (writeError) {
      return { accepted: false, error: `Spine write failed: ${writeError.message}` }
    }

    return {
      accepted: true,
      event_id: eventId,
      sequence_no: sequenceNo,
      quarantined,
    }
  }

  async appendBatch(inputs: SpineEventInput[]): Promise<SpineWriteResult[]> {
    return Promise.all(inputs.map(i => this.append(i)))
  }

  private async quarantine(input: SpineEventInput, reason: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('spine_quarantine')
      .insert({
        event_id: uuidv7(),
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        source_system: input.source_system,
        idempotency_key: input.idempotency_key,
        payload: input.payload ?? {},
        reason,
        tenant_id: input.tenant_id ?? null,
      })
    if (error) {
      console.error(`[SpineWriter] Quarantine write failed: ${error.message}`)
    }
  }
}
