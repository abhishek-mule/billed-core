import type { NormalizedRecoveryEvent } from '../normalized-event'

export const PREFERRED_ACTIONS = ['reminder', 'call', 'visit', 'escalate', 'wait'] as const
export type PreferredAction = (typeof PREFERRED_ACTIONS)[number]

export const COMMUNICATION_PREFERENCES = ['friendly', 'professional', 'urgent', 'unknown'] as const
export type CommunicationPreference = (typeof COMMUNICATION_PREFERENCES)[number]

export interface RelationshipFeatures {
  preferredAction: PreferredAction
  communicationPreference: CommunicationPreference
  respondsToCall: boolean
  respondsToReminder: boolean
}

export function extractRelationshipFeatures(events: NormalizedRecoveryEvent[]): RelationshipFeatures {
  const payments = events.filter(e => e.type === 'payment_received')
  const calls = events.filter(e => e.type === 'call')
  const reminders = events.filter(e => e.type === 'reminder_sent')
  const escalations = events.filter(e => e.type === 'promise_broken')

  let paymentAfterCall = 0
  for (const call of calls) {
    const hasPayment = payments.some(p =>
      p.customerId === call.customerId &&
      new Date(p.timestamp) > new Date(call.timestamp) &&
      (new Date(p.timestamp).getTime() - new Date(call.timestamp).getTime()) < 48 * 3600 * 1000,
    )
    if (hasPayment) paymentAfterCall++
  }

  let paymentAfterReminder = 0
  for (const reminder of reminders) {
    const hasPayment = payments.some(p =>
      p.customerId === reminder.customerId &&
      new Date(p.timestamp) > new Date(reminder.timestamp) &&
      (new Date(p.timestamp).getTime() - new Date(reminder.timestamp).getTime()) < 48 * 3600 * 1000,
    )
    if (hasPayment) paymentAfterReminder++
  }

  const callEffectiveness = calls.length > 0 ? paymentAfterCall / calls.length : 0
  const reminderEffectiveness = reminders.length > 0 ? paymentAfterReminder / reminders.length : 0

  let preferredAction: PreferredAction
  if (callEffectiveness > reminderEffectiveness && calls.length >= 2) {
    preferredAction = 'call'
  } else if (escalations.length > 0 && escalations.length >= payments.length * 0.5) {
    preferredAction = 'escalate'
  } else if (reminderEffectiveness > 0.3) {
    preferredAction = 'reminder'
  } else {
    preferredAction = 'wait'
  }

  let communicationPreference: CommunicationPreference
  const promiseBrokenRate = escalations.length > 0
    ? events.filter(e => e.type === 'promise_kept').length / (escalations.length + events.filter(e => e.type === 'promise_kept').length)
    : 0
  if (promiseBrokenRate > 0.5) {
    communicationPreference = 'urgent'
  } else if (callEffectiveness > 0.3) {
    communicationPreference = 'professional'
  } else if (payments.length > 3) {
    communicationPreference = 'friendly'
  } else {
    communicationPreference = 'unknown'
  }

  return {
    preferredAction,
    communicationPreference,
    respondsToCall: callEffectiveness > 0.3,
    respondsToReminder: reminderEffectiveness > 0.3,
  }
}
