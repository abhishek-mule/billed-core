export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

interface PlanView {
  code: string
  name: string
  monthlyPrice: number // INR (whole rupees)
  annualPrice: number
  features: string[]
  limits: Record<string, unknown>
  purchasable: boolean
  highlighted?: boolean
}

/**
 * Server-driven pricing. Frontend NEVER hardcodes prices — it renders this.
 * Returns the latest active+visible version of each plan.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('plans')
    .select('code, name, version, monthly_price_paise, annual_price_paise, currency, limits, features, is_visible, sort_order')
    .eq('is_active', true)
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }

  // Collapse to latest version per code (seed has one each; safe if more exist later).
  const latest = new Map<string, any>()
  for (const row of data ?? []) {
    const prev = latest.get(row.code)
    if (!prev || row.version > prev.version) latest.set(row.code, row)
  }

  const plans: PlanView[] = [...latest.values()].map((row) => ({
    code: row.code,
    name: row.name,
    monthlyPrice: (row.monthly_price_paise ?? 0) / 100,
    annualPrice: (row.annual_price_paise ?? 0) / 100,
    features: row.features ?? [],
    limits: row.limits ?? {},
    purchasable: row.code !== 'enterprise',
    highlighted: row.code === 'pro',
  }))

  return NextResponse.json({ plans, currency: 'INR' })
}
