import { createClient } from '@supabase/supabase-js'
import type { PipelineValidator, CheckResult } from '../types'
import { check } from '../runner'
import { poll } from '../poll'
import { pollForRecoveryCase, pollForOutbox } from '../supabase-poll'

export function paymentPipeline(): PipelineValidator {
  return {
    name: 'Payment Pipeline',
    description: 'Receive payment → outbox → worker → recovery projection → dashboard',
    dependencies: ['supabase', 'worker'],
    async run(ctx) {
      const supabase = createClient(ctx.supabaseUrl, ctx.supabaseKey)
      const tenantId = `test-validate-pay-${Date.now()}`
      const customerId = `cust-validate-pay-${Date.now()}`
      const invoiceId = `inv-validate-pay-${Date.now()}`
      const paymentId = `pay-validate-${Date.now()}`
      const results: CheckResult[] = []

      // Step 1-2: Create customer + invoice
      await supabase.from('customers').insert({
        id: customerId, tenant_id: tenantId, name: 'Pay Test', phone: '9999999998',
      })
      await supabase.from('invoices').insert({
        id: invoiceId, customer_id: customerId, tenant_id: tenantId,
        total: 5000, paid_amount: 0, status: 'pending',
      })
      await pollForRecoveryCase(supabase, customerId)

      // Step 3: Record payment
      const step1 = await check('Record payment', async () => {
        const { error } = await supabase.from('payments').insert({
          id: paymentId,
          invoice_id: invoiceId,
          customer_id: customerId,
          tenant_id: tenantId,
          amount: 5000,
          method: 'cash',
          status: 'completed',
          created_at: new Date().toISOString(),
        })
        if (error) throw new Error(`Payment insert failed: ${error.message}`)
      })
      results.push(step1)

      // Step 4: Check outbox
      const step2 = await check('Payment outbox event', async () => {
        await pollForOutbox(supabase, paymentId)
      })
      results.push(step2)

      // Step 5: Check recovery case updated
      const step3 = await check('Recovery case updated', async () => {
        await poll(async () => {
          const { data } = await supabase
            .from('recovery_cases')
            .select('total_overdue, status')
            .eq('customer_id', customerId)
            .single()
          if (!data) throw new Error('No recovery case')
          if (data.total_overdue !== 0) throw new Error(`Expected 0 overdue, got ${data.total_overdue}`)
        }, { timeoutMs: 15_000, intervalMs: 500 })
      })
      results.push(step3)

      // Cleanup
      await supabase.from('payments').delete().eq('id', paymentId)
      await supabase.from('invoices').delete().eq('id', invoiceId)
      await supabase.from('customers').delete().eq('id', customerId)

      return results
    },
  }
}
