import { describe, it, expect } from 'vitest'
import { evaluateSovereignty, checkRateLimit } from '../sovereignty'
import type { IntentEnvelope, PolicyBundle } from '../schemas'

function makeIntent(overrides: Partial<IntentEnvelope> = {}): IntentEnvelope {
  return {
    intentId: 'test-intent-1',
    intentType: 'tenant.provision',
    intentVersion: 1,
    tenantId: 'tenant_1',
    actor: 'system',
    source: 'n8n_prod',
    timestamp: new Date().toISOString(),
    causationId: null,
    correlationId: null,
    payload: {},
    nonce: 'abc123',
    signature: 'sig',
    ...overrides,
  }
}

const defaultPolicy: PolicyBundle = {
  policyVersion: 'test-v1',
  rules: [
    {
      intent: 'tenant.provision',
      allowedSources: ['n8n_prod', 'provisioning_sidecar'],
      allowedPlans: ['premium', 'enterprise'],
      minIntentVersion: 1,
      maxIntentVersion: 1,
    },
    {
      intent: 'payment.reconcile',
      allowedSources: ['worker', 'internal_worker'],
    },
    {
      intent: 'whatsapp.send.template',
      allowedSources: ['n8n_prod', 'worker'],
      allowedPlans: ['premium', 'standard', 'starter'],
    },
  ],
}

describe('evaluateSovereignty', () => {
  it('allows intent when source and plan match', () => {
    const result = evaluateSovereignty(makeIntent(), defaultPolicy, 'premium')
    expect(result.allowed).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('rejects when no rule matches intent type', () => {
    const result = evaluateSovereignty(makeIntent({ intentType: 'unknown.intent' }), defaultPolicy)
    expect(result.allowed).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]).toContain('No sovereignty rule found')
  })

  it('rejects when source is not allowed', () => {
    const result = evaluateSovereignty(makeIntent({ source: 'frappe' }), defaultPolicy, 'premium')
    expect(result.allowed).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]).toContain('Source')
    expect(result.violations[0]).toContain('frappe')
  })

  it('rejects when tenant plan is not allowed', () => {
    const result = evaluateSovereignty(makeIntent(), defaultPolicy, 'starter')
    expect(result.allowed).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]).toContain('plan')
    expect(result.violations[0]).toContain('starter')
  })

  it('rejects when intent version is below minimum', () => {
    const rule = defaultPolicy.rules[0]
    const policyWithMinVersion = {
      ...defaultPolicy,
      rules: [{ ...rule, minIntentVersion: 2 }],
    }
    const result = evaluateSovereignty(makeIntent({ intentVersion: 1 }), policyWithMinVersion, 'premium')
    expect(result.allowed).toBe(false)
    expect(result.violations.some((v) => v.includes('below minimum'))).toBe(true)
  })

  it('rejects when intent version exceeds maximum', () => {
    const rule = defaultPolicy.rules[0]
    const policyWithMaxVersion = {
      ...defaultPolicy,
      rules: [{ ...rule, maxIntentVersion: 1 }],
    }
    const result = evaluateSovereignty(makeIntent({ intentVersion: 2 }), policyWithMaxVersion, 'premium')
    expect(result.allowed).toBe(false)
    expect(result.violations.some((v) => v.includes('exceeds maximum'))).toBe(true)
  })

  it('allows when no plan restriction exists on the rule', () => {
    const result = evaluateSovereignty(
      makeIntent({ intentType: 'payment.reconcile', source: 'worker' }),
      defaultPolicy,
    )
    expect(result.allowed).toBe(true)
  })

  it('allows internal_worker source for payment.reconcile', () => {
    const result = evaluateSovereignty(
      makeIntent({ intentType: 'payment.reconcile', source: 'internal_worker' }),
      defaultPolicy,
    )
    expect(result.allowed).toBe(true)
  })

  it('returns matchedRuleIndex for successful evaluation', () => {
    const result = evaluateSovereignty(makeIntent(), defaultPolicy, 'premium')
    expect(result.allowed).toBe(true)
    expect(result.matchedRuleIndex).toBe(0)
  })

  it('returns -1 matchedRuleIndex when no rule matches', () => {
    const result = evaluateSovereignty(makeIntent({ intentType: 'unknown.intent' }), defaultPolicy)
    expect(result.matchedRuleIndex).toBe(-1)
  })
})

describe('checkRateLimit', () => {
  const rateLimitedRule = {
    intent: 'tenant.provision',
    allowedSources: ['n8n_prod'],
    rateLimit: { perHour: 5, perTenantPerDay: 1 },
  }

  it('returns empty violations when under limits', () => {
    const violations = checkRateLimit(rateLimitedRule, { perHour: 3, perTenantPerDay: 0 })
    expect(violations).toHaveLength(0)
  })

  it('returns violation when per-hour limit exceeded', () => {
    const violations = checkRateLimit(rateLimitedRule, { perHour: 6, perTenantPerDay: 0 })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('per hour')
  })

  it('returns violation when per-tenant-per-day limit exceeded', () => {
    const violations = checkRateLimit(rateLimitedRule, { perHour: 0, perTenantPerDay: 2 })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('per tenant per day')
  })

  it('returns multiple violations when multiple limits exceeded', () => {
    const violations = checkRateLimit(rateLimitedRule, { perHour: 10, perTenantPerDay: 3 })
    expect(violations).toHaveLength(2)
  })

  it('returns empty when no rate limit configured', () => {
    const rule = { intent: 'test', allowedSources: ['worker'] }
    const violations = checkRateLimit(rule, { perHour: 999 })
    expect(violations).toHaveLength(0)
  })
})
