import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/billzo/api-middleware', () => ({
  verifyRequest: vi.fn(async () => ({ tenantId: 't1' })),
}))
vi.mock('@/lib/billzo/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

import { GET } from '@/app/api/recovery/timeline/route'

const { supabaseAdmin } = await import('@/lib/billzo/supabase-admin')

let tableData: Record<string, any[]> = {}
function fromMock(table: string) {
  let result = tableData[table] || []
  const chain: any = {
    then(resolve: any, reject?: any) {
      return Promise.resolve({ data: result, error: null }).then(resolve, reject)
    },
  }
  const passthrough = () => chain
  for (const m of ['select', 'eq', 'in', 'gt', 'gte', 'lt', 'order', 'limit']) chain[m] = passthrough
  return chain
}

function makeReq(customerId: string) {
  return { nextUrl: new URL(`http://localhost/api/recovery/timeline?customerId=${customerId}`) } as any
}

describe('timeline route', () => {
  beforeEach(() => { vi.clearAllMocks(); tableData = {}; ;(supabaseAdmin.from as any).mockImplementation(fromMock) })

  it('requires customerId', async () => {
    const res = await GET({ nextUrl: new URL('http://localhost/api/recovery/timeline') } as any)
    expect(res.status).toBe(400)
  })

  it('unifies collection_actions, events, and whatsapp into day-grouped timeline', async () => {
    const d1 = '2025-07-15T10:00:00.000Z'
    const d2 = '2025-07-16T09:00:00.000Z'
    tableData = {
      collection_actions: [
        { id: 'ca1', action_type: 'reminder', channel: 'whatsapp', template_name: 'R', status: 'completed', trigger_type: 'OVERDUE', created_at: d1, scheduled_at: d1, completed_at: d1, invoice_ids: ['inv1'] },
        { id: 'ca2', action_type: 'reminder', channel: 'whatsapp', template_name: 'R', status: 'completed', trigger_type: 'OVERDUE', created_at: d2, scheduled_at: d2, completed_at: d2, invoice_ids: ['inv1'] },
      ],
      collection_action_events: [
        { action_id: 'ca1', event_type: 'sent', to_status: null, created_at: d1, payload: {} },
        { action_id: 'ca1', event_type: 'promise_made', to_status: null, created_at: d1, payload: {} },
      ],
      whatsapp_events: [
        { recovery_attempt_id: 'ca1', template: 'R', delivered_at: d1, read_at: d2, clicked_at: null, failed_reason: null, occurred_at: d1, status: 'read' },
      ],
    }

    const res = await GET(makeReq('cu1'))
    const json = await res.json()
    expect(res.status).toBe(200)
    // 2 days (15 Jul, 16 Jul)
    expect(json.days).toHaveLength(2)
    // newest day first
    expect(json.days[0].date).toBe('2025-07-16')
    // 15 Jul should contain: created, completed, sent, promise_made, delivered events
    const day1 = json.days.find((d: any) => d.date === '2025-07-15')
    const labels = day1.items.map((i: any) => i.label)
    expect(labels).toContain('Reminder Scheduled')
    expect(labels).toContain('Reminder Completed')
    expect(labels).toContain('Reminder Sent')
    expect(labels).toContain('Promise Made')
    expect(labels).toContain('Delivered')
    // Read happened on 16 Jul (read_at = d2) → lives in the newest day
    const day2 = json.days.find((d: any) => d.date === '2025-07-16')
    expect(day2.items.map((i: any) => i.label)).toContain('Read')
    expect(json.total).toBeGreaterThanOrEqual(6)
  })
})
