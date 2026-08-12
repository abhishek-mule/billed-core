import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { billzoPlanOf, reminderMonthlyAllowance, type BillzoPlan } from '@billzo/shared'
import { checkQuota } from '@/lib/billzo/feature-flags'

export interface ReminderQuota {
  planCode: BillzoPlan | null
  limit: number
  used: number
  remaining: number
  unlimited: boolean
  /** Hard-disabled once usage passes 110% of the allowance (soft-limit policy). */
  exceeded: boolean
}

/**
 * Current-month recovery-reminder quota for a tenant.
 * Reads the plan from `tenants` (denormalized mirror) and usage from
 * `tenant_usage` (incremented by the billing worker) — never synchronously.
 */
export async function getReminderQuota(tenantId: string): Promise<ReminderQuota> {
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('plan')
    .eq('id', tenantId)
    .maybeSingle()

  const planCode = tenant ? billzoPlanOf(tenant.plan as string | null) : null
  const limit = planCode ? reminderMonthlyAllowance(planCode) : 5

  const quota = await checkQuota(tenantId, 'reminders_sent', limit)

  return {
    planCode,
    limit: quota.limit,
    used: quota.used,
    remaining: quota.remaining,
    unlimited: quota.unlimited,
    exceeded: !quota.unlimited && limit > 0 && (quota.used / limit) * 100 >= 110,
  }
}