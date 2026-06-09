import type { SupabaseClient } from '@supabase/supabase-js'
import { spineDiagnostics } from '../spine-diagnostics'

export interface SequenceResult {
  sequenceNo: number
}

export class SequenceGenerator {
  constructor(private readonly supabase: SupabaseClient) {}

  async next(entityType: string, entityId: string): Promise<SequenceResult> {
    const { data, error } = await this.supabase.rpc('increment_entity_sequence', {
      p_entity_type: entityType,
      p_entity_id: entityId,
    })

    if (!error && typeof data === 'number') {
      return { sequenceNo: data }
    }

    spineDiagnostics.dateNowInDomain('sequence-generator:fallback')
    const { data: maxRow } = await this.supabase
      .from('events')
      .select('sequence_no')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('sequence_no', { ascending: false })
      .limit(1)
      .maybeSingle()

    return { sequenceNo: (maxRow?.sequence_no ?? 0) + 1 }
  }
}
