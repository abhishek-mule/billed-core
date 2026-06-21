import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.cookies.get('bz_tenant')?.value
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Return empty if Supabase not configured
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ situations: [], total: 0 })
    }

    const searchParams = request.nextUrl.searchParams
    const state = searchParams.get('state') || 'active'
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50)

    const supabase = createClient(supabaseUrl, supabaseKey)

    let query = supabase
      .from('operational_situations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('situation_state', state)
      .order('priority_score', { ascending: false })
      .limit(limit)

    const category = searchParams.get('category')
    if (category) {
      query = query.eq('situation_type', category)
    }

    const { data, error } = await query

    if (error) {
      console.error('[Situations] Query error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      situations: data || [],
      total: data?.length || 0,
    })
  } catch (err: any) {
    console.error('[Situations] Error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const tenantId = request.cookies.get('bz_tenant')?.value
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ success: true })
    }

    const body = await request.json()
    const { situationId, action } = body

    if (!situationId || !action) {
      return NextResponse.json({ error: 'situationId and action are required' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (action === 'dismiss') {
      updates.situation_state = 'dismissed'
      updates.last_seen_at = new Date().toISOString()
      const { data: cur } = await supabase
        .from('operational_situations')
        .select('dismissal_count')
        .eq('id', situationId)
        .single()
      updates.dismissal_count = (cur?.dismissal_count || 0) + 1
    } else if (action === 'snooze') {
      updates.situation_state = 'snoozed'
      updates.last_seen_at = new Date().toISOString()
    } else if (action === 'complete') {
      updates.situation_state = 'completed'
    } else if (action === 'seen') {
      updates.last_seen_at = new Date().toISOString()
    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    const { error } = await supabase
      .from('operational_situations')
      .update(updates)
      .eq('id', situationId)
      .eq('tenant_id', tenantId)

    if (error) {
      console.error('[Situations] PATCH error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[Situations] PATCH Error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
