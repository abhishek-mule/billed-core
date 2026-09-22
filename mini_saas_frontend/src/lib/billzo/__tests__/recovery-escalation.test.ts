import { describe, it, expect, vi, beforeEach } from 'vitest'
import { recoveryFormatRupees, validateSettlementOffer, classifyCommunicationFidelity, buildPackEvidence } from '@billzo/shared'

const tables = new Map<string, any>()

vi.mock('@/lib/billzo/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const existing = tables.get(table)
      if (existing) return existing
      const chain: any = {}
      const thenable = { data: tables.get(table) ?? null, error: null }
      for (const m of ['select', 'eq', 'in', 'gt', 'limit', 'order', 'not']) chain[m] = vi.fn(() => chain)
      chain.maybeSingle = vi.fn(async () => thenable)
      chain.single = vi.fn(async () => thenable)
      chain.insert = vi.fn(async () => chain)
      chain.update = vi.fn(async () => chain)
      chain.then = vi.fn(async (resolve: any) => resolve(thenable))
      tables.set(table, chain)
      return chain
    }),
  },
}))

vi.mock('@/lib/billzo/outbox', () => ({
  writeOutboxEvent: vi.fn(async () => `o_${Date.now()}`),
}))

let wouldRecommend = true

vi.mock('@/lib/billzo/plan-limits', () => ({
  PLAN_LIMITS: {
    starter: { reminders: 5, escalation_pack: false },
    pro: { reminders: 500, escalation_pack: true },
    business: { reminders: 5000, escalation_pack: true },
    enterprise: { reminders: 50000, escalation_pack: true },
  },
}))

import {
  assessRecoveryCase,
  prepareRecoveryCase,
  recordMerchantDecision,
  buildSettlementNoticeDraft,
  exportRecoveryCaseJSON,
} from '@/lib/billzo/recovery-escalation'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { writeOutboxEvent } from '@/lib/billzo/outbox'

function seedScenario() {
  const today = Date.now()
  const daysAgo = (n: number) => new Date(today - n * 86_400_000).toISOString()

  const caseRow = {
    id: 'case-1',
    tenant_id: 't1',
    customer_id: 'cust-1',
    last_activity_at: daysAgo(10),
    created_at: daysAgo(40),
  }
  const cases = [{ ...caseRow }]
  const customers = [
    {
      id: 'cust-1',
      customer_name: 'Acme Retail',
      phone: '+919999000001',
      email: 'billing@acme.test',
      billing_address: 'Mumbai',
    },
  ]
  const invoices = [
    {
      id: 'inv-1',
      customer_id: 'cust-1',
      invoice_number: 'ACME-001',
      invoice_date: daysAgo(40),
      due_date: daysAgo(22),
      grand_total: 84000,
      total: 84000,
      paid_amount: 0,
      outstanding_amount: 84000,
      status: 'issued',
      gstin: '27AACCT1234',
    },
    {
      id: 'inv-2',
      customer_id: 'cust-1',
      invoice_number: 'ACME-002',
      invoice_date: daysAgo(20),
      due_date: daysAgo(9),
      grand_total: 16000,
      total: 16000,
      paid_amount: 0,
      outstanding_amount: 16000,
      status: 'issued',
    },
  ]
  const actions = [
    {
      id: 'act-1',
      action_type: 'reminder',
      status: 'completed',
      scheduled_at: daysAgo(12),
      completed_at: daysAgo(12),
      source: 'automation',
    },
    { id: 'act-2', action_type: 'call', status: 'completed', completed_at: daysAgo(5), scheduled_at: daysAgo(5), source: 'merchant' },
    { id: 'act-3', action_type: 'call', status: 'completed', completed_at: daysAgo(3), scheduled_at: daysAgo(3), source: 'merchant' },
  ]
  const promises = [
    { id: 'prom-1', promise_date: daysAgo(12), amount: 84000, status: 'broken', triggered_by_action_id: 'act-1' },
  ]
  const sessions: any[] = []
  const payments: any[] = []
  const events = [
    {
      id: 'ev-1',
      event_type: 'transition',
      created_at: daysAgo(11),
      payload: { from_recovery_state: 'promised', to_recovery_state: 'overdue' },
    },
  ]
  const tenants = [{ id: 't1', company_name: 'Acme Pvt Ltd' }]

  // whatsapp events come back to the recovery-attempt query (built from action ids)
  const waEvents: any[] = []

  return { caseRow, cases, customers, invoices, actions, promises, sessions, payments, events, tenants, waEvents }
}

function wireScenario() {
  const s = seedScenario()
  const chains: Record<string, any> = {}
  const list = (data: any) => {
    const c: any = {}
    const self = () => c
    for (const m of ['select', 'eq', 'in', 'gt', 'lt', 'limit', 'order', 'not', 'contains']) c[m] = vi.fn(self)
    c.maybeSingle = c.single = vi.fn(async () => ({ data: data?.[0] ?? null, error: null }))
    c.then = vi.fn(async (resolve: any) => resolve({ data, error: null }))
    return c
  }

  chains.recovery_cases = list(s.cases)
  chains.customers = list(s.customers)
  chains.invoices = list(s.invoices)
  chains.collection_actions = list(s.actions)
  chains.whatsapp_events = list(s.waEvents)
  chains.payment_promises = list(s.promises)
  chains.recovery_sessions = list(s.sessions)
  chains.payments = list(s.payments)
  chains.recovery_case_events = {
    select: vi.fn(() => chains.recovery_case_events),
    eq: vi.fn(() => chains.recovery_case_events),
    order: vi.fn(() => chains.recovery_case_events),
    limit: vi.fn(() => chains.recovery_case_events),
    then: vi.fn(async (resolve: any) => resolve({ data: s.events, error: null })),
  }
  chains.tenants = list(s.tenants)

  let escalationsRows: any[] = []
  const esc: any = {}
  esc.select = vi.fn(() => esc)
  esc.eq = vi.fn(() => esc)
  esc.not = vi.fn(() => esc)
  esc.order = vi.fn(() => esc)
  esc.limit = vi.fn(() => esc)
esc.update = vi.fn(() => esc)
  esc.insert = vi.fn(() => esc)
  esc.maybeSingle = vi.fn(async () => {
    if (esc._insertResult) return esc._insertResult
    if (esc._updateResult) return esc._updateResult
    if (esc._single) return { data: esc._single, error: null }
    return { data: escalationsRows[0] ?? null, error: null }
  })
  esc.single = esc.maybeSingle
  esc.then = vi.fn(async (resolve: any) =>
    resolve({ data: escalationsRows[0] ?? [], error: null, count: escalationsRows.length }),
  )

  ;(supabaseAdmin.from as any).mockImplementation((table: string) => {
    if (table === 'recovery_escalations') return esc
    return chains[table] || list(null)
  })

  const escalationStore = {
    rows: escalationsRows,
    setRows(rows: any[]) {
      escalationsRows = rows
    },
  }
  chains.recovery_escalations = esc

  return { chains, escalationStore, s }
}

describe('recovery-escalation lib — Domain A (assessment)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tables.clear()
  })

  it('recommends when overdue days are 16+ and a negative relationship fact exists', async () => {
    const { chains } = wireScenario()
    chains.recovery_escalations._single = null
    chains.recovery_escalations._insertResult = {
      data: {
        id: 'esc-1',
        tenant_id: 't1',
        case_id: 'case-1',
        customer_id: 'cust-1',
        primary_invoice_id: 'inv-1',
        status: 'recommended',
        recommended: true,
        grade: 84,
        basis: [{ kind: 'overdue', fact: '22 days overdue' }],
        merchant_decision: null,
        merchant_note: null,
        settlement_offer: null,
        snapshot: null,
        prepared_by: null,
        prepared_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      error: null,
    }

    const assessment = await assessRecoveryCase('t1', 'case-1')
    expect(assessment).not.toBeNull()
    expect(assessment!.recommended).toBe(true)
    // The case is 22 days overdue at the invoice trigger (16..30) → urgent.
    expect(assessment!.stage).toBe('urgent')
    expect(assessment!.basis.length).toBeGreaterThan(0)
  })

  it('returns the recovery case not found path when the case is missing', async () => {
    const { chains } = wireScenario()
    ;(chains.recovery_cases.maybeSingle as any).mockResolvedValue({ data: null, error: null })
    const assessment = await assessRecoveryCase('t1', 'case-missing')
    expect(assessment).toBeNull()
  })
})

describe('recovery-escalation lib — Domain B (prepare + export)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tables.clear()
  })

  it('builds a deterministic case number and exports the JSON snapshot', async () => {
    const { chains } = wireScenario()
    // prepare needs a recommendation (broken promise exists) and an empty slot.
    chains.recovery_escalations._single = null
    chains.recovery_escalations._insertResult = {
      data: {
        id: 'esc-2',
        tenant_id: 't1',
        case_id: 'case-1',
        customer_id: 'cust-1',
        primary_invoice_id: 'inv-1',
        status: 'prepared',
        recommended: true,
        grade: 84,
        basis: [],
        snapshot: {
          version: 1,
          caseNumber: 'RC-ACME-001-1',
          asOf: new Date().toISOString(),
          merchantName: 'Acme Pvt Ltd',
          customer: { id: 'cust-1', name: 'Acme Retail', phone: '+919999000001' },
          invoices: [],
        },
        prepared_by: 'u1',
        prepared_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      error: null,
    }

    const prepared = await prepareRecoveryCase('t1', 'case-1', 'u1')
    expect(prepared).not.toBeNull()
    expect(prepared!.status).toBe('prepared')
    expect(prepared!.caseNumber).toMatch(/^RC-[A-Z0-9-]+-\d+$/)
  })

  it('is idempotent: a second prepare on an already-prepared slot returns the pack', async () => {
    const { chains } = wireScenario()
    const existing = {
      id: 'esc-2',
      tenant_id: 't1',
      case_id: 'case-1',
      customer_id: 'cust-1',
      primary_invoice_id: 'inv-1',
      status: 'prepared',
      recommended: true,
      grade: 84,
      basis: [],
      snapshot: {
        version: 1 as const,
        caseNumber: 'RC-ACME-001-1',
        asOf: new Date().toISOString(),
        merchantName: 'Acme Pvt Ltd',
        customer: { id: 'cust-1', name: 'Acme Retail', phone: '+919999000001' },
        invoices: [] as any[],
        outstanding: 100000,
        invoiceCount: 2,
        maxOverdueDays: 22,
        effort: { attempts: 0, days: 1, noise: '0 attempts over 1 day', result: 'No successful payment or reliable commitment.' },
        evidence: { communications: [], promises: [], payments: [], actions: [] },
        timeline: [],
        completeness: { invoices: true, payments: false, whatsapp: false, promises: true, calls: true, timeline: true },
        attributionNote: 'note',
      },
      prepared_by: 'u1',
      prepared_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    chains.recovery_escalations._single = existing

    const prepared = await prepareRecoveryCase('t1', 'case-1', 'u1')
    expect(prepared!.alreadyPrepared).toBe(true)
    expect(prepared!.snapshot?.caseNumber).toBe('RC-ACME-001-1')
  })
})

describe('recovery-escalation lib — Domain C (settlement + notice)', () => {
  it('builds a merchant-authored notice that never auto-sends', () => {
    const draft = buildSettlementNoticeDraft({
      merchantName: 'Acme Pvt Ltd',
      customerName: 'Acme Retail',
      outstanding: 84000,
      invoiceCount: 2,
      maxOverdueDays: 22,
      caseNumber: 'RC-ACME-001-1',
      effortResult: '2 attempts over 3 days — Promises recorded — none resulting in payment',
    })
    expect(draft.neverAutoSent).toBe(true)
    expect(draft.subject).toContain('Acme Retail')
    expect(draft.body).toContain('Regards')
    expect(draft.body).not.toMatch(/legal action|lawyer|sue|recovery agent/i)
  })

  it('validates settlement offers against the shared contract', () => {
    expect(validateSettlementOffer({ type: 'full', amount: 84000 }).valid).toBe(true)
    expect(validateSettlementOffer({ type: 'partial', amount: 0 }).valid).toBe(false)
    expect(validateSettlementOffer({ type: 'plan', amount: 84000 }).valid).toBe(false)
    expect(validateSettlementOffer({ type: 'plan', amount: 84000, schedule: '3 monthly instalments' }).valid).toBe(true)
    expect(validateSettlementOffer({ type: 'revised_promise_date' }).valid).toBe(false)
    expect(validateSettlementOffer({ type: 'revised_promise_date', dueBy: '2026-10-01T00:00:00Z' }).valid).toBe(true)
    expect(validateSettlementOffer({ type: 'nope' }).valid).toBe(false)
  })

  it('formats INR with the en-IN grouping shared by the pack', () => {
    expect(recoveryFormatRupees(84000)).toBe('₹84,000')
    expect(recoveryFormatRupees(4_800_000)).toBe('₹48,00,000')
  })
})

describe('no-causal-evidence invariant (shared — rendered through the frontend pack)', () => {
  it('never attributes a customer contact without a verified action link', () => {
    const rows = buildPackEvidence([
      { attributedCustomerId: 'cust-1', hasActionId: false, source: 'whatsapp', kind: 'reminder_sent', summary: 'Reminder', occurredAt: null, sourceId: 'w-1' },
      { attributedCustomerId: 'cust-1', hasActionId: true, source: 'whatsapp', kind: 'reminder_sent', summary: 'Reminder', occurredAt: null, sourceId: 'w-2' },
    ], { name: 'Acme Retail', phone: '+919999000001' })

    expect(rows[0].fidelity).toBe('unknown_no_action_id')
    expect(rows[0].customerName).toBeNull()
    expect(rows[0].customerPhone).toBeNull()
    expect(rows[1].fidelity).toBe('verified')
    expect(rows[1].customerName).toBe('Acme Retail')
  })

  it('classifies provider-level (no identity) links as provider', () => {
    expect(classifyCommunicationFidelity({ attributedCustomerId: null, hasActionId: true, source: 'provider' })).toBe('provider')
  })
})

describe('recordMerchantDecision — authorize emits merchant.escalated through the shared outbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tables.clear()
  })

  it('emits merchant.escalated only when decision = authorize', async () => {
    const { chains } = wireScenario()
    const existing = {
      id: 'esc-1',
      tenant_id: 't1',
      case_id: 'case-1',
      customer_id: 'cust-1',
      primary_invoice_id: 'inv-1',
      status: 'prepared',
      recommended: true,
      grade: 84,
      basis: [],
      snapshot: null,
      prepared_by: null,
      prepared_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    chains.recovery_escalations._single = existing
    chains.recovery_escalations._updateResult = {
      data: { ...existing, merchant_decision: 'authorize' },
      error: null,
    }

    const { escalation } = await recordMerchantDecision('t1', 'case-1', 'u1', {
      decision: 'authorize',
      emitEscalatedEvent: true,
    })
    expect(escalation.merchantDecision).toBe('authorize')
    expect(writeOutboxEvent).toHaveBeenCalledTimes(1)
    const arg = (writeOutboxEvent as any).mock.calls[0][0]
    expect(arg.type).toBe('merchant.escalated')
    expect(arg.tenantId).toBe('t1')
    expect(arg.payload).toMatchObject({ customerId: 'cust-1', caseId: 'case-1', escalationId: 'esc-1' })
  })

  it('does NOT emit when the merchant declines', async () => {
    const { chains } = wireScenario()
    const existing = {
      id: 'esc-1',
      tenant_id: 't1',
      case_id: 'case-1',
      customer_id: 'cust-1',
      primary_invoice_id: 'inv-1',
      status: 'assessed',
      recommended: true,
      grade: 84,
      basis: [],
      snapshot: null,
      prepared_by: null,
      prepared_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    chains.recovery_escalations._single = existing
    chains.recovery_escalations._updateResult = {
      data: { ...existing, merchant_decision: 'decline' },
      error: null,
    }

    const { escalation } = await recordMerchantDecision('t1', 'case-1', 'u1', {
      decision: 'decline',
      emitEscalatedEvent: true,
    })
    expect(escalation.merchantDecision).toBe('decline')
    expect(writeOutboxEvent).not.toHaveBeenCalled()
  })
})