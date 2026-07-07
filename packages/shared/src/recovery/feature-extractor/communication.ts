import type { NormalizedRecoveryEvent } from '../normalized-event'

export interface CommunicationFeatures {
  readRate: number
  ignoreRate: number
  clickToPayLatencyHours: number
  responseDelayHours: number
  totalRemindersSent: number
  totalReads: number
  totalClicks: number
}

export function extractCommunicationFeatures(events: NormalizedRecoveryEvent[]): CommunicationFeatures {
  const sent = events.filter(e => e.type === 'reminder_sent')
  const delivered = events.filter(e => e.type === 'reminder_delivered')
  const reads = events.filter(e => e.type === 'reminder_read')
  const clicks = events.filter(e => e.type === 'payment_link_clicked')
  const payments = events.filter(e => e.type === 'payment_received')

  const clickToPay: number[] = []
  for (const click of clicks) {
    const payment = payments.find(p => p.customerId === click.customerId && new Date(p.timestamp) > new Date(click.timestamp))
    if (payment) {
      clickToPay.push((new Date(payment.timestamp).getTime() - new Date(click.timestamp).getTime()) / (1000 * 3600))
    }
  }

  const responseDelays: number[] = []
  for (const reminder of sent) {
    const response = [...reads, ...clicks, ...payments].find(r => r.customerId === reminder.customerId && new Date(r.timestamp) > new Date(reminder.timestamp))
    if (response) {
      responseDelays.push((new Date(response.timestamp).getTime() - new Date(reminder.timestamp).getTime()) / (1000 * 3600))
    }
  }

  return {
    readRate: delivered.length > 0 ? reads.length / delivered.length : 0,
    ignoreRate: sent.length > 0 ? 1 - (reads.length / sent.length) : 0,
    clickToPayLatencyHours: clickToPay.length > 0
      ? clickToPay.reduce((s, v) => s + v, 0) / clickToPay.length
      : 0,
    responseDelayHours: responseDelays.length > 0
      ? responseDelays.reduce((s, v) => s + v, 0) / responseDelays.length
      : 0,
    totalRemindersSent: sent.length,
    totalReads: reads.length,
    totalClicks: clicks.length,
  }
}
