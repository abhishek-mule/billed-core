import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../billzo/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
            single: () => Promise.resolve({ data: null, error: null }),
          }),
          order: () => Promise.resolve({ data: [], error: null }),
          single: () => Promise.resolve({ data: null, error: null }),
        }),
        order: () => Promise.resolve({ data: [], error: null }),
        single: () => Promise.resolve({ data: null, error: null }),
      }),
      insert: () => Promise.resolve({ error: null }),
      upsert: () => Promise.resolve({ error: null }),
    }),
  },
}));

import { traceInvoice } from './trace';
import * as eventLoader from './event-loader';

const mockInvoiceEvents = [
  {
    type: 'invoice.created' as const,
    id: 'evt_1',
    occurredAt: '2026-06-01T10:00:00Z',
    invoiceId: 'inv_1',
    tenantId: 'tenant_1',
    customerId: 'cust_1',
    amount: 5000,
    status: 'unpaid',
    rawPayload: { amount: 5000, status: 'unpaid' },
  },
  {
    type: 'payment.recorded' as const,
    id: 'evt_2',
    occurredAt: '2026-06-05T14:00:00Z',
    invoiceId: 'inv_1',
    tenantId: 'tenant_1',
    customerId: 'cust_1',
    amount: 2000,
    rawPayload: { amount: 2000 },
  },
];

const mockCurrentState = {
  triggerOutstanding: 3000,
  reducerOutstanding: 0,
  recoveryCaseOutstanding: null,
  invoiceData: {
    outstanding_amount: 3000,
    total: 5000,
    paid_amount: 2000,
    status: 'unpaid',
    invoice_number: 'INV-001',
    customer_id: 'cust_1' as string | undefined,
    tenant_id: 'tenant_1' as string | undefined,
  },
};

describe('recovery:trace', () => {
  beforeEach(() => {
    vi.spyOn(eventLoader, 'loadInvoiceEvents').mockResolvedValue(mockInvoiceEvents);
    vi.spyOn(eventLoader, 'loadInvoiceCurrentState').mockResolvedValue(mockCurrentState);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should trace invoice correctly', async () => {
    const result = await traceInvoice('inv_1', 'tenant_1');

    expect(result.invoiceId).toBe('inv_1');
    expect(result.tenantId).toBe('tenant_1');
    expect(result.customerId).toBe('cust_1');
    expect(result.invoiceNumber).toBe('INV-001');
    expect(result.steps).toHaveLength(2);
    expect(result.summary.totalEvents).toBe(2);
    expect(result.summary.invariantViolations).toBe(0);
    expect(result.drift).toBe(0);
    expect(result.driftDetected).toBe(false);

    expect(result.steps[0].eventType).toBe('invoice.created');
    expect(result.steps[0].before.outstanding).toBe(0);
    expect(result.steps[0].after.outstanding).toBe(5000);
    expect(result.steps[0].invariant.passed).toBe(true);

    expect(result.steps[1].eventType).toBe('payment.recorded');
    expect(result.steps[1].before.outstanding).toBe(5000);
    expect(result.steps[1].after.outstanding).toBe(3000);
    expect(result.steps[1].invariant.passed).toBe(true);

    expect(result.currentState.triggerOutstanding).toBe(3000);
    expect(result.currentState.reducerOutstanding).toBe(3000);
    expect(result.currentState.recoveryCaseOutstanding).toBeNull();
  });

  it('should detect invariant violation for overpayment', async () => {
    const overpaymentEvents = [
      { ...mockInvoiceEvents[0] },
      {
        ...mockInvoiceEvents[1],
        amount: 10000,
        rawPayload: { amount: 10000 },
      },
    ];
    vi.spyOn(eventLoader, 'loadInvoiceEvents').mockResolvedValue(overpaymentEvents);

    const result = await traceInvoice('inv_1', 'tenant_1');

    expect(result.summary.invariantViolations).toBe(1);
  });

  it('should detect drift between trigger and reducer', async () => {
    vi.spyOn(eventLoader, 'loadInvoiceCurrentState').mockResolvedValue({
      ...mockCurrentState,
      triggerOutstanding: 5000,
      invoiceData: {
        ...mockCurrentState.invoiceData,
        outstanding_amount: 5000,
      },
    });

    const result = await traceInvoice('inv_1', 'tenant_1');

    expect(result.drift).toBe(2000);
    expect(result.driftDetected).toBe(true);
  });
});