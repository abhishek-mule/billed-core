import { describe, it, expect } from 'vitest'
import { attributabilityOf } from '../attribution-truth'

describe('attributabilityOf — Phase 1.5 attribution truth rule', () => {
  it('marks an outcome VERIFIED only with an explicit recovery attempt identity', () => {
    expect(attributabilityOf('CA_abc')).toEqual({
      attribution_status: 'verified',
      attribution_method: 'explicit',
      confidence_score: 1,
    })
  })

  it('marks an outcome UNKNOWN when no attempt identity is present', () => {
    expect(attributabilityOf(null)).toEqual({
      attribution_status: 'unknown',
      attribution_method: null,
      confidence_score: null,
    })
    expect(attributabilityOf(undefined)).toEqual({
      attribution_status: 'unknown',
      attribution_method: null,
      confidence_score: null,
    })
    expect(attributabilityOf('')).toEqual({
      attribution_status: 'unknown',
      attribution_method: null,
      confidence_score: null,
    })
  })

  it('NEGATIVE TEST — a payment is UNKNOWN even when it arrives 10 seconds after a reminder, unless it carries the attempt id', () => {
    // Highly hostile case: payment lands right after a reminder but the
    // payload does NOT include recoveryAttemptId. This must be UNKNOWN.
    // The rule is time-independent by construction — proximity never
    // manufactures causality. (The 10s margin is irrelevant to the answer.)
    const paymentArrived10sAfterReminder = { paymentId: 'pay_1', recoveryAttemptId: null }
    expect(attributabilityOf(paymentArrived10sAfterReminder.recoveryAttemptId)).toEqual({
      attribution_status: 'unknown',
      attribution_method: null,
      confidence_score: null,
    })
  })

  it('positive control — the same payment WITH the attempt id is VERIFIED', () => {
    const paymentCarryingAttempt = { paymentId: 'pay_1', recoveryAttemptId: 'CA_reminder' }
    expect(attributabilityOf(paymentCarryingAttempt.recoveryAttemptId)).toEqual({
      attribution_status: 'verified',
      attribution_method: 'explicit',
      confidence_score: 1,
    })
  })
})