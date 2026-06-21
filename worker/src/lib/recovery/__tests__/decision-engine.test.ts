import { describe, it, expect } from 'vitest'
import { canSendReminder } from '../decision-engine'
import type { CanSendReminderInput } from '@billzo/shared'

interface MakeInputOverrides {
  invoice?: Partial<CanSendReminderInput['invoice']>
  customer?: Partial<CanSendReminderInput['customer']>
  activePromiseDate?: CanSendReminderInput['activePromiseDate']
  behaviorMetrics?: CanSendReminderInput['behaviorMetrics']
  now?: string
}

function makeInput(overrides?: MakeInputOverrides): CanSendReminderInput {
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
      ...overrides?.invoice,
    },
    customer: {
      id: 'cust-001',
      phone: '919999999988',
      customerTier: 'regular',
      automationMode: 'full_auto',
      phoneVerification: 'unknown',
      reputationScore: 50,
      ...overrides?.customer,
    },
    activePromiseDate: overrides?.activePromiseDate,
    behaviorMetrics: overrides?.behaviorMetrics,
    now: overrides?.now ?? '2026-06-10T12:00:00.000Z',
  }
}

describe('canSendReminder', () => {
  it('allows send when all rules pass', () => {
    const result = canSendReminder(makeInput())
    expect(result.allowed).toBe(true)
    expect(result.decision).toBe('send')
    expect(result.reason).toBe('All checks passed')
    expect(result.rules).toHaveLength(14)
    expect(result.rules.every(r => r.passed)).toBe(true)
  })

  it('blocks when outstanding is zero', () => {
    const result = canSendReminder(makeInput({
      invoice: { outstanding: 0 },
    }))
    expect(result.allowed).toBe(false)
    expect(result.decision).toBe('block')
    expect(result.reason).toContain('Outstanding is zero')
    expect(result.rules[0].passed).toBe(false)
  })

  it('blocks when invoice is disputed', () => {
    const result = canSendReminder(makeInput({
      invoice: { isDisputed: true },
    }))
    expect(result.allowed).toBe(false)
    expect(result.rules[1].passed).toBe(false)
    expect(result.reason).toContain('disputed')
  })

  it('blocks when active promise exists', () => {
    const result = canSendReminder(makeInput({
      activePromiseDate: '2026-06-15T12:00:00.000Z',
    }))
    expect(result.allowed).toBe(false)
    expect(result.rules[2].passed).toBe(false)
    expect(result.reason).toContain('promise')
  })

  it('allows when promise date is past', () => {
    const result = canSendReminder(makeInput({
      activePromiseDate: '2026-06-05T12:00:00.000Z',
    }))
    expect(result.rules[2].passed).toBe(true)
  })

  it('blocks when snoozed', () => {
    const result = canSendReminder(makeInput({
      invoice: { isSnoozed: true, snoozeUntil: '2026-06-20T12:00:00.000Z' },
    }))
    expect(result.allowed).toBe(false)
    expect(result.rules[3].passed).toBe(false)
    expect(result.reason).toContain('Snoozed')
  })

  it('blocks when cooldown active', () => {
    const result = canSendReminder(makeInput({
      invoice: { nextRecoveryAt: '2026-06-15T12:00:00.000Z' },
    }))
    expect(result.allowed).toBe(false)
    expect(result.rules[4].passed).toBe(false)
    expect(result.reason).toContain('Cooldown')
  })

  it('blocks when customer has no phone', () => {
    const result = canSendReminder(makeInput({
      customer: { phone: null },
    }))
    expect(result.allowed).toBe(false)
    expect(result.rules[5].passed).toBe(false)
    expect(result.reason).toContain('No phone')
  })

  it('blocks when delivery rate too low', () => {
    const result = canSendReminder(makeInput({
      behaviorMetrics: { readRate: 0, deliveryRate: 0.1, observationCount: 10 },
    }))
    expect(result.allowed).toBe(false)
    expect(result.rules[5].passed).toBe(false)
  })

  it('blocks when merchant manually contacted recently', () => {
    const result = canSendReminder(makeInput({
      invoice: { manualInteractionAt: '2026-06-09T12:00:00.000Z' }, // 24h ago
    }))
    expect(result.allowed).toBe(false)
    expect(result.rules[6].passed).toBe(false)
    expect(result.reason).toContain('manual')
  })

  it('allows when manual contact was > 48h ago', () => {
    const result = canSendReminder(makeInput({
      invoice: { manualInteractionAt: '2026-06-05T12:00:00.000Z' }, // 5 days ago
    }))
    expect(result.rules[6].passed).toBe(true)
  })

  it('blocks VIP customer from exceeding t24_nudge stage', () => {
    const result = canSendReminder(makeInput({
      customer: { customerTier: 'vip' },
      invoice: { recoveryStage: 't5_warning' },
    }))
    expect(result.allowed).toBe(false)
    expect(result.rules[7].passed).toBe(false)
    expect(result.reason).toContain('Tier')
  })

  it('allows VIP customer at t0_soft stage', () => {
    const result = canSendReminder(makeInput({
      customer: { customerTier: 'vip' },
      invoice: { recoveryStage: 't0_soft' },
    }))
    expect(result.rules[7].passed).toBe(true)
  })

  it('returns pending_approval when automationMode is manual', () => {
    const result = canSendReminder(makeInput({
      customer: { automationMode: 'manual' },
      invoice: { outstanding: 0 },
    }))
    expect(result.decision).toBe('pending_approval')
  })

  it('logs all 14 rules in output', () => {
    const result = canSendReminder(makeInput())
    expect(result.rules.map(r => r.rule)).toEqual([
      'outstanding_positive',
      'not_disputed',
      'no_active_promise',
      'not_snoozed',
      'cooldown_expired',
      'customer_reachable',
      'no_recent_manual_contact',
      'tier_permits_escalation',
      'not_in_silence_period',
      'under_monthly_cap',
      'under_total_cap',
      'engagement_cooldown',
      'business_hours',
      'merchant_intervention_trigger',
    ])
    expect(result.rulesSnapshot).toEqual({
      merchant_override: false,
      outstanding_positive: true,
      not_disputed: true,
      no_active_promise: true,
      not_snoozed: true,
      cooldown_expired: true,
      customer_reachable: true,
      no_recent_manual_contact: true,
      tier_permits_escalation: true,
      not_in_silence_period: true,
      under_monthly_cap: true,
      under_total_cap: true,
      engagement_cooldown: true,
      business_hours: true,
      merchant_intervention_trigger: true,
    })
  })

  it('rulesSnapshot reflects failures correctly', () => {
    const result = canSendReminder(makeInput({
      invoice: { isDisputed: true, isSnoozed: true },
    }))
    expect(result.rulesSnapshot.outstanding_positive).toBe(true)
    expect(result.rulesSnapshot.not_disputed).toBe(false)
    expect(result.rulesSnapshot.not_snoozed).toBe(false)
    expect(result.rulesSnapshot.cooldown_expired).toBe(true)
  })

  it('computes confidence proportionally to failing rules', () => {
    const allPass = canSendReminder(makeInput())
    expect(allPass.confidence).toBe(1.0)

    const oneFail = canSendReminder(makeInput({
      invoice: { isDisputed: true },
    }))
    expect(oneFail.confidence).toBeLessThan(1.0)
    expect(oneFail.confidence).toBeGreaterThan(0.8)

    const threeFail = canSendReminder(makeInput({
      invoice: { isDisputed: true, isSnoozed: true },
      customer: { phone: null },
    }))
    expect(threeFail.confidence).toBeLessThan(0.8)
  })

  // ── Rule 0: Merchant Override ──

  it('respects active override and bypasses all checks', () => {
    const result = canSendReminder(makeInput({
      invoice: {
        overrideSend: true,
        overrideAt: '2026-06-10T10:00:00.000Z',  // 2h before our test time
        overrideReason: 'Customer is a family friend',
      },
    }))
    expect(result.allowed).toBe(true)
    expect(result.decision).toBe('send')
    expect(result.reason).toContain('Merchant override')
    expect(result.rules).toHaveLength(1)  // only override rule checked
    expect(result.rules[0].override).toBe(true)
  })

  it('bypasses even blocked conditions when override is active', () => {
    const result = canSendReminder(makeInput({
      invoice: {
        outstanding: 0,
        isDisputed: true,
        isSnoozed: true,
        overrideSend: true,
        overrideAt: '2026-06-10T10:00:00.000Z',
        overrideReason: 'Trust the merchant',
      },
    }))
    expect(result.allowed).toBe(true)
    expect(result.rulesSnapshot.merchant_override).toBe(true)
  })

  it('does not apply expired override (>24h old) — falls through to normal rules', () => {
    const result = canSendReminder(makeInput({
      invoice: {
        overrideSend: true,
        overrideAt: '2026-06-05T10:00:00.000Z',  // 5 days ago
        overrideReason: 'Old override',
      },
    }))
    // Override rule not in rules array (only active overrides appear)
    expect(result.rules.every(r => r.rule !== 'merchant_override')).toBe(true)
    expect(result.rules.length).toBe(14)
    expect(result.rules[0].rule).toBe('outstanding_positive')
    // Snapshot reflects inactive override
    expect(result.rulesSnapshot.merchant_override).toBe(false)
  })

  it('merchant_override rule appears first in rules_snapshot', () => {
    const result = canSendReminder(makeInput({
      invoice: {
        overrideSend: true,
        overrideAt: '2026-06-10T10:00:00.000Z',
        overrideReason: 'Override test',
      },
    }))
    expect(result.rulesSnapshot.merchant_override).toBe(true)
  })
})
