import { describe, it, expect, vi, beforeEach } from 'vitest'

// Supabase chain mock: per-table data, records inserts.
function makeMockSupabase(handlers: Record<string, { data: any; error: any }>) {
  const inserts: any[] = []
  const supabaseAdmin = {
    from: vi.fn((table: string) => {
      const result = handlers[table] ?? { data: null, error: null }
      const api: any = {
        data: result.data,
        error: result.error,
        single: () => ({ data: result.data, error: result.error }),
        maybeSingle: () => ({ data: result.data, error: result.error }),
        insert: vi.fn((row: any) => { inserts.push({ table, row }); api.data = [{ id: 'generated' }]; api.error = null; return api }),
        update: vi.fn(() => api),
        delete: vi.fn(() => api),
      }
      for (const m of ['select', 'eq', 'in', 'order', 'limit', 'gte', 'lte', 'contains', 'neq']) {
        api[m] = vi.fn(() => api)
      }
      return api
    }),
  }
  return { supabaseAdmin, inserts }
}

async function loadWithMock(handlers: Record<string, { data: any; error: any }>) {
  const mock = makeMockSupabase(handlers)
  vi.doMock('@/lib/billzo/supabase-admin', () => ({ supabaseAdmin: mock.supabaseAdmin }))
  const mod = await import('../planner')
  return { mod, mock }
}

describe('recovery planner', () => {
  beforeEach(() => vi.resetModules())

  it('resolvePolicy returns system Standard steps when tenant has no default', async () => {
    const { mod } = await loadWithMock({
      recovery_policies: { data: { id: 'sys_standard' }, error: null }, // tenant default lookup → null-ish
      recovery_policy_steps: {
        data: [
          { sequence: 1, trigger_type: 'DUE_DATE', offset_days: 0, action_type: 'reminder', template_name: 'invoice_due', channel: 'whatsapp' },
          { sequence: 2, trigger_type: 'DUE_DATE', offset_days: 3, action_type: 'reminder', template_name: 'payment_reminder', channel: 'whatsapp' },
        ],
        error: null,
      },
    })
    const policy = await mod.resolvePolicy('t1')
    expect(policy).not.toBeNull()
    expect(policy!.policyId).toBe('sys_standard')
    expect(policy!.steps).toHaveLength(2)
    expect(policy!.steps[1].offsetDays).toBe(3)
  })

  it('planRecoveryForInvoice inserts one action per DUE_DATE step', async () => {
    const { mod, mock } = await loadWithMock({
      recovery_policies: { data: { id: 'sys_standard' }, error: null },
      recovery_policy_steps: {
        data: [
          { sequence: 1, trigger_type: 'DUE_DATE', offset_days: 0, action_type: 'reminder', template_name: 'invoice_due', channel: 'whatsapp' },
          { sequence: 2, trigger_type: 'DUE_DATE', offset_days: 3, action_type: 'call', template_name: null, channel: 'phone' },
        ],
        error: null,
      },
      collection_actions: { data: [], error: null }, // no existing → plan
    })
    const res = await mod.planRecoveryForInvoice({
      tenantId: 't1',
      customerId: 'c1',
      invoiceIds: ['inv1'],
      reason: 'invoice_created',
    })
    expect(res.created).toBe(2)
    expect(res.policyId).toBe('sys_standard')
    expect(mock.inserts.filter((i: any) => i.table === 'collection_actions')).toHaveLength(2)
  })

  it('planRecoveryForInvoice is idempotent (skips when actions exist)', async () => {
    const { mod } = await loadWithMock({
      recovery_policies: { data: { id: 'sys_standard' }, error: null },
      recovery_policy_steps: {
        data: [{ sequence: 1, trigger_type: 'DUE_DATE', offset_days: 0, action_type: 'reminder', template_name: 'invoice_due', channel: 'whatsapp' }],
        error: null,
      },
      collection_actions: { data: [{ id: 'existing' }], error: null }, // already planned
    })
    const res = await mod.planRecoveryForInvoice({
      tenantId: 't1',
      customerId: 'c1',
      invoiceIds: ['inv1'],
      reason: 'invoice_created',
    })
    expect(res.created).toBe(0)
  })

  it('planPromiseFollowup creates a promise_followup action', async () => {
    const { mod, mock } = await loadWithMock({
      collection_actions: { data: [], error: null },
    })
    const res = await mod.planPromiseFollowup({
      tenantId: 't1',
      customerId: 'c1',
      invoiceIds: ['inv1'],
      promiseDate: new Date('2026-07-25T10:00:00Z'),
      reason: 'promise_made',
    })
    expect(res.created).toBe(1)
    const inserts = mock.inserts.filter((i: any) => i.table === 'collection_actions')
    expect(inserts).toHaveLength(1)
    expect(inserts[0].row.action_type).toBe('promise_followup')
    expect(inserts[0].row.trigger_type).toBe('PROMISE_DATE')
  })

  it('cancelFutureActions cancels scheduled actions for a paid invoice', async () => {
    const { mod, mock } = await loadWithMock({
      collection_actions: {
        data: [
          { id: 'a1', status: 'scheduled' },
          { id: 'a2', status: 'scheduled' },
        ],
        error: null,
      },
    })
    const cancelled = await mod.cancelFutureActions('inv1', 't1')
    expect(cancelled).toBe(2)
    // Two updates (cancel) + two audit inserts
    expect(mock.inserts.filter((i: any) => i.table === 'collection_action_events')).toHaveLength(2)
  })
})
