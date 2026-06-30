import { createClient } from '@supabase/supabase-js'
import type { PipelineValidator, CheckResult } from '../types'
import { check } from '../runner'
import { poll } from '../poll'

export function invoicePipeline(): PipelineValidator {
  return {
    name: 'Invoice Pipeline',
    description: 'Create invoice → outbox → worker → recovery case → dashboard',
    dependencies: ['supabase', 'worker'],
    async run(ctx) {
      const supabase = createClient(ctx.supabaseUrl, ctx.supabaseKey)
      const tenantId = `test-validate-${Date.now()}`
      const customerId = `cust-validate-${Date.now()}`
      const invoiceId = `inv-validate-${Date.now()}`
      const results: CheckResult[] = []

      // Step 1: Create test customer
      const step1 = await check('Create customer', async () => {
        const { error } = await supabase.from('customers').insert({
          id: customerId,
          tenant_id: tenantId,
          name: 'Validate Test Customer',
          phone: '9999999999',
          created_at: new Date().toISOString(),
        })
        if (error) throw new Error(`Customer insert failed: ${error.message}`)
      })
      results.push(step1)

      // Step 2: Create invoice
      const step2 = await check('Create invoice', async () => {
        const { error } = await supabase.from('invoices').insert({
          id: invoiceId,
          customer_id: customerId,
          tenant_id: tenantId,
          total: 5000,
          paid_amount: 0,
          status: 'pending',
          created_at: new Date().toISOString(),
        })
        if (error) throw new Error(`Invoice insert failed: ${error.message}`)
      })
      results.push(step2)

      // Step 3: Check outbox event was created
      const step3 = await check('Outbox event created', async () => {
        await poll(async () => {
          const { data, error } = await supabase
            .from('outbox_events')
            .select('id, type, status')
            .eq('aggregate_id', invoiceId)
            .limit(1)
          if (error) throw new Error(`Outbox query failed: ${error.message}`)
          if (!data || data.length === 0) throw new Error('No outbox event found')
          return data[0]
        }, { timeoutMs: 10_000, intervalMs: 500 })
      })
      results.push(step3)

      // Step 4: Wait for worker to process (recovery case created)
      const step4 = await check('Worker creates recovery case', async () => {
        await poll(async () => {
          const { data, error } = await supabase
            .from('recovery_cases')
            .select('id, total_overdue, status')
            .eq('customer_id', customerId)
            .limit(1)
          if (error) throw new Error(`Recovery case query failed: ${error.message}`)
          if (!data || data.length === 0) throw new Error('No recovery case created')
          if (data[0].total_overdue < 5000) throw new Error(`Recovery case total ${data[0].total_overdue} < 5000`)
          return data[0]
        }, { timeoutMs: 15_000, intervalMs: 500 })
      })
      results.push(step4)

      await supabase.from('invoices').delete().eq('id', invoiceId)
      await supabase.from('customers').delete().eq('id', customerId)

      return results
    },
  }
}
