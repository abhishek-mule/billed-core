import { describe, it, expect } from 'vitest'
import { validateIntentSchema, compileDecisionGraph, compileExecutionPlan } from '../decision-graph'
import { DEFAULT_POLICY_BUNDLE_V1, canonicalizePolicyBundle, hashPolicyBundle } from '../policy-compiler'
import { SemanticNormalizerRegistry } from '../semantic-dedup'
import { NonceStore } from '../nonces'
import { CapabilityRegistry } from '../capabilities'
import type {
  IntentEnvelope,
  CapabilityProvider,
  SovereigntyDecision,
  PolicyBundle,
  SemanticDedupRule,
} from '../schemas'

// ============================================================
// Shared fixtures
// ============================================================

const validIntent: IntentEnvelope = {
  intentId: 'int_001',
  intentType: 'tenant.provision',
  intentVersion: 1,
  tenantId: 'tenant_acme',
  actor: 'n8n_workflow_1',
  source: 'n8n_prod',
  timestamp: '2026-05-28T12:00:00.000Z',
  causationId: null,
  correlationId: null,
  payload: { companyName: 'Acme Corp', plan: 'premium' },
  nonce: 'abc123',
  signature: 'sig_001',
}

const allowedSovereignty: SovereigntyDecision = {
  allowed: true,
  matchedRuleIndex: 0,
  violations: [],
}

const rejectedSovereignty: SovereigntyDecision = {
  allowed: false,
  matchedRuleIndex: 0,
  violations: ['Source not allowed'],
}

const dummyCapability: CapabilityProvider = {
  capabilityId: 'tenant.provision',
  classification: 'infrastructure',
  reversibility: 'irreversible',
  blastRadius: 'tenant',
  priorityClass: 'tenant_lifecycle',
  estimatedCost: 'high',
  estimatedLatencyMs: 5000,
  externalDependencyCount: 2,
  requiresApproval: false,
  compensatable: false,
  minIntentVersion: 1,
  maxIntentVersion: 1,
  execute: async () => ({ success: true, executionLatencyMs: 0 }),
}

// ============================================================
// validateIntentSchema
// ============================================================

describe('validateIntentSchema', () => {
  it('passes for a valid intent', () => {
    const result = validateIntentSchema(validIntent)
    expect(result.valid).toBe(true)
    expect(result.failures).toHaveLength(0)
  })

  it('rejects missing intentId', () => {
    const r = validateIntentSchema({ ...validIntent, intentId: '' })
    expect(r.valid).toBe(false)
    expect(r.failures[0]).toContain('intentId')
  })

  it('rejects missing intentType', () => {
    const r = validateIntentSchema({ ...validIntent, intentType: '' })
    expect(r.valid).toBe(false)
  })

  it('rejects non-positive intentVersion', () => {
    const r = validateIntentSchema({ ...validIntent, intentVersion: 0 })
    expect(r.valid).toBe(false)
  })

  it('rejects missing tenantId', () => {
    const r = validateIntentSchema({ ...validIntent, tenantId: '' })
    expect(r.valid).toBe(false)
  })

  it('rejects invalid timestamp', () => {
    const r = validateIntentSchema({ ...validIntent, timestamp: 'not-a-date' })
    expect(r.valid).toBe(false)
  })

  it('rejects empty nonce', () => {
    const r = validateIntentSchema({ ...validIntent, nonce: '' })
    expect(r.valid).toBe(false)
  })

  it('rejects empty signature', () => {
    const r = validateIntentSchema({ ...validIntent, signature: '' })
    expect(r.valid).toBe(false)
  })
})

// ============================================================
// compileDecisionGraph
// ============================================================

describe('compileDecisionGraph', () => {
  it('accepts with valid intent, passing sovereignty, and matched capability', () => {
    const result = compileDecisionGraph({
      intent: validIntent,
      policy: DEFAULT_POLICY_BUNDLE_V1,
      sovereignty: allowedSovereignty,
      capabilities: [dummyCapability],
      semanticalDedupHash: null,
      dedupOnMatch: null,
    })
    expect(result.decision.outcome).toBe('accepted')
    expect(result.plan).not.toBeNull()
    expect(result.plan!.steps).toHaveLength(1)
    expect(result.plan!.steps[0].capabilityId).toBe('tenant.provision')
  })

  it('rejects when schema validation fails', () => {
    const result = compileDecisionGraph({
      intent: { ...validIntent, intentId: '' },
      policy: DEFAULT_POLICY_BUNDLE_V1,
      sovereignty: allowedSovereignty,
      capabilities: [dummyCapability],
      semanticalDedupHash: null,
      dedupOnMatch: null,
    })
    expect(result.decision.outcome).toBe('rejected')
    expect(result.plan).toBeNull()
    expect(result.decision.decisionGraph[0].nodeType).toBe('schema_validation')
    expect(result.decision.decisionGraph[0].passed).toBe(false)
  })

  it('rejects when sovereignty fails', () => {
    const result = compileDecisionGraph({
      intent: validIntent,
      policy: DEFAULT_POLICY_BUNDLE_V1,
      sovereignty: rejectedSovereignty,
      capabilities: [dummyCapability],
      semanticalDedupHash: null,
      dedupOnMatch: null,
    })
    expect(result.decision.outcome).toBe('rejected')
    expect(result.plan).toBeNull()
  })

  it('rejects when semantic dedup match rejects', () => {
    const result = compileDecisionGraph({
      intent: validIntent,
      policy: DEFAULT_POLICY_BUNDLE_V1,
      sovereignty: allowedSovereignty,
      capabilities: [dummyCapability],
      semanticalDedupHash: 'dup_hash_001',
      dedupOnMatch: 'reject',
    })
    expect(result.decision.outcome).toBe('rejected')
    expect(result.plan).toBeNull()
  })

  it('records semantical dedup hash when known but not rejected', () => {
    const result = compileDecisionGraph({
      intent: validIntent,
      policy: DEFAULT_POLICY_BUNDLE_V1,
      sovereignty: allowedSovereignty,
      capabilities: [dummyCapability],
      semanticalDedupHash: 'known_hash',
      dedupOnMatch: 'require_approval',
    })
    expect(result.decision.outcome).toBe('accepted')
    expect(result.decision.decisionGraph.find((n) => n.nodeType === 'semantic_dedup')!.reason).toContain('known_hash')
  })

  it('rejects when no capability matches', () => {
    const result = compileDecisionGraph({
      intent: validIntent,
      policy: DEFAULT_POLICY_BUNDLE_V1,
      sovereignty: allowedSovereignty,
      capabilities: [],
      semanticalDedupHash: null,
      dedupOnMatch: null,
    })
    expect(result.decision.outcome).toBe('rejected')
    expect(result.plan).toBeNull()
  })

  it('returns deterministic decision graph with timestamps', () => {
    const result = compileDecisionGraph({
      intent: validIntent,
      policy: DEFAULT_POLICY_BUNDLE_V1,
      sovereignty: allowedSovereignty,
      capabilities: [dummyCapability],
      semanticalDedupHash: null,
      dedupOnMatch: null,
    })
    expect(result.decision.decisionGraph.length).toBeGreaterThan(0)
    for (const node of result.decision.decisionGraph) {
      expect(node.latencyMs).toBeGreaterThanOrEqual(0)
      expect(typeof node.reason).toBe('string')
    }
    expect(result.decision.evaluatedAt).toBeTruthy()
  })
})

// ============================================================
// compileExecutionPlan
// ============================================================

describe('compileExecutionPlan', () => {
  it('produces a stable plan hash', () => {
    const plan1 = compileExecutionPlan(validIntent, [dummyCapability])
    const plan2 = compileExecutionPlan(validIntent, [dummyCapability])
    expect(plan1.planHash).toBe(plan2.planHash)
  })

  it('assigns correct order and includes capability metadata', () => {
    const c2: CapabilityProvider = {
      ...dummyCapability,
      capabilityId: 'audit.log',
      classification: 'regulatory',
    }
    const plan = compileExecutionPlan(validIntent, [dummyCapability, c2])
    expect(plan.steps).toHaveLength(2)
    expect(plan.steps[0].order).toBe(0)
    expect(plan.steps[1].order).toBe(1)
    expect(plan.steps[0].priorityClass).toBe('tenant_lifecycle')
  })
})

// ============================================================
// policy-compiler
// ============================================================

describe('policy-compiler', () => {
  describe('canonicalizePolicyBundle', () => {
    it('produces deterministic JSON', () => {
      const a = canonicalizePolicyBundle(DEFAULT_POLICY_BUNDLE_V1)
      const b = canonicalizePolicyBundle(DEFAULT_POLICY_BUNDLE_V1)
      expect(a).toBe(b)
    })

    it('includes policyVersion and rules', () => {
      const json = canonicalizePolicyBundle(DEFAULT_POLICY_BUNDLE_V1)
      const parsed = JSON.parse(json)
      expect(parsed.policyVersion).toBe('2026.05.28-alpha')
      expect(Array.isArray(parsed.rules)).toBe(true)
    })
  })

  describe('hashPolicyBundle', () => {
    it('produces a 64-char hex string', () => {
      const hash = hashPolicyBundle(DEFAULT_POLICY_BUNDLE_V1)
      expect(hash).toHaveLength(64)
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true)
    })

    it('is deterministic', () => {
      expect(hashPolicyBundle(DEFAULT_POLICY_BUNDLE_V1)).toBe(hashPolicyBundle(DEFAULT_POLICY_BUNDLE_V1))
    })
  })
})

// ============================================================
// semantic-dedup
// ============================================================

describe('SemanticNormalizerRegistry', () => {
  it('registers and retrieves a normalizer', () => {
    const reg = new SemanticNormalizerRegistry()
    const fn = (p: Record<string, unknown>) => ({ ...p })
    reg.register('test.cap', fn)
    expect(reg.getNormalizer('test.cap')).toBe(fn)
  })

  it('skips duplicate registration', () => {
    const reg = new SemanticNormalizerRegistry()
    const fn1 = (p: Record<string, unknown>) => ({ a: 1 })
    const fn2 = (p: Record<string, unknown>) => ({ b: 2 })
    reg.register('test.cap', fn1)
    reg.register('test.cap', fn2)
    expect(reg.getNormalizer('test.cap')).toBe(fn1)
  })

  it('computes dedup hash', () => {
    const reg = new SemanticNormalizerRegistry()
    const normalizer = (p: Record<string, unknown>) => {
      const { _meta, ...rest } = p as any
      return rest
    }
    reg.register('test.cap', normalizer)
    const h1 = reg.computeDedupHash('test.cap', { amount: 100, _meta: 'stripped' })
    const h2 = reg.computeDedupHash('test.cap', { amount: 100, _meta: 'different' })
    expect(h1).toBe(h2)
  })

  it('registerFromCapability reads normalizer from CapabilityProvider', () => {
    const reg = new SemanticNormalizerRegistry()
    const cap: CapabilityProvider = {
      capabilityId: 'test.cap',
      classification: 'financial',
      reversibility: 'reversible',
      blastRadius: 'tenant',
      priorityClass: 'critical_financial',
      estimatedCost: 'low',
      estimatedLatencyMs: 100,
      externalDependencyCount: 0,
      requiresApproval: false,
      compensatable: true,
      minIntentVersion: 1,
      maxIntentVersion: 1,
      execute: async () => ({ success: true, executionLatencyMs: 0 }),
      semanticNormalizer: (p) => ({ ...p, amount: String(p.amount) }),
    }
    reg.registerFromCapability(cap)
    expect(reg.getNormalizer('test.cap')).toBe(cap.semanticNormalizer)
  })

  it('evaluateDedup returns matched when hash collision found', () => {
    const reg = new SemanticNormalizerRegistry()
    const payload = { amount: 100 }
    const hash = reg.computeDedupHash('test.cap', payload)
    const result = reg.evaluateDedup(
      { capabilityId: 'test.cap', windowMinutes: 5, matchFields: ['payload_hash'], onMatch: 'reject' },
      payload,
      [{ payload_hash: hash }],
    )
    expect(result.matched).toBe(true)
    expect(result.matchedHash).toBe(hash)
  })
})

// ============================================================
// nonces
// ============================================================

describe('NonceStore', () => {
  it('accepts a fresh nonce', () => {
    const store = new NonceStore()
    expect(store.checkAndMark('abc').valid).toBe(true)
  })

  it('rejects a replay nonce', () => {
    const store = new NonceStore()
    store.checkAndMark('abc')
    expect(store.checkAndMark('abc').valid).toBe(false)
  })

  it('isReplay returns true for used nonce', () => {
    const store = new NonceStore()
    store.checkAndMark('used')
    expect(store.isReplay('used')).toBe(true)
    expect(store.isReplay('fresh')).toBe(false)
  })

  it('reset clears all nonces', () => {
    const store = new NonceStore()
    store.checkAndMark('abc')
    store.checkAndMark('def')
    expect(store.size).toBe(2)
    store.reset()
    expect(store.size).toBe(0)
  })
})

// ============================================================
// capabilities
// ============================================================

describe('CapabilityRegistry', () => {
  it('registers and retrieves capabilities', () => {
    const reg = new CapabilityRegistry()
    reg.register(dummyCapability)
    expect(reg.get('tenant.provision')).toBe(dummyCapability)
    expect(reg.size).toBe(1)
  })

  it('skips duplicate registration', () => {
    const reg = new CapabilityRegistry()
    reg.register(dummyCapability)
    reg.register(dummyCapability)
    expect(reg.size).toBe(1)
  })

  it('getAll returns all registered', () => {
    const reg = new CapabilityRegistry()
    const c2: CapabilityProvider = {
      ...dummyCapability,
      capabilityId: 'other.cap',
    }
    reg.register(dummyCapability)
    reg.register(c2)
    expect(reg.getAll()).toHaveLength(2)
  })

  it('findForIntent matches by prefix', () => {
    const reg = new CapabilityRegistry()
    reg.register(dummyCapability)
    reg.register({ ...dummyCapability, capabilityId: 'tenant.provision.v2' })
    reg.register({ ...dummyCapability, capabilityId: 'unrelated' })
    expect(reg.findForIntent('tenant.provision')).toHaveLength(2)
  })
})
