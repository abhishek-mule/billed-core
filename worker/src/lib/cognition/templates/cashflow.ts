import type { NarrativeSeed, RecommendedAction } from '../types'

interface TemplateResult {
  headline: string
  narrative: string
}

export function renderCashflowTemplate(seed: NarrativeSeed): TemplateResult {
  const { entityCount, totalAmount, customerName, maxUrgency, stageLabel, customerBehavior } = seed
  const formattedAmount = `₹${totalAmount.toLocaleString('en-IN')}`

  // Rule 1: Multiple invoices + critical urgency
  if (entityCount > 1 && maxUrgency === 'critical') {
    const readNote = customerBehavior.readRate !== null
      ? customerBehavior.readRate > 0.5
        ? 'Customer reads reminders but is not acting'
        : 'Customer rarely opens reminders'
      : ''

    return {
      headline: `${formattedAmount} stuck across ${entityCount} invoices from ${customerName}`,
      narrative: [
        stageLabel || 'Multiple invoices overdue',
        customerBehavior.delayLikelihood !== null && customerBehavior.delayLikelihood > 0.6
          ? 'Customer likely delaying intentionally'
          : readNote,
        seed.windowInfo
          ? `Best action window: ${new Date(seed.windowInfo.bestStart).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} – ${new Date(seed.windowInfo.bestEnd).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
          : '',
      ].filter(Boolean).join('. ') + '.',
    }
  }

  // Rule 2: Single invoice + critical urgency
  if (entityCount === 1 && maxUrgency === 'critical') {
    return {
      headline: `${formattedAmount} overdue — ${customerName}`,
      narrative: [
        customerBehavior.delayLikelihood !== null && customerBehavior.delayLikelihood > 0.6
          ? 'Customer likely delaying strategically'
          : 'Payment window open',
        customerBehavior.readRate !== null && customerBehavior.readRate > 0.5
          ? 'WhatsApp channel viable — send reminder'
          : 'Consider direct call',
      ].filter(Boolean).join('. ') + '.',
    }
  }

  // Rule 3: Low/medium urgency
  if (maxUrgency === 'low' || maxUrgency === 'medium') {
    return {
      headline: `${customerName} has pending payments`,
      narrative: `${formattedAmount} outstanding across ${entityCount} invoice${entityCount > 1 ? 's' : ''}. No urgent action needed — continuing standard reminder cadence.`,
    }
  }

  // Default
  return {
    headline: `${formattedAmount} pending from ${customerName}`,
    narrative: `Payment follow-up recommended for ${entityCount} invoice${entityCount > 1 ? 's' : ''}.`,
  }
}
