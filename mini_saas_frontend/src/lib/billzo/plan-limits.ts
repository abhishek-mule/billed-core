export const FREE_LIMITS = {
  invoices: 3,
  reminders: 3,
  autoRecovery: false,
} as const

export const PLAN_LIMITS = {
  starter: FREE_LIMITS,
  pro: {
    invoices: Infinity,
    reminders: Infinity,
    autoRecovery: true,
  },
  growth: {
    invoices: Infinity,
    reminders: Infinity,
    autoRecovery: true,
    analytics: true,
    multiUser: true,
  },
} as const

export type PlanType = keyof typeof PLAN_LIMITS

export type UsageLimits = {
  invoices: number
  reminders: number
  autoRecovery: boolean
  multiUser?: boolean
  analytics?: boolean
}

export function getLimits(plan: PlanType): UsageLimits {
  return PLAN_LIMITS[plan] ?? FREE_LIMITS
}

export function checkLimit(
  current: number,
  limit: number
): { allowed: boolean; remaining: number } {
  if (limit === Infinity) return { allowed: true, remaining: Infinity }
  return {
    allowed: current < limit,
    remaining: Math.max(0, limit - current),
  }
}

export function isPaywallBlocked(
  invoiceCount: number,
  reminderCount: number,
  plan: PlanType
): { blocked: boolean; type?: 'invoice' | 'reminder' } {
  const limits = getLimits(plan)

  const invoiceCheck = checkLimit(invoiceCount, limits.invoices)
  if (!invoiceCheck.allowed) {
    return { blocked: true, type: 'invoice' }
  }

  const reminderCheck = checkLimit(reminderCount, limits.reminders)
  if (!reminderCheck.allowed) {
    return { blocked: true, type: 'reminder' }
  }

  return { blocked: false }
}
