export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { verifyRequest, validateJsonBody, errorResponse } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

const SYSTEM_TENANT = '00000000-0000-0000-0000-000000000000'

/**
 * PATCH /api/recovery/policies/:id — update name/isDefault and (optionally) steps.
 * Replacing steps is treated as a policy change → triggers replanning downstream.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params
  const { data: policy } = await supabaseAdmin
    .from('recovery_policies')
    .select('id, tenant_id, is_system')
    .eq('id', id)
    .single()
  if (!policy) return NextResponse.json({ error: 'Policy not found' }, { status: 404 })
  if (policy.tenant_id === SYSTEM_TENANT) {
    return errorResponse('System policies are read-only', 403)
  }

  const body = await validateJsonBody(request)
  if (body.response) return body.response
  const { name, isDefault, steps } = body.data as any

  if (name !== undefined) {
    await supabaseAdmin
      .from('recovery_policies')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
  }

  if (isDefault) {
    await supabaseAdmin
      .from('recovery_policies')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .neq('id', id)
    await supabaseAdmin
      .from('recovery_policies')
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq('id', id)
  }

  if (Array.isArray(steps)) {
    await supabaseAdmin.from('recovery_policy_steps').delete().eq('policy_id', id)
    const stepRows = steps.map((s: any, i: number) => ({
      id: `step_${crypto.randomUUID()}`,
      policy_id: id,
      sequence: i + 1,
      trigger_type: s.triggerType || 'DUE_DATE',
      offset_days: s.offsetDays ?? 0,
      action_type: s.actionType || 'reminder',
      template_name: s.templateName || null,
      channel: s.channel || 'whatsapp',
      is_enabled: s.isEnabled !== false,
      metadata: s.metadata || {},
    }))
    await supabaseAdmin.from('recovery_policy_steps').insert(stepRows)
  }

  return NextResponse.json({ ok: true })
}

/**
 * DELETE /api/recovery/policies/:id — remove a tenant policy. Cannot delete
 * the last/default policy if it has scheduled actions; caller should reassign.
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params
  const { data: policy } = await supabaseAdmin
    .from('recovery_policies')
    .select('tenant_id')
    .eq('id', id)
    .single()
  if (!policy) return NextResponse.json({ error: 'Policy not found' }, { status: 404 })
  if (policy.tenant_id === SYSTEM_TENANT) {
    return errorResponse('System policies cannot be deleted', 403)
  }

  await supabaseAdmin.from('recovery_policy_steps').delete().eq('policy_id', id)
  await supabaseAdmin.from('recovery_policies').delete().eq('id', id)

  return NextResponse.json({ ok: true })
}
