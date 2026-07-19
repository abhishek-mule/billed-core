export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

/**
 * POST /api/recovery/policies/:id/set-default — make a tenant policy the default.
 * Unsets other defaults for the tenant.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params
  const { data: policy } = await supabaseAdmin
    .from('recovery_policies')
    .select('id, tenant_id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()
  if (!policy) return NextResponse.json({ error: 'Policy not found' }, { status: 404 })

  await supabaseAdmin
    .from('recovery_policies')
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .neq('id', id)
  await supabaseAdmin
    .from('recovery_policies')
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq('id', id)

  // Policy change recorded; downstream scheduler/planner will replan open invoices.
  const { count } = await supabaseAdmin
    .from('recovery_cases')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)

  return NextResponse.json({ ok: true, openCases: count ?? 0 })
}
