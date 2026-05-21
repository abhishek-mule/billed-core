import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/billzo/supabase'

export const dynamic = 'force-dynamic'

function getTenantId(): string | null {
  return cookies().get('bz_tenant')?.value || null
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = getTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!supabase) {
      return NextResponse.json({ connected: false, reason: 'Database not available' }, { status: 200 })
    }

    const { data, error } = await supabase
      .from('tenants')
      .select('whatsapp_config')
      .eq('id', tenantId)
      .single()

    if (error) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const config = data?.whatsapp_config
    if (!config?.gupshupApiKey) {
      return NextResponse.json({ connected: false, reason: 'Gupshup API key not configured' }, { status: 200 })
    }

    try {
      const res = await fetch('https://api.gupshup.io/sm/api/v1/app/settings', {
        headers: {
          'api_key': config.gupshupApiKey,
          'app_name': config.gupshupAppName || '',
        },
      })
      if (res.ok) {
        const data = await res.json()
        return NextResponse.json({
          connected: true,
          appName: config.gupshupAppName,
          sourceNumber: config.sourceNumber,
          autoSend: config.autoSend,
          templates: config.templateNames,
          message: 'Connected to Gupshup',
        })
      }
      return NextResponse.json({ connected: false, reason: `Gupshup returned ${res.status}` }, { status: 200 })
    } catch {
      return NextResponse.json({ connected: false, reason: 'Could not reach Gupshup API' }, { status: 200 })
    }
  } catch (err: any) {
    console.error('[WhatsAppStatus] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
