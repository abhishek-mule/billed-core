import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeAction } from '../action-executor'
import { supabaseAdmin } from '../../billzo/supabase-admin'
import { sendWhatsAppMessage } from '../../../../lib/whatsapp-router'
import { writeOutboxEvent } from '../../billzo/outbox'

vi.mock('../../billzo/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

vi.mock('../../../../lib/whatsapp-router', () => ({
  sendWhatsAppMessage: vi.fn(),
}))

vi.mock('../../billzo/outbox', () => ({
  writeOutboxEvent: vi.fn().mockResolvedValue('evt_1'),
}))

vi.mock('../../../../lib/queue-logger', () => ({
  createQueueLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

interface Row {
  id: string
  tenant_id: string
  customer_id: string | null
  invoice_ids: string[]
  action_type: string
  template_name: string | null
  status: string
  scheduled_at: string | null
  attempt_count: number
  max_attempts: number
  phone?: string
}

function baseAction(overrides: Partial<Row> = {}): Row {
  return {
    id: 'act_1',
    tenant_id: 'tenant_1',
    customer_id: 'cust_1',
    invoice_ids: ['inv_1'],
    action_type: 'reminder',
    template_name: 'payment_reminder',
    status: 'processing',
    scheduled_at: new Date().toISOString(),
    attempt_count: 0,
    max_attempts: 3,
    ...overrides,
  }
}

// Table-aware chain: resolves per-table terminal data. `single` returns the
// table's single result; other query shapes resolve the list result.
function makeChains(config: Record<string, { single?: any; list?: any }>) {
  const from = vi.fn((table: string) => {
    const cfg = config[table] || {}
    const chain: any = {}
    Object.assign(chain, {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      gt: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      single: vi.fn().mockResolvedValue(cfg.single ?? { data: null, error: null }),
      update: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      // Awaiting the chain directly (no .single) resolves the list result.
      then: (resolve: any) => resolve(cfg.list ?? { data: null, error: null }),
    })
    return chain
  })
  ;(supabaseAdmin.from as any).mockImplementation(from)
  return from
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(sendWhatsAppMessage as any).mockResolvedValue({
    messageId: 'wamid_test_123',
    provider: 'meta',
    identity: { billzoMessageId: 'billzo_123' },
  })
})

describe('executeAction — full automation path (worker reminders queue)', () => {
  it('executes an action already marked processing (Phase 3 fix)', async () => {
    const action = baseAction({ status: 'processing' })
    makeChains({
      collection_actions: { single: { data: action, error: null } },
      invoices: {
        list: { data: [{ id: 'inv_1', customer_id: 'cust_1' }], error: null },
        single: { data: { id: 'inv_1', total: 5000, paid_amount: 0, status: 'unpaid', invoice_number: 'INV-1', due_at: new Date().toISOString() }, error: null },
      },
      customers: {
        single: { data: { id: 'cust_1', customer_name: 'Rahul', phone: '9876543210', automation_mode: 'full_auto' }, error: null },
      },
    })

    const result = await executeAction('act_1')

    expect(result.status).toBe('completed')
    expect((result as any).messageId).toBe('wamid_test_123')
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1)
    expect(writeOutboxEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'recovery.reminder.sent',
      entityId: 'inv_1',
      tenantId: 'tenant_1',
    }))
  })

  it('clears invoices.next_recovery_at on completion so derived metadata stays consistent', async () => {
    const action = baseAction({ status: 'processing' })
    const from = makeChains({
      collection_actions: { single: { data: action, error: null } },
      invoices: {
        list: { data: [{ id: 'inv_1', customer_id: 'cust_1' }], error: null },
        single: { data: { id: 'inv_1', total: 5000, paid_amount: 0, status: 'unpaid', invoice_number: 'INV-1', due_at: new Date().toISOString() }, error: null },
      },
      customers: {
        single: { data: { id: 'cust_1', customer_name: 'Rahul', phone: '9876543210', automation_mode: 'full_auto' }, error: null },
      },
    })

    const result = await executeAction('act_1')
    expect(result.status).toBe('completed')

    const invoiceChain = (supabaseAdmin.from as any).mock.results
      .map((r: any) => r.value)
      .filter((chain: any) => chain && chain.update)
    const cleared = invoiceChain.some((chain: any) =>
      (chain.update as any).mock.calls.some((c: any) => c[0] && c[0].next_recovery_at === null))
    expect(cleared).toBe(true)
  })

  it('accepts in_progress status too (scheduler path)', async () => {
    const action = baseAction({ status: 'in_progress' })
    makeChains({
      collection_actions: { single: { data: action, error: null } },
      invoices: {
        list: { data: [{ id: 'inv_1', customer_id: 'cust_1' }], error: null },
        single: { data: { id: 'inv_1', total: 5000, paid_amount: 0, status: 'unpaid', invoice_number: 'INV-1', due_at: new Date().toISOString() }, error: null },
      },
      customers: {
        single: { data: { id: 'cust_1', customer_name: 'Rahul', phone: '9876543210', automation_mode: 'full_auto' }, error: null },
      },
    })

    const result = await executeAction('act_1')
    expect(result.status).toBe('completed')
  })

  it('rejects already-completed actions', async () => {
    makeChains({
      collection_actions: { single: { data: baseAction({ status: 'completed' }), error: null } },
    })

    const result = await executeAction('act_1')
    expect(result).toEqual({ status: 'skipped', reason: 'action_status_completed' })
    expect(sendWhatsAppMessage).not.toHaveBeenCalled()
  })

  it('skips when all invoices are paid', async () => {
    makeChains({
      collection_actions: { single: { data: baseAction(), error: null } },
      invoices: { list: { data: [], error: null } },
    })

    const result = await executeAction('act_1')
    expect(result).toEqual({ status: 'skipped', reason: 'all_invoices_paid' })
    expect(sendWhatsAppMessage).not.toHaveBeenCalled()
  })

  it('skips muted customers', async () => {
    makeChains({
      collection_actions: { single: { data: baseAction(), error: null } },
      invoices: {
        list: { data: [{ id: 'inv_1', customer_id: 'cust_1' }], error: null },
      },
      customers: {
        single: { data: { id: 'cust_1', automation_mode: 'muted' }, error: null },
      },
    })

    const result = await executeAction('act_1')
    expect(result).toEqual({ status: 'skipped', reason: 'customer_muted' })
  })

  it('marks failed after exhausting retries', async () => {
    const action = baseAction({ attempt_count: 2, max_attempts: 3 })
    makeChains({
      collection_actions: { single: { data: action, error: null } },
      invoices: {
        list: { data: [{ id: 'inv_1', customer_id: 'cust_1' }], error: null },
        single: { data: { id: 'inv_1', total: 5000, paid_amount: 0, status: 'unpaid', invoice_number: 'INV-1', due_at: new Date().toISOString() }, error: null },
      },
      customers: {
        single: { data: { id: 'cust_1', customer_name: 'Rahul', phone: '9876543210', automation_mode: 'full_auto' }, error: null },
      },
    })
    ;(sendWhatsAppMessage as any).mockRejectedValue(new Error('meta 401'))

    const result = await executeAction('act_1')

    expect(result.status).toBe('failed')
    const updateCalls = (supabaseAdmin.from as any).mock.calls.filter((c: any) => c[0] === 'collection_actions')
    expect(updateCalls.length).toBeGreaterThan(0)
  })
})
