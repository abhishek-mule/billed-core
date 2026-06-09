import { supabaseAdmin } from '../billzo/supabase-admin'
import type { SpineEvent } from '@billzo/shared'

export type ExternalRefType = 'whatsapp_message_id' | 'razorpay_payment_id' | 'provider_message_id'

export interface ExternalRefQuery {
  type: ExternalRefType
  value: string
}

function mapRowToSpineEvent(row: Record<string, unknown>): SpineEvent {
  return {
    event_id: row.event_id as string,
    entity_type: row.entity_type as SpineEvent['entity_type'],
    entity_id: row.entity_id as string,
    causal_id: row.causal_id as string | null,
    correlation_id: row.correlation_id as string,
    sequence_no: row.sequence_no as number,
    occurred_at: row.occurred_at as string,
    ingested_at: row.ingested_at as string,
    source_system: row.source_system as SpineEvent['source_system'],
    idempotency_key: row.idempotency_key as string,
    payload: row.payload as Record<string, unknown>,
    external_refs: row.external_refs as Record<string, unknown> | undefined,
  }
}

export async function resolveExternalRef(query: ExternalRefQuery): Promise<SpineEvent[]> {
  const refColumn = query.type === 'whatsapp_message_id'
    ? 'external_refs->>whatsapp_message_id'
    : query.type === 'razorpay_payment_id'
    ? 'external_refs->>razorpay_payment_id'
    : 'external_refs->>provider_message_id'

  const { data, error } = await supabaseAdmin
    .from('events')
    .select('*')
    .not('external_refs', 'is', null)
    .eq(refColumn, query.value as any)
    .order('sequence_no', { ascending: true })

  if (error || !data) return []
  return data.map(mapRowToSpineEvent)
}

export async function resolveExternalRefs(queries: ExternalRefQuery[]): Promise<Map<string, SpineEvent[]>> {
  const results = new Map<string, SpineEvent[]>()
  for (const q of queries) {
    results.set(`${q.type}:${q.value}`, await resolveExternalRef(q))
  }
  return results
}
