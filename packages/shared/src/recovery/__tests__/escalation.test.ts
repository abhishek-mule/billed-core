import { describe, it, expect } from 'vitest'
import {
  ESCALATION_STAGE_DAYS,
  escalationStageFromDays,
  isUrgentPlus,
  recoveryFormatRupees,
  escalationDecision,
  buildEffortSummary,
  SETTLEMENT_OFFER_KINDS,
  validateSettlementOffer,
  allowsEscalationTransition,
  ESCALATION_STATUSES,
  classifyCommunicationFidelity,
  buildPackEvidence,
  type EscalationDecisionInput,
} from '../escalation'

const urgentInput: EscalationDecisionInput = {
  overdueDays: 63,
  outstanding: 84_000,
  invoiceCount: 4,
  brokenPromises: 3,
  ignoredReminders: 4,
  unansweredCalls: 2,
  hasActiveArrangement: false,
}

describe('escalation stage scale', () => {
  it('mirrors the collection-risk stage bands', () => {
    expect(ESCALATION_STAGE_DAYS).toEqual({ monitor: 7, attention: 15, urgent: 30 })
    expect(escalationStageFromDays(0)).toBe('healthy')
    expect(escalationStageFromDays(-2)).toBe('healthy')
    expect(escalationStageFromDays(7)).toBe('monitor')
    expect(escalationStageFromDays(15)).toBe('attention')
    expect(escalationStageFromDays(16)).toBe('urgent')
    expect(escalationStageFromDays(30)).toBe('urgent')
    expect(escalationStageFromDays(31)).toBe('critical')
  })

  it('Urgent+ starts at 16 days overdue', () => {
    expect(isUrgentPlus('urgent')).toBe(true)
    expect(isUrgentPlus('critical')).toBe(true)
    expect(isUrgentPlus('attention')).toBe(false)
    expect(isUrgentPlus('healthy')).toBe(false)
  })
})

describe('rupee formatting', () => {
  it('formats INR with Indian grouping, deterministic', () => {
    expect(recoveryFormatRupees(84000)).toBe('₹84,000')
    expect(recoveryFormatRupees(4_800_000)).toBe('₹48,00,000')
    expect(recoveryFormatRupees(500)).toBe('₹500')
    expect(recoveryFormatRupees(0)).toBe('₹0')
  })
})

describe('escalation decision — basis (facts only, no score leak)', () => {
  it('recommends only at Urgent+ with a negative relationship fact', () => {
    const d = escalationDecision(urgentInput)
    expect(d.recommended).toBe(true)
  })

  it('does NOT recommend when below Urgent even with negative facts', () => {
    const d = escalationDecision({ ...urgentInput, overdueDays: 12 })
    expect(d.recommended).toBe(false)
  })

  it('does NOT recommend at Urgent+ with no negative relationship fact', () => {
    const d = escalationDecision({
      ...urgentInput,
      brokenPromises: 0,
      ignoredReminders: 1, // requires >= 2
      unansweredCalls: 0,
    })
    expect(d.recommended).toBe(false)
  })

  it('does NOT recommend for a single ignored reminder regardless of stage', () => {
    expect(
      escalationDecision({ ...urgentInput, brokenPromises: 0, ignoredReminders: 1, unansweredCalls: 0 }).recommended,
    ).toBe(false)
  })

  it('basis bullets are verifiable ledger facts, never a score', () => {
    const d = escalationDecision(urgentInput)
    expect(d.basis.map(b => b.fact)).toEqual([
      '₹84,000 outstanding across 4 invoices',
      '63 days overdue',
      '3 payment promises broken',
      '4 reminders delivered/read without resolution',
      '2 calls unanswered',
      'No active payment arrangement',
    ])
  })

  it('omits no-arrangement bullet when a live arrangement exists', () => {
    const d = escalationDecision({ ...urgentInput, hasActiveArrangement: true })
    expect(d.basis.some(b => b.kind === 'no_arrangement')).toBe(false)
  })

  it('singularises counts correctly', () => {
    const d = escalationDecision({ ...urgentInput, brokenPromises: 1, ignoredReminders: 1, unansweredCalls: 0 })
    expect(d.basis).toContainEqual({ kind: 'broken_promise', fact: '1 payment promise broken' })
    expect(d.basis).toContainEqual({ kind: 'ignored_reminder', fact: '1 reminder delivered/read without resolution' })
  })

  it('grade exists for ordering but is independent of basis content', () => {
    const d = escalationDecision(urgentInput)
    expect(typeof d.grade).toBe('number')
    // grade must exist even when basis has only a single fact.
    const sparse = escalationDecision({ ...urgentInput, overdueDays: 16, outstanding: 0, invoiceCount: 0 })
    expect(sparse.basis.length).toBeGreaterThanOrEqual(1)
    expect(sparse.grade).toBeGreaterThan(0)
    // deterministic
    expect(escalationDecision(urgentInput).grade).toBe(escalationDecision(urgentInput).grade)
  })
})

describe('recovery effort summary', () => {
  it('aggregates per-channel counts and the effort window', () => {
    const summary = buildEffortSummary(
      [
        { channel: 'whatsapp', occurredAt: '2026-08-01T10:00:00Z' },
        { channel: 'whatsapp', occurredAt: '2026-08-08T10:00:00Z' },
        { channel: 'calls', occurredAt: '2026-09-01T10:00:00Z' },
      ],
      { start: '2026-08-01T10:00:00Z', end: '2026-09-17T10:00:00Z' },
    )
    expect(summary.attempts).toBe(3)
    expect(summary.channels.whatsapp).toBe(2)
    expect(summary.channels.calls).toBe(1)
    expect(summary.channels.followups).toBe(0)
    expect(summary.channels.promises).toBe(0)
    expect(summary.channels.payments).toBe(0)
    expect(summary.days).toBe(47)
    expect(summary.result).toBe('No successful payment or reliable commitment.')
  })

  it('never reports zero days of effort', () => {
    const s = buildEffortSummary([{ channel: 'promises', occurredAt: '2026-09-17T10:00:00Z' }], {
      start: '2026-09-17T10:00:00Z',
      end: '2026-09-17T10:00:00Z',
    })
    expect(s.days).toBe(1)
    expect(s.channels.promises).toBe(1)
  })

  it('a payment makes the result deterministic and positive', () => {
    const s = buildEffortSummary(
      [{ channel: 'payments', occurredAt: '2026-09-10T10:00:00Z' }],
      { start: '2026-08-01T00:00:00Z', end: '2026-09-17T00:00:00Z' },
    )
    expect(s.result).toBe('Payment received')
  })
})

describe('settlement offer validation', () => {
  it('ships the four published offer kinds', () => {
    expect(SETTLEMENT_OFFER_KINDS).toEqual(['full', 'partial', 'plan', 'revised_promise_date'])
  })

  it('rejects unknown/empty offers', () => {
    expect(validateSettlementOffer(null).valid).toBe(false)
    expect(validateSettlementOffer({}).valid).toBe(false)
    expect(validateSettlementOffer({ type: 'demand_letter' }).valid).toBe(false)
  })

  it('partial requires a positive amount', () => {
    expect(validateSettlementOffer({ type: 'partial' }).valid).toBe(false)
    expect(validateSettlementOffer({ type: 'partial', amount: 0 }).valid).toBe(false)
    expect(validateSettlementOffer({ type: 'partial', amount: 25_000 }).valid).toBe(true)
  })

  it('plan requires a positive amount AND a schedule', () => {
    expect(validateSettlementOffer({ type: 'plan', amount: 84_000 }).valid).toBe(false)
    expect(validateSettlementOffer({ type: 'plan', schedule: '3 monthly instalments' }).valid).toBe(false)
    expect(
      validateSettlementOffer({ type: 'plan', amount: 84_000, schedule: '3 monthly instalments' }).valid,
    ).toBe(true)
  })

  it('revised_promise_date requires a dueBy ISO date', () => {
    expect(validateSettlementOffer({ type: 'revised_promise_date' }).valid).toBe(false)
    expect(validateSettlementOffer({ type: 'revised_promise_date', dueBy: 'not-a-date' }).valid).toBe(false)
    expect(validateSettlementOffer({ type: 'revised_promise_date', dueBy: '2026-10-15' }).valid).toBe(true)
  })

  it('rejects negative amounts on every kind', () => {
    expect(validateSettlementOffer({ type: 'full', amount: -1 }).valid).toBe(false)
    expect(validateSettlementOffer({ type: 'partial', amount: -1 }).valid).toBe(false)
    expect(validateSettlementOffer({ type: 'plan', amount: -1, schedule: 'x' }).valid).toBe(false)
  })
})

describe('escalation lifecycle', () => {
  it('covers the spec cycle assessed → recommended → prepared → notified → settled', () => {
    expect(allowsEscalationTransition('assessed', 'recommended')).toBe(true)
    expect(allowsEscalationTransition('recommended', 'prepared')).toBe(true)
    expect(allowsEscalationTransition('prepared', 'notified')).toBe(true)
    expect(allowsEscalationTransition('notified', 'settled')).toBe(true)
  })

  it('settled and cancelled are terminal (no outbound edges)', () => {
    for (const from of ['settled', 'cancelled'] as const) {
      for (const to of ESCALATION_STATUSES) {
        expect(allowsEscalationTransition(from, to)).toBe(false)
      }
    }
  })

  it('skipping stages is rejected', () => {
    expect(allowsEscalationTransition('assessed', 'notified')).toBe(false)
    expect(allowsEscalationTransition('recommended', 'notified')).toBe(false)
    expect(allowsEscalationTransition('notified', 'prepared')).toBe(false)
  })

  it('cancellation is always open from a running state', () => {
    expect(allowsEscalationTransition('assessed', 'cancelled')).toBe(true)
    expect(allowsEscalationTransition('recommended', 'cancelled')).toBe(true)
    expect(allowsEscalationTransition('prepared', 'cancelled')).toBe(true)
    expect(allowsEscalationTransition('notified', 'cancelled')).toBe(true)
  })

  it('a merchant can settle directly from recommended (money-first path)', () => {
    expect(allowsEscalationTransition('assessed', 'settled')).toBe(true)
    expect(allowsEscalationTransition('recommended', 'settled')).toBe(true)
  })
})

describe('no-causal-evidence invariant — fidelity markers', () => {
  it('classifies per the 093 backfill reality', () => {
    expect(
      classifyCommunicationFidelity({ attributedCustomerId: 'cust1', hasActionId: true, source: 'whatsapp' }),
    ).toBe('verified')
    expect(
      classifyCommunicationFidelity({ attributedCustomerId: null, hasActionId: false, source: 'whatsapp' }),
    ).toBe('unknown_no_action_id')
    expect(
      classifyCommunicationFidelity({ attributedCustomerId: null, hasActionId: true, source: 'whatsapp' }),
    ).toBe('provider')
  })

  it('a pack built on an unverified event renders Unknown and NEVER asserts attribution', () => {
    const rows = buildPackEvidence(
      [
        {
          kind: 'reminder_sent',
          summary: 'Reminder delivered',
          occurredAt: '2026-08-14T10:00:00Z',
          sourceId: null,
          attributedCustomerId: null, // 093 backfill outcome: no billzo_message_id stored
          hasActionId: false,
          source: 'whatsapp',
        },
      ],
      { name: 'ABC Traders', phone: '+919000000000' },
    )
    expect(rows[0].fidelity).toBe('unknown_no_action_id')
    // The invariant: no customer phone/name may be attached to an unverified row.
    expect(rows[0].customerPhone).toBeNull()
    expect(rows[0].customerName).toBeNull()
    // And the row still renders — the pack records it as attribution-unknown.
    expect(rows[0].summary).toBe('Reminder delivered')
  })

  it('attaches customer contact ONLY to verified rows', () => {
    const rows = buildPackEvidence(
      [
        {
          kind: 'reminder_sent',
          summary: 'Reminder read',
          occurredAt: '2026-08-14T10:00:00Z',
          sourceId: 'col-action-1',
          attributedCustomerId: 'cust1',
          hasActionId: true,
          source: 'whatsapp',
        },
      ],
      { name: 'ABC Traders', phone: '+919000000000' },
    )
    expect(rows[0].fidelity).toBe('verified')
    expect(rows[0].customerName).toBe('ABC Traders')
    expect(rows[0].customerPhone).toBe('+919000000000')
  })

  it('provider events with an action id but no identity stay provider-tagged', () => {
    const rows = buildPackEvidence([
      {
        kind: 'payment_link_opened',
        summary: 'Payment link opened',
        occurredAt: '2026-08-20T10:00:00Z',
        sourceId: 'action-9',
        attributedCustomerId: null,
        hasActionId: true,
        source: 'provider',
      },
    ])
    expect(rows[0].fidelity).toBe('provider')
    expect(rows[0].customerPhone).toBeNull()
  })
})