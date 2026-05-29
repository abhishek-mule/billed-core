import type { NarrativeSeed } from '../types'

interface TemplateResult {
  headline: string
  narrative: string
}

export function renderCommunicationFailureTemplate(seed: NarrativeSeed): TemplateResult {
  const { entityCount, totalAmount, customerName, maxUrgency } = seed
  const formattedAmount = `₹${totalAmount.toLocaleString('en-IN')}`

  if (maxUrgency === 'critical') {
    return {
      headline: `Messages to ${customerName || 'customer'} repeatedly failing`,
      narrative: `${entityCount} message${entityCount > 1 ? 's have' : ' has'} failed to deliver. Check if ${customerName ? `${customerName}'s` : 'the'} WhatsApp number is still active and consider an alternative contact method.`,
    }
  }

  return {
    headline: `${customerName || 'A customer'} is not reading reminders`,
    narrative: `Messages are being delivered but not read. ${formattedAmount} outstanding — consider switching to phone call follow-up.`,
  }
}
