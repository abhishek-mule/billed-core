import { billzoPlanOf, reminderMonthlyAllowance, type BillzoPlan } from '@billzo/shared'

export type PlanType = BillzoPlan

export type Feature =
  | 'manual_reminders'
  | 'auto_recovery'
  | 'recovery_queue'
  | 'promise_tracking'
  | 'cashflow_forecast'
  | 'advanced_analytics'
  | 'exports'
  | 'api'
  | 'multi_branch'

export interface PlanLimits {
  reminders: number // -1 = unlimited
  branches: number // -1 = unlimited
  api: boolean
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  starter: { reminders: reminderMonthlyAllowance('starter'), branches: 1, api: false },
  pro: { reminders: reminderMonthlyAllowance('pro'), branches: 1, api: false },
  business: { reminders: reminderMonthlyAllowance('business'), branches: 5, api: true },
  enterprise: { reminders: reminderMonthlyAllowance('enterprise'), branches: -1, api: true },
}

export const FEATURES: Record<PlanType, readonly Feature[]> = {
  starter: ['manual_reminders'],
  pro: ['manual_reminders', 'auto_recovery', 'recovery_queue', 'promise_tracking', 'cashflow_forecast'],
  business: [
    'manual_reminders',
    'auto_recovery',
    'recovery_queue',
    'promise_tracking',
    'cashflow_forecast',
    'advanced_analytics',
    'exports',
    'api',
    'multi_branch',
  ],
  enterprise: [
    'manual_reminders',
    'auto_recovery',
    'recovery_queue',
    'promise_tracking',
    'cashflow_forecast',
    'advanced_analytics',
    'exports',
    'api',
    'multi_branch',
  ],
}

export function hasFeature(plan: PlanType, feature: Feature): boolean {
  return FEATURES[plan]?.includes(feature) ?? false
}

export function getPlan(plan?: string): PlanType {
  return billzoPlanOf(plan)
}

export const UNLIMITED = -1

export function isUnlimited(value: number): boolean {
  return value === UNLIMITED
}

/** Returns true if `used` is within `limit` (unlimited always passes). */
export function withinLimit(used: number, limit: number): boolean {
  if (isUnlimited(limit)) return true
  return used < limit
}

export function remaining(used: number, limit: number): number {
  if (isUnlimited(limit)) return UNLIMITED
  return Math.max(0, limit - used)
}