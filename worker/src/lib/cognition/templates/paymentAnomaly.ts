import type { NarrativeSeed } from '../types'

interface TemplateResult {
  headline: string
  narrative: string
}

export function renderPaymentAnomalyTemplate(seed: NarrativeSeed): TemplateResult {
  const { entityCount, totalAmount, customerName, customerBehavior } = seed
  const formattedAmount = `₹${totalAmount.toLocaleString('en-IN')}`

  if (!customerName || entityCount === 0) {
    return {
      headline: `Unidentified payment of ${formattedAmount} received`,
      narrative: `A payment of ${formattedAmount} was received but could not be matched to any invoice. Check your bank statement and reconcile manually.`,
    }
  }

  return {
    headline: `${customerName} paid partially — ${formattedAmount} remains`,
    narrative: [
      `${customerName} made a partial payment but hasn't followed up.`,
      customerBehavior.readRate !== null && customerBehavior.readRate < 0.3
        ? 'Not reading reminders — consider a direct call'
        : 'Continue standard reminder cadence with updated balance',
    ].filter(Boolean).join(' '),
  }
}
