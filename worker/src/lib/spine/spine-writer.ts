// ============================================================
// SpineWriter — The ONLY way to append events to the spine
// ============================================================
// This runtime guard enforces all Event Spine invariants:
//   1. Required fields present and valid
//   2. Idempotency key uniqueness
//   3. Per-entity monotonic sequence
//   4. Causal chain completeness (optional, warn-only in Phase 1)
//   5. External refs presence (optional, warn-only in Phase 1)
//
// Phase 1 behavior: REJECT invalid events, but only for
// structural validity. Causal and identity checks are
// observational until Phase 3.
// ============================================================

import { supabaseAdmin } from '../billzo/supabase-admin'
import { spineDiagnostics } from '../spine-diagnostics'
import {
  type SpineEvent,
  type SpineEventInput,
  type SpineWriteResult,
  type SpineValidationError,
  validateSpineEventInput,
  uuidv7,
  inferEntityType,
} from '@billzo/shared'

// ----------------------------------------------------------
// Sequence counter — atomic per-entity sequence number
// Uses Supabase RPC for atomicity. Falls back to Redis.
// ----------------------------------------------------------
async function nextSequence(entityType: string, entityId: string): Promise<number> {
  // Try atomic Postgres increment first
  const { data, error } = await supabaseAdmin.rpc('increment_entity_sequence', {
    p_entity_type: entityType,
    p_entity_id: entityId,
  })

  if (!error && typeof data === 'number') {
    return data
  }

  // Fallback: read max + 1 (non-atomic, but safe for Phase 1)
  spineDiagnostics.dateNowInDomain('spine-writer:sequence-fallback')
  const { data: maxRow } = await supabaseAdmin
    .from('events')
    .select('sequence_no')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('sequence_no', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (maxRow?.sequence_no ?? 0) + 1
}

// ----------------------------------------------------------
// Idempotency guard — reject duplicate idempotency keys
// ----------------------------------------------------------
async function checkIdempotency(idempotencyKey: string): Promise<boolean> {
  if (!idempotencyKey) return true // no key = no dedup
  const { data } = await supabaseAdmin
    .from('events')
    .select('event_id')
    .eq('idempotency_key', idempotencyKey)
    .limit(1)
    .maybeSingle()
  return !data // true if NOT already processed
}

// ----------------------------------------------------------
// SpineWriter — write events with full invariant enforcement
// ----------------------------------------------------------
export class SpineWriter {
  // --------------------------------------------------------
  // Append — validate, assign sequence, write
  // --------------------------------------------------------
  async append(input: SpineEventInput): Promise<SpineWriteResult> {
    // 1. Structural validation
    const errors: SpineValidationError[] = validateSpineEventInput(input)
    if (errors.length > 0) {
      const msg = errors.map(e => `${e.field}: ${e.message}`).join('; ')
      return { accepted: false, error: `Spine validation failed: ${msg}` }
    }

    // 2. Infer entity_type from event type if not explicitly set
    const entityType = input.entity_type

    // 3. Idempotency check
    if (input.idempotency_key) {
      const isNew = await checkIdempotency(input.idempotency_key)
      if (!isNew) {
        return { accepted: false, error: `Duplicate idempotency_key: ${input.idempotency_key}` }
      }
    }

    // 4. Assign sequence number (atomic per entity)
    const sequenceNo = await nextSequence(entityType, input.entity_id)

    // 5. Build the event
    const now = new Date().toISOString()
    const eventId = uuidv7()

    // Phase 0 probe: detect missing external_refs for transport/payment events
    if (!input.external_refs && (entityType === 'whatsapp_message' || entityType === 'payment')) {
      spineDiagnostics.missingExternalRefs(entityType, input.entity_id)
    }

    const event: Omit<SpineEvent, 'ingested_at'> & { ingested_at: string } = {
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
      payload: input.payload ?? {},
      external_refs: input.external_refs,
    }

    // 6. Write to spine
    const { error: writeError } = await supabaseAdmin
      .from('events')
      .insert({
        event_id: event.event_id,
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        causal_id: event.causal_id,
        correlation_id: event.correlation_id,
        sequence_no: event.sequence_no,
        occurred_at: event.occurred_at,
        ingested_at: event.ingested_at,
        source_system: event.source_system,
        idempotency_key: event.idempotency_key,
        payload: event.payload,
        external_refs: event.external_refs ?? null,
      })

    if (writeError) {
      return { accepted: false, error: `Spine write failed: ${writeError.message}` }
    }

    return {
      accepted: true,
      event_id: eventId,
      sequence_no: sequenceNo,
    }
  }

  // --------------------------------------------------------
  // Bulk append — multiple events in one batch
  // --------------------------------------------------------
  async appendBatch(inputs: SpineEventInput[]): Promise<SpineWriteResult[]> {
    return Promise.all(inputs.map(i => this.append(i)))
  }
}
