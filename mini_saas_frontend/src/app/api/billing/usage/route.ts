import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'
import { getReminderQuota } from '@/lib/billzo/reminder-quota'

export const dynamic = 'force-dynamic'

/**
 * Current-month usage snapshot: reminder allowance vs used.
 * Powers the send page gate + the settings billing usage meter.
 */
export async function GET(request: NextRequest) {
  const tenantId = getVerifiedTenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const quota = await getReminderQuota(tenantId)
    return NextResponse.json({ metric: 'reminders_sent', ...quota })
  } catch (err: any) {
    console.error('[Billing/Usage] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}