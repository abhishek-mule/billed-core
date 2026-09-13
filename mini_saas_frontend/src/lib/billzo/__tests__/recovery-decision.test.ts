import { describe, it, expect } from 'vitest'
import { buildRecoveryDecision, type DecisionRow } from '../recovery-decision'

function row(overrides: Partial<DecisionRow> = {}): DecisionRow {
  return {
    customerPhone: '+919000000000',
    invoices: [
      {
        id: 'inv-1',
        number: 'INV-0001',
        outstanding: 12000,
        dueDate: new Date(Date.now() - 10 * 86400000).toISOString(),
        status: 'issued',
        createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
      },
    ],
    actions: [],
    deliveryByAction: {},
    promises: [],
    replies: [],
    nextActionType: null,
    recoveryState: 'overdue',
    ...overrides,
  }
}

describe('buildRecoveryDecision — exhausted', () => {
  it('returns exhausted when the merchant escalated the case', () => {
    const decision = buildRecoveryDecision(row({ nextActionType: 'merchant_review' }))
    expect(decision.state).toBe('exhausted')
    expect(decision.headline).toBe('Handle manually')
    expect(decision.reason).toContain('stopped automated recovery')
  })

  it('does not classify disputed cases as exhausted', () => {
    // Disputed cases also derive nextActionType=merchant_review, but they are
    // guided by recovery_state, not the next-action marker.
    const decision = buildRecoveryDecision(row({ nextActionType: 'merchant_review', recoveryState: 'disputed' }))
    expect(decision.state).not.toBe('exhausted')
    expect(decision.state).toBe('remind')
  })

  it('leaves ordinary overdue cases on the automated path', () => {
    const decision = buildRecoveryDecision(row())
    expect(decision.state).toBe('remind')
  })

  it('prefers recovered when all invoices are paid, even if escalated', () => {
    const decision = buildRecoveryDecision(
      row({
        nextActionType: 'merchant_review',
        invoices: [
          {
            id: 'inv-1',
            number: 'INV-0001',
            outstanding: 0,
            dueDate: new Date(Date.now() - 10 * 86400000).toISOString(),
            status: 'paid',
            createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
          },
        ],
      }),
    )
    expect(decision.state).toBe('recovered')
  })
})