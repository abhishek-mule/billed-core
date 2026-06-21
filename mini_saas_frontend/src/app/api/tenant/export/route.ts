import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyRequest } from '@/lib/billzo/api-middleware'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { db: { schema: 'public' } })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId!

    const format = request.nextUrl.searchParams.get('format') || 'json'
    const supabase = getSupabase()
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }

    const tables = ['invoices', 'customers', 'products', 'payments', 'recovery_cases', 'whatsapp_messages'] as const
    const data: Record<string, unknown[]> = {}

    for (const table of tables) {
      const { data: rows, error } = await supabase
        .from(table)
        .select('*')
        .eq('tenant_id', tenantId)

      if (!error && rows) {
        data[table] = rows
      }
    }

    if (format === 'csv') {
      const lines: string[] = []
      for (const [table, rows] of Object.entries(data)) {
        if (rows.length === 0) continue
        lines.push(`--- ${table} ---`)
        const headers = Object.keys(rows[0] as Record<string, unknown>)
        lines.push(headers.join(','))
        for (const row of rows) {
          lines.push(
            headers.map(h => {
              const v = (row as Record<string, unknown>)[h]
              if (v === null || v === undefined) return ''
              const s = String(v)
              return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
            }).join(',')
          )
        }
        lines.push('')
      }
      return new NextResponse(lines.join('\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="billzo-export-${tenantId.slice(0, 8)}.csv"`,
        },
      })
    }

    return NextResponse.json(data, {
      headers: {
        'Content-Disposition': `attachment; filename="billzo-export-${tenantId.slice(0, 8)}.json"`,
      },
    })
  } catch (err: any) {
    console.error('[Tenant/Export] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
