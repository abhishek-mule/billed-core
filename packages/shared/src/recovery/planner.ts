// ============================================================
// ACTION PLANNER — RecoveryPlan → ActionPlan
// ============================================================
//
// Pure function. No database access. No side effects.
// Resolves channel/provider from the RecoveryPlan and merchant preferences.
// Provider-agnostic — only decides WHICH provider, not HOW to use it.
// ============================================================

import type { RecoveryPlan, ActionPlan } from './types'

export function createActionPlan(
  plan: RecoveryPlan,
  preferredChannels: string[],
  paymentPreference: string[],
): ActionPlan {
  switch (plan.actionType) {
    case 'reminder': {
      const channel = pickBestChannel(preferredChannels, ['whatsapp', 'sms', 'email'])
      return {
        actionType: 'reminder',
        provider: channel,
        config: { tone: plan.priority <= 3 ? 'urgent' : 'normal' },
      }
    }

    case 'payment_request': {
      const provider = pickBestChannel(paymentPreference, ['razorpay', 'upi'])
      return {
        actionType: 'payment_request',
        provider,
        amount: plan.suggestedAmount,
        config: {},
      }
    }

    case 'call':
      return {
        actionType: 'call',
        provider: null,
        config: {},
      }

    case 'visit':
      return {
        actionType: 'visit',
        provider: null,
        config: {},
      }

    case 'escalate':
      return {
        actionType: 'escalate',
        provider: null,
        config: { reason: plan.reason },
      }

    case 'wait':
      return {
        actionType: 'wait',
        provider: null,
        config: { scheduledAt: plan.timing.scheduledAt },
      }

    default:
      return {
        actionType: 'wait',
        provider: null,
        config: {},
      }
  }
}

function pickBestChannel(available: string[], preference: string[]): string | null {
  for (const p of preference) {
    if (available.includes(p)) return p
  }
  return available.length > 0 ? available[0] : null
}
