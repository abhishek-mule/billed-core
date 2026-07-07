import type { NormalizedRecoveryEvent } from '../normalized-event'

export interface PaymentFeatures {
  avgSettlementDelayHours: number
  avgPaymentAmount: number
  partialPaymentRate: number
  promiseKeepingRate: number
  earlyPaymentRate: number
  latePaymentRate: number
  paymentCount: number
  promiseCount: number
}

export function extractPaymentFeatures(events: NormalizedRecoveryEvent[]): PaymentFeatures {
  const payments = events.filter(e => e.type === 'payment_received' || e.type === 'partial_payment')
  const partials = events.filter(e => e.type === 'partial_payment')
  const promisesKept = events.filter(e => e.type === 'promise_kept')
  const promisesBroken = events.filter(e => e.type === 'promise_broken')
  const promises = events.filter(e => e.type === 'promise_created')

  const settlementDelays: number[] = []
  const amounts: number[] = []
  for (const p of payments) {
    const invoiceEvent = events.find(e => e.type === 'invoice_created' && e.customerId === p.customerId && new Date(e.timestamp) <= new Date(p.timestamp))
    if (invoiceEvent) {
      const delayMs = new Date(p.timestamp).getTime() - new Date(invoiceEvent.timestamp).getTime()
      settlementDelays.push(delayMs / (1000 * 3600))
    }
    if (p.amount) amounts.push(p.amount)
  }

  const totalPromises = promises.length
  const keptPromises = promisesKept.length

  return {
    avgSettlementDelayHours: settlementDelays.length > 0
      ? settlementDelays.reduce((s, v) => s + v, 0) / settlementDelays.length
      : 0,
    avgPaymentAmount: amounts.length > 0
      ? amounts.reduce((s, v) => s + v, 0) / amounts.length
      : 0,
    partialPaymentRate: payments.length > 0 ? partials.length / payments.length : 0,
    promiseKeepingRate: totalPromises > 0 ? keptPromises / totalPromises : 0,
    earlyPaymentRate: 0,
    latePaymentRate: 0,
    paymentCount: payments.length,
    promiseCount: totalPromises,
  }
}
