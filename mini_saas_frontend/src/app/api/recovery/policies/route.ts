export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { verifyRequest, validateJsonBody, errorResponse } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

const SYSTEM_TENANT = '00000000-0000-0000-0000-000000000000'

/**
 * GET /api/recovery/policies — list the tenant's policies (plus system defaults).
 */
export async function GET(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('recovery_policies')
    .select('id, tenant_id, name, is_default, metadata, created_at, updated_at')
    .or(`tenant_id.eq.${tenantId},tenant_id.eq.${SYSTEM_TENANT}`)
    .order('tenant_id', { ascending: false })
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: 'Failed to load policies' }, { status: 500 })

  // Attach steps to each policy.
  const withSteps = await Promise.all(
    (data || []).map(async (p: any) => {
      const { data: steps } = await supabaseAdmin
        .from('recovery_policy_steps')
        .select('id, sequence, trigger_type, offset_days, action_type, template_name, channel, is_enabled, metadata')
        .eq('policy_id', p.id)
        .order('sequence', { ascending: true })
      return { ...p, steps: steps || [], isSystem: p.tenant_id === SYSTEM_TENANT }
    }),
  )

  return NextResponse.json({ policies: withSteps })
}

/**
 * POST /api/recovery/policies — create a tenant policy (with steps).
 * Body: { name, isDefault?, steps: [{ triggerType, offsetDays, actionType, templateName, channel }] }
 */
export async function POST(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await validateJsonBody(request, {
    fields: {
      name: { required: true, type: 'string' },
      steps: { required: true, type: 'array' },
    },
  })
  if (body.response) return body.response
  const { name, isDefault, steps } = body.data as any

  if (!Array.isArray(steps) || steps.length === 0) {
    return errorResponse('At least one step is required', 400)
  }

  const policyId = `pol_${crypto.randomUUID()}`
  const { error: pErr } = await supabaseAdmin.from('recovery_policies').insert({
    id: policyId,
    tenant_id: tenantId,
    name,
    is_default: !!isDefault,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  if (pErr) return NextResponse.json({ error: 'Failed to create policy' }, { status: 500 })

  // If marked default, unset other defaults for this tenant.
  if (isDefault) {
    await supabaseAdmin
      .from('recovery_policies')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .neq('id', policyId)
  }

  const stepRows = steps.map((s: any, i: number) => ({
    id: `step_${crypto.randomUUID()}`,
    policy_id: policyId,
    sequence: i + 1,
    trigger_type: s.triggerType || 'DUE_DATE',
    offset_days: s.offsetDays ?? 0,
    action_type: s.actionType || 'reminder',
    template_name: s.templateName || null,
    channel: s.channel || 'whatsapp',
    is_enabled: s.isEnabled !== false,
    metadata: s.metadata || {},
  }))

  const { error: sErr } = await supabaseAdmin.from('recovery_policy_steps').insert(stepRows)
  if (sErr) return NextResponse.json({ error: 'Failed to create steps' }, { status: 500 })

  return NextResponse.json({ policyId, created: stepRows.length }, { status: 201 })
}
