// Helper: emit simulated payment link click + payment completed
import { EventType } from '@billzo/shared'
import { emitEvent } from '../src/lib/billzo/events'
import { generateCorrelationId } from '../src/lib/billzo/idempotency'

const [tenantId, invoiceId] = process.argv.slice(2)
if (!tenantId || !invoiceId) {
  console.error('Usage: npx ts-node scripts/emit-payment-flow.ts <tenantId> <invoiceId>')
  process.exit(1)
}

async function main() {
  const corrId = generateCorrelationId(invoiceId)

  await emitEvent({
    type: EventType.PAYMENT_LINK_CLICKED,
    tenantId,
    entityId: invoiceId,
    payload: { invoiceId, amount: 5000 },
    causationId: null,
    correlationId: corrId,
    idempotencyKey: null,
    producer: 'webhook',
    retentionDays: 30,
  })

  await emitEvent({
    type: EventType.PAYMENT_COMPLETED,
    tenantId,
    entityId: invoiceId,
    payload: { amount: 5000, provider: 'razorpay', providerPaymentId: 'pay_test_e2e', matchedBy: 'exact' },
    causationId: null,
    correlationId: corrId,
    idempotencyKey: `payment:e2e:${invoiceId}:razorpay:pay_test_e2e`,
    producer: 'webhook',
    retentionDays: 30,
  })

  console.log(JSON.stringify({ status: 'ok', emitted: ['payment_link.clicked', 'payment.completed'] }))
}

main().catch(e => { console.error(JSON.stringify({ error: e.message })); process.exit(1) })
