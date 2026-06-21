import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock supabaseAdmin before importing anything that uses it
vi.mock('../../billzo/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}))

// Mock traceInvoice
vi.mock('./trace', () => ({
  traceInvoice: vi.fn(),
}))

import { generateRebuildPlan, executeRebuild, type FixAction } from './rebuild-cli'
import { traceInvoice } from './trace'
import { supabaseAdmin } from '../../billzo/supabase-admin'

describe('recovery:rebuild CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock: return empty invoice list
    vi.mocked(supabaseAdmin.from).mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        limit: vi.fn(() => ({
          range: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    }) as any)
  })

  it('should return empty plan when no invoices exist', async () => {
    const { plan, totalInvoices } = await generateRebuildPlan({
      tenantId: 'tenant_1',
      apply: false,
    })

    expect(plan).toHaveLength(0)
    expect(totalInvoices).toBe(0)
  })

  it('should generate fix plan for invoices with drift', async () => {
    vi.mocked(supabaseAdmin.from).mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({
          data: [{
            id: 'inv_1',
            invoice_number: 'INV-001',
            outstanding_amount: 5000,
            total: 10000,
            paid_amount: 5000,
            status: 'unpaid',
            customer_id: 'cust_1',
          }],
          error: null,
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    }) as any)

    vi.mocked(traceInvoice).mockResolvedValue({
      invoiceId: 'inv_1',
      tenantId: 'tenant_1',
      customerId: 'cust_1',
      invoiceNumber: 'INV-001',
      steps: [],
      currentState: {
        triggerOutstanding: 5000,
        reducerOutstanding: 3000,
        recoveryCaseOutstanding: null,
      },
      drift: 2000,
      driftDetected: true,
      summary: {
        totalEvents: 2,
        financialEvents: 2,
        invariantViolations: 0,
      },
    })

    const { plan, totalInvoices } = await generateRebuildPlan({
      tenantId: 'tenant_1',
      apply: false,
    })

    expect(plan).toHaveLength(1)
    expect(plan[0].field).toBe('outstanding_amount')
    expect(plan[0].oldValue).toBe(5000)
    expect(plan[0].newValue).toBe(3000)
    expect(plan[0].severity).toBe('critical')
    expect(totalInvoices).toBe(1)
  })

  it('should exclude invoices without drift from plan', async () => {
    vi.mocked(supabaseAdmin.from).mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({
          data: [
            {
              id: 'inv_1',
              invoice_number: 'INV-001',
              outstanding_amount: 3000,
              total: 10000,
              paid_amount: 7000,
              status: 'unpaid',
              customer_id: 'cust_1',
            },
            {
              id: 'inv_2',
              invoice_number: 'INV-002',
              outstanding_amount: 5000,
              total: 5000,
              paid_amount: 0,
              status: 'unpaid',
              customer_id: 'cust_2',
            },
          ],
          error: null,
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    }) as any)

    vi.mocked(traceInvoice)
      .mockResolvedValueOnce({
        invoiceId: 'inv_1',
        tenantId: 'tenant_1',
        customerId: 'cust_1',
        invoiceNumber: 'INV-001',
        steps: [],
        currentState: {
          triggerOutstanding: 3000,
          reducerOutstanding: 3000,
          recoveryCaseOutstanding: null,
        },
        drift: 0,
        driftDetected: false,
        summary: { totalEvents: 1, financialEvents: 1, invariantViolations: 0 },
      })
      .mockResolvedValueOnce({
        invoiceId: 'inv_2',
        tenantId: 'tenant_1',
        customerId: 'cust_2',
        invoiceNumber: 'INV-002',
        steps: [],
        currentState: {
          triggerOutstanding: 5000,
          reducerOutstanding: 4500,
          recoveryCaseOutstanding: null,
        },
        drift: 500,
        driftDetected: true,
        summary: { totalEvents: 1, financialEvents: 1, invariantViolations: 0 },
      })

    const { plan } = await generateRebuildPlan({
      tenantId: 'tenant_1',
      apply: false,
    })

    expect(plan).toHaveLength(1)
    expect(plan[0].invoiceId).toBe('inv_2')
  })

  it('should execute rebuild by updating invoices and writing audit log', async () => {
    const mockUpdate = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    }))

    const mockInsert = vi.fn(() => Promise.resolve({ error: null }))

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'invoices') {
        return { update: mockUpdate, insert: mockInsert } as any
      }
      return { insert: mockInsert } as any
    })

    const plan: FixAction[] = [
      {
        invoiceId: 'inv_1',
        invoiceNumber: 'INV-001',
        field: 'outstanding_amount',
        oldValue: 5000,
        newValue: 3000,
        reason: 'drift detected',
        severity: 'critical',
      },
    ]

    const result = await executeRebuild('tenant_1', plan)

    expect(result.invoicesFixed).toBe(1)
    expect(result.auditLogEntries).toBe(1)

    // Should update invoices table
    expect(mockUpdate).toHaveBeenCalledWith({ outstanding_amount: 3000 })
    expect(mockUpdate).toHaveBeenCalledTimes(1)

    // Should log to recovery_audit_log
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant_1',
        action: 'rebuild',
        invoice_id: 'inv_1',
        rebuild_field: 'outstanding_amount',
        rebuild_old_value: 5000,
        rebuild_new_value: 3000,
      }),
    )
  })

  it('should handle empty plan gracefully', async () => {
    const result = await executeRebuild('tenant_1', [])
    expect(result.invoicesFixed).toBe(0)
    expect(result.auditLogEntries).toBe(0)
  })

  it('should support single-invoice mode', async () => {
    vi.mocked(supabaseAdmin.from).mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({
            data: [{
              id: 'inv_1',
              invoice_number: 'INV-001',
              outstanding_amount: 5000,
              total: 10000,
              paid_amount: 5000,
              status: 'unpaid',
              customer_id: 'cust_1',
            }],
            error: null,
          })),
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    }) as any)

    vi.mocked(traceInvoice).mockResolvedValue({
      invoiceId: 'inv_1',
      tenantId: 'tenant_1',
      customerId: 'cust_1',
      invoiceNumber: 'INV-001',
      steps: [],
      currentState: {
        triggerOutstanding: 5000,
        reducerOutstanding: 3000,
        recoveryCaseOutstanding: null,
      },
      drift: 2000,
      driftDetected: true,
      summary: { totalEvents: 2, financialEvents: 2, invariantViolations: 0 },
    })

    const { plan } = await generateRebuildPlan({
      tenantId: 'tenant_1',
      apply: false,
      invoiceId: 'inv_1',
    })

    expect(plan).toHaveLength(1)
    expect(plan[0].invoiceId).toBe('inv_1')
  })
})
