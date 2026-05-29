import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import { executePlan } from '../executor'
import { InternalAuthorityClient } from '../internal-authority'
import { CapabilityRegistry } from '../capabilities'
import { DEFAULT_POLICY_BUNDLE_V1 } from '../policy-compiler'
import { createAuthorityGateway } from '../gateway'
import type { CapabilityProvider, ExecutionPlan } from '../schemas'

// ============================================================
// Fixtures
// ============================================================

const successCap: CapabilityProvider = {
  capabilityId: 'tenant.provision',
  classification: 'infrastructure',
  reversibility: 'irreversible',
  blastRadius: 'tenant',
  priorityClass: 'tenant_lifecycle',
  estimatedCost: 'high',
  estimatedLatencyMs: 5,
  externalDependencyCount: 2,
  requiresApproval: false,
  compensatable: true,
  minIntentVersion: 1,
  maxIntentVersion: 1,
  ownedMutations: [],
  execute: async () => ({ success: true, executionLatencyMs: 1 }),
  compensate: async () => ({ success: true }),
}

const failCap: CapabilityProvider = {
  ...successCap,
  capabilityId: 'invoice.issue',
  execute: async () => ({ success: false, error: 'API failure', executionLatencyMs: 1 }),
  compensatable: true,
}

const samplePlan: ExecutionPlan = {
  intentId: 'plan_001',
  planHash: 'abc123',
  planCompilerVersion: 'test',
  steps: [
    { capabilityId: 'tenant.provision', order: 0, compensatable: true, requiresApproval: false, priorityClass: 'tenant_lifecycle', implementationHash: 'h1', input: {} },
  ],
  capabilityImplementationHashes: { 'tenant.provision': 'h1' },
  policySnapshotHash: '',
  registrySnapshotHash: '',
}

const multiStepPlan: ExecutionPlan = {
  intentId: 'plan_002',
  planHash: 'def456',
  planCompilerVersion: 'test',
  steps: [
    { capabilityId: 'tenant.provision', order: 0, compensatable: true, requiresApproval: false, priorityClass: 'tenant_lifecycle', implementationHash: 'h1', input: {} },
    { capabilityId: 'invoice.issue', order: 1, compensatable: true, requiresApproval: false, priorityClass: 'critical_financial', implementationHash: 'h2', input: {} },
  ],
  capabilityImplementationHashes: { 'tenant.provision': 'h1', 'invoice.issue': 'h2' },
  policySnapshotHash: '',
  registrySnapshotHash: '',
}

// ============================================================
// executor.ts
// ============================================================

describe('executePlan', () => {
  it('executes all steps successfully', async () => {
    const reg = new CapabilityRegistry()
    reg.register(successCap)
    const results = await executePlan(reg, samplePlan)
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)
  })

  it('stops on first failure', async () => {
    const reg = new CapabilityRegistry()
    reg.register(successCap)
    reg.register(failCap)
    const results = await executePlan(reg, multiStepPlan)
    expect(results).toHaveLength(2)
    expect(results[0].success).toBe(true)
    expect(results[1].success).toBe(false)
  })

  it('returns error when capability not found', async () => {
    const reg = new CapabilityRegistry()
    const results = await executePlan(reg, samplePlan)
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(false)
    expect(results[0].error).toContain('not_found')
  })
})

// ============================================================
// internal-authority.ts
// ============================================================

describe('InternalAuthorityClient', () => {
  it('builds a valid intent and submits it', async () => {
    const reg = new CapabilityRegistry()
    const client = new InternalAuthorityClient({
      policy: DEFAULT_POLICY_BUNDLE_V1,
      capabilities: reg.getAll(),
      rateLimitStore: {
        getCurrentCounts: async () => ({}),
      },
      tenantPlanLookup: async () => 'premium',
      registrySnapshotHash: 'test-registry-hash',
    })
    const result = await client.submit({
      intentType: 'tenant.provision',
      tenantId: 'tenant_acme',
      actor: 'system',
      payload: { plan: 'premium' },
    })
    expect(result.accepted).toBe(false) // no capability registered
    expect(result.intentId).toBeTruthy()
    expect(result.error).toBeTruthy()
  })
})

// ============================================================
// gateway.ts
// ============================================================

describe('createAuthorityGateway', () => {
  it('returns health status', async () => {
    const app = createAuthorityGateway({
      policy: DEFAULT_POLICY_BUNDLE_V1,
      capabilities: [],
      rateLimitStore: { getCurrentCounts: async () => ({}) },
      tenantPlanLookup: async () => undefined,
      registrySnapshotHash: 'test-registry-hash',
    })
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(json.status).toBe('ok')
  })

  function signedRequest(body: Record<string, unknown>): { body: string; signature: string } {
    const secret = 'dev-secret-n8n'
    const timestamp = new Date().toISOString()
    const nonce = crypto.randomUUID()
    const payload: Record<string, unknown> = { ...body, timestamp, nonce }
    const rawBody = JSON.stringify(payload)
    const signature = crypto.createHmac('sha256', secret).update('POST/api/v1/authority/evaluate' + timestamp + nonce + rawBody).digest('hex')
    payload.signature = signature
    return { body: JSON.stringify(payload), signature }
  }

  it('rejects evaluate with invalid signature', async () => {
    const app = createAuthorityGateway({
      policy: DEFAULT_POLICY_BUNDLE_V1,
      capabilities: [],
      rateLimitStore: { getCurrentCounts: async () => ({}) },
      tenantPlanLookup: async () => undefined,
      registrySnapshotHash: 'test-registry-hash',
    })

    const { body } = signedRequest({
      intentId: 'int_001', intentType: 'tenant.provision', intentVersion: 1,
      tenantId: 't1', actor: 'test', source: 'n8n_prod',
      causationId: null, correlationId: null, payload: {},
    } as any)
    const parsed = JSON.parse(body)
    parsed.signature = 'invalid'
    const res = await app.request('/api/v1/authority/evaluate', { method: 'POST', body: JSON.stringify(parsed), headers: { 'content-type': 'application/json' } })
    expect(res.status).toBe(403)
  })

  it('accepts evaluate with valid signature', async () => {
    const app = createAuthorityGateway({
      policy: DEFAULT_POLICY_BUNDLE_V1,
      capabilities: [],
      rateLimitStore: { getCurrentCounts: async () => ({}) },
      tenantPlanLookup: async () => undefined,
      registrySnapshotHash: 'test-registry-hash',
    })

    const { body } = signedRequest({
      intentId: 'int_002', intentType: 'tenant.provision', intentVersion: 1,
      tenantId: 't1', actor: 'test', source: 'n8n_prod',
      causationId: null, correlationId: null, payload: {},
    } as any)
    const res = await app.request('/api/v1/authority/evaluate', { method: 'POST', body, headers: { 'content-type': 'application/json' } })
    expect(res.status).toBe(422) // rejected: no capabilities registered
  })
})
