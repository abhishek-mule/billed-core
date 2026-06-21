import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock supabaseAdmin before importing anything that uses it
vi.mock('../../billzo/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
            single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          limit: vi.fn(() => ({
            range: vi.fn(() => Promise.resolve({ data: [], error: null })),
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
        order: vi.fn(() => ({
          limit: vi.fn(() => ({
            range: vi.fn(() => Promise.resolve({ data: [], error: null })),
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
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
    })),
  },
}))

// Mock traceInvoice
vi.mock('./trace', () => ({
  traceInvoice: vi.fn(),
}))

import { scanInvoices, writeAuditLog, AuditOptions } from './audit-cli'
import { traceInvoice } from './trace'
import type { TraceResult } from './types'

describe('recovery:audit CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return empty result when no invoices exist', async () => {
    const mockFrom = vi.mocked((await import('../../billzo/supabase-admin')).supabaseAdmin.from)
    // Return empty invoices
    mockFrom.mockImplementation((() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          limit: vi.fn(() => ({
            range: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
        order: vi.fn(() => ({
          limit: vi.fn(() => ({
            range: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
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
    })) as any)

    const result = await scanInvoices({ tenantId: 'tenant_1' })
    expect(result.drifts).toHaveLength(0)
    expect(result.progress.scanned).toBe(0)
  })

  it('should detect drifts from traced invoices', async () => {
    const mockFrom = vi.mocked((await import('../../billzo/supabase-admin')).supabaseAdmin.from)

    // Return one invoice with drift
    mockFrom.mockImplementation((() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({
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
        limit: vi.fn(() => ({
          range: vi.fn(() => Promise.resolve({
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
    })) as any)

    // Mock traceInvoice to return a drift result
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
    } satisfies TraceResult)

    const result = await scanInvoices({ tenantId: 'tenant_1' })
    expect(result.drifts).toHaveLength(1)
    expect(result.drifts[0].drift).toBe(2000)
    expect(result.drifts[0].severity).toBe('critical') // abs(2000) > 100
    expect(result.progress.driftsFound).toBe(1)
    expect(result.progress.criticalDrifts).toBe(1)
  })

  it('should classify small drifts as warning', async () => {
    const mockFrom = vi.mocked((await import('../../billzo/supabase-admin')).supabaseAdmin.from)

    mockFrom.mockImplementation((() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({
            data: [{
              id: 'inv_2',
              invoice_number: 'INV-002',
              outstanding_amount: 101,
              total: 100,
              paid_amount: 0,
              status: 'unpaid',
              customer_id: 'cust_1',
            }],
            error: null,
          })),
        })),
        limit: vi.fn(() => ({
          range: vi.fn(() => Promise.resolve({
            data: [{
              id: 'inv_2',
              invoice_number: 'INV-002',
              outstanding_amount: 101,
              total: 100,
              paid_amount: 0,
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
    })) as any)

    vi.mocked(traceInvoice).mockResolvedValue({
      invoiceId: 'inv_2',
      tenantId: 'tenant_1',
      customerId: 'cust_1',
      invoiceNumber: 'INV-002',
      steps: [],
      currentState: {
        triggerOutstanding: 101,
        reducerOutstanding: 100,
        recoveryCaseOutstanding: null,
      },
      drift: 1,
      driftDetected: true,
      summary: {
        totalEvents: 1,
        financialEvents: 1,
        invariantViolations: 0,
      },
    } satisfies TraceResult)

    const result = await scanInvoices({ tenantId: 'tenant_1' })
    expect(result.drifts).toHaveLength(1)
    expect(result.drifts[0].drift).toBe(1)
    expect(result.drifts[0].severity).toBe('warning') // abs(1) <= 100
    expect(result.progress.warningDrifts).toBe(1)
  })

  it('should classify invariant violations as critical', async () => {
    const mockFrom = vi.mocked((await import('../../billzo/supabase-admin')).supabaseAdmin.from)

    mockFrom.mockImplementation((() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({
              range: vi.fn(() => Promise.resolve({
                data: [{
                  id: 'inv_3',
                  invoice_number: 'INV-003',
                  outstanding_amount: 100,
                  total: 100,
                  paid_amount: 0,
                  status: 'unpaid',
                  customer_id: 'cust_1',
                }],
                error: null,
              })),
            })),
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
    })) as any)

    vi.mocked(traceInvoice).mockResolvedValue({
      invoiceId: 'inv_3',
      tenantId: 'tenant_1',
      customerId: 'cust_1',
      invoiceNumber: 'INV-003',
      steps: [],
      currentState: {
        triggerOutstanding: 100,
        reducerOutstanding: 100,
        recoveryCaseOutstanding: null,
      },
      drift: 0,
      driftDetected: false,
      summary: {
        totalEvents: 2,
        financialEvents: 2,
        invariantViolations: 1,
      },
    } satisfies TraceResult)

    const result = await scanInvoices({ tenantId: 'tenant_1', limit: 100 })
    expect(result.drifts).toHaveLength(0) // drift is 0, so no drift returned
  })

  it('should write drifts to audit log', async () => {
    const mockInsert = vi.fn(() => Promise.resolve({ error: null }))
    const mockFrom = vi.mocked((await import('../../billzo/supabase-admin')).supabaseAdmin.from)
    mockFrom.mockReturnValue({ insert: mockInsert } as any)

    const drifts = [{
      invoiceId: 'inv_1',
      invoiceNumber: 'INV-001',
      triggerOutstanding: 5000,
      reducerOutstanding: 3000,
      recoveryCaseOutstanding: null,
      drift: 2000,
      reason: 'drift detected',
      severity: 'critical' as const,
    }]

    await writeAuditLog('tenant_1', drifts, {
      scanned: 1,
      driftsFound: 1,
      criticalDrifts: 1,
      warningDrifts: 0,
      totalEvents: 2,
      totalInvariantsViolated: 0,
    })

    expect(mockInsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        tenant_id: 'tenant_1',
        action: 'audit_scan',
        invoice_id: 'inv_1',
        drift_detected: true,
      }),
    ]))
  })
})
