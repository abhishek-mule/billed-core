import { NextRequest, NextResponse } from 'next/server'
import { getCookie } from '@/lib/cookies'
import { createClient } from '@supabase/supabase-js'
import { buildQueueItems } from '@/lib/recovery/queue-service'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''

export async function GET(request: NextRequest) {
  const tenantId = getCookie('bz_tenant')
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // ── Active cases with customer join ──
  const { data: activeCases, error: casesErr } = await supabase
    .from('recovery_cases')
    .select(`*, customers!inner(name, phone)`)
    .eq('tenant_id', tenantId)
    .not('recovery_state_v2', 'in', '("recovered","closed")')
    .order('attention_score', { ascending: false })
    .limit(20)

  if (casesErr) {
    return NextResponse.json({ error: casesErr.message }, { status: 500 })
  }

  // ── Active operational situations (for inline context) ──
  const { data: situations } = await supabase
    .from('operational_situations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('situation_state', 'active')
    .limit(20)

  // ── Build queue items ──
  const queue = buildQueueItems(activeCases || [], situations || [])

  // ── Recent successful payments summary ──
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data: payments } = await supabase
    .from('payments')
    .select('amount, created_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'success')
    .gte('created_at', todayStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(50)

  const recoveredToday = (payments || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)

  return NextResponse.json({
    ...queue,
    recoveredToday,
  })
}
