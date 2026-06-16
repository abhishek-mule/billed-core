export type PlanType = 'starter' | 'pro' | 'growth'

export type Feature =
  | 'manual_reminders'
  | 'auto_recovery'
  | 'recovery_queue'
  | 'promise_tracking'
  | 'cashflow_forecast'
  | 'advanced_analytics'
  | 'exports'

export const FEATURES: Record<PlanType, readonly Feature[]> = {
  starter: ['manual_reminders'],
  pro: [
    'manual_reminders',
    'auto_recovery',
    'recovery_queue',
    'promise_tracking',
    'cashflow_forecast',
  ],
  growth: [
    'manual_reminders',
    'auto_recovery',
    'recovery_queue',
    'promise_tracking',
    'cashflow_forecast',
    'advanced_analytics',
    'exports',
  ],
}

export function hasFeature(plan: PlanType, feature: Feature): boolean {
  return FEATURES[plan]?.includes(feature) ?? false
}

export function getPlan(plan?: string): PlanType {
  if (plan === 'pro' || plan === 'growth') return plan
  return 'starter'
}
