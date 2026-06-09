import { describe, it, expect, vi } from 'vitest'
import { SequenceGenerator } from './sequence-generator'

function createMockSupabase() {
  const rpc = vi.fn()
  const maybeSingle = vi.fn()

  // Build a chainable query builder
  const queryBuilder = {
    eq: vi.fn(() => queryBuilder),
    order: vi.fn(() => queryBuilder),
    limit: vi.fn(() => ({ maybeSingle })),
    maybeSingle,
  }

  return {
    rpc,
    from: vi.fn(() => ({
      select: vi.fn(() => queryBuilder),
    })),
  } as any
}

describe('SequenceGenerator', () => {
  it('returns sequence number from RPC when it succeeds', async () => {
    const supabase = createMockSupabase()
    supabase.rpc.mockResolvedValue({ data: 7, error: null })

    const gen = new SequenceGenerator(supabase)
    const result = await gen.next('invoice', 'inv-123')

    expect(result.sequenceNo).toBe(7)
    expect(supabase.rpc).toHaveBeenCalledWith('increment_entity_sequence', {
      p_entity_type: 'invoice',
      p_entity_id: 'inv-123',
    })
  })

  it('falls back to SELECT MAX+1 when RPC fails', async () => {
    const supabase = createMockSupabase()
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('RPC not found') })

    supabase.from('events').select().eq('entity_type', 'payment').eq('entity_id', 'pay-456')
      .order('sequence_no', { ascending: false }).limit(1).maybeSingle
      .mockResolvedValue({ data: { sequence_no: 5 }, error: null })

    const gen = new SequenceGenerator(supabase)
    const result = await gen.next('payment', 'pay-456')

    expect(result.sequenceNo).toBe(6)
  })

  it('falls back to 1 when no existing events found', async () => {
    const supabase = createMockSupabase()
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('RPC not found') })

    supabase.from('events').select().eq('entity_type', 'customer').eq('entity_id', 'cus-789')
      .order('sequence_no', { ascending: false }).limit(1).maybeSingle
      .mockResolvedValue({ data: null, error: null })

    const gen = new SequenceGenerator(supabase)
    const result = await gen.next('customer', 'cus-789')

    expect(result.sequenceNo).toBe(1)
  })
})
