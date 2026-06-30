import { poll } from './poll'

export async function pollForRecoveryCase(supabase: any, customerId: string): Promise<void> {
  await poll(async () => {
    const { data } = await supabase
      .from('recovery_cases')
      .select('id')
      .eq('customer_id', customerId)
      .single()
    if (!data) throw new Error('No recovery case yet')
  }, { timeoutMs: 15_000, intervalMs: 500 })
}

export async function pollForOutbox(supabase: any, aggregateId: string): Promise<void> {
  await poll(async () => {
    const { data } = await supabase
      .from('outbox_events')
      .select('id')
      .eq('aggregate_id', aggregateId)
      .limit(1)
    if (!data || data.length === 0) throw new Error('No outbox event')
  }, { timeoutMs: 10_000, intervalMs: 500 })
}
