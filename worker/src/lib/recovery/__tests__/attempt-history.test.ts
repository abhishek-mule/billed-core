import { describe, it, expect } from 'vitest'
import { buildAttemptHistory, attemptMoment, isExecutedAttempt } from '../attempt-history'
import type { AttemptRow } from '../attempt-history'
import { canSendReminder } from '../decision-engine'
import type { CanSendReminderInput } from '@billzo/shared'

const NOW = '2026-06-10T12:00:00.000Z'

function attempt(overrides: Partial<AttemptRow> = {}): AttemptRow {
  return {
    id: 'CA_x',
    action_type: 'reminder',
    status: 'completed',
    executed_at: null,
    created_at: '2026-06-01T10:00:00.000Z',
    delivered_at: null,
    read_at: null,
    last_delivery_status: null,
    ...overrides,
  }
}

function makeBaseInput(): CanSendReminderInput {
  return {
    invoice: {
      id: 'inv-001',
      total: 5000,
      outstanding: 5000,
      recoveryStage: 't0_soft',
      nextRecoveryAt: null,
      isSnoozed: false,
      snoozeUntil: null,
      isDisputed: false,
      manualInteractionAt: null,
      overrideSend: false,
      overrideAt: null,
      overrideReason: null,
    },
    customer: {
      id: 'cust-001',
      phone: '919999999988',
      customerTier: 'regular',
      automationMode: 'full_auto',
      phoneVerification: 'unknown',
      reputationScore: 50,
      engagementState: 'unseen',
      messagingConsent: true,
    },
    activePromiseDate: null,
    now: NOW,
  }
}

describe('buildAttemptHistory — C1', () => {
  it('counts EXECUTED attempts only (finalized rows, not scheduled/cancelled/expired)', () => {
    const h = buildAttemptHistory({
      attempts: [
        attempt({ id: 'A', created_at: '2026-06-05T10:00:00.000Z', status: 'completed' }),
        attempt({ id: 'B', created_at: '2026-06-04T10:00:00.000Z', status: 'in_progress' }),
        attempt({ id: 'E', created_at: '2026-06-03T10:00:00.000Z', status: 'failed' }),
        attempt({ id: 'C', created_at: '2026-06-02T10:00:00.000Z', status: 'scheduled' }),
        attempt({ id: 'D', created_at: '2026-06-01T10:00:00.000Z', status: 'cancelled' }),
      ],
      outcomesByAttempt: {},
      now: NOW,
    })
    expect(h.totalSent).toBe(3)
    expect(h.attempts.map(a => a.id).sort()).toEqual(['A', 'B', 'E'])
  })

  it('a stack of outcome receipts from ONE send still projects as ONE attempt', () => {
    const h = buildAttemptHistory({
      attempts: [attempt({ id: 'A', created_at: '2026-06-01T10:00:00.000Z' })],
      outcomesByAttempt: {
        A: [
          { outcome_type: 'delivered', outcome_at: '2026-06-01T10:00:01.000Z' },
          { outcome_type: 'customer_read', outcome_at: '2026-06-01T11:00:00.000Z' },
          { outcome_type: 'customer_replied', outcome_at: '2026-06-01T11:30:00.000Z' },
          { outcome_type: 'payment', outcome_at: '2026-06-02T09:00:00.000Z' },
          { outcome_type: 'promise_kept', outcome_at: '2026-06-02T09:00:00.000Z' },
        ],
      },
      now: NOW,
    })
    expect(h.totalSent).toBe(1)
    expect(h.attempts[0].delivered).toBe(true)
    expect(h.attempts[0].read).toBe(true)
    expect(h.attempts[0].outcomes).toEqual(
      expect.arrayContaining(['delivered', 'customer_read', 'customer_replied', 'payment', 'promise_kept']),
    )
    expect(h.consecutiveIgnores).toBe(0)
  })

  it('consecutiveIgnores: read breaks the run, delivered/failed are neutral, unengaged counts', () => {
    const h = buildAttemptHistory({
      attempts: [
        attempt({ id: 'ignored', created_at: '2026-06-05T10:00:00.000Z' }),
        attempt({ id: 'neutral', created_at: '2026-06-04T10:00:00.000Z', delivered_at: '2026-06-04T10:00:01.000Z' }),
        attempt({ id: 'read', created_at: '2026-06-03T10:00:00.000Z', read_at: '2026-06-03T11:00:00.000Z' }),
      ],
      outcomesByAttempt: {},
      now: NOW,
    })
    expect(h.consecutiveIgnores).toBe(1)
  })

  it('consecutiveIgnores: failed delivery is neutral (matches legacy status passthrough)', () => {
    const h = buildAttemptHistory({
      attempts: [
        attempt({ id: 'ignored', created_at: '2026-06-05T10:00:00.000Z' }),
        attempt({ id: 'failed', created_at: '2026-06-04T10:00:00.000Z', last_delivery_status: 'failed' }),
      ],
      outcomesByAttempt: {},
      now: NOW,
    })
    expect(h.consecutiveIgnores).toBe(1)
  })

  it('lastReminderAt uses the actual execution moment (executed_at fallback created_at)', () => {
    const h = buildAttemptHistory({
      attempts: [
        attempt({ id: 'A', created_at: '2026-06-01T10:00:00.000Z', executed_at: '2026-06-03T10:00:00.000Z' }),
        attempt({ id: 'B', created_at: '2026-06-02T10:00:00.000Z' }),
      ],
      outcomesByAttempt: {},
      now: NOW,
    })
    expect(h.lastReminderAt).toBe('2026-06-03T10:00:00.000Z')
  })

  it('customer cooldown falls back to 99h when there is no prior customer attempt', () => {
    const h = buildAttemptHistory({ attempts: [], outcomesByAttempt: {}, now: NOW })
    expect(h.totalSent).toBe(0)
    expect(h.lastReminderAt).toBeNull()
    expect(h.lastCustomerReminderAt).toBeNull()
    expect(h.hoursSinceLastCustomerReminder).toBe(99)
  })

  it('attemptMoment / isExecutedAttempt helpers', () => {
    expect(attemptMoment({ executed_at: '2026-01-01T10:00:00.000Z', created_at: '2026-01-01T09:00:00.000Z' })).toBe('2026-01-01T10:00:00.000Z')
    expect(attemptMoment({ executed_at: null, created_at: '2026-01-01T09:00:00.000Z' })).toBe('2026-01-01T09:00:00.000Z')
    expect(isExecutedAttempt('completed')).toBe(true)
    expect(isExecutedAttempt('in_progress')).toBe(true)
    expect(isExecutedAttempt('failed')).toBe(true)
    expect(isExecutedAttempt('scheduled')).toBe(false)
    expect(isExecutedAttempt('cancelled')).toBe(false)
    expect(isExecutedAttempt('expired')).toBe(false)
  })
})

describe('C2 regression — canSendReminder inputs are identical pre/post data-source swap', () => {
  it('attempt-derived history equals the legacy raw-event computation for the same send scenario', () => {
    const attempts = [
      attempt({ id: 'CA_1', created_at: '2026-06-02T10:00:00.000Z', executed_at: '2026-06-02T10:00:00.000Z', delivered_at: '2026-06-02T10:00:05.000Z', read_at: '2026-06-02T11:00:00.000Z' }),
      attempt({ id: 'CA_2', created_at: '2026-06-03T10:00:00.000Z', executed_at: '2026-06-03T10:00:00.000Z', delivered_at: '2026-06-03T10:00:05.000Z', read_at: '2026-06-03T11:00:00.000Z' }),
      attempt({ id: 'CA_3', created_at: '2026-06-04T10:00:00.000Z', executed_at: '2026-06-04T10:00:00.000Z', delivered_at: '2026-06-04T10:00:05.000Z', read_at: '2026-06-04T11:00:00.000Z' }),
    ]

    const derived = buildAttemptHistory({
      attempts,
      outcomesByAttempt: {},
      customerLastAttemptAt: '2026-06-04T10:00:00.000Z',
      now: NOW,
    })

    // What the replaced raw whatsapp_events model would have produced for
    // the same three sends (one row each, last event read):
    const legacy = {
      totalSent: 3,
      sentThisMonth: 3,
      consecutiveIgnores: 0,
      lastReminderAt: '2026-06-04T10:00:00.000Z',
      lastReadAt: null,
      linkClicked: false,
      hoursSinceLastCustomerReminder: 146,
      lastCustomerReminderAt: '2026-06-04T10:00:00.000Z',
    }

    expect(derived.totalSent).toBe(legacy.totalSent)
    expect(derived.sentThisMonth).toBe(legacy.sentThisMonth)
    expect(derived.consecutiveIgnores).toBe(legacy.consecutiveIgnores)
    expect(derived.lastReminderAt).toBe(legacy.lastReminderAt)
    expect(derived.lastCustomerReminderAt).toBe(legacy.lastCustomerReminderAt)
    expect(derived.hoursSinceLastCustomerReminder).toBe(legacy.hoursSinceLastCustomerReminder)
    expect(derived.lastReadAt).toBeNull()
    expect(derived.linkClicked).toBe(false)

    const base = makeBaseInput()
    const viaAttempts = canSendReminder({ ...base, reminderHistory: derived })
    const viaLegacy = canSendReminder({ ...base, reminderHistory: legacy })

    // The decision engine must emit the identical verdict for equivalent history.
    expect(viaAttempts.decision).toBe(viaLegacy.decision)
    expect(viaAttempts.allowed).toBe(viaLegacy.allowed)
    expect(viaAttempts.reason).toBe(viaLegacy.reason)
    expect(viaAttempts.rules.map((r: any) => [r.rule, r.passed])).toEqual(viaLegacy.rules.map((r: any) => [r.rule, r.passed]))
  })
})