export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

const SYSTEM_TENANT = '00000000-0000-0000-0000-000000000000'

/**
 * POST /api/recovery/policies/:id/clone — clone a policy (system or tenant)
 * into the caller's tenant as a new editable policy.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params
  const { data: src } = await supabaseAdmin
    .from('recovery_policies')
    .select('name, metadata')
    .eq('id', id)
    .single()
  if (!src) return NextResponse.json({ error: 'Policy not found' }, { status: 404 })

  const { data: steps } = await supabaseAdmin
    .from('recovery_policy_steps')
    .select('sequence, trigger_type, offset_days, action_type, template_name, channel, is_enabled, metadata')
    .eq('policy_id', id)
    .order('sequence', { ascending: true })

  const newId = `pol_${crypto.randomUUID()}`
  const { error: pErr } = await supabaseAdmin.from('recovery_policies').insert({
    id: newId,
    tenant_id: tenantId,
    name: `${src.name} (copy)`,
    is_default: false,
    metadata: src.metadata || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  if (pErr) return NextResponse.json({ error: 'Clone failed' }, { status: 500 })

  if (steps && steps.length) {
    const rows = steps.map((s: any, i: number) => ({
      id: `step_${crypto.randomUUID()}`,
      policy_id: newId,
      sequence: i + 1,
      trigger_type: s.trigger_type,
      offset_days: s.offset_days,
      action_type: s.action_type,
      template_name: s.template_name,
      channel: s.channel,
      is_enabled: s.is_enabled,
      metadata: s.metadata || {},
    }))
    await supabaseAdmin.from('recovery_policy_steps').insert(rows)
  }

  return NextResponse.json({ policyId: newId }, { status: 201 })
}
